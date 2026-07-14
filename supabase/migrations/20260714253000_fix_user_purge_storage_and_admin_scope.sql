-- La tabla storage.objects no admite borrados directos desde Postgres. La
-- purga elimina de inmediato cuenta, historial y referencias de evidencia;
-- los objetos privados quedan inaccesibles y se registran para limpieza
-- posterior mediante Storage API con credenciales de servidor.

begin;

create or replace function public.superadmin_purge_user(
  p_usuario_id uuid,
  p_confirmacion text
)
returns table (usuario_id uuid, asistencias_eliminadas integer, evidencias_eliminadas integer)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_target public.usuarios_app%rowtype;
  v_actor_role text;
  v_target_role text;
  v_auth_user_id uuid;
  v_attendance_count integer := 0;
  v_evidence_count integer := 0;
begin
  perform public.assert_active_app_session();

  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found then raise exception 'usuario_app_no_encontrado'; end if;

  v_actor_role := public.normalize_app_role(v_actor.rol);
  if v_actor_role not in ('admin', 'superadmin') then
    raise exception 'permiso_admin_requerido';
  end if;

  select ua.* into v_target
  from public.usuarios_app as ua
  where ua.id = p_usuario_id
  limit 1;
  if not found then raise exception 'usuario_no_encontrado'; end if;
  if v_target.id = v_actor.id then raise exception 'usuario_no_puede_eliminarse'; end if;

  v_target_role := public.normalize_app_role(v_target.rol);
  if exists (
    select 1
    from public.system_owners as owner
    where owner.auth_user_id = v_target.auth_user_id and owner.activo
  ) then
    raise exception 'owner_no_modificable_desde_aplicacion';
  end if;
  if v_target_role = 'superadmin' and not public.is_system_owner() then
    raise exception 'owner_requerido_para_gestionar_superadmin';
  end if;
  if v_actor_role = 'admin' and (
    v_target.organizacion_id is distinct from v_actor.organizacion_id
    or v_target_role not in ('usuario', 'supervisor')
  ) then
    raise exception 'usuario_fuera_de_alcance';
  end if;
  if upper(trim(coalesce(p_confirmacion, ''))) <> 'ELIMINAR' then
    raise exception 'confirmacion_de_purga_invalida';
  end if;

  v_auth_user_id := v_target.auth_user_id;
  select count(*)::integer,
         coalesce(sum(
           case when nullif(trim(coalesce(a.foto_entrada_storage_path, '')), '') is not null then 1 else 0 end
           + case when nullif(trim(coalesce(a.foto_salida_storage_path, '')), '') is not null then 1 else 0 end
         ), 0)::integer
  into v_attendance_count, v_evidence_count
  from public.asistencias as a
  where a.usuario_id = v_target.id;

  delete from public.site_admin_invitations
  where created_by = v_target.id or accepted_by = v_target.id;
  delete from public.site_admin_invites
  where created_by_usuario_id = v_target.id
     or accepted_by_auth_user_id is not distinct from v_auth_user_id;
  delete from public.audit_logs where actor_user_id = v_target.id;
  delete from public.asistencias as a where a.usuario_id = v_target.id;
  delete from public.usuarios_app as ua where ua.id = v_target.id;
  if v_auth_user_id is not null then
    delete from auth.users where id = v_auth_user_id;
  end if;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values (
    'user.purged',
    jsonb_build_object(
      'usuario_id', p_usuario_id,
      'asistencias_eliminadas', v_attendance_count,
      'evidencias_inaccesibles_pendientes_storage', v_evidence_count,
      'rol_eliminado', v_target_role,
      'actor_rol', v_actor_role
    )::text,
    'exitoso', v_actor.id, v_target.organizacion_id, v_target.sitio_id
  );

  return query select p_usuario_id, v_attendance_count, v_evidence_count;
end;
$$;

revoke all on function public.superadmin_purge_user(uuid, text) from public, anon;
grant execute on function public.superadmin_purge_user(uuid, text) to authenticated;
notify pgrst, 'reload schema';

commit;
