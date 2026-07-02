-- HITO 9: administracion multiempresa y clave de organizacion

create extension if not exists pgcrypto;

alter table public.organizaciones
  add column if not exists clave_acceso_hash text,
  add column if not exists configuracion jsonb not null default '{}'::jsonb;

create or replace function public.hash_org_key(p_key text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when nullif(trim(coalesce(p_key, '')), '') is null then null
    else encode(extensions.digest(upper(trim(p_key)), 'sha256'), 'hex')
  end;
$$;

update public.organizaciones
set clave_acceso_hash = public.hash_org_key('DEMO-AS-2026')
where slug = 'organizacion-principal'
  and clave_acceso_hash is null;

create or replace function public.resolve_organization_by_key(p_key text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.organizaciones o
  where o.activo = true
    and o.clave_acceso_hash = public.hash_org_key(p_key)
  limit 1;
$$;

create or replace function public.get_manageable_organizations()
returns table (
  id uuid,
  nombre text,
  tipo text,
  slug text,
  activo boolean,
  sitios_total integer,
  usuarios_total integer,
  asistencias_total integer,
  puede_editar boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_permissions jsonb;
begin
  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by u.updated_at desc nulls last, u.created_at desc nulls last
  limit 1;

  if v_user.id is null then
    return;
  end if;

  v_permissions := public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb);

  return query
  select
    o.id,
    o.nombre,
    o.tipo,
    o.slug,
    o.activo,
    (select count(*)::integer from public.sitios s where s.organizacion_id = o.id),
    (select count(*)::integer from public.usuarios_app u where u.organizacion_id = o.id),
    (select count(*)::integer from public.asistencias a where a.organizacion_id = o.id),
    coalesce((v_permissions->>'manage_organization')::boolean, false) or o.id = v_user.organizacion_id
  from public.organizaciones o
  where o.activo = true
    and (
      coalesce((v_permissions->>'manage_organization')::boolean, false)
      or o.id = v_user.organizacion_id
    )
  order by o.nombre asc;
end;
$$;

create or replace function public.admin_create_organization(
  p_nombre text,
  p_tipo text default 'empresa',
  p_slug text default null,
  p_clave text default null,
  p_activo boolean default true
)
returns table (
  id uuid,
  nombre text,
  tipo text,
  slug text,
  activo boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permissions jsonb;
  v_slug text;
  v_key text;
  v_org public.organizaciones%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sesion_requerida';
  end if;

  select public.app_role_permissions(u.rol) || coalesce(u.permisos_extra, '{}'::jsonb)
  into v_permissions
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc
  limit 1;

  if not coalesce((v_permissions->>'manage_organization')::boolean, false) then
    raise exception 'permiso_manage_organization_requerido';
  end if;

  if nullif(trim(coalesce(p_nombre, '')), '') is null then
    raise exception 'nombre_requerido';
  end if;

  if coalesce(p_tipo, 'empresa') not in ('empresa', 'escuela', 'centro_trabajo', 'negocio_local', 'otro') then
    raise exception 'tipo_invalido';
  end if;

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), trim(p_nombre)), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    v_slug := 'org-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
  end if;

  v_key := nullif(trim(coalesce(p_clave, '')), '');
  if v_key is null then
    v_key := upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
  end if;

  insert into public.organizaciones (nombre, tipo, slug, activo, clave_acceso_hash)
  values (trim(p_nombre), coalesce(p_tipo, 'empresa'), v_slug, coalesce(p_activo, true), public.hash_org_key(v_key))
  on conflict (slug) do update
  set nombre = excluded.nombre,
      tipo = excluded.tipo,
      activo = excluded.activo,
      clave_acceso_hash = excluded.clave_acceso_hash,
      updated_at = now()
  returning * into v_org;

  return query select v_org.id, v_org.nombre, v_org.tipo, v_org.slug, v_org.activo;
end;
$$;

drop function if exists public.get_organization_context();
create or replace function public.get_organization_context()
returns table (
  organizacion_id uuid,
  organizacion_nombre text,
  organizacion_tipo text,
  sitios_total integer,
  usuarios_total integer,
  asistencias_total integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_permissions jsonb;
begin
  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc, u.updated_at desc nulls last
  limit 1;

  if v_user.id is null then
    return query
    select o.id, o.nombre, o.tipo,
      (select count(*)::integer from public.sitios s where s.organizacion_id = o.id),
      (select count(*)::integer from public.usuarios_app u where u.organizacion_id = o.id),
      (select count(*)::integer from public.asistencias a where a.organizacion_id = o.id)
    from public.organizaciones o
    where o.slug = 'organizacion-principal'
    limit 1;
    return;
  end if;

  v_permissions := public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb);

  if coalesce((v_permissions->>'manage_organization')::boolean, false) then
    return query
    select null::uuid, 'Todas las organizaciones'::text, 'multiempresa'::text,
      (select count(*)::integer from public.sitios),
      (select count(*)::integer from public.usuarios_app),
      (select count(*)::integer from public.asistencias);
    return;
  end if;

  return query
  select o.id, o.nombre, o.tipo,
    (select count(*)::integer from public.sitios s where s.organizacion_id = o.id),
    (select count(*)::integer from public.usuarios_app u where u.organizacion_id = o.id),
    (select count(*)::integer from public.asistencias a where a.organizacion_id = o.id)
  from public.organizaciones o
  where o.id = v_user.organizacion_id
  limit 1;
end;
$$;

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

  select lower(email), coalesce(v_org_key, raw_user_meta_data->>'organization_key', raw_user_meta_data->>'org_key')
  into v_email, v_org_key
  from auth.users
  where auth.users.id = v_auth_uid;

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
      update public.usuarios_app
      set auth_user_id = v_auth_uid,
          nombre = coalesce(v_nombre, nombre),
          email = v_email,
          ultimo_acceso_at = now(),
          updated_at = now()
      where public.usuarios_app.id = v_user.id
      returning * into v_user;
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

      update public.usuarios_app
      set auth_user_id = v_auth_uid,
          nombre = coalesce(v_nombre, nombre),
          email = coalesce(v_email, email),
          ultimo_acceso_at = now(),
          updated_at = now()
      where public.usuarios_app.id = v_user.id
      returning * into v_user;
    else
      insert into public.usuarios_app (organizacion_id, nombre, matricula, email, rol, activo, auth_user_id, ultimo_acceso_at)
      values (v_org_id, v_nombre, v_matricula, v_email, 'usuario', true, v_auth_uid, now())
      returning * into v_user;
    end if;
  else
    update public.usuarios_app
    set nombre = coalesce(v_nombre, nombre),
        email = coalesce(v_email, email),
        ultimo_acceso_at = now(),
        updated_at = now()
    where public.usuarios_app.id = v_user.id
    returning * into v_user;
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

drop function if exists public.get_active_site();
create or replace function public.get_active_site()
returns table (
  id uuid,
  nombre text,
  direccion text,
  latitud numeric,
  longitud numeric,
  radio_metros integer,
  hora_entrada_inicio text,
  hora_entrada_fin text,
  hora_salida_inicio text,
  hora_salida_fin text,
  zona_horaria text,
  activo boolean,
  configured boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_org_id uuid;
begin
  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  limit 1;

  v_org_id := coalesce(v_user.organizacion_id, public.get_default_organizacion_id());

  return query
  select s.id, s.nombre, s.direccion, s.latitud, s.longitud, s.radio_metros,
    to_char(s.hora_entrada_inicio, 'HH24:MI'),
    to_char(s.hora_entrada_fin, 'HH24:MI'),
    to_char(s.hora_salida_inicio, 'HH24:MI'),
    to_char(s.hora_salida_fin, 'HH24:MI'),
    s.zona_horaria, s.activo, true
  from public.sitios s
  where s.activo = true
    and s.organizacion_id = v_org_id
    and (v_user.sitio_id is null or s.id = v_user.sitio_id or public.current_user_can('manage_organization'))
  order by s.updated_at desc nulls last
  limit 1;
end;
$$;

drop function if exists public.upsert_site_config(text,text,text,numeric,numeric,integer,text,text,text,text,text,boolean);
create or replace function public.upsert_site_config(
  p_admin_key text,
  p_nombre text,
  p_direccion text,
  p_latitud numeric,
  p_longitud numeric,
  p_radio_metros integer default 150,
  p_hora_entrada_inicio text default '07:30',
  p_hora_entrada_fin text default '08:15',
  p_hora_salida_inicio text default '16:30',
  p_hora_salida_fin text default '17:10',
  p_zona_horaria text default 'America/Mexico_City',
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_permissions jsonb;
  v_org_id uuid;
  v_site_id uuid;
  v_entry_start time := p_hora_entrada_inicio::time;
  v_entry_end time := p_hora_entrada_fin::time;
  v_exit_start time := p_hora_salida_inicio::time;
  v_exit_end time := p_hora_salida_fin::time;
begin
  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = auth.uid()
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc
  limit 1;

  v_permissions := public.app_role_permissions(v_user.rol) || coalesce(v_user.permisos_extra, '{}'::jsonb);

  if v_user.id is null then
    if p_admin_key is distinct from 'ADMIN123' then
      raise exception 'sesion_o_clave_administrativa_requerida';
    end if;
    v_org_id := public.get_default_organizacion_id();
  else
    if not coalesce((v_permissions->>'manage_site')::boolean, false) then
      raise exception 'permiso_manage_site_requerido';
    end if;
    v_org_id := v_user.organizacion_id;
  end if;

  if coalesce(trim(p_nombre), '') = '' then raise exception 'nombre_requerido'; end if;
  if p_latitud is null or p_latitud < -90 or p_latitud > 90 then raise exception 'latitud_invalida'; end if;
  if p_longitud is null or p_longitud < -180 or p_longitud > 180 then raise exception 'longitud_invalida'; end if;
  if p_radio_metros is null or p_radio_metros < 20 or p_radio_metros > 1000 then raise exception 'radio_invalido'; end if;
  if v_entry_start >= v_entry_end or v_exit_start >= v_exit_end then raise exception 'horario_invalido'; end if;

  if p_activo then
    update public.sitios set activo = false where organizacion_id = v_org_id and activo = true;
  end if;

  if v_user.sitio_id is not null and not coalesce((v_permissions->>'manage_organization')::boolean, false) then
    v_site_id := v_user.sitio_id;
    update public.sitios
    set nombre = trim(p_nombre),
        direccion = nullif(trim(coalesce(p_direccion, '')), ''),
        latitud = p_latitud,
        longitud = p_longitud,
        radio_metros = p_radio_metros,
        hora_entrada_inicio = v_entry_start,
        hora_entrada_fin = v_entry_end,
        hora_salida_inicio = v_exit_start,
        hora_salida_fin = v_exit_end,
        zona_horaria = coalesce(nullif(trim(p_zona_horaria), ''), 'America/Mexico_City'),
        activo = p_activo,
        updated_at = now()
    where id = v_site_id and organizacion_id = v_org_id;
  else
    insert into public.sitios (organizacion_id, nombre, direccion, latitud, longitud, radio_metros, hora_entrada_inicio, hora_entrada_fin, hora_salida_inicio, hora_salida_fin, zona_horaria, activo)
    values (v_org_id, trim(p_nombre), nullif(trim(coalesce(p_direccion, '')), ''), p_latitud, p_longitud, p_radio_metros, v_entry_start, v_entry_end, v_exit_start, v_exit_end, coalesce(nullif(trim(p_zona_horaria), ''), 'America/Mexico_City'), p_activo)
    returning id into v_site_id;
  end if;

  return v_site_id;
end;
$$;

revoke execute on function public.resolve_organization_by_key(text) from public, anon;
revoke execute on function public.get_manageable_organizations() from public, anon;
revoke execute on function public.admin_create_organization(text, text, text, text, boolean) from public, anon;
revoke execute on function public.get_current_app_user(text, text, text) from public, anon;
grant execute on function public.get_manageable_organizations() to authenticated;
grant execute on function public.admin_create_organization(text, text, text, text, boolean) to authenticated;
grant execute on function public.get_current_app_user(text, text, text) to authenticated;

grant execute on function public.hash_org_key(text) to authenticated;
notify pgrst, 'reload schema';
