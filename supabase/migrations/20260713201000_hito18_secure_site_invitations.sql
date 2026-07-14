-- Hito 18: invitaciones de administrador de sitio de un solo uso.

begin;

create table if not exists public.site_admin_invitations (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete restrict,
  sitio_id uuid not null references public.sitios(id) on delete restrict,
  email text not null,
  rol text not null default 'admin' check (rol in ('admin', 'supervisor')),
  token_hash text not null unique,
  created_by uuid not null references public.usuarios_app(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.usuarios_app(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint site_admin_invitations_email_normalized check (email = lower(trim(email)))
);

create unique index if not exists site_admin_invitations_open_email_site_idx
  on public.site_admin_invitations (sitio_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.site_admin_invitations enable row level security;
revoke all on public.site_admin_invitations from public, anon, authenticated;

create or replace function public.admin_create_site_invitation(
  p_email text,
  p_sitio_id uuid,
  p_rol text default 'admin'
)
returns table (
  invitacion_id uuid,
  correo text,
  sitio_id uuid,
  rol text,
  clave text,
  expira_en timestamptz
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
  v_key_hash text;
  v_invitation public.site_admin_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'sesion_requerida';
  end if;

  select * into v_actor
  from public.usuarios_app
  where auth_user_id = auth.uid()
    and coalesce(activo, true)
  order by public.app_role_rank(rol) desc, updated_at desc nulls last
  limit 1;

  if v_actor.id is null or public.normalize_app_role(v_actor.rol) <> 'superadmin' then
    raise exception 'permiso_superadmin_requerido';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'correo_invalido';
  end if;
  if v_role not in ('admin', 'supervisor') then
    raise exception 'rol_invitacion_invalido';
  end if;

  select * into v_site
  from public.sitios
  where id = p_sitio_id
    and coalesce(activo, true)
  limit 1;
  if v_site.id is null then
    raise exception 'sitio_activo_no_encontrado';
  end if;

  update public.site_admin_invitations
  set revoked_at = now()
  where sitio_id = v_site.id
    and email = v_email
    and accepted_at is null
    and revoked_at is null;

  v_key := 'AS-INV-' || upper(replace(gen_random_uuid()::text, '-', '')) || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_key_hash := encode(extensions.digest(v_key, 'sha256'), 'hex');

  insert into public.site_admin_invitations (
    organizacion_id, sitio_id, email, rol, token_hash, created_by, expires_at
  ) values (
    v_site.organizacion_id, v_site.id, v_email, v_role, v_key_hash, v_actor.id, now() + interval '72 hours'
  )
  returning * into v_invitation;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('site_admin_invitation_created', v_invitation.id::text, 'ok', v_actor.id, v_site.organizacion_id, v_site.id);

  return query
  select v_invitation.id, v_invitation.email, v_site.id, v_invitation.rol, v_key, v_invitation.expires_at;
end;
$$;

create or replace function public.accept_site_admin_invitation(p_clave text)
returns table (
  organizacion_id uuid,
  sitio_id uuid,
  rol text
)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_key_hash text := encode(extensions.digest(trim(coalesce(p_clave, '')), 'sha256'), 'hex');
  v_invitation public.site_admin_invitations%rowtype;
  v_user public.usuarios_app%rowtype;
  v_name text;
  v_matricula text;
begin
  if v_auth_id is null then
    raise exception 'sesion_requerida';
  end if;

  select lower(email), coalesce(nullif(trim(raw_user_meta_data->>'nombre'), ''), split_part(lower(email), '@', 1))
  into v_email, v_name
  from auth.users
  where id = v_auth_id;
  if v_email is null then
    raise exception 'correo_de_sesion_no_encontrado';
  end if;

  select * into v_invitation
  from public.site_admin_invitations
  where token_hash = v_key_hash
  for update;

  if v_invitation.id is null then
    raise exception 'invitacion_no_valida';
  end if;
  if v_invitation.accepted_at is not null or v_invitation.revoked_at is not null then
    raise exception 'invitacion_no_disponible';
  end if;
  if v_invitation.expires_at <= now() then
    update public.site_admin_invitations set revoked_at = now() where id = v_invitation.id;
    raise exception 'invitacion_expirada';
  end if;
  if v_invitation.email <> v_email then
    raise exception 'invitacion_no_corresponde_al_correo_autenticado';
  end if;

  select * into v_user
  from public.usuarios_app
  where auth_user_id = v_auth_id
  order by public.app_role_rank(rol) desc, updated_at desc nulls last
  limit 1;

  if v_user.id is not null and public.normalize_app_role(v_user.rol) = 'superadmin' then
    raise exception 'superadmin_no_modificable_por_invitacion';
  end if;

  if v_user.id is null then
    v_matricula := 'AUTH-' || upper(left(replace(v_auth_id::text, '-', ''), 12));
    insert into public.usuarios_app (
      organizacion_id, sitio_id, nombre, matricula, email, rol, activo, auth_user_id, scope_type, ultimo_acceso_at
    ) values (
      v_invitation.organizacion_id, v_invitation.sitio_id, v_name, v_matricula, v_email,
      v_invitation.rol, true, v_auth_id, 'sitio', now()
    )
    returning * into v_user;
  else
    update public.usuarios_app
    set organizacion_id = v_invitation.organizacion_id,
        sitio_id = v_invitation.sitio_id,
        rol = v_invitation.rol,
        scope_type = 'sitio',
        email = v_email,
        activo = true,
        ultimo_acceso_at = now(),
        updated_at = now()
    where id = v_user.id
    returning * into v_user;
  end if;

  update public.site_admin_invitations
  set accepted_at = now(),
      accepted_by = v_user.id
  where id = v_invitation.id;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('site_admin_invitation_accepted', v_invitation.id::text, 'ok', v_user.id, v_invitation.organizacion_id, v_invitation.sitio_id);

  return query select v_invitation.organizacion_id, v_invitation.sitio_id, v_invitation.rol;
end;
$$;

revoke all on function public.admin_create_site_invitation(text, uuid, text) from public, anon;
revoke all on function public.accept_site_admin_invitation(text) from public, anon;
grant execute on function public.admin_create_site_invitation(text, uuid, text) to authenticated;
grant execute on function public.accept_site_admin_invitation(text) to authenticated;

notify pgrst, 'reload schema';

commit;
