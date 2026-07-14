-- El nombre de salida usuario_id de la RPC comparte nombre con la columna de
-- asistencias. Todas las referencias de tabla se califican explicitamente.

begin;

create or replace function public.superadmin_purge_user(
  p_usuario_id uuid,
  p_confirmacion text
)
returns table (usuario_id uuid, asistencias_eliminadas integer, evidencias_eliminadas integer)
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_target_role text;
  v_auth_user_id uuid;
  v_attendance_count integer := 0;
  v_evidence_count integer := 0;
begin
  perform public.assert_active_app_session();
  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last limit 1;
  if not found or public.normalize_app_role(v_actor.rol) <> 'superadmin' then
    raise exception 'permiso_superadmin_requerido';
  end if;
  select ua.* into v_target from public.usuarios_app as ua where ua.id = p_usuario_id limit 1;
  if not found then raise exception 'usuario_no_encontrado'; end if;
  if v_target.id = v_actor.id then raise exception 'usuario_no_puede_eliminarse'; end if;
  v_target_role := public.normalize_app_role(v_target.rol);
  if exists (select 1 from public.system_owners as owner where owner.auth_user_id = v_target.auth_user_id and owner.activo) then
    raise exception 'owner_no_modificable_desde_aplicacion';
  end if;
  if v_target_role = 'superadmin' and not public.is_system_owner() then
    raise exception 'owner_requerido_para_gestionar_superadmin';
  end if;
  if upper(trim(coalesce(p_confirmacion, ''))) <> 'ELIMINAR' then
    raise exception 'confirmacion_de_purga_invalida';
  end if;

  v_auth_user_id := v_target.auth_user_id;
  select count(*)::integer into v_attendance_count
  from public.asistencias as attendance
  where attendance.usuario_id = v_target.id;
  delete from storage.objects
  where bucket_id in ('attendance-photos', 'evidencias-asistencia')
    and name in (
      select a.foto_entrada_storage_path from public.asistencias as a
      where a.usuario_id = v_target.id and nullif(trim(coalesce(a.foto_entrada_storage_path, '')), '') is not null
      union
      select a.foto_salida_storage_path from public.asistencias as a
      where a.usuario_id = v_target.id and nullif(trim(coalesce(a.foto_salida_storage_path, '')), '') is not null
    );
  get diagnostics v_evidence_count = row_count;
  delete from public.site_admin_invitations where created_by = v_target.id or accepted_by = v_target.id;
  delete from public.site_admin_invites
  where created_by_usuario_id = v_target.id or accepted_by_auth_user_id is not distinct from v_auth_user_id;
  delete from public.audit_logs where actor_user_id = v_target.id;
  delete from public.asistencias as attendance where attendance.usuario_id = v_target.id;
  delete from public.usuarios_app where id = v_target.id;
  if v_auth_user_id is not null then delete from auth.users where id = v_auth_user_id; end if;
  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('user.purged', jsonb_build_object('usuario_id', p_usuario_id, 'asistencias_eliminadas', v_attendance_count, 'evidencias_eliminadas', v_evidence_count, 'rol_eliminado', v_target_role)::text, 'exitoso', v_actor.id, v_target.organizacion_id, v_target.sitio_id);
  return query select p_usuario_id, v_attendance_count, v_evidence_count;
end;
$$;

revoke all on function public.superadmin_purge_user(uuid, text) from public, anon;
grant execute on function public.superadmin_purge_user(uuid, text) to authenticated;
notify pgrst, 'reload schema';

commit;
