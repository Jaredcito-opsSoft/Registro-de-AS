-- Reactivacion reversible con el mismo alcance que la inactivacion. Ningun
-- admin ordinario puede reactivar ni alterar administradores o superadmins.

begin;

create or replace function public.admin_reactivate_user(p_usuario_id uuid)
returns table (usuario_id uuid, reactivado boolean)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_actor_role text;
  v_target_role text;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found then raise exception 'usuario_app_no_encontrado'; end if;
  v_actor_role := public.normalize_app_role(v_actor.rol);
  if v_actor_role not in ('admin', 'superadmin') then raise exception 'permiso_admin_requerido'; end if;

  select ua.* into v_target from public.usuarios_app as ua where ua.id = p_usuario_id limit 1;
  if not found then raise exception 'usuario_no_encontrado'; end if;
  if coalesce(v_target.activo, true) then raise exception 'usuario_ya_activo'; end if;
  v_target_role := public.normalize_app_role(v_target.rol);
  if exists (select 1 from public.system_owners as owner where owner.auth_user_id = v_target.auth_user_id and owner.activo) then
    raise exception 'owner_no_modificable_desde_aplicacion';
  end if;
  if v_target_role = 'superadmin' and not public.is_system_owner() then
    raise exception 'owner_requerido_para_gestionar_superadmin';
  end if;
  if v_actor_role = 'admin' and (
    v_target.organizacion_id is distinct from v_actor.organizacion_id
    or v_target_role not in ('usuario', 'supervisor')
  ) then raise exception 'usuario_fuera_de_alcance'; end if;

  update public.usuarios_app as ua
  set activo = true, active_session_id = null, active_session_started_at = null,
      active_session_device_label = null, updated_at = now()
  where ua.id = v_target.id;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('user.reactivated', jsonb_build_object('usuario_id', v_target.id, 'rol', v_target_role, 'actor_rol', v_actor_role)::text, 'exitoso', v_actor.id, v_target.organizacion_id, v_target.sitio_id);
  return query select v_target.id, true;
end;
$$;

revoke all on function public.admin_reactivate_user(uuid) from public, anon;
grant execute on function public.admin_reactivate_user(uuid) to authenticated;
notify pgrst, 'reload schema';

commit;
