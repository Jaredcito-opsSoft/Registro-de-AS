begin;

create table if not exists public.usuario_sitios_alcance (
  usuario_id uuid not null references public.usuarios_app(id) on delete cascade,
  sitio_id uuid not null references public.sitios(id) on delete cascade,
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  es_principal boolean not null default false,
  asignado_por uuid references public.usuarios_app(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (usuario_id, sitio_id)
);

create unique index if not exists usuario_sitios_alcance_principal_uidx
  on public.usuario_sitios_alcance(usuario_id)
  where es_principal;

create index if not exists usuario_sitios_alcance_sitio_idx
  on public.usuario_sitios_alcance(sitio_id, usuario_id);

alter table public.usuario_sitios_alcance enable row level security;
revoke all on table public.usuario_sitios_alcance from public, anon, authenticated;

create or replace function public.validate_usuario_sitio_alcance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_org uuid;
  v_site_org uuid;
begin
  select ua.organizacion_id into v_user_org
  from public.usuarios_app as ua
  where ua.id = new.usuario_id;

  select s.organizacion_id into v_site_org
  from public.sitios as s
  where s.id = new.sitio_id;

  if v_user_org is null or v_site_org is null or v_user_org is distinct from v_site_org then
    raise exception 'sitio_fuera_de_organizacion_del_usuario';
  end if;

  new.organizacion_id := v_site_org;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_usuario_sitio_alcance on public.usuario_sitios_alcance;
create trigger trg_validate_usuario_sitio_alcance
before insert or update on public.usuario_sitios_alcance
for each row execute function public.validate_usuario_sitio_alcance();

revoke all on function public.validate_usuario_sitio_alcance() from public, anon, authenticated;

insert into public.usuario_sitios_alcance (
  usuario_id, sitio_id, organizacion_id, es_principal
)
select ua.id, ua.sitio_id, ua.organizacion_id, true
from public.usuarios_app as ua
join public.sitios as s on s.id = ua.sitio_id and s.organizacion_id = ua.organizacion_id
where ua.sitio_id is not null
on conflict (usuario_id, sitio_id) do update
set es_principal = true,
    updated_at = now();

create or replace function public.admin_update_user_scope(
  p_usuario_id uuid,
  p_sitio_ids uuid[] default null,
  p_sitio_principal_id uuid default null,
  p_rol text default null
)
returns table (
  usuario_id uuid,
  sitio_id uuid,
  organizacion_id uuid,
  rol text,
  sitios_asignados integer
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_actor_role text;
  v_current_role text;
  v_new_role text;
  v_site_ids uuid[];
  v_primary_site_id uuid;
  v_invalid_sites integer;
  v_scope_type text;
begin
  perform public.assert_active_app_session();

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
  where ua.id = p_usuario_id and coalesce(ua.activo, true)
  for update;
  if not found then raise exception 'usuario_no_encontrado'; end if;

  v_current_role := public.normalize_app_role(v_target.rol);
  if v_current_role = 'superadmin' then
    raise exception 'superadmin_no_modificable';
  end if;

  if nullif(trim(coalesce(p_rol, '')), '') is not null
     and lower(trim(p_rol)) not in ('usuario', 'supervisor', 'admin') then
    raise exception 'rol_objetivo_invalido';
  end if;

  v_new_role := case
    when nullif(trim(coalesce(p_rol, '')), '') is null then v_current_role
    else public.normalize_app_role(p_rol)
  end;

  if v_actor_role = 'admin' then
    if v_target.organizacion_id is distinct from v_actor.organizacion_id then
      raise exception 'usuario_fuera_de_organizacion';
    end if;
    if v_current_role in ('admin', 'superadmin') and v_target.id is distinct from v_actor.id then
      raise exception 'admin_no_puede_modificar_otro_admin';
    end if;
    if v_new_role not in ('usuario', 'supervisor') and v_target.id is distinct from v_actor.id then
      raise exception 'admin_no_puede_otorgar_rol_administrativo';
    end if;
    if v_target.id = v_actor.id and v_new_role is distinct from v_current_role then
      raise exception 'admin_no_puede_cambiar_su_propio_rol';
    end if;
  elsif v_new_role not in ('usuario', 'supervisor', 'admin') then
    raise exception 'rol_objetivo_invalido';
  end if;

  if p_sitio_ids is null then
    select coalesce(array_agg(scope.sitio_id order by scope.es_principal desc, scope.created_at), '{}'::uuid[])
    into v_site_ids
    from public.usuario_sitios_alcance as scope
    where scope.usuario_id = v_target.id;

    if coalesce(array_length(v_site_ids, 1), 0) = 0 and v_target.sitio_id is not null then
      v_site_ids := array[v_target.sitio_id];
    end if;
  else
    select coalesce(array_agg(distinct requested.site_id), '{}'::uuid[])
    into v_site_ids
    from unnest(p_sitio_ids) as requested(site_id)
    where requested.site_id is not null;
  end if;

  select count(*) into v_invalid_sites
  from unnest(v_site_ids) as requested(site_id)
  left join public.sitios as s on s.id = requested.site_id
  where s.id is null
     or not coalesce(s.activo, true)
     or s.organizacion_id is distinct from v_target.organizacion_id;
  if v_invalid_sites > 0 then raise exception 'sitio_fuera_de_organizacion'; end if;

  v_primary_site_id := coalesce(p_sitio_principal_id, v_target.sitio_id);
  if v_primary_site_id is not null and not (v_primary_site_id = any(v_site_ids)) then
    v_primary_site_id := null;
  end if;
  if v_primary_site_id is null and coalesce(array_length(v_site_ids, 1), 0) > 0 then
    v_primary_site_id := v_site_ids[1];
  end if;

  if v_new_role in ('usuario', 'supervisor') and v_primary_site_id is null then
    raise exception 'sitio_requerido_para_rol_operativo';
  end if;

  if v_new_role = 'usuario' and v_primary_site_id is not null then
    v_site_ids := array[v_primary_site_id];
  end if;

  v_scope_type := case v_new_role
    when 'superadmin' then 'global'
    when 'admin' then 'organizacion'
    when 'supervisor' then 'sitio'
    else 'propio'
  end;

  update public.usuarios_app as ua
  set sitio_id = v_primary_site_id,
      rol = v_new_role,
      scope_type = v_scope_type,
      updated_at = now()
  where ua.id = v_target.id;

  delete from public.usuario_sitios_alcance as scope
  where scope.usuario_id = v_target.id;

  insert into public.usuario_sitios_alcance (
    usuario_id, sitio_id, organizacion_id, es_principal, asignado_por
  )
  select v_target.id, requested.site_id, v_target.organizacion_id,
         requested.site_id = v_primary_site_id, v_actor.id
  from unnest(v_site_ids) as requested(site_id)
  on conflict on constraint usuario_sitios_alcance_pkey do update
  set es_principal = excluded.es_principal,
      asignado_por = excluded.asignado_por,
      updated_at = now();

  insert into public.audit_logs (
    accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id
  ) values (
    'user.scope_updated',
    jsonb_build_object(
      'usuario_id', v_target.id,
      'rol_anterior', v_current_role,
      'rol_nuevo', v_new_role,
      'sitio_anterior', v_target.sitio_id,
      'sitio_principal_nuevo', v_primary_site_id,
      'sitios_nuevos', v_site_ids
    )::text,
    'exitoso', v_actor.id, v_target.organizacion_id, v_primary_site_id
  );

  return query
  select v_target.id, v_primary_site_id, v_target.organizacion_id, v_new_role,
         coalesce(array_length(v_site_ids, 1), 0);
end;
$$;

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
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select result.usuario_id, result.sitio_id, result.organizacion_id, result.rol
  from public.admin_update_user_scope(
    p_usuario_id,
    array[p_sitio_id],
    p_sitio_id,
    p_rol
  ) as result;
$$;

create or replace function public.get_manageable_user_site_scopes()
returns table (
  usuario_id uuid,
  sitio_id uuid,
  sitio_nombre text,
  organizacion_id uuid,
  es_principal boolean
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_actor_role text;
begin
  perform public.assert_active_app_session();
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

  return query
  select scope.usuario_id, scope.sitio_id, s.nombre, scope.organizacion_id, scope.es_principal
  from public.usuario_sitios_alcance as scope
  join public.sitios as s on s.id = scope.sitio_id
  join public.usuarios_app as target on target.id = scope.usuario_id
  where v_actor_role = 'superadmin'
     or target.organizacion_id = v_actor.organizacion_id
  order by scope.usuario_id, scope.es_principal desc, s.nombre;
end;
$$;

create or replace function public.get_my_site_scopes()
returns table (
  sitio_id uuid,
  sitio_nombre text,
  organizacion_id uuid,
  organizacion_nombre text,
  es_principal boolean
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_actor_role text;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found then return; end if;
  v_actor_role := public.normalize_app_role(v_actor.rol);

  return query
  select s.id, s.nombre, s.organizacion_id, o.nombre,
         s.id = v_actor.sitio_id
  from public.sitios as s
  join public.organizaciones as o on o.id = s.organizacion_id
  where coalesce(s.activo, true)
    and case
      when v_actor_role = 'superadmin' then true
      when v_actor_role = 'admin' then s.organizacion_id = v_actor.organizacion_id
      when v_actor_role = 'supervisor' then
        s.id = v_actor.sitio_id
        or exists (
          select 1 from public.usuario_sitios_alcance as scope
          where scope.usuario_id = v_actor.id and scope.sitio_id = s.id
        )
      else s.id = v_actor.sitio_id
    end
  order by (s.id = v_actor.sitio_id) desc, o.nombre, s.nombre;
end;
$$;

create or replace function public.get_manageable_sites()
returns table (
  id uuid,
  organizacion_id uuid,
  organizacion_nombre text,
  nombre text,
  direccion text,
  activo boolean,
  radio_metros integer,
  zona_horaria text,
  hora_entrada_inicio text,
  hora_entrada_fin text,
  hora_salida_inicio text,
  hora_salida_fin text,
  usuarios_total integer,
  asistencias_total integer,
  tiene_clave boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_actor_role text;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found then raise exception 'usuario_app_no_encontrado'; end if;

  v_actor_role := public.normalize_app_role(v_actor.rol);
  if v_actor_role not in ('supervisor', 'admin', 'superadmin') then
    raise exception 'permiso_sitios_requerido';
  end if;

  return query
  select s.id, s.organizacion_id, o.nombre, s.nombre, s.direccion, s.activo,
         s.radio_metros, s.zona_horaria, s.hora_entrada_inicio::text,
         s.hora_entrada_fin::text, s.hora_salida_inicio::text,
         s.hora_salida_fin::text,
         (select count(*)::integer from public.usuarios_app as u2
          where u2.sitio_id = s.id and coalesce(u2.activo, true)),
         (select count(*)::integer from public.asistencias as a
          where s.id in (a.sitio_id, a.sitio_entrada_id, a.sitio_salida_id)),
         s.clave_acceso_hash is not null, s.updated_at
  from public.sitios as s
  join public.organizaciones as o on o.id = s.organizacion_id
  where case
    when v_actor_role = 'superadmin' then true
    when v_actor_role = 'admin' then s.organizacion_id = v_actor.organizacion_id
    else s.id = v_actor.sitio_id or exists (
      select 1 from public.usuario_sitios_alcance as scope
      where scope.usuario_id = v_actor.id and scope.sitio_id = s.id
    )
  end
  order by o.nombre, s.activo desc, s.nombre;
end;
$$;

create or replace function public.get_manageable_users()
returns table (
  id uuid,
  organizacion_id uuid,
  organizacion_nombre text,
  sitio_id uuid,
  sitio_nombre text,
  nombre text,
  matricula text,
  email text,
  rol text,
  activo boolean,
  ultimo_acceso_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_actor_role text;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found then raise exception 'usuario_app_no_encontrado'; end if;

  v_actor_role := public.normalize_app_role(v_actor.rol);
  if v_actor_role not in ('supervisor', 'admin', 'superadmin') then
    raise exception 'permiso_consultar_usuarios_requerido';
  end if;

  return query
  select target.id, target.organizacion_id, o.nombre, target.sitio_id, s.nombre,
         target.nombre, target.matricula, target.email,
         public.normalize_app_role(target.rol), target.activo,
         target.ultimo_acceso_at, target.created_at
  from public.usuarios_app as target
  join public.organizaciones as o on o.id = target.organizacion_id
  left join public.sitios as s on s.id = target.sitio_id
  where case
    when v_actor_role = 'superadmin' then true
    when v_actor_role = 'admin' then target.organizacion_id = v_actor.organizacion_id
    else target.organizacion_id = v_actor.organizacion_id and (
      target.sitio_id = v_actor.sitio_id
      or exists (
        select 1
        from public.usuario_sitios_alcance as actor_scope
        where actor_scope.usuario_id = v_actor.id
          and actor_scope.sitio_id = target.sitio_id
      )
    )
  end
  order by o.nombre, s.nombre nulls last,
           public.app_role_rank(target.rol) desc, target.nombre;
end;
$$;

create or replace function public.get_visible_asistencias()
returns setof public.asistencias
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_permissions jsonb;
  v_actor_role text;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found then return; end if;

  v_actor_role := public.normalize_app_role(v_actor.rol);
  v_permissions := public.app_role_permissions(v_actor.rol) || coalesce(v_actor.permisos_extra, '{}'::jsonb);

  if v_actor_role = 'superadmin' then
    return query select a.* from public.asistencias as a
    order by a.fecha desc, a.hora_entrada desc nulls last;
    return;
  end if;

  if v_actor_role = 'admin' or coalesce((v_permissions->>'view_all_records')::boolean, false) then
    return query select a.* from public.asistencias as a
    where a.organizacion_id = v_actor.organizacion_id
    order by a.fecha desc, a.hora_entrada desc nulls last;
    return;
  end if;

  if v_actor_role = 'supervisor' and coalesce((v_permissions->>'view_site_records')::boolean, false) then
    return query
    select a.* from public.asistencias as a
    where a.organizacion_id = v_actor.organizacion_id
      and exists (
        select 1
        from public.sitios as allowed_site
        where allowed_site.id in (a.sitio_id, a.sitio_entrada_id, a.sitio_salida_id)
          and (
            allowed_site.id = v_actor.sitio_id
            or exists (
              select 1 from public.usuario_sitios_alcance as scope
              where scope.usuario_id = v_actor.id
                and scope.sitio_id = allowed_site.id
            )
          )
      )
    order by a.fecha desc, a.hora_entrada desc nulls last;
    return;
  end if;

  if coalesce((v_permissions->>'view_own_records')::boolean, true) then
    return query select a.* from public.asistencias as a
    where a.organizacion_id = v_actor.organizacion_id
      and (a.usuario_id = v_actor.id or lower(trim(a.matricula)) = lower(trim(v_actor.matricula)))
    order by a.fecha desc, a.hora_entrada desc nulls last;
  end if;
end;
$$;

revoke all on function public.admin_update_user_scope(uuid, uuid[], uuid, text) from public, anon;
revoke all on function public.admin_assign_user_scope(uuid, uuid, text) from public, anon;
revoke all on function public.get_manageable_user_site_scopes() from public, anon;
revoke all on function public.get_my_site_scopes() from public, anon;
revoke all on function public.get_manageable_sites() from public, anon;
revoke all on function public.get_manageable_users() from public, anon;
revoke all on function public.get_visible_asistencias() from public, anon;

grant execute on function public.admin_update_user_scope(uuid, uuid[], uuid, text) to authenticated;
grant execute on function public.admin_assign_user_scope(uuid, uuid, text) to authenticated;
grant execute on function public.get_manageable_user_site_scopes() to authenticated;
grant execute on function public.get_my_site_scopes() to authenticated;
grant execute on function public.get_manageable_sites() to authenticated;
grant execute on function public.get_manageable_users() to authenticated;
grant execute on function public.get_visible_asistencias() to authenticated;

notify pgrst, 'reload schema';

commit;
