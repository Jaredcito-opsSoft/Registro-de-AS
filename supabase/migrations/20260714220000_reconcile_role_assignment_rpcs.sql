-- Recupera el contrato de roles cuando el proyecto remoto conserva RPCs heredadas.
-- Estas funciones usan auth.uid() y nunca aceptan el actor desde el cliente.

begin;

alter table public.usuarios_app
  add column if not exists scope_type text not null default 'propio';

update public.usuarios_app
set scope_type = case public.normalize_app_role(rol)
  when 'superadmin' then 'global'
  when 'admin' then case when sitio_id is null then 'organizacion' else 'sitio' end
  when 'supervisor' then 'sitio'
  else 'propio'
end
where scope_type is null
   or scope_type not in ('propio', 'sitio', 'organizacion', 'global');

alter table public.usuarios_app
  drop constraint if exists usuarios_app_scope_type_check;

alter table public.usuarios_app
  add constraint usuarios_app_scope_type_check
  check (scope_type in ('propio', 'sitio', 'organizacion', 'global'));

create or replace function public.admin_assign_user_scope(
  p_usuario_id uuid,
  p_sitio_id uuid,
  p_rol text default null
)
returns table (
  usuario_id uuid,
  sitio_id uuid,
  organizacion_id uuid,
  rol text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_actor_role text;
  v_requested_role text;
  v_new_role text;
  v_scope_type text;
begin
  if auth.uid() is null then raise exception 'sesion_requerida'; end if;

  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found then raise exception 'usuario_app_no_encontrado'; end if;

  v_actor_role := public.normalize_app_role(v_actor.rol);
  if v_actor_role not in ('admin', 'superadmin') then
    raise exception 'permiso_manage_users_requerido';
  end if;

  select ua.* into v_target
  from public.usuarios_app as ua
  where ua.id = p_usuario_id
  limit 1;
  if not found then raise exception 'usuario_no_encontrado'; end if;
  if public.normalize_app_role(v_target.rol) = 'superadmin' then
    raise exception 'superadmin_no_modificable_desde_asignacion';
  end if;

  select s.* into v_site
  from public.sitios as s
  where s.id = p_sitio_id and coalesce(s.activo, true)
  limit 1;
  if not found then raise exception 'sitio_activo_no_encontrado'; end if;

  if v_actor_role = 'admin' then
    if v_target.organizacion_id is distinct from v_actor.organizacion_id
       or v_site.organizacion_id is distinct from v_actor.organizacion_id
       or (v_actor.sitio_id is not null and v_actor.sitio_id <> v_site.id) then
      raise exception 'sitio_fuera_de_alcance';
    end if;
    if public.normalize_app_role(v_target.rol) <> 'usuario' then
      raise exception 'admin_solo_puede_gestionar_usuarios_regulares';
    end if;
  end if;

  v_requested_role := lower(nullif(trim(coalesce(p_rol, '')), ''));
  if v_requested_role is not null and v_requested_role not in ('usuario', 'supervisor') then
    raise exception 'rol_operativo_invalido';
  end if;
  if v_actor_role = 'admin' and coalesce(v_requested_role, 'usuario') <> 'usuario' then
    raise exception 'admin_no_puede_cambiar_roles';
  end if;

  v_new_role := case when v_actor_role = 'admin' then 'usuario' else coalesce(v_requested_role, 'usuario') end;
  v_scope_type := case when v_new_role = 'supervisor' then 'sitio' else 'propio' end;

  update public.usuarios_app as ua
  set organizacion_id = v_site.organizacion_id,
      sitio_id = v_site.id,
      rol = v_new_role,
      scope_type = v_scope_type,
      updated_at = now()
  where ua.id = v_target.id;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values (
    'user.scope_assigned',
    jsonb_build_object(
      'usuario_id', v_target.id,
      'organizacion_anterior', v_target.organizacion_id,
      'organizacion_nueva', v_site.organizacion_id,
      'sitio_anterior', v_target.sitio_id,
      'sitio_nuevo', v_site.id,
      'rol_anterior', public.normalize_app_role(v_target.rol),
      'rol_nuevo', v_new_role
    )::text,
    'exitoso', v_actor.id, v_site.organizacion_id, v_site.id
  );

  return query select v_target.id, v_site.id, v_site.organizacion_id, v_new_role;
end;
$$;

create or replace function public.superadmin_assign_organization_admin(
  p_usuario_id uuid,
  p_organizacion_id uuid
)
returns table (
  usuario_id uuid,
  organizacion_id uuid,
  nombre text,
  rol text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_organization public.organizaciones%rowtype;
begin
  if auth.uid() is null then raise exception 'sesion_requerida'; end if;

  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found or public.normalize_app_role(v_actor.rol) <> 'superadmin' then
    raise exception 'permiso_superadmin_requerido';
  end if;

  select ua.* into v_target
  from public.usuarios_app as ua
  where ua.id = p_usuario_id
  limit 1;
  if not found then raise exception 'usuario_no_encontrado'; end if;
  if public.normalize_app_role(v_target.rol) = 'superadmin' then
    raise exception 'superadmin_no_modificable';
  end if;

  select o.* into v_organization
  from public.organizaciones as o
  where o.id = p_organizacion_id and coalesce(o.activo, true)
  limit 1;
  if not found then raise exception 'organizacion_activa_no_encontrada'; end if;

  update public.usuarios_app as ua
  set organizacion_id = v_organization.id,
      sitio_id = null,
      rol = 'admin',
      scope_type = 'organizacion',
      updated_at = now()
  where ua.id = v_target.id;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values (
    'organization.admin_assigned',
    jsonb_build_object(
      'usuario_id', v_target.id,
      'organizacion_anterior', v_target.organizacion_id,
      'rol_anterior', public.normalize_app_role(v_target.rol),
      'rol_nuevo', 'admin'
    )::text,
    'exitoso', v_actor.id, v_organization.id, null
  );

  return query
  select v_target.id, v_organization.id,
         coalesce(v_target.nombre, v_target.email, v_target.matricula, 'Usuario'),
         'admin'::text;
end;
$$;

revoke all on function public.admin_assign_user_scope(uuid, uuid, text) from public, anon;
revoke all on function public.superadmin_assign_organization_admin(uuid, uuid) from public, anon;
grant execute on function public.admin_assign_user_scope(uuid, uuid, text) to authenticated;
grant execute on function public.superadmin_assign_organization_admin(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
