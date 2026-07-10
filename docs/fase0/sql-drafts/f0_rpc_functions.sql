-- F0 RPC functions draft.
-- No ejecutar en produccion sin introspeccion, respaldo y pruebas.
-- Las funciones SECURITY DEFINER deben revisarse con supabase db advisors antes de merge.

begin;

create or replace function public.audit_event(
  p_accion text,
  p_entidad text,
  p_entity_id uuid default null,
  p_organizacion_id uuid default null,
  p_sitio_id uuid default null,
  p_detalle jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (
    organizacion_id,
    sitio_id,
    actor_user_id,
    accion,
    entidad,
    entity_id,
    detalle_json
  )
  values (
    p_organizacion_id,
    p_sitio_id,
    public.current_app_user_id(),
    p_accion,
    p_entidad,
    p_entity_id,
    coalesce(p_detalle, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.audit_event(text, text, uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.audit_event(text, text, uuid, uuid, uuid, jsonb) to authenticated;

create or replace function public.register_entry(
  p_sitio_id uuid,
  p_identificador text,
  p_evidence jsonb default '{}'::jsonb,
  p_location jsonb default '{}'::jsonb,
  p_client_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_existing uuid;
  v_asistencia_id uuid;
  v_fecha date;
  v_folio text;
begin
  select * into v_user
  from public.usuarios_app
  where id = public.current_app_user_id()
    and activo = true;

  if v_user.id is null then
    raise exception 'USER_INACTIVE';
  end if;

  select * into v_site
  from public.sitios
  where id = p_sitio_id
    and activo = true;

  if v_site.id is null or not public.can_access_site(v_site.id) then
    raise exception 'SITE_FORBIDDEN';
  end if;

  if upper(trim(coalesce(p_identificador, ''))) <> upper(trim(v_user.identificador)) then
    raise exception 'IDENTIFIER_MISMATCH';
  end if;

  if coalesce(p_evidence->>'path', '') = '' then
    raise exception 'EVIDENCE_REQUIRED';
  end if;

  if v_site.gps_policy in ('obligatorio', 'bloqueo') and coalesce(p_location->>'latitud', '') = '' then
    raise exception 'GPS_REQUIRED';
  end if;

  v_fecha := (now() at time zone v_site.zona_horaria)::date;

  select id into v_existing
  from public.asistencias
  where organizacion_id = v_user.organizacion_id
    and sitio_id = v_site.id
    and usuario_id = v_user.id
    and fecha = v_fecha
    and estado <> 'cancelada'
  limit 1;

  if v_existing is not null then
    raise exception 'DUPLICATE_ENTRY';
  end if;

  v_folio := concat('AS-', to_char(now(), 'YYYYMMDDHH24MISS'), '-', substring(gen_random_uuid()::text from 1 for 8));

  insert into public.asistencias (
    organizacion_id,
    sitio_id,
    usuario_id,
    identificador_snapshot,
    fecha,
    entrada_at,
    estado,
    riesgo,
    folio_interno
  )
  values (
    v_user.organizacion_id,
    v_site.id,
    v_user.id,
    v_user.identificador,
    v_fecha,
    now(),
    'pendiente_salida',
    case when v_site.gps_policy = 'revision' and coalesce(p_location->>'validado', 'false') <> 'true' then 'revision' else 'normal' end,
    v_folio
  )
  returning id into v_asistencia_id;

  insert into public.evidencias (
    organizacion_id,
    sitio_id,
    asistencia_id,
    tipo,
    bucket,
    path,
    hash_sha256,
    mime,
    size_bytes,
    width,
    height,
    captured_at,
    created_by
  )
  values (
    v_user.organizacion_id,
    v_site.id,
    v_asistencia_id,
    coalesce(p_evidence->>'tipo', 'entrada_rostro'),
    coalesce(p_evidence->>'bucket', 'evidence-private'),
    p_evidence->>'path',
    p_evidence->>'hash_sha256',
    p_evidence->>'mime',
    nullif(p_evidence->>'size_bytes', '')::bigint,
    nullif(p_evidence->>'width', '')::integer,
    nullif(p_evidence->>'height', '')::integer,
    coalesce(nullif(p_evidence->>'captured_at', '')::timestamptz, now()),
    v_user.id
  );

  if coalesce(p_location->>'latitud', '') <> '' then
    insert into public.ubicaciones (
      organizacion_id,
      sitio_id,
      asistencia_id,
      tipo,
      latitud,
      longitud,
      precision_metros,
      distancia_metros,
      validado,
      observacion
    )
    values (
      v_user.organizacion_id,
      v_site.id,
      v_asistencia_id,
      'entrada',
      nullif(p_location->>'latitud', '')::double precision,
      nullif(p_location->>'longitud', '')::double precision,
      nullif(p_location->>'precision_metros', '')::double precision,
      nullif(p_location->>'distancia_metros', '')::double precision,
      coalesce(nullif(p_location->>'validado', '')::boolean, false),
      p_location->>'observacion'
    );
  end if;

  perform public.audit_event(
    'attendance.entry.registered',
    'asistencias',
    v_asistencia_id,
    v_user.organizacion_id,
    v_site.id,
    jsonb_build_object('folio', v_folio)
  );

  return jsonb_build_object(
    'ok', true,
    'asistencia_id', v_asistencia_id,
    'estado', 'pendiente_salida',
    'riesgo', 'normal',
    'folio_interno', v_folio,
    'entrada_at', now()
  );
end;
$$;

revoke all on function public.register_entry(uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.register_entry(uuid, text, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.register_exit(
  p_sitio_id uuid,
  p_identificador text,
  p_evidence jsonb default '{}'::jsonb,
  p_location jsonb default '{}'::jsonb,
  p_face_match jsonb default '{}'::jsonb,
  p_client_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_att public.asistencias%rowtype;
begin
  select * into v_user
  from public.usuarios_app
  where id = public.current_app_user_id()
    and activo = true;

  if v_user.id is null then
    raise exception 'USER_INACTIVE';
  end if;

  select * into v_site
  from public.sitios
  where id = p_sitio_id
    and activo = true;

  if v_site.id is null or not public.can_access_site(v_site.id) then
    raise exception 'SITE_FORBIDDEN';
  end if;

  if upper(trim(coalesce(p_identificador, ''))) <> upper(trim(v_user.identificador)) then
    raise exception 'IDENTIFIER_MISMATCH';
  end if;

  select * into v_att
  from public.asistencias
  where organizacion_id = v_user.organizacion_id
    and sitio_id = v_site.id
    and usuario_id = v_user.id
    and fecha = (now() at time zone v_site.zona_horaria)::date
    and estado <> 'cancelada'
  order by entrada_at desc
  limit 1;

  if v_att.id is null then
    raise exception 'NO_ACTIVE_ENTRY';
  end if;

  if v_att.salida_at is not null then
    raise exception 'DUPLICATE_EXIT';
  end if;

  if coalesce(p_evidence->>'path', '') = '' then
    raise exception 'EVIDENCE_REQUIRED';
  end if;

  update public.asistencias
  set salida_at = now(),
      estado = 'completa',
      updated_at = now(),
      riesgo = case
        when coalesce(p_face_match->>'status', '') = 'review' then 'revision'
        when v_site.gps_policy = 'revision' and coalesce(p_location->>'validado', 'false') <> 'true' then 'revision'
        else riesgo
      end
  where id = v_att.id;

  insert into public.evidencias (
    organizacion_id,
    sitio_id,
    asistencia_id,
    tipo,
    bucket,
    path,
    hash_sha256,
    mime,
    size_bytes,
    width,
    height,
    captured_at,
    created_by
  )
  values (
    v_user.organizacion_id,
    v_site.id,
    v_att.id,
    coalesce(p_evidence->>'tipo', 'salida_rostro'),
    coalesce(p_evidence->>'bucket', 'evidence-private'),
    p_evidence->>'path',
    p_evidence->>'hash_sha256',
    p_evidence->>'mime',
    nullif(p_evidence->>'size_bytes', '')::bigint,
    nullif(p_evidence->>'width', '')::integer,
    nullif(p_evidence->>'height', '')::integer,
    coalesce(nullif(p_evidence->>'captured_at', '')::timestamptz, now()),
    v_user.id
  );

  perform public.audit_event(
    'attendance.exit.registered',
    'asistencias',
    v_att.id,
    v_user.organizacion_id,
    v_site.id,
    jsonb_build_object('face_match', p_face_match)
  );

  return jsonb_build_object(
    'ok', true,
    'asistencia_id', v_att.id,
    'estado', 'completa',
    'salida_at', now()
  );
end;
$$;

revoke all on function public.register_exit(uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.register_exit(uuid, text, jsonb, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.correct_attendance(
  p_asistencia_id uuid,
  p_changes jsonb,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_att public.asistencias%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_correction_id uuid;
begin
  if public.current_app_user_role() not in ('admin', 'superadmin') then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'MOTIVE_REQUIRED';
  end if;

  select * into v_att
  from public.asistencias
  where id = p_asistencia_id;

  if v_att.id is null or not public.can_access_site(v_att.sitio_id) then
    raise exception 'ATTENDANCE_FORBIDDEN';
  end if;

  v_before := to_jsonb(v_att);

  update public.asistencias
  set estado = coalesce(p_changes->>'estado', estado),
      riesgo = coalesce(p_changes->>'riesgo', riesgo),
      updated_at = now()
  where id = p_asistencia_id
  returning * into v_att;

  v_after := to_jsonb(v_att);

  insert into public.attendance_corrections (
    asistencia_id,
    admin_id,
    motivo,
    antes_json,
    despues_json
  )
  values (
    p_asistencia_id,
    public.current_app_user_id(),
    p_motivo,
    v_before,
    v_after
  )
  returning id into v_correction_id;

  insert into public.user_notifications (usuario_id, tipo, titulo, mensaje)
  values (v_att.usuario_id, 'attendance_corrected', 'Asistencia corregida', 'Una asistencia fue corregida por administracion.');

  perform public.audit_event(
    'attendance.corrected',
    'asistencias',
    p_asistencia_id,
    v_att.organizacion_id,
    v_att.sitio_id,
    jsonb_build_object('correction_id', v_correction_id, 'motivo', p_motivo)
  );

  return jsonb_build_object('ok', true, 'correction_id', v_correction_id);
end;
$$;

revoke all on function public.correct_attendance(uuid, jsonb, text) from public, anon;
grant execute on function public.correct_attendance(uuid, jsonb, text) to authenticated;

commit;
