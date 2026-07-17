-- Invitaciones de incorporacion para administradores que aun no tienen
-- organizacion. La clave se almacena solo como hash, queda ligada al correo y
-- puede canjearse una sola vez. Solo superadmin puede emitirla.

begin;

create table if not exists public.organization_admin_onboarding_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  email text not null,
  invite_key_hash text not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references public.usuarios_app(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid not null references public.usuarios_app(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_admin_onboarding_email_normalized check (email = lower(trim(email)))
);

create index if not exists organization_admin_onboarding_email_idx
  on public.organization_admin_onboarding_invites (email, expires_at desc);

alter table public.organization_admin_onboarding_invites enable row level security;
revoke all on public.organization_admin_onboarding_invites from public, anon, authenticated;

create or replace function public.superadmin_create_organization_admin_invite(
  p_email text,
  p_expires_hours integer default 72
)
returns table (
  invite_key text,
  invite_id uuid,
  email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_key text;
  v_invite public.organization_admin_onboarding_invites%rowtype;
begin
  perform public.assert_active_app_session();

  select actor.* into v_actor
  from public.usuarios_app as actor
  where actor.auth_user_id = auth.uid() and coalesce(actor.activo, true)
  order by public.app_role_rank(actor.rol) desc, actor.updated_at desc nulls last
  limit 1;

  if v_actor.id is null or public.normalize_app_role(v_actor.rol) <> 'superadmin' then
    raise exception 'solo_superadmin_puede_invitar_admins';
  end if;
  if nullif(v_email, '') is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalido';
  end if;
  if p_expires_hours not between 1 and 168 then raise exception 'expiracion_invalida'; end if;

  update public.organization_admin_onboarding_invites as invite
  set revoked_at = now(), updated_at = now()
  where invite.email = v_email and invite.redeemed_at is null and invite.revoked_at is null;

  v_key := 'ORG-ADMIN-' || upper(encode(extensions.gen_random_bytes(18), 'hex'));
  insert into public.organization_admin_onboarding_invites (
    email, invite_key_hash, expires_at, created_by
  ) values (
    v_email,
    public.hash_org_key(v_key),
    now() + make_interval(hours => p_expires_hours),
    v_actor.id
  ) returning * into v_invite;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id)
  values ('organization_admin_invite_created', v_invite.id::text, 'ok', v_actor.id);

  return query select v_key, v_invite.id, v_invite.email, v_invite.expires_at;
end;
$$;

create or replace function public.redeem_organization_admin_onboarding_invite(
  p_invite_key text
)
returns table (rol text, can_create_organization boolean)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_name text;
  v_matricula text;
  v_invite public.organization_admin_onboarding_invites%rowtype;
  v_user public.usuarios_app%rowtype;
begin
  if v_auth_id is null then raise exception 'sesion_requerida'; end if;

  select lower(email),
         coalesce(nullif(trim(raw_user_meta_data->>'nombre'), ''), split_part(lower(email), '@', 1)),
         upper(coalesce(nullif(trim(raw_user_meta_data->>'matricula'), ''), 'AUTH-' || left(replace(v_auth_id::text, '-', ''), 12)))
  into v_email, v_name, v_matricula
  from auth.users
  where id = v_auth_id;
  if v_email is null then raise exception 'correo_de_sesion_no_encontrado'; end if;

  select invite.* into v_invite
  from public.organization_admin_onboarding_invites as invite
  where invite.invite_key_hash = public.hash_org_key(trim(coalesce(p_invite_key, '')))
  for update;

  if v_invite.id is null then raise exception 'invitacion_no_valida'; end if;
  if v_invite.revoked_at is not null then raise exception 'invitacion_no_disponible'; end if;
  if v_invite.email <> v_email then raise exception 'invitacion_no_corresponde_al_correo_autenticado'; end if;

  select actor.* into v_user
  from public.usuarios_app as actor
  where actor.auth_user_id = v_auth_id
  order by public.app_role_rank(actor.rol) desc, actor.updated_at desc nulls last
  limit 1;

  if v_invite.redeemed_at is not null then
    if v_user.id is null or v_user.id is distinct from v_invite.redeemed_by then
      raise exception 'invitacion_no_disponible';
    end if;
    return query select public.normalize_app_role(v_user.rol), v_user.organizacion_id is null;
    return;
  end if;
  if v_invite.expires_at <= now() then
    update public.organization_admin_onboarding_invites set revoked_at = now(), updated_at = now() where id = v_invite.id;
    raise exception 'invitacion_expirada';
  end if;
  if v_user.id is not null and public.normalize_app_role(v_user.rol) = 'superadmin' then
    raise exception 'superadmin_no_modificable_por_invitacion';
  end if;
  if v_user.id is not null and v_user.organizacion_id is not null then
    raise exception 'usuario_ya_afiliado_a_organizacion';
  end if;

  if v_user.id is null then
    insert into public.usuarios_app (
      organizacion_id, sitio_id, nombre, matricula, email, rol, activo, auth_user_id, scope_type, ultimo_acceso_at
    ) values (
      null, null, v_name, v_matricula, v_email, 'admin', true, v_auth_id, 'organizacion', now()
    ) returning * into v_user;
  else
    update public.usuarios_app
    set organizacion_id = null,
        sitio_id = null,
        nombre = coalesce(v_name, nombre),
        email = v_email,
        rol = 'admin',
        activo = true,
        scope_type = 'organizacion',
        ultimo_acceso_at = now(),
        updated_at = now()
    where id = v_user.id
    returning * into v_user;
  end if;

  update public.organization_admin_onboarding_invites
  set redeemed_at = now(), redeemed_by = v_user.id, updated_at = now()
  where id = v_invite.id;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id)
  values ('organization_admin_invite_redeemed', v_invite.id::text, 'ok', v_user.id);

  return query select 'admin'::text, true;
end;
$$;

-- Superadmin conserva control global. Un admin incorporado por esta invitacion
-- solo puede crear su primera organizacion; al crearla queda afiliado a ella.
create or replace function public.admin_upsert_organization(
  p_id uuid default null,
  p_nombre text default null,
  p_tipo text default 'empresa',
  p_slug text default null,
  p_clave text default null,
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_actor_role text;
  v_id uuid;
  v_slug text;
  v_is_onboarded_admin boolean := false;
begin
  perform public.assert_active_app_session();
  select actor.* into v_actor
  from public.usuarios_app as actor
  where actor.auth_user_id = auth.uid() and coalesce(actor.activo, true)
  order by public.app_role_rank(actor.rol) desc, actor.updated_at desc nulls last
  limit 1;
  if v_actor.id is null then raise exception 'usuario_app_no_encontrado'; end if;

  v_actor_role := public.normalize_app_role(v_actor.rol);
  select exists (
    select 1 from public.organization_admin_onboarding_invites as invite
    where invite.redeemed_by = v_actor.id and invite.redeemed_at is not null and invite.revoked_at is null
  ) into v_is_onboarded_admin;

  if v_actor_role <> 'superadmin' then
    if v_actor_role <> 'admin' or p_id is not null or v_actor.organizacion_id is not null or not v_is_onboarded_admin then
      raise exception 'solo_superadmin_o_admin_invitado_sin_organizacion';
    end if;
  end if;
  if nullif(trim(coalesce(p_nombre, '')), '') is null then raise exception 'nombre_requerido'; end if;
  if p_tipo not in ('empresa', 'escuela', 'centro_trabajo', 'negocio_local', 'otro') then raise exception 'tipo_invalido'; end if;
  if p_id is null and length(trim(coalesce(p_clave, ''))) < 8 then raise exception 'clave_minimo_8_caracteres'; end if;
  if p_clave is not null and p_clave <> '' and length(trim(p_clave)) < 8 then raise exception 'clave_minimo_8_caracteres'; end if;

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), trim(p_nombre)), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then raise exception 'slug_invalido'; end if;

  if p_id is null then
    insert into public.organizaciones (nombre, tipo, slug, activo, clave_acceso_hash)
    values (trim(p_nombre), p_tipo, v_slug, coalesce(p_activo, true), public.hash_org_key(p_clave))
    returning id into v_id;

    if v_actor_role = 'admin' then
      update public.usuarios_app
      set organizacion_id = v_id, sitio_id = null, scope_type = 'organizacion', updated_at = now()
      where id = v_actor.id;
    end if;
  else
    update public.organizaciones as organization
    set nombre = trim(p_nombre),
        tipo = p_tipo,
        slug = v_slug,
        activo = coalesce(p_activo, true),
        clave_acceso_hash = case
          when nullif(trim(coalesce(p_clave, '')), '') is null then organization.clave_acceso_hash
          else public.hash_org_key(p_clave)
        end,
        updated_at = now()
    where organization.id = p_id
    returning organization.id into v_id;
    if v_id is null then raise exception 'organizacion_no_encontrada'; end if;
  end if;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id)
  values (
    case when p_id is null then 'organizacion_creada' else 'organizacion_actualizada' end,
    v_id::text,
    'ok',
    v_actor.id,
    v_id
  );
  return v_id;
exception
  when unique_violation then raise exception 'slug_organizacion_duplicado';
end;
$$;

revoke all on function public.superadmin_create_organization_admin_invite(text, integer) from public, anon;
revoke all on function public.redeem_organization_admin_onboarding_invite(text) from public, anon;
revoke all on function public.admin_upsert_organization(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.superadmin_create_organization_admin_invite(text, integer) to authenticated;
grant execute on function public.redeem_organization_admin_onboarding_invite(text) to authenticated;
grant execute on function public.admin_upsert_organization(uuid, text, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
