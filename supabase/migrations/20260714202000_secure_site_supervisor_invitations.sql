-- Los administradores de organizacion pueden invitar supervisores dentro de su
-- alcance. Solo superadmin puede emitir una invitacion que otorgue rol admin.

begin;

create or replace function public.admin_create_site_invite(
  p_sitio_id uuid,
  p_email text,
  p_rol text default 'supervisor',
  p_expires_hours integer default 72
)
returns table (invite_key text, invite_id uuid, expires_at timestamptz, sitio_id uuid, organizacion_id uuid, rol text)
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_role text := lower(trim(coalesce(p_rol, 'supervisor')));
  v_key text;
  v_hash text;
  v_invite public.site_admin_invites%rowtype;
  v_expires_at timestamptz;
begin
  perform public.assert_active_app_session();
  if nullif(v_email, '') is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'email_invalido';
  end if;
  if v_role not in ('supervisor', 'admin') then raise exception 'rol_invitacion_invalido'; end if;
  if p_expires_hours not between 1 and 168 then raise exception 'expiracion_invalida'; end if;

  select * into v_site from public.sitios where id = p_sitio_id and coalesce(activo, true) limit 1;
  if not found then raise exception 'sitio_activo_no_encontrado'; end if;
  v_actor := public.require_organization_manager(v_site.organizacion_id, v_site.id, true);
  if public.normalize_app_role(v_actor.rol) <> 'superadmin' and v_role <> 'supervisor' then
    raise exception 'admin_solo_puede_invitar_supervisores';
  end if;

  v_key := 'SITE-INV-' || upper(encode(extensions.gen_random_bytes(15), 'hex'));
  v_hash := public.hash_org_key(v_key);
  v_expires_at := now() + make_interval(hours => p_expires_hours);
  update public.site_admin_invites
  set revoked_at = now(), updated_at = now()
  where sitio_id = v_site.id and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.site_admin_invites (
    organizacion_id, sitio_id, email, rol, invite_key_hash, expires_at, created_by_usuario_id
  ) values (v_site.organizacion_id, v_site.id, v_email, v_role, v_hash, v_expires_at, v_actor.id)
  returning * into v_invite;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('site_invite_created', v_invite.id::text, 'ok', v_actor.id, v_site.organizacion_id, v_site.id);
  return query select v_key, v_invite.id, v_invite.expires_at, v_site.id, v_site.organizacion_id, v_invite.rol;
end;
$$;

revoke all on function public.admin_create_site_invite(uuid, text, text, integer) from public, anon;
grant execute on function public.admin_create_site_invite(uuid, text, text, integer) to authenticated;
notify pgrst, 'reload schema';
commit;
