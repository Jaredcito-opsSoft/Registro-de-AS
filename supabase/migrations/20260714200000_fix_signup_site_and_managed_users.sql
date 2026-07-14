-- La afiliacion elegida al registrarse se valida en servidor. Una clave nunca
-- eleva privilegios por si sola: solo las invitaciones existentes y vinculadas
-- al correo pueden promover a supervisor o administrador.

begin;

create or replace function public.get_current_app_user(
  p_nombre text default null,
  p_matricula text default null,
  p_org_key text default null
)
returns table (
  id uuid, auth_user_id uuid, organizacion_id uuid, organizacion_nombre text,
  sitio_id uuid, sitio_nombre text, nombre text, matricula text, email text,
  rol text, rol_rank integer, permisos jsonb, activo boolean
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_email text;
  v_org_id uuid;
  v_site_id uuid;
  v_site_raw text;
  v_org_slug text;
  v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
  v_matricula text := upper(nullif(trim(coalesce(p_matricula, '')), ''));
  v_org_key text := nullif(trim(coalesce(p_org_key, '')), '');
  v_user public.usuarios_app%rowtype;
begin
  if v_auth_uid is null then raise exception 'sesion_requerida'; end if;

  select lower(au.email),
         coalesce(v_org_key, au.raw_user_meta_data->>'organization_key', au.raw_user_meta_data->>'org_key'),
         nullif(trim(au.raw_user_meta_data->>'site_id'), ''),
         nullif(trim(au.raw_user_meta_data->>'organization_slug'), '')
  into v_email, v_org_key, v_site_raw, v_org_slug
  from auth.users as au
  where au.id = v_auth_uid;

  if v_site_raw is not null then
    begin
      v_site_id := v_site_raw::uuid;
    exception when invalid_text_representation then
      raise exception 'sitio_de_registro_invalido';
    end;

    select s.organizacion_id into v_org_id
    from public.sitios as s
    join public.organizaciones as o on o.id = s.organizacion_id
    where s.id = v_site_id
      and coalesce(s.activo, true)
      and coalesce(o.activo, true)
      and (v_org_slug is null or o.slug = v_org_slug)
    limit 1;
    if v_org_id is null then raise exception 'sitio_de_registro_invalido'; end if;
  else
    v_org_id := coalesce(public.resolve_organization_by_key(v_org_key), public.get_default_organizacion_id());
  end if;
  if v_org_id is null then raise exception 'organizacion_de_registro_no_disponible'; end if;

  v_nombre := coalesce(v_nombre, nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Usuario');
  v_matricula := coalesce(v_matricula, 'AUTH-' || left(replace(v_auth_uid::text, '-', ''), 8));

  select ua.* into v_user
  from public.usuarios_app as ua
  where ua.auth_user_id = v_auth_uid and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;

  if not found and v_email is not null then
    select ua.* into v_user
    from public.usuarios_app as ua
    where lower(ua.email) = v_email and coalesce(ua.activo, true)
    order by public.app_role_rank(ua.rol) desc, ua.created_at asc
    limit 1;
    if found then
      update public.usuarios_app as ua
      set auth_user_id = v_auth_uid, nombre = coalesce(v_nombre, ua.nombre), email = v_email,
          ultimo_acceso_at = now(), updated_at = now()
      where ua.id = v_user.id
      returning ua.* into v_user;
    end if;
  end if;

  if not found then
    select ua.* into v_user
    from public.usuarios_app as ua
    where ua.organizacion_id = v_org_id and ua.matricula = v_matricula and coalesce(ua.activo, true)
    limit 1;
    if found then
      if public.normalize_app_role(v_user.rol) <> 'usuario'
         and (v_user.email is null or lower(v_user.email) <> coalesce(v_email, '')) then
        raise exception 'matricula_requiere_vinculacion_administrativa';
      end if;
      if v_site_id is not null and v_user.sitio_id is not null and v_user.sitio_id is distinct from v_site_id then
        raise exception 'matricula_asignada_a_otro_sitio';
      end if;
      update public.usuarios_app as ua
      set auth_user_id = v_auth_uid, nombre = coalesce(v_nombre, ua.nombre), email = coalesce(v_email, ua.email),
          sitio_id = coalesce(ua.sitio_id, v_site_id),
          scope_type = case when coalesce(ua.sitio_id, v_site_id) is null then ua.scope_type else 'propio' end,
          ultimo_acceso_at = now(), updated_at = now()
      where ua.id = v_user.id
      returning ua.* into v_user;
    else
      insert into public.usuarios_app (
        organizacion_id, sitio_id, nombre, matricula, email, rol, scope_type, activo, auth_user_id, ultimo_acceso_at
      ) values (v_org_id, v_site_id, v_nombre, v_matricula, v_email, 'usuario', 'propio', true, v_auth_uid, now())
      returning * into v_user;
    end if;
  else
    update public.usuarios_app as ua
    set nombre = coalesce(v_nombre, ua.nombre), email = coalesce(v_email, ua.email),
        ultimo_acceso_at = now(), updated_at = now()
    where ua.id = v_user.id
    returning ua.* into v_user;
  end if;

  return query
  select v_user.id, v_user.auth_user_id, v_user.organizacion_id, o.nombre,
         v_user.sitio_id, s.nombre, v_user.nombre, v_user.matricula, v_user.email,
         public.normalize_app_role(v_user.rol), public.app_role_rank(v_user.rol),
         public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb), v_user.activo
  from public.organizaciones as o
  left join public.sitios as s on s.id = v_user.sitio_id
  where o.id = v_user.organizacion_id;
end;
$$;

create or replace function public.admin_assign_user_scope(
  p_usuario_id uuid, p_sitio_id uuid, p_rol text default null
)
returns table (usuario_id uuid, sitio_id uuid, organizacion_id uuid, rol text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_actor_role text;
  v_new_role text;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last limit 1;
  if not found then raise exception 'usuario_app_no_encontrado'; end if;
  v_actor_role := public.normalize_app_role(v_actor.rol);
  if v_actor_role not in ('admin', 'superadmin') then raise exception 'permiso_manage_users_requerido'; end if;

  select ua.* into v_target from public.usuarios_app as ua where ua.id = p_usuario_id limit 1;
  if not found then raise exception 'usuario_no_encontrado'; end if;
  if public.normalize_app_role(v_target.rol) in ('admin', 'superadmin') then
    raise exception 'rol_administrativo_no_modificable_desde_alcance';
  end if;
  select s.* into v_site from public.sitios as s where s.id = p_sitio_id and coalesce(s.activo, true) limit 1;
  if not found then raise exception 'sitio_activo_no_encontrado'; end if;

  v_new_role := coalesce(lower(nullif(trim(coalesce(p_rol, '')), '')), 'usuario');
  if v_new_role not in ('usuario', 'supervisor') then raise exception 'rol_operativo_invalido'; end if;
  if v_actor_role = 'admin' and (
    v_target.organizacion_id is distinct from v_actor.organizacion_id
    or v_site.organizacion_id is distinct from v_actor.organizacion_id
  ) then raise exception 'sitio_fuera_de_alcance'; end if;

  update public.usuarios_app as ua
  set organizacion_id = v_site.organizacion_id, sitio_id = v_site.id, rol = v_new_role,
      scope_type = case when v_new_role = 'supervisor' then 'sitio' else 'propio' end, updated_at = now()
  where ua.id = v_target.id;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('user.scope_assigned', jsonb_build_object('usuario_id', v_target.id, 'rol_anterior', public.normalize_app_role(v_target.rol), 'rol_nuevo', v_new_role)::text, 'exitoso', v_actor.id, v_site.organizacion_id, v_site.id);
  return query select v_target.id, v_site.id, v_site.organizacion_id, v_new_role;
end;
$$;

create or replace function public.superadmin_deactivate_user(p_usuario_id uuid)
returns table (usuario_id uuid, desactivado boolean)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_actor_role text;
  v_target_role text;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last limit 1;
  if not found then raise exception 'usuario_app_no_encontrado'; end if;
  v_actor_role := public.normalize_app_role(v_actor.rol);
  if v_actor_role not in ('admin', 'superadmin') then raise exception 'permiso_admin_requerido'; end if;

  select ua.* into v_target from public.usuarios_app as ua where ua.id = p_usuario_id limit 1;
  if not found then raise exception 'usuario_no_encontrado'; end if;
  if v_target.id = v_actor.id then raise exception 'usuario_no_puede_eliminarse'; end if;
  v_target_role := public.normalize_app_role(v_target.rol);
  if v_target_role = 'superadmin' then raise exception 'superadmin_no_eliminable'; end if;
  if v_actor_role = 'admin' and (
    v_target.organizacion_id is distinct from v_actor.organizacion_id
    or v_target_role not in ('usuario', 'supervisor')
  ) then raise exception 'usuario_fuera_de_alcance'; end if;

  update public.usuarios_app as ua
  set activo = false, active_session_id = null, active_session_started_at = null,
      active_session_device_label = null, updated_at = now()
  where ua.id = v_target.id;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('user.deactivated', jsonb_build_object('usuario_id', v_target.id, 'rol', v_target_role, 'actor_rol', v_actor_role)::text, 'exitoso', v_actor.id, v_target.organizacion_id, v_target.sitio_id);
  return query select v_target.id, true;
end;
$$;

revoke all on function public.get_current_app_user(text, text, text) from public, anon;
grant execute on function public.get_current_app_user(text, text, text) to authenticated;
revoke all on function public.admin_assign_user_scope(uuid, uuid, text) from public, anon;
grant execute on function public.admin_assign_user_scope(uuid, uuid, text) to authenticated;
revoke all on function public.superadmin_deactivate_user(uuid) from public, anon;
grant execute on function public.superadmin_deactivate_user(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
