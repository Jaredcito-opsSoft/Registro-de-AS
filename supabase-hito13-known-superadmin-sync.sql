-- HITO 13: sincroniza superadmins conocidos en usuarios_app para que RPCs admin funcionen.
-- Corrige el caso donde el frontend eleva permisos por email, pero usuarios_app quedo como usuario.

create or replace function public.sync_known_superadmin(p_auth_uid uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_auth_uid is null or v_email = '' then
    return;
  end if;

  if v_email not in ('alexisdavid1177@gmail.com', 'jaredcontacto.mx@gmail.com') then
    return;
  end if;

  update public.usuarios_app ua
  set rol = 'superadmin',
      auth_user_id = p_auth_uid,
      activo = true,
      email = v_email,
      ultimo_acceso_at = now(),
      updated_at = now()
  where lower(ua.email) = v_email;

  if not found then
    insert into public.usuarios_app (
      organizacion_id, nombre, matricula, email, rol, activo, auth_user_id, ultimo_acceso_at
    )
    values (
      public.get_default_organizacion_id(),
      initcap(split_part(v_email, '@', 1)),
      upper(split_part(v_email, '@', 1)),
      v_email,
      'superadmin',
      true,
      p_auth_uid,
      now()
    )
    on conflict (organizacion_id, matricula) do update
    set rol = 'superadmin',
        email = excluded.email,
        auth_user_id = excluded.auth_user_id,
        activo = true,
        updated_at = now();
  end if;
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

  select lower(au.email), coalesce(v_org_key, au.raw_user_meta_data->>'organization_key', au.raw_user_meta_data->>'org_key')
  into v_email, v_org_key
  from auth.users au
  where au.id = v_auth_uid;

  perform public.sync_known_superadmin(v_auth_uid, v_email);

  v_org_id := coalesce(public.resolve_organization_by_key(v_org_key), public.get_default_organizacion_id());
  v_nombre := coalesce(v_nombre, nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Usuario');
  v_matricula := coalesce(v_matricula, 'AUTH-' || left(replace(v_auth_uid::text, '-', ''), 8));

  select * into v_user
  from public.usuarios_app u
  where u.auth_user_id = v_auth_uid
    and coalesce(u.activo, true)
  order by public.app_role_rank(u.rol) desc, u.updated_at desc nulls last
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

revoke execute on function public.sync_known_superadmin(uuid, text) from public, anon;
grant execute on function public.sync_known_superadmin(uuid, text) to authenticated;

notify pgrst, 'reload schema';

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
#variable_conflict use_column
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

notify pgrst, 'reload schema';
