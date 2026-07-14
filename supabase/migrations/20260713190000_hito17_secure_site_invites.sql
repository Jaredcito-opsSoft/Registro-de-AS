-- Hito 17: invitaciones de administracion por sitio.
-- La llave se devuelve una sola vez; en base de datos solo se conserva su hash.

begin;

create table if not exists public.site_admin_invites (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  sitio_id uuid not null references public.sitios(id) on delete restrict,
  email text not null,
  rol text not null default 'admin' check (rol in ('supervisor', 'admin')),
  invite_key_hash text not null unique,
  expires_at timestamptz not null,
  created_by_usuario_id uuid not null references public.usuarios_app(id) on delete restrict,
  accepted_by_auth_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_admin_invites_email_check check (email = lower(trim(email)))
);

create index if not exists site_admin_invites_lookup_idx
  on public.site_admin_invites (sitio_id, email, expires_at desc)
  where accepted_at is null and revoked_at is null;

alter table public.site_admin_invites enable row level security;
revoke all on public.site_admin_invites from public, anon, authenticated;

create or replace function public.admin_create_site_invite(
  p_sitio_id uuid,
  p_email text,
  p_rol text default 'admin',
  p_expires_hours integer default 72
)
returns table (
  invite_key text,
  invite_id uuid,
  expires_at timestamptz,
  sitio_id uuid,
  organizacion_id uuid,
  rol text
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_rol, 'admin')));
  v_key text;
  v_hash text;
  v_invite public.site_admin_invites%rowtype;
  v_expires_at timestamptz;
begin
  if nullif(v_email, '') is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalido';
  end if;
  if v_role not in ('supervisor', 'admin') then
    raise exception 'rol_invitacion_invalido';
  end if;
  if p_expires_hours not between 1 and 168 then
    raise exception 'expiracion_invalida';
  end if;

  select * into v_site
  from public.sitios
  where id = p_sitio_id and coalesce(activo, true)
  limit 1;
  if not found then
    raise exception 'sitio_activo_no_encontrado';
  end if;

  v_actor := public.require_organization_manager(v_site.organizacion_id, v_site.id, true);
  v_key := 'SITE-INV-' || upper(encode(extensions.gen_random_bytes(15), 'hex'));
  v_hash := public.hash_org_key(v_key);
  v_expires_at := now() + make_interval(hours => p_expires_hours);

  update public.site_admin_invites
  set revoked_at = now(), updated_at = now()
  where sitio_id = v_site.id
    and email = v_email
    and accepted_at is null
    and revoked_at is null;

  insert into public.site_admin_invites (
    organizacion_id, sitio_id, email, rol, invite_key_hash, expires_at, created_by_usuario_id
  ) values (
    v_site.organizacion_id, v_site.id, v_email, v_role, v_hash, v_expires_at, v_actor.id
  ) returning * into v_invite;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('site_invite_created', v_invite.id::text, 'ok', v_actor.id, v_site.organizacion_id, v_site.id);

  return query select v_key, v_invite.id, v_invite.expires_at, v_site.id, v_site.organizacion_id, v_invite.rol;
end;
$$;

create or replace function public.redeem_site_invite(p_invite_key text)
returns table (
  usuario_id uuid,
  organizacion_id uuid,
  sitio_id uuid,
  rol text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_email text;
  v_nombre text;
  v_matricula text;
  v_invite public.site_admin_invites%rowtype;
  v_user public.usuarios_app%rowtype;
begin
  if v_auth_uid is null then
    raise exception 'sesion_requerida';
  end if;

  select lower(email), coalesce(raw_user_meta_data->>'nombre', split_part(email, '@', 1)),
         upper(coalesce(nullif(raw_user_meta_data->>'matricula', ''), split_part(email, '@', 1)))
  into v_email, v_nombre, v_matricula
  from auth.users
  where id = v_auth_uid;

  select * into v_invite
  from public.site_admin_invites
  where invite_key_hash = public.hash_org_key(p_invite_key)
    and email = v_email
    and revoked_at is null
    and expires_at > now()
    and (accepted_by_auth_user_id is null or accepted_by_auth_user_id = v_auth_uid)
  limit 1;
  if not found then
    raise exception 'invitacion_invalida_o_expirada';
  end if;

  select * into v_user
  from public.usuarios_app
  where auth_user_id = v_auth_uid
  limit 1;

  if not found and v_email is not null then
    select * into v_user
    from public.usuarios_app
    where lower(email) = v_email
    order by created_at asc
    limit 1;
  end if;

  if found and v_user.organizacion_id is distinct from v_invite.organizacion_id then
    raise exception 'usuario_ya_afiliado_a_otra_organizacion';
  end if;

  if found then
    update public.usuarios_app
    set auth_user_id = v_auth_uid,
        sitio_id = v_invite.sitio_id,
        rol = v_invite.rol,
        scope_type = 'sitio',
        email = v_email,
        nombre = coalesce(nullif(v_nombre, ''), nombre),
        ultimo_acceso_at = now(),
        updated_at = now()
    where id = v_user.id
    returning * into v_user;
  else
    insert into public.usuarios_app (
      organizacion_id, sitio_id, nombre, matricula, email, rol, scope_type, activo, auth_user_id, ultimo_acceso_at
    ) values (
      v_invite.organizacion_id, v_invite.sitio_id, v_nombre, v_matricula, v_email, v_invite.rol, 'sitio', true, v_auth_uid, now()
    ) returning * into v_user;
  end if;

  update public.site_admin_invites
  set accepted_by_auth_user_id = v_auth_uid,
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where id = v_invite.id;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('site_invite_redeemed', v_invite.id::text, 'ok', v_user.id, v_invite.organizacion_id, v_invite.sitio_id);

  return query select v_user.id, v_user.organizacion_id, v_user.sitio_id, public.normalize_app_role(v_user.rol);
end;
$$;

revoke all on function public.admin_create_site_invite(uuid, text, text, integer) from public, anon;
revoke all on function public.redeem_site_invite(text) from public, anon;
grant execute on function public.admin_create_site_invite(uuid, text, text, integer) to authenticated;
grant execute on function public.redeem_site_invite(text) to authenticated;

notify pgrst, 'reload schema';

commit;
