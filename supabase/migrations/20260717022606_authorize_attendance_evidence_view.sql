-- Authorize every attendance evidence view in Postgres before Storage signs it.
-- The function returns a private object path only when the authenticated actor
-- owns the attendance or has organization/site scope. Every attempt is audited.

create or replace function public.authorize_attendance_evidence_view(
  p_asistencia_id uuid,
  p_tipo text
)
returns table (
  authorized boolean,
  reason text,
  bucket_name text,
  object_path text,
  expires_in integer
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor public.usuarios_app%rowtype;
  v_attendance public.asistencias%rowtype;
  v_role text;
  v_kind text := lower(trim(coalesce(p_tipo, '')));
  v_path text;
  v_allowed boolean := false;
  v_reason text := 'not_authorized';
begin
  perform public.assert_active_app_session();

  select actor.*
  into v_actor
  from public.usuarios_app as actor
  where actor.auth_user_id = auth.uid()
    and coalesce(actor.activo, true)
  order by public.app_role_rank(actor.rol) desc, actor.updated_at desc nulls last
  limit 1;

  if not found then
    return query select false, 'not_authorized', null::text, null::text, 0;
    return;
  end if;

  select attendance.*
  into v_attendance
  from public.asistencias as attendance
  where attendance.id = p_asistencia_id;

  if not found then
    insert into public.audit_logs (
      accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id
    ) values (
      'evidence.view_requested',
      jsonb_build_object('asistencia_id', p_asistencia_id, 'tipo', v_kind, 'reason', 'not_authorized')::text,
      'denied', v_actor.id, v_actor.organizacion_id, v_actor.sitio_id
    );
    return query select false, 'not_authorized', null::text, null::text, 0;
    return;
  end if;

  if v_kind in ('entrada', 'entry') then
    v_kind := 'entrada';
    v_path := nullif(trim(coalesce(v_attendance.foto_entrada_storage_path, '')), '');
  elsif v_kind in ('salida', 'exit') then
    v_kind := 'salida';
    v_path := nullif(trim(coalesce(v_attendance.foto_salida_storage_path, '')), '');
  else
    v_reason := 'invalid_evidence_type';
  end if;

  v_role := public.normalize_app_role(v_actor.rol);
  v_allowed := v_attendance.usuario_id = v_actor.id
    or v_role = 'superadmin'
    or (
      v_role = 'admin'
      and v_attendance.organizacion_id = v_actor.organizacion_id
    )
    or (
      v_role = 'supervisor'
      and v_attendance.organizacion_id = v_actor.organizacion_id
      and (
        v_attendance.sitio_id = v_actor.sitio_id
        or v_attendance.sitio_entrada_id = v_actor.sitio_id
        or v_attendance.sitio_salida_id = v_actor.sitio_id
        or exists (
          select 1
          from public.usuario_sitios_alcance as scope
          where scope.usuario_id = v_actor.id
            and scope.organizacion_id = v_actor.organizacion_id
            and scope.sitio_id in (
              v_attendance.sitio_id,
              v_attendance.sitio_entrada_id,
              v_attendance.sitio_salida_id
            )
        )
      )
    );

  if v_reason = 'invalid_evidence_type' then
    v_allowed := false;
  elsif not v_allowed then
    v_reason := 'not_authorized';
  elsif v_path is null then
    v_allowed := false;
    v_reason := 'evidence_not_found';
  else
    v_reason := 'authorized';
  end if;

  insert into public.audit_logs (
    accion, detalle, resultado, actor_user_id, organizacion_id, sitio_id
  ) values (
    case when v_allowed then 'evidence.view_authorized' else 'evidence.view_denied' end,
    jsonb_build_object(
      'asistencia_id', p_asistencia_id,
      'tipo', v_kind,
      'reason', v_reason
    )::text,
    case when v_allowed then 'ok' else 'denied' end,
    v_actor.id,
    v_attendance.organizacion_id,
    coalesce(v_attendance.sitio_id, v_attendance.sitio_entrada_id, v_attendance.sitio_salida_id)
  );

  return query
  select
    v_allowed,
    v_reason,
    case when v_allowed then 'attendance-photos'::text else null::text end,
    case when v_allowed then v_path else null::text end,
    case when v_allowed then 600 else 0 end;
end;
$$;

revoke all on function public.authorize_attendance_evidence_view(uuid, text) from public, anon;
grant execute on function public.authorize_attendance_evidence_view(uuid, text) to authenticated;
