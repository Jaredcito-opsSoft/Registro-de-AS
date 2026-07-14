-- Correct superadmin attendance visibility and enforce one operational app session
-- per user. Supabase Auth remains the identity provider; this session controls
-- access to attendance and administration RPCs issued by the web app.

alter table public.usuarios_app
  add column if not exists active_session_id uuid,
  add column if not exists active_session_started_at timestamptz,
  add column if not exists active_session_device_label text;

create or replace function public.request_app_session_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_headers text := current_setting('request.headers', true);
  v_session_text text;
begin
  if coalesce(v_headers, '') = '' then
    return null;
  end if;

  v_session_text := coalesce((v_headers::jsonb ->> 'x-app-session-id'), '');
  if v_session_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v_session_text::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.assert_active_app_session()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_session_id uuid := public.request_app_session_id();
  v_active_session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sesion_requerida';
  end if;
  if v_session_id is null then
    raise exception 'sesion_operativa_requerida';
  end if;

  select active_session_id into v_active_session_id
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and coalesce(activo, true)
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if v_active_session_id is null then
    raise exception 'sesion_operativa_requerida';
  end if;
  if v_active_session_id <> v_session_id then
    raise exception 'sesion_reemplazada_en_otro_dispositivo';
  end if;
  return true;
end;
$$;

create or replace function public.activate_app_session(
  p_session_id uuid,
  p_device_label text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user public.usuarios_app%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sesion_requerida';
  end if;
  if p_session_id is null or public.request_app_session_id() is distinct from p_session_id then
    raise exception 'sesion_operativa_invalida';
  end if;

  select * into v_user
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and coalesce(activo, true)
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1
  for update;

  if v_user.id is null then
    raise exception 'usuario_app_no_encontrado';
  end if;

  if v_user.active_session_id is not null and v_user.active_session_id <> p_session_id then
    insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
    values ('sesion_operativa_reemplazada', 'Inicio de sesion desde otro dispositivo.', 'ok', v_user.id, v_user.organizacion_id, v_user.sitio_id);
  end if;

  update public.usuarios_app
  set active_session_id = p_session_id,
      active_session_started_at = clock_timestamp(),
      active_session_device_label = nullif(left(trim(coalesce(p_device_label, '')), 160), ''),
      ultimo_acceso_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = v_user.id;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('sesion_operativa_activada', 'Sesion operativa activada.', 'ok', v_user.id, v_user.organizacion_id, v_user.sitio_id);
  return true;
end;
$$;

create or replace function public.deactivate_app_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user public.usuarios_app%rowtype;
begin
  if auth.uid() is null then
    return false;
  end if;
  if p_session_id is null or public.request_app_session_id() is distinct from p_session_id then
    return false;
  end if;

  select * into v_user
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and active_session_id = p_session_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1
  for update;
  if v_user.id is null then
    return false;
  end if;

  update public.usuarios_app
  set active_session_id = null,
      active_session_started_at = null,
      active_session_device_label = null,
      updated_at = clock_timestamp()
  where id = v_user.id;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('sesion_operativa_cerrada', 'Sesion operativa cerrada.', 'ok', v_user.id, v_user.organizacion_id, v_user.sitio_id);
  return true;
end;
$$;

create or replace function public.verify_active_app_session()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
begin
  return public.assert_active_app_session();
end;
$$;

create or replace function public.get_attendance_actor(p_matricula text)
returns public.usuarios_app
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_matricula text := upper(trim(coalesce(p_matricula, '')));
begin
  perform public.assert_active_app_session();
  if v_matricula = '' then
    raise exception 'identificador_requerido';
  end if;

  select u.* into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by u.updated_at desc nulls last
  limit 1;

  if v_user.id is null then
    raise exception 'usuario_app_no_encontrado';
  end if;
  if upper(trim(v_user.matricula)) <> v_matricula then
    raise exception 'identificador_fuera_de_sesion';
  end if;
  if v_user.organizacion_id is null or v_user.sitio_id is null then
    raise exception 'usuario_sin_sitio_asignado';
  end if;
  return v_user;
end;
$$;

create or replace function public.get_visible_asistencias()
returns setof public.asistencias
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_permissions jsonb;
  v_role text;
begin
  perform public.assert_active_app_session();
  select * into v_user
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and coalesce(activo, true)
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;
  if v_user.id is null then
    return;
  end if;

  v_role := public.normalize_app_role(v_user.rol);
  v_permissions := public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb);

  if v_role = 'superadmin' then
    return query
    select a.* from public.asistencias a
    order by a.fecha desc, a.hora_entrada desc nulls last;
    return;
  end if;

  if coalesce((v_permissions->>'view_all_records')::boolean, false) then
    return query
    select a.* from public.asistencias a
    where a.organizacion_id = v_user.organizacion_id
    order by a.fecha desc, a.hora_entrada desc nulls last;
    return;
  end if;

  if coalesce((v_permissions->>'view_site_records')::boolean, false) and v_user.sitio_id is not null then
    return query
    select a.* from public.asistencias a
    where a.organizacion_id = v_user.organizacion_id
      and v_user.sitio_id in (a.sitio_id, a.sitio_entrada_id, a.sitio_salida_id)
    order by a.fecha desc, a.hora_entrada desc nulls last;
    return;
  end if;

  if coalesce((v_permissions->>'view_own_records')::boolean, true) then
    return query
    select a.* from public.asistencias a
    where a.organizacion_id = v_user.organizacion_id
      and (a.usuario_id = v_user.id or lower(trim(a.matricula)) = lower(trim(v_user.matricula)))
    order by a.fecha desc, a.hora_entrada desc nulls last;
  end if;
end;
$$;

create or replace function public.require_organization_manager(
  p_organization_id uuid default null,
  p_site_id uuid default null,
  p_superadmin_only boolean default false
)
returns public.usuarios_app
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_role text;
begin
  perform public.assert_active_app_session();
  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc, u.updated_at desc nulls last
  limit 1;

  if v_user.id is null then
    raise exception 'usuario_app_no_encontrado';
  end if;
  v_role := public.normalize_app_role(v_user.rol);
  if v_role not in ('admin', 'superadmin') then
    raise exception 'permiso_administracion_requerido';
  end if;
  if p_superadmin_only and v_role <> 'superadmin' then
    raise exception 'permiso_superadmin_requerido';
  end if;
  if v_role <> 'superadmin' then
    if p_organization_id is not null and p_organization_id <> v_user.organizacion_id then
      raise exception 'organizacion_fuera_de_alcance';
    end if;
    if p_site_id is not null and v_user.sitio_id is not null and p_site_id <> v_user.sitio_id then
      raise exception 'sitio_fuera_de_alcance';
    end if;
  end if;
  return v_user;
end;
$$;

revoke all on function public.request_app_session_id() from public, anon;
revoke all on function public.assert_active_app_session() from public, anon;
revoke all on function public.activate_app_session(uuid, text) from public, anon;
revoke all on function public.deactivate_app_session(uuid) from public, anon;
revoke all on function public.verify_active_app_session() from public, anon;
grant execute on function public.activate_app_session(uuid, text) to authenticated;
grant execute on function public.deactivate_app_session(uuid) to authenticated;
grant execute on function public.verify_active_app_session() to authenticated;
