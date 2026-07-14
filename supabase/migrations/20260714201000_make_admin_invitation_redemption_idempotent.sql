-- Una invitacion AS-INV aceptada por la misma cuenta debe poder volver a
-- iniciar sesion sin intentar elevar permisos ni fallar por estar consumida.

begin;

create or replace function public.accept_site_admin_invitation(p_clave text)
returns table (organizacion_id uuid, sitio_id uuid, rol text)
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
  if v_auth_id is null then raise exception 'sesion_requerida'; end if;

  select lower(email),
         coalesce(nullif(trim(raw_user_meta_data->>'nombre'), ''), split_part(lower(email), '@', 1)),
         upper(coalesce(nullif(trim(raw_user_meta_data->>'matricula'), ''), 'AUTH-' || left(replace(v_auth_id::text, '-', ''), 12)))
  into v_email, v_name, v_matricula
  from auth.users
  where id = v_auth_id;
  if v_email is null then raise exception 'correo_de_sesion_no_encontrado'; end if;

  select * into v_invitation
  from public.site_admin_invitations
  where token_hash = v_key_hash
  for update;
  if v_invitation.id is null then raise exception 'invitacion_no_valida'; end if;
  if v_invitation.revoked_at is not null then raise exception 'invitacion_no_disponible'; end if;
  if v_invitation.email <> v_email then raise exception 'invitacion_no_corresponde_al_correo_autenticado'; end if;

  select * into v_user
  from public.usuarios_app
  where auth_user_id = v_auth_id
  order by public.app_role_rank(rol) desc, updated_at desc nulls last
  limit 1;

  if v_invitation.accepted_at is not null then
    if v_user.id is null
       or v_user.id is distinct from v_invitation.accepted_by
       or v_user.organizacion_id is distinct from v_invitation.organizacion_id
       or v_user.sitio_id is distinct from v_invitation.sitio_id then
      raise exception 'invitacion_no_disponible';
    end if;
    return query select v_user.organizacion_id, v_user.sitio_id, public.normalize_app_role(v_user.rol);
    return;
  end if;
  if v_invitation.expires_at <= now() then
    update public.site_admin_invitations set revoked_at = now() where id = v_invitation.id;
    raise exception 'invitacion_expirada';
  end if;
  if v_user.id is not null and public.normalize_app_role(v_user.rol) = 'superadmin' then
    raise exception 'superadmin_no_modificable_por_invitacion';
  end if;

  if v_user.id is null then
    insert into public.usuarios_app (
      organizacion_id, sitio_id, nombre, matricula, email, rol, activo, auth_user_id, scope_type, ultimo_acceso_at
    ) values (
      v_invitation.organizacion_id, v_invitation.sitio_id, v_name, v_matricula, v_email,
      v_invitation.rol, true, v_auth_id, 'sitio', now()
    ) returning * into v_user;
  else
    update public.usuarios_app
    set organizacion_id = v_invitation.organizacion_id,
        sitio_id = v_invitation.sitio_id,
        rol = v_invitation.rol,
        scope_type = 'sitio',
        email = v_email,
        nombre = coalesce(v_name, nombre),
        activo = true,
        ultimo_acceso_at = now(),
        updated_at = now()
    where id = v_user.id
    returning * into v_user;
  end if;

  update public.site_admin_invitations
  set accepted_at = now(), accepted_by = v_user.id
  where id = v_invitation.id;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('site_admin_invitation_accepted', v_invitation.id::text, 'ok', v_user.id, v_invitation.organizacion_id, v_invitation.sitio_id);
  return query select v_invitation.organizacion_id, v_invitation.sitio_id, v_invitation.rol;
end;
$$;

revoke all on function public.accept_site_admin_invitation(text) from public, anon;
grant execute on function public.accept_site_admin_invitation(text) to authenticated;
notify pgrst, 'reload schema';
commit;
