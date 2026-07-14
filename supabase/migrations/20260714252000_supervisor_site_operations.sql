-- Supervisor operativo: corrige asistencias y configura exclusivamente su sitio asignado.

begin;

create or replace function public.app_role_permissions(p_rol text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case public.normalize_app_role(p_rol)
    when 'superadmin' then jsonb_build_object(
      'register_attendance', true, 'view_own_records', true, 'view_site_records', true,
      'view_all_records', true, 'view_evidence', true, 'export_records', true,
      'manage_records', true, 'delete_records', true, 'manage_site', true,
      'manage_organization', true, 'manage_roles', true, 'view_audit', true
    )
    when 'admin' then jsonb_build_object(
      'register_attendance', true, 'view_own_records', true, 'view_site_records', true,
      'view_all_records', true, 'view_evidence', true, 'export_records', true,
      'manage_records', true, 'delete_records', true, 'manage_site', true,
      'manage_organization', false, 'manage_roles', false, 'view_audit', true
    )
    when 'supervisor' then jsonb_build_object(
      'register_attendance', true, 'view_own_records', true, 'view_site_records', true,
      'view_all_records', false, 'view_evidence', true, 'export_records', false,
      'manage_records', true, 'delete_records', false, 'manage_site', true,
      'manage_organization', false, 'manage_roles', false, 'view_audit', false
    )
    else jsonb_build_object(
      'register_attendance', true, 'view_own_records', true, 'view_site_records', false,
      'view_all_records', false, 'view_evidence', false, 'export_records', false,
      'manage_records', false, 'delete_records', false, 'manage_site', false,
      'manage_organization', false, 'manage_roles', false, 'view_audit', false
    )
  end;
$$;

create or replace function public.supervisor_update_asistencia_observacion(
  p_id uuid,
  p_observacion text
)
returns public.asistencias
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_row public.asistencias%rowtype;
begin
  perform public.assert_active_app_session();

  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found or public.normalize_app_role(v_actor.rol) <> 'supervisor' or v_actor.sitio_id is null then
    raise exception 'permiso_supervisor_de_sitio_requerido';
  end if;

  update public.asistencias as a
  set observacion_admin = coalesce(trim(p_observacion), ''),
      modificado_por_admin = true,
      updated_at = now()
  where a.id = p_id
    and (a.sitio_id = v_actor.sitio_id or a.sitio_entrada_id = v_actor.sitio_id or a.sitio_salida_id = v_actor.sitio_id)
  returning a.* into v_row;

  if v_row.id is null then raise exception 'registro_no_encontrado_o_fuera_de_alcance'; end if;

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('supervisor.attendance_observation_updated', v_row.id::text, 'exitoso', v_actor.id, v_actor.organizacion_id, v_actor.sitio_id);

  return v_row;
end;
$$;

create or replace function public.supervisor_update_assigned_site(
  p_nombre text,
  p_direccion text,
  p_latitud numeric,
  p_longitud numeric,
  p_radio_metros integer,
  p_hora_entrada_inicio text,
  p_hora_entrada_fin text,
  p_hora_salida_inicio text,
  p_hora_salida_fin text,
  p_zona_horaria text,
  p_gps_policy text,
  p_evidence_policy text,
  p_identificador_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_site_id uuid;
  v_entry_start time := p_hora_entrada_inicio::time;
  v_entry_end time := p_hora_entrada_fin::time;
  v_exit_start time := p_hora_salida_inicio::time;
  v_exit_end time := p_hora_salida_fin::time;
begin
  perform public.assert_active_app_session();

  select ua.* into v_actor
  from public.usuarios_app as ua
  where ua.auth_user_id = auth.uid() and coalesce(ua.activo, true)
  order by public.app_role_rank(ua.rol) desc, ua.updated_at desc nulls last
  limit 1;
  if not found or public.normalize_app_role(v_actor.rol) <> 'supervisor' or v_actor.sitio_id is null then
    raise exception 'permiso_supervisor_de_sitio_requerido';
  end if;

  select s.* into v_site
  from public.sitios as s
  where s.id = v_actor.sitio_id
    and s.organizacion_id = v_actor.organizacion_id
    and coalesce(s.activo, true)
  limit 1;
  if not found then raise exception 'sitio_asignado_no_encontrado'; end if;

  if nullif(trim(coalesce(p_nombre, '')), '') is null then raise exception 'nombre_requerido'; end if;
  if v_entry_start >= v_entry_end or v_exit_start >= v_exit_end then raise exception 'horario_invalido'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_zona_horaria) then raise exception 'zona_horaria_invalida'; end if;
  -- Los parametros de GPS, radio y evidencia se conservan en la firma por
  -- compatibilidad de cliente, pero nunca se escriben para un supervisor.

  update public.sitios as s
  set nombre = trim(p_nombre),
      direccion = nullif(trim(coalesce(p_direccion, '')), ''),
      hora_entrada_inicio = v_entry_start,
      hora_entrada_fin = v_entry_end,
      hora_salida_inicio = v_exit_start,
      hora_salida_fin = v_exit_end,
      zona_horaria = p_zona_horaria,
      updated_at = now()
  where s.id = v_actor.sitio_id
    and s.organizacion_id = v_actor.organizacion_id
    and coalesce(s.activo, true)
  returning s.id into v_site_id;

  if v_site_id is null then raise exception 'sitio_asignado_no_encontrado'; end if;

  insert into public.site_identifier_config (organizacion_id, sitio_id, label, updated_at)
  values (v_actor.organizacion_id, v_site_id, coalesce(nullif(trim(p_identificador_label), ''), 'Identificador'), now())
  on conflict (sitio_id) do update
  set label = excluded.label, organizacion_id = excluded.organizacion_id, updated_at = now();

  insert into public.audit_logs (accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id)
  values ('supervisor.site_updated', v_site_id::text, 'exitoso', v_actor.id, v_actor.organizacion_id, v_site_id);

  return v_site_id;
end;
$$;

revoke all on function public.supervisor_update_asistencia_observacion(uuid, text) from public, anon;
revoke all on function public.supervisor_update_assigned_site(text, text, numeric, numeric, integer, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.supervisor_update_asistencia_observacion(uuid, text) to authenticated;
grant execute on function public.supervisor_update_assigned_site(text, text, numeric, numeric, integer, text, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
