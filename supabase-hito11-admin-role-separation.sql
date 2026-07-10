-- HITO 11: separacion real de superadmin, administrador de sitio y usuario.
-- Aplicado en Supabase: corrige get_current_app_user y agrega RPC de directorios administrativos.

alter table public.sitios add column if not exists clave_acceso_hash text;
alter table public.sitios add column if not exists configuracion jsonb not null default '{}'::jsonb;

create or replace function public.get_current_app_user(
  p_nombre text default null,
  p_matricula text default null,
  p_org_key text default null
)
returns table (
  id uuid,
  auth_user_id uuid,
  organizacion_id uuid,
  organizacion_nombre text,
  sitio_id uuid,
  sitio_nombre text,
  nombre text,
  matricula text,
  email text,
  rol text,
  rol_rank integer,
  permisos jsonb,
  activo boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_email text;
  v_org_id uuid;
  v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
  v_matricula text := upper(nullif(trim(coalesce(p_matricula, '')), ''));
  v_org_key text := nullif(trim(coalesce(p_org_key, '')), '');
  v_user public.usuarios_app%rowtype;
begin
  if v_auth_uid is null then
    raise exception 'Sesion requerida';
  end if;

  select lower(au.email), coalesce(v_org_key, au.raw_user_meta_data->>'organization_key', au.raw_user_meta_data->>'org_key')
  into v_email, v_org_key
  from auth.users au
  where au.id = v_auth_uid;

  v_org_id := coalesce(public.resolve_organization_by_key(v_org_key), public.get_default_organizacion_id());
  v_nombre := coalesce(v_nombre, nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Usuario');
  v_matricula := coalesce(v_matricula, 'AUTH-' || left(replace(v_auth_uid::text, '-', ''), 8));

  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = v_auth_uid
    and coalesce(u.activo, true)
  limit 1;

  if not found and v_email is not null then
    select * into v_user
    from public.usuarios_app u
    where lower(u.email) = v_email
      and coalesce(u.activo, true)
    order by public.app_role_rank(u.rol) desc, u.created_at asc
    limit 1;

    if found then
      update public.usuarios_app ua
      set auth_user_id = v_auth_uid,
          nombre = coalesce(v_nombre, ua.nombre),
          email = v_email,
          ultimo_acceso_at = now(),
          updated_at = now()
      where ua.id = v_user.id
      returning ua.* into v_user;
    end if;
  end if;

  if not found then
    select * into v_user
    from public.usuarios_app u
    where u.organizacion_id = v_org_id
      and u.matricula = v_matricula
      and coalesce(u.activo, true)
    limit 1;

    if found then
      if public.normalize_app_role(v_user.rol) <> 'usuario'
         and (v_user.email is null or lower(v_user.email) <> coalesce(v_email, '')) then
        raise exception 'Esta matricula requiere vinculacion administrativa antes de iniciar sesion.';
      end if;

      update public.usuarios_app ua
      set auth_user_id = v_auth_uid,
          nombre = coalesce(v_nombre, ua.nombre),
          email = coalesce(v_email, ua.email),
          ultimo_acceso_at = now(),
          updated_at = now()
      where ua.id = v_user.id
      returning ua.* into v_user;
    else
      insert into public.usuarios_app (organizacion_id, nombre, matricula, email, rol, activo, auth_user_id, ultimo_acceso_at)
      values (v_org_id, v_nombre, v_matricula, v_email, 'usuario', true, v_auth_uid, now())
      returning * into v_user;
    end if;
  else
    update public.usuarios_app ua
    set nombre = coalesce(v_nombre, ua.nombre),
        email = coalesce(v_email, ua.email),
        ultimo_acceso_at = now(),
        updated_at = now()
    where ua.id = v_user.id
    returning ua.* into v_user;
  end if;

  return query
  select
    v_user.id,
    v_user.auth_user_id,
    v_user.organizacion_id,
    o.nombre,
    v_user.sitio_id,
    s.nombre,
    v_user.nombre,
    v_user.matricula,
    v_user.email,
    public.normalize_app_role(v_user.rol),
    public.app_role_rank(v_user.rol),
    public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb),
    v_user.activo
  from public.organizaciones o
  left join public.sitios s on s.id = v_user.sitio_id
  where o.id = v_user.organizacion_id;
end;
$$;

create or replace function public.get_current_app_user(p_nombre text default null, p_matricula text default null)
returns table (
  id uuid, auth_user_id uuid, organizacion_id uuid, organizacion_nombre text, sitio_id uuid,
  sitio_nombre text, nombre text, matricula text, email text, rol text, rol_rank integer,
  permisos jsonb, activo boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select * from public.get_current_app_user(p_nombre, p_matricula, null::text);
$$;

create or replace function public.get_manageable_sites()
returns table (
  id uuid, organizacion_id uuid, organizacion_nombre text, nombre text, direccion text,
  activo boolean, radio_metros integer, zona_horaria text, hora_entrada_inicio text,
  hora_entrada_fin text, hora_salida_inicio text, hora_salida_fin text, usuarios_total integer,
  asistencias_total integer, tiene_clave boolean, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_role text;
begin
  select * into v_user from public.usuarios_app u where u.auth_user_id = auth.uid() and coalesce(u.activo, true) limit 1;
  if not found then raise exception 'Usuario de aplicacion no encontrado'; end if;
  v_role := public.normalize_app_role(v_user.rol);
  if v_role not in ('admin', 'superadmin') then raise exception 'Permiso insuficiente para administrar sitios'; end if;

  return query
  select s.id, s.organizacion_id, o.nombre, s.nombre, s.direccion, s.activo, s.radio_metros, s.zona_horaria,
    s.hora_entrada_inicio::text, s.hora_entrada_fin::text, s.hora_salida_inicio::text, s.hora_salida_fin::text,
    (select count(*)::integer from public.usuarios_app u2 where u2.sitio_id = s.id and coalesce(u2.activo, true)),
    (select count(*)::integer from public.asistencias a where a.sitio_id = s.id or a.sitio_entrada_id = s.id or a.sitio_salida_id = s.id),
    s.clave_acceso_hash is not null,
    s.updated_at
  from public.sitios s
  join public.organizaciones o on o.id = s.organizacion_id
  where case when v_role = 'superadmin' then true when v_user.sitio_id is not null then s.id = v_user.sitio_id else s.organizacion_id = v_user.organizacion_id end
  order by o.nombre asc, s.activo desc, s.nombre asc;
end;
$$;

create or replace function public.get_manageable_users()
returns table (
  id uuid, organizacion_id uuid, organizacion_nombre text, sitio_id uuid, sitio_nombre text,
  nombre text, matricula text, email text, rol text, activo boolean, ultimo_acceso_at timestamptz, created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_role text;
begin
  select * into v_user from public.usuarios_app u where u.auth_user_id = auth.uid() and coalesce(u.activo, true) limit 1;
  if not found then raise exception 'Usuario de aplicacion no encontrado'; end if;
  v_role := public.normalize_app_role(v_user.rol);
  if v_role not in ('admin', 'superadmin', 'supervisor') then raise exception 'Permiso insuficiente para consultar usuarios'; end if;

  return query
  select u.id, u.organizacion_id, o.nombre, u.sitio_id, s.nombre, u.nombre, u.matricula, u.email,
    public.normalize_app_role(u.rol), u.activo, u.ultimo_acceso_at, u.created_at
  from public.usuarios_app u
  join public.organizaciones o on o.id = u.organizacion_id
  left join public.sitios s on s.id = u.sitio_id
  where case when v_role = 'superadmin' then true when v_user.sitio_id is not null then u.organizacion_id = v_user.organizacion_id and u.sitio_id = v_user.sitio_id else u.organizacion_id = v_user.organizacion_id end
  order by o.nombre asc, s.nombre asc nulls last, public.app_role_rank(u.rol) desc, u.nombre asc;
end;
$$;

create or replace function public.admin_delete_site(p_site_id uuid)
returns table (deleted boolean, deactivated boolean, message text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_role text;
  v_site public.sitios%rowtype;
  v_refs integer;
begin
  select * into v_user from public.usuarios_app u where u.auth_user_id = auth.uid() and coalesce(u.activo, true) limit 1;
  if not found then raise exception 'Usuario de aplicacion no encontrado'; end if;
  v_role := public.normalize_app_role(v_user.rol);
  if v_role not in ('admin', 'superadmin') then raise exception 'Permiso insuficiente para eliminar sitios'; end if;

  select * into v_site from public.sitios s where s.id = p_site_id limit 1;
  if not found then raise exception 'Sitio no encontrado'; end if;
  if v_role <> 'superadmin' and v_site.organizacion_id <> v_user.organizacion_id then raise exception 'No puedes administrar sitios de otra organizacion'; end if;
  if v_role <> 'superadmin' and v_user.sitio_id is not null and v_site.id <> v_user.sitio_id then raise exception 'No puedes administrar otro sitio'; end if;

  select count(*)::integer into v_refs from public.asistencias a where a.sitio_id = p_site_id or a.sitio_entrada_id = p_site_id or a.sitio_salida_id = p_site_id;
  if v_refs > 0 then
    update public.sitios set activo = false, updated_at = now() where id = p_site_id;
    return query select false, true, 'Sitio con asistencias historicas: se desactivo para preservar evidencia.';
  else
    delete from public.sitios where id = p_site_id;
    return query select true, false, 'Sitio eliminado porque no tenia asistencias historicas.';
  end if;
end;
$$;


create or replace function public.admin_set_site_key(p_site_id uuid, p_clave text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $
declare
  v_user public.usuarios_app%rowtype;
  v_role text;
  v_site public.sitios%rowtype;
  v_clean_key text := nullif(trim(coalesce(p_clave, '')), '');
begin
  if v_clean_key is null or length(v_clean_key) < 8 then raise exception 'La llave de sitio debe tener al menos 8 caracteres'; end if;
  select * into v_user from public.usuarios_app u where u.auth_user_id = auth.uid() and coalesce(u.activo, true) limit 1;
  if not found then raise exception 'Usuario de aplicacion no encontrado'; end if;
  v_role := public.normalize_app_role(v_user.rol);
  if v_role not in ('admin', 'superadmin') then raise exception 'Permiso insuficiente para configurar llave de sitio'; end if;
  select * into v_site from public.sitios s where s.id = p_site_id limit 1;
  if not found then raise exception 'Sitio no encontrado'; end if;
  if v_role <> 'superadmin' and v_site.organizacion_id <> v_user.organizacion_id then raise exception 'No puedes administrar sitios de otra organizacion'; end if;
  if v_role <> 'superadmin' and v_user.sitio_id is not null and v_site.id <> v_user.sitio_id then raise exception 'No puedes administrar otro sitio'; end if;
  update public.sitios set clave_acceso_hash = public.hash_org_key(v_clean_key), updated_at = now() where id = p_site_id;
  return true;
end;
$;

revoke execute on function public.get_current_app_user(text,text,text) from public, anon;
revoke execute on function public.get_current_app_user(text,text) from public, anon;
revoke execute on function public.get_manageable_sites() from public, anon;
revoke execute on function public.get_manageable_users() from public, anon;
revoke execute on function public.admin_delete_site(uuid) from public, anon;
revoke execute on function public.admin_set_site_key(uuid,text) from public, anon;
grant execute on function public.get_current_app_user(text,text,text) to authenticated;
grant execute on function public.get_current_app_user(text,text) to authenticated;
grant execute on function public.get_manageable_sites() to authenticated;
grant execute on function public.get_manageable_users() to authenticated;
grant execute on function public.admin_delete_site(uuid) to authenticated;
grant execute on function public.admin_set_site_key(uuid,text) to authenticated;

notify pgrst, 'reload schema';
