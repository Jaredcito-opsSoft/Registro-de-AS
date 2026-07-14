-- Enforce site attendance windows on the server.
-- Administrators still need an assigned site, but may register their own
-- attendance outside its schedule for operational continuity.

create or replace function public.registrar_entrada_segura(
  p_nombre text,
  p_matricula text,
  p_foto_entrada_url text,
  p_descriptor_entrada jsonb,
  p_rostro_entrada_detectado boolean default true,
  p_foto_entrada_metadata jsonb default null,
  p_foto_entrada_hash text default null,
  p_foto_entrada_storage_path text default null,
  p_foto_entrada_mime text default null,
  p_foto_entrada_size_bytes integer default null,
  p_foto_entrada_width integer default null,
  p_foto_entrada_height integer default null,
  p_foto_entrada_captured_at timestamptz default null,
  p_foto_entrada_user_agent text default null,
  p_foto_entrada_device_label text default null,
  p_fotos_privadas boolean default true,
  p_evidencia_entrada_completa boolean default null,
  p_evidencia_observacion text default '',
  p_latitud_entrada numeric default null,
  p_longitud_entrada numeric default null,
  p_precision_entrada numeric default null,
  p_ubicacion_entrada_estado text default null
)
returns public.asistencias
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_fecha date;
  v_distance numeric;
  v_geo_valid boolean := false;
  v_geo_obs text := '';
  v_geo_complete boolean := false;
  v_row public.asistencias%rowtype;
  v_matricula text := upper(trim(coalesce(p_matricula, '')));
  v_evidence_complete boolean := coalesce(p_evidencia_entrada_completa, p_foto_entrada_hash is not null and p_foto_entrada_storage_path is not null and p_foto_entrada_size_bytes is not null);
  v_metadata jsonb;
  v_role text;
  v_zona_horaria text;
  v_hora_local time;
  v_horario_validado boolean := false;
  v_horario_obs text := '';
begin
  if p_foto_entrada_url is null or trim(p_foto_entrada_url) = '' then raise exception 'foto_entrada_requerida'; end if;
  if p_descriptor_entrada is null or jsonb_typeof(p_descriptor_entrada) <> 'array' then raise exception 'descriptor_facial_entrada_requerido'; end if;
  if p_rostro_entrada_detectado is not true then raise exception 'rostro_entrada_no_detectado'; end if;

  v_user := public.get_attendance_actor(v_matricula);
  select s.* into v_site
  from public.sitios s
  where s.id = v_user.sitio_id
    and s.organizacion_id = v_user.organizacion_id
    and s.activo = true;
  if v_site.id is null then raise exception 'sitio_activo_no_encontrado'; end if;

  v_role := public.normalize_app_role(v_user.rol);
  v_zona_horaria := coalesce(nullif(v_site.zona_horaria, ''), 'America/Mexico_City');
  v_hora_local := (v_now at time zone v_zona_horaria)::time;
  v_fecha := (v_now at time zone v_zona_horaria)::date;

  if v_role in ('admin', 'superadmin') then
    v_horario_validado := true;
    v_horario_obs := format('Registro sin restriccion horaria por rol %s; hora servidor: %s.', v_role, to_char(v_hora_local, 'HH24:MI'));
  elsif v_site.hora_entrada_inicio is null or v_site.hora_entrada_fin is null then
    raise exception 'horario_entrada_no_configurado';
  elsif (v_site.hora_entrada_inicio <= v_site.hora_entrada_fin and v_hora_local between v_site.hora_entrada_inicio and v_site.hora_entrada_fin)
     or (v_site.hora_entrada_inicio > v_site.hora_entrada_fin and (v_hora_local >= v_site.hora_entrada_inicio or v_hora_local <= v_site.hora_entrada_fin)) then
    v_horario_validado := true;
    v_horario_obs := format('Entrada dentro del horario del sitio (%s-%s, %s).', to_char(v_site.hora_entrada_inicio, 'HH24:MI'), to_char(v_site.hora_entrada_fin, 'HH24:MI'), v_zona_horaria);
  else
    raise exception 'entrada_fuera_de_horario';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user.id::text || ':' || v_site.id::text || ':' || v_fecha::text));
  if exists (
    select 1 from public.asistencias a
    where a.usuario_id = v_user.id and a.organizacion_id = v_user.organizacion_id
      and a.fecha = v_fecha and a.hora_salida is null
  ) then raise exception 'entrada_activa_existente'; end if;

  if p_latitud_entrada is null or p_longitud_entrada is null or lower(coalesce(p_ubicacion_entrada_estado, '')) = 'ubicacion_denegada' then
    v_geo_obs := 'Ubicacion de entrada no autorizada por el navegador.';
  elsif p_precision_entrada is not null and p_precision_entrada > 200 then
    v_geo_obs := 'Precision GPS de entrada insuficiente.';
  else
    v_distance := public.geo_distance_meters(p_latitud_entrada, p_longitud_entrada, v_site.latitud, v_site.longitud);
    if v_distance <= v_site.radio_metros then
      v_geo_valid := true;
      v_geo_obs := 'Ubicacion de entrada validada correctamente.';
    else
      v_geo_obs := 'Ubicacion de entrada fuera del radio permitido.';
    end if;
  end if;
  v_geo_complete := v_geo_valid and p_latitud_entrada is not null and p_longitud_entrada is not null;
  v_metadata := jsonb_set(coalesce(p_foto_entrada_metadata, '{}'::jsonb), '{location}', jsonb_build_object(
    'latitud', p_latitud_entrada, 'longitud', p_longitud_entrada, 'precision', p_precision_entrada,
    'sitio_id', v_site.id, 'sitio_nombre', v_site.nombre, 'distancia_metros', v_distance,
    'validada', v_geo_valid, 'observacion', v_geo_obs
  ), true);

  insert into public.asistencias (
    organizacion_id, usuario_id, sitio_id, sitio_nombre, radio_metros,
    nombre, matricula, fecha, hora_entrada, server_time_entrada,
    foto_entrada_url, descriptor_entrada, rostro_entrada_detectado,
    estado, validacion_identidad, horario_validado, horario_observacion, riesgo, alertas, observacion, observaciones,
    foto_entrada_metadata, foto_entrada_hash, foto_entrada_storage_path, foto_entrada_mime,
    foto_entrada_size_bytes, foto_entrada_width, foto_entrada_height, foto_entrada_captured_at,
    foto_entrada_user_agent, foto_entrada_device_label, fotos_privadas, evidencia_entrada_completa,
    evidencia_observacion, latitud_entrada, longitud_entrada, precision_entrada, distancia_entrada_metros,
    ubicacion_entrada_validada, ubicacion_entrada_observacion, sitio_entrada_id, sitio_entrada_nombre,
    evidencia_entrada_geolocalizada, evidencia_geolocalizada_observacion
  ) values (
    v_user.organizacion_id, v_user.id, v_site.id, v_site.nombre, v_site.radio_metros,
    v_user.nombre, v_user.matricula, v_fecha, v_now, v_now,
    p_foto_entrada_url, p_descriptor_entrada, true,
    'entrada_registrada', 'pendiente', v_horario_validado, v_horario_obs,
    case when v_geo_complete then 'normal' else 'revision_ubicacion_entrada' end,
    case when v_geo_complete then '[]'::jsonb else jsonb_build_array('ubicacion_entrada_revision') end,
    concat_ws(' ', 'Entrada registrada con hora de servidor.', v_horario_obs, v_geo_obs), concat_ws(' ', 'Entrada registrada con hora de servidor.', v_horario_obs, v_geo_obs),
    v_metadata, p_foto_entrada_hash, p_foto_entrada_storage_path, p_foto_entrada_mime,
    p_foto_entrada_size_bytes, p_foto_entrada_width, p_foto_entrada_height, p_foto_entrada_captured_at,
    p_foto_entrada_user_agent, p_foto_entrada_device_label, coalesce(p_fotos_privadas, true), v_evidence_complete,
    coalesce(p_evidencia_observacion, ''), p_latitud_entrada, p_longitud_entrada, p_precision_entrada, v_distance,
    v_geo_valid, v_geo_obs, v_site.id, v_site.nombre, v_geo_complete, v_geo_obs
  ) returning * into v_row;

  insert into public.audit_logs (accion, detalle, resultado, user_agent)
  values ('asistencia_entrada_sitio', v_user.id::text || ' / ' || v_site.id::text, case when v_geo_complete then 'ok' else 'revision' end, p_foto_entrada_user_agent);
  return v_row;
end;
$$;

create or replace function public.registrar_salida_segura(
  p_matricula text,
  p_foto_salida_url text,
  p_descriptor_salida jsonb,
  p_token_qr text,
  p_latitud numeric default null,
  p_longitud numeric default null,
  p_precision numeric default null,
  p_ubicacion_estado text default null,
  p_reto_vida text default null,
  p_foto_salida_metadata jsonb default null,
  p_foto_salida_hash text default null,
  p_foto_salida_storage_path text default null,
  p_foto_salida_mime text default null,
  p_foto_salida_size_bytes integer default null,
  p_foto_salida_width integer default null,
  p_foto_salida_height integer default null,
  p_foto_salida_captured_at timestamptz default null,
  p_foto_salida_user_agent text default null,
  p_foto_salida_device_label text default null,
  p_evidencia_salida_completa boolean default null,
  p_evidencia_observacion text default ''
)
returns public.asistencias
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_user public.usuarios_app%rowtype;
  v_site public.sitios%rowtype;
  v_record public.asistencias%rowtype;
  v_distance numeric;
  v_similarity numeric;
  v_geo_distance numeric;
  v_geo_valid boolean := false;
  v_geo_complete boolean := false;
  v_entry_geo_valid boolean := false;
  v_geo_obs text := '';
  v_identity text := 'revision_administrativa';
  v_identity_obs text := '';
  v_alertas jsonb := '[]'::jsonb;
  v_riesgo text := 'normal';
  v_estado text := 'revision_requerida';
  v_matricula text := upper(trim(coalesce(p_matricula, '')));
  v_evidence_complete boolean := coalesce(p_evidencia_salida_completa, p_foto_salida_hash is not null and p_foto_salida_storage_path is not null and p_foto_salida_size_bytes is not null);
  v_metadata jsonb;
  v_role text;
  v_zona_horaria text;
  v_hora_local time;
  v_horario_validado boolean := false;
  v_horario_obs text := '';
begin
  if p_foto_salida_url is null or trim(p_foto_salida_url) = '' then raise exception 'foto_salida_requerida'; end if;
  if p_descriptor_salida is null or jsonb_typeof(p_descriptor_salida) <> 'array' then raise exception 'descriptor_facial_salida_requerido'; end if;
  v_user := public.get_attendance_actor(v_matricula);

  select a.* into v_record from public.asistencias a
  where a.usuario_id = v_user.id and a.organizacion_id = v_user.organizacion_id and a.hora_salida is null
  order by a.hora_entrada desc limit 1 for update;
  if v_record.id is null then
    if exists (select 1 from public.asistencias a where a.usuario_id = v_user.id and a.organizacion_id = v_user.organizacion_id and a.fecha = (v_now at time zone 'America/Mexico_City')::date) then
      raise exception 'salida_ya_registrada';
    end if;
    raise exception 'entrada_activa_no_encontrada';
  end if;
  select s.* into v_site from public.sitios s
  where s.id = coalesce(v_record.sitio_entrada_id, v_record.sitio_id) and s.organizacion_id = v_user.organizacion_id;
  if v_site.id is null then raise exception 'sitio_de_entrada_no_encontrado'; end if;

  v_role := public.normalize_app_role(v_user.rol);
  v_zona_horaria := coalesce(nullif(v_site.zona_horaria, ''), 'America/Mexico_City');
  v_hora_local := (v_now at time zone v_zona_horaria)::time;
  if v_record.fecha <> (v_now at time zone v_zona_horaria)::date then
    raise exception 'entrada_activa_no_corresponde_al_dia_actual';
  end if;

  if v_role in ('admin', 'superadmin') then
    v_horario_validado := true;
    v_horario_obs := format('Registro sin restriccion horaria por rol %s; hora servidor: %s.', v_role, to_char(v_hora_local, 'HH24:MI'));
  elsif v_site.hora_salida_inicio is null or v_site.hora_salida_fin is null then
    raise exception 'horario_salida_no_configurado';
  elsif (v_site.hora_salida_inicio <= v_site.hora_salida_fin and v_hora_local between v_site.hora_salida_inicio and v_site.hora_salida_fin)
     or (v_site.hora_salida_inicio > v_site.hora_salida_fin and (v_hora_local >= v_site.hora_salida_inicio or v_hora_local <= v_site.hora_salida_fin)) then
    v_horario_validado := true;
    v_horario_obs := format('Salida dentro del horario del sitio (%s-%s, %s).', to_char(v_site.hora_salida_inicio, 'HH24:MI'), to_char(v_site.hora_salida_fin, 'HH24:MI'), v_zona_horaria);
  else
    raise exception 'salida_fuera_de_horario';
  end if;

  if v_record.descriptor_entrada is not null then
    select sqrt(sum(power((entrada.value #>> '{}')::numeric - (salida.value #>> '{}')::numeric, 2))) into v_distance
    from jsonb_array_elements(v_record.descriptor_entrada) with ordinality entrada(value, ord)
    join jsonb_array_elements(p_descriptor_salida) with ordinality salida(value, ord) using (ord);
  end if;
  if v_distance is null then v_alertas := v_alertas || jsonb_build_array('identidad_no_comparable'); v_identity_obs := 'No fue posible comparar la foto de salida con la entrada.';
  elsif v_distance <= 0.46 then v_identity := 'identidad_validada'; v_similarity := round(greatest(0, 1 - v_distance), 4); v_identity_obs := 'La foto de salida coincide con la foto de entrada.';
  elsif v_distance <= 0.62 then v_similarity := round(greatest(0, 1 - v_distance), 4); v_alertas := v_alertas || jsonb_build_array('identidad_dudosa'); v_identity_obs := 'La coincidencia facial requiere revision.';
  else v_similarity := round(greatest(0, 1 - v_distance), 4); v_identity := 'fallida'; v_alertas := v_alertas || jsonb_build_array('identidad_fallida'); v_identity_obs := 'La foto de salida no coincide suficientemente con la entrada.'; end if;

  if p_latitud is null or p_longitud is null or lower(coalesce(p_ubicacion_estado, '')) = 'ubicacion_denegada' then v_geo_obs := 'Ubicacion de salida no autorizada por el navegador.'; v_alertas := v_alertas || jsonb_build_array('ubicacion_denegada_salida');
  elsif p_precision is not null and p_precision > 200 then v_geo_obs := 'Precision GPS de salida insuficiente.'; v_alertas := v_alertas || jsonb_build_array('ubicacion_salida_imprecisa');
  else
    v_geo_distance := public.geo_distance_meters(p_latitud, p_longitud, v_site.latitud, v_site.longitud);
    if v_geo_distance <= v_site.radio_metros then v_geo_valid := true; v_geo_obs := 'Ubicacion de salida validada correctamente.';
    else v_geo_obs := 'Ubicacion de salida fuera del radio permitido.'; v_alertas := v_alertas || jsonb_build_array('ubicacion_salida_fuera_de_rango'); end if;
  end if;
  v_geo_complete := v_geo_valid and p_latitud is not null and p_longitud is not null;
  v_entry_geo_valid := coalesce(v_record.ubicacion_entrada_validada, false);
  if not v_evidence_complete then v_alertas := v_alertas || jsonb_build_array('evidencia_salida_incompleta'); end if;
  if (not v_entry_geo_valid) and (not v_geo_complete) then v_riesgo := 'revision_multiple'; elsif not v_geo_complete then v_riesgo := 'revision_ubicacion_salida'; elsif not v_entry_geo_valid then v_riesgo := 'revision_ubicacion_entrada'; elsif v_identity <> 'identidad_validada' then v_riesgo := 'revision_identidad'; end if;
  if v_riesgo = 'normal' and v_identity = 'identidad_validada' and v_geo_complete then v_estado := 'asistencia_completa'; end if;
  v_metadata := jsonb_set(coalesce(p_foto_salida_metadata, '{}'::jsonb), '{location}', jsonb_build_object('latitud', p_latitud, 'longitud', p_longitud, 'precision', p_precision, 'sitio_id', v_site.id, 'sitio_nombre', v_site.nombre, 'distancia_metros', v_geo_distance, 'validada', v_geo_valid, 'observacion', v_geo_obs), true);

  update public.asistencias set
    hora_salida = v_now, server_time_salida = v_now, foto_salida_url = p_foto_salida_url, descriptor_salida = p_descriptor_salida, rostro_salida_detectado = true,
    similitud_facial = v_similarity, validacion_identidad = v_identity, metodo_salida = 'matricula_foto_gps', qr_token_id = null, token_qr_usado = 'no_aplica', qr_salida = 'no_aplica', qr_validado = false,
    qr_observacion = 'No aplica: salida validada por identificador, foto, GPS y facial.', horario_validado = v_horario_validado, horario_observacion = v_horario_obs,
    latitud_salida = p_latitud, longitud_salida = p_longitud, precision_salida = p_precision, distancia_salida_metros = v_geo_distance, ubicacion_salida_validada = v_geo_valid, ubicacion_salida_observacion = v_geo_obs,
    sitio_salida_id = v_site.id, sitio_salida_nombre = v_site.nombre, evidencia_salida_geolocalizada = v_geo_complete, evidencia_geolocalizada_observacion = concat_ws(' ', nullif(v_record.evidencia_geolocalizada_observacion, ''), v_geo_obs),
    precision_ubicacion = p_precision, ubicacion_validada = v_geo_valid, distancia_empresa_metros = v_geo_distance, ubicacion_observacion = v_geo_obs,
    reto_vida = p_reto_vida, reto_vida_cumplido = (p_reto_vida is not null and trim(p_reto_vida) <> ''), reto_vida_observacion = case when p_reto_vida is null or trim(p_reto_vida) = '' then 'Reto de vida no registrado.' else 'Reto de vida mostrado antes de captura.' end,
    foto_salida_metadata = v_metadata, foto_salida_hash = p_foto_salida_hash, foto_salida_storage_path = p_foto_salida_storage_path, foto_salida_mime = p_foto_salida_mime, foto_salida_size_bytes = p_foto_salida_size_bytes,
    foto_salida_width = p_foto_salida_width, foto_salida_height = p_foto_salida_height, foto_salida_captured_at = p_foto_salida_captured_at, foto_salida_user_agent = p_foto_salida_user_agent, foto_salida_device_label = p_foto_salida_device_label,
    evidencia_salida_completa = v_evidence_complete, evidencia_observacion = concat_ws(' ', nullif(v_record.evidencia_observacion, ''), nullif(coalesce(p_evidencia_observacion, ''), '')),
    riesgo = v_riesgo, alertas = v_alertas, estado = v_estado, observacion = concat_ws(' ', v_identity_obs, v_geo_obs), observaciones = concat_ws(' ', v_identity_obs, v_geo_obs), updated_at = v_now
  where id = v_record.id returning * into v_record;
  insert into public.audit_logs (accion, detalle, resultado, user_agent) values ('asistencia_salida_sitio', v_user.id::text || ' / ' || v_site.id::text, case when v_geo_complete then 'ok' else 'revision' end, p_foto_salida_user_agent);
  return v_record;
end;
$$;

revoke all on function public.registrar_entrada_segura(text, text, text, jsonb, boolean, jsonb, text, text, text, integer, integer, integer, timestamptz, text, text, boolean, boolean, text, numeric, numeric, numeric, text) from public, anon;
revoke all on function public.registrar_salida_segura(text, text, jsonb, text, numeric, numeric, numeric, text, text, jsonb, text, text, text, integer, integer, integer, timestamptz, text, text, boolean, text) from public, anon;
grant execute on function public.registrar_entrada_segura(text, text, text, jsonb, boolean, jsonb, text, text, text, integer, integer, integer, timestamptz, text, text, boolean, boolean, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.registrar_salida_segura(text, text, jsonb, text, numeric, numeric, numeric, text, text, jsonb, text, text, text, integer, integer, integer, timestamptz, text, text, boolean, text) to authenticated;
