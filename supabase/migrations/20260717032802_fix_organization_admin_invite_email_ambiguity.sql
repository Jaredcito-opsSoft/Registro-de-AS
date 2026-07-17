-- Califica columnas que comparten nombre con las columnas de retorno del RPC.

begin;

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

revoke all on function public.superadmin_create_organization_admin_invite(text, integer) from public, anon;
grant execute on function public.superadmin_create_organization_admin_invite(text, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
