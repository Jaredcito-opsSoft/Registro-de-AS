-- Hotfix: remove QR as exit validation.
-- QR remains only as an access helper in the frontend; salida is validated by matricula, facial, GPS and evidence.
drop function if exists public.registrar_salida_segura(text, text, jsonb, text, numeric, numeric, numeric, text, text, jsonb, text, text, text, integer, integer, integer, timestamptz, text, text, boolean, text);
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
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_site public.sitios%rowtype;
  v_tz text := 'America/Mexico_City';
  v_local timestamp;
  v_fecha date;
  v_record public.asistencias%rowtype;
  v_distance numeric;
  v_similarity numeric;
  v_identity text := 'revision_administrativa';
  v_identity_obs text := '';
  v_estado text := 'revision_requerida';
  v_geo_valid boolean := false;
  v_geo_obs text := '';
  v_geo_distance numeric;
  v_geo_complete boolean := false;
  v_entry_geo_valid boolean := false;
  v_qr_obs text := 'No aplica: salida validada por matricula, foto, GPS y facial.';
  v_horario_obs text := 'Hora servidor registrada; QR no aplica para salida.';
  v_alertas jsonb := '[]'::jsonb;
  v_riesgo text := 'normal';
  v_observacion text := '';
  v_matricula text := upper(trim(coalesce(p_matricula, '')));
  v_evidence_complete boolean := coalesce(p_evidencia_salida_completa, p_foto_salida_hash is not null and p_foto_salida_storage_path is not null and p_foto_salida_size_bytes is not null);
  v_metadata jsonb;
begin
  select * into v_site from public.sitios where activo = true order by updated_at desc limit 1;

  if v_site.id is not null then
    v_tz := coalesce(nullif(v_site.zona_horaria, ''), 'America/Mexico_City');
  end if;

  v_local := v_now at time zone v_tz;
  v_fecha := v_local::date;
  if v_matricula = '' then raise exception 'La matricula es obligatoria'; end if;
  if p_foto_salida_url is null or trim(p_foto_salida_url) = '' then raise exception 'La foto de salida es obligatoria'; end if;
  if p_descriptor_salida is null or jsonb_typeof(p_descriptor_salida) <> 'array' then raise exception 'El descriptor facial de salida es obligatorio'; end if;
  select * into v_record from public.asistencias where matricula = v_matricula and fecha = v_fecha order by hora_entrada desc limit 1;
  if v_record.id is null then raise exception 'No existe una entrada registrada para esta matricula el dia de hoy'; end if;
  if v_record.hora_salida is not null then raise exception 'La salida de esa matricula ya fue registrada'; end if;

  v_entry_geo_valid := coalesce(v_record.ubicacion_entrada_validada, false);


  if v_record.descriptor_entrada is not null then
    select sqrt(sum(power((entrada.value #>> '{}')::numeric - (salida.value #>> '{}')::numeric, 2)))
    into v_distance
    from jsonb_array_elements(v_record.descriptor_entrada) with ordinality entrada(value, ord)
    join jsonb_array_elements(p_descriptor_salida) with ordinality salida(value, ord) using (ord);
  end if;

  if v_distance is null then
    v_similarity := null;
    v_identity := 'revision_administrativa';
    v_identity_obs := 'No fue posible comparar la foto de salida con la entrada.';
    v_alertas := v_alertas || jsonb_build_array('identidad_no_comparable');
  else
    v_similarity := round(greatest(0, 1 - v_distance), 4);
    if v_distance <= 0.46 then
      v_identity := 'identidad_validada';
      v_identity_obs := 'La foto de salida coincide con la foto de entrada.';
    elsif v_distance <= 0.62 then
      v_identity := 'revision_administrativa';
      v_identity_obs := 'La salida fue registrada, pero la coincidencia facial requiere revision.';
      v_alertas := v_alertas || jsonb_build_array('identidad_dudosa');
    else
      v_identity := 'fallida';
      v_identity_obs := 'La foto de salida no parece coincidir con la foto de entrada.';
      v_alertas := v_alertas || jsonb_build_array('identidad_fallida');
    end if;
  end if;

  if v_site.id is null then
    v_geo_obs := 'No hay sitio activo configurado para validar salida.';
    v_alertas := v_alertas || jsonb_build_array('sitio_no_configurado');
  elsif lower(coalesce(p_ubicacion_estado, '')) = 'ubicacion_denegada' or p_latitud is null or p_longitud is null then
    v_geo_obs := 'Ubicacion de salida no autorizada por el navegador.';
    v_alertas := v_alertas || jsonb_build_array('ubicacion_denegada_salida');
  elsif p_precision is not null and p_precision > 200 then
    v_geo_obs := 'Precision GPS de salida insuficiente.';
    v_alertas := v_alertas || jsonb_build_array('ubicacion_salida_imprecisa');
  else
    v_geo_distance := public.geo_distance_meters(p_latitud, p_longitud, v_site.latitud, v_site.longitud);
    if v_geo_distance <= v_site.radio_metros then
      v_geo_valid := true;
      v_geo_obs := 'Ubicacion de salida validada correctamente.';
    else
      v_geo_obs := 'Ubicacion de salida fuera del radio permitido.';
      v_alertas := v_alertas || jsonb_build_array('ubicacion_salida_fuera_de_rango');
    end if;
  end if;

  v_geo_complete := v_geo_valid and p_latitud is not null and p_longitud is not null;

  if not v_evidence_complete then
    v_alertas := v_alertas || jsonb_build_array('evidencia_salida_incompleta');
  end if;

  if (not v_entry_geo_valid) and (not v_geo_complete) and v_identity <> 'identidad_validada' then
    v_riesgo := 'sospechoso';
  elsif (not v_entry_geo_valid) and (not v_geo_complete) then
    v_riesgo := 'revision_multiple';
  elsif not v_geo_complete then
    v_riesgo := 'revision_ubicacion_salida';
  elsif not v_entry_geo_valid then
    v_riesgo := 'revision_ubicacion_entrada';
  elsif v_identity <> 'identidad_validada' then
    v_riesgo := 'revision_identidad';
  else
    v_riesgo := 'normal';
  end if;

  if v_riesgo = 'normal' and v_identity = 'identidad_validada' and v_geo_complete then
    v_estado := 'asistencia_completa';
  else
    v_estado := 'revision_requerida';
  end if;

  v_metadata := jsonb_set(coalesce(p_foto_salida_metadata, '{}'::jsonb), '{location}', jsonb_build_object(
    'latitud', p_latitud,
    'longitud', p_longitud,
    'precision', p_precision,
    'sitio_id', v_site.id,
    'sitio_nombre', v_site.nombre,
    'distancia_metros', v_geo_distance,
    'validada', v_geo_valid,
    'observacion', v_geo_obs
  ), true);

  v_observacion := concat_ws(' ', v_identity_obs, v_qr_obs, v_geo_obs, 'Reto de vida:', coalesce(p_reto_vida, 'no registrado'));

  update public.asistencias
  set hora_salida = v_now,
      server_time_salida = v_now,
      foto_salida_url = p_foto_salida_url,
      descriptor_salida = p_descriptor_salida,
      rostro_salida_detectado = true,
      similitud_facial = v_similarity,
      validacion_identidad = v_identity,
      metodo_salida = 'matricula_foto_gps',
      qr_token_id = null,
      token_qr_usado = 'no_aplica',
      qr_salida = 'no_aplica',
      qr_validado = false,
      qr_observacion = v_qr_obs,
      horario_validado = true,
      horario_observacion = v_horario_obs,
      latitud_salida = p_latitud,
      longitud_salida = p_longitud,
      precision_salida = p_precision,
      distancia_salida_metros = v_geo_distance,
      ubicacion_salida_validada = v_geo_valid,
      ubicacion_salida_observacion = v_geo_obs,
      sitio_salida_id = v_site.id,
      sitio_salida_nombre = v_site.nombre,
      evidencia_salida_geolocalizada = v_geo_complete,
      evidencia_geolocalizada_observacion = concat_ws(' ', nullif(v_record.evidencia_geolocalizada_observacion, ''), v_geo_obs),
      precision_ubicacion = p_precision,
      ubicacion_validada = v_geo_valid,
      distancia_empresa_metros = v_geo_distance,
      ubicacion_observacion = v_geo_obs,
      reto_vida = p_reto_vida,
      reto_vida_cumplido = (p_reto_vida is not null and trim(p_reto_vida) <> ''),
      reto_vida_observacion = case when p_reto_vida is null or trim(p_reto_vida) = '' then 'Reto de vida no registrado.' else 'Reto de vida mostrado antes de captura.' end,
      sitio_id = v_site.id,
      sitio_nombre = v_site.nombre,
      radio_metros = v_site.radio_metros,
      foto_salida_metadata = v_metadata,
      foto_salida_hash = p_foto_salida_hash,
      foto_salida_storage_path = p_foto_salida_storage_path,
      foto_salida_mime = p_foto_salida_mime,
      foto_salida_size_bytes = p_foto_salida_size_bytes,
      foto_salida_width = p_foto_salida_width,
      foto_salida_height = p_foto_salida_height,
      foto_salida_captured_at = p_foto_salida_captured_at,
      foto_salida_user_agent = p_foto_salida_user_agent,
      foto_salida_device_label = p_foto_salida_device_label,
      evidencia_salida_completa = v_evidence_complete,
      evidencia_observacion = concat_ws(' ', nullif(v_record.evidencia_observacion, ''), nullif(coalesce(p_evidencia_observacion, ''), '')),
      riesgo = v_riesgo,
      alertas = v_alertas,
      estado = v_estado,
      observacion = v_observacion,
      observaciones = v_observacion,
      updated_at = v_now
  where id = v_record.id
  returning * into v_record;

  insert into public.audit_logs (accion, detalle, resultado, user_agent)
  values (
    case when v_geo_complete then 'ubicacion_salida_validada' else 'ubicacion_salida_rechazada' end,
    'salida ' || v_matricula || ' - ' || v_geo_obs,
    case when v_geo_complete then 'ok' else 'revision' end,
    p_foto_salida_user_agent
  );

  if lower(coalesce(p_ubicacion_estado, '')) = 'ubicacion_denegada' or p_latitud is null or p_longitud is null then
    insert into public.audit_logs (accion, detalle, resultado, user_agent)
    values ('gps_denegado_salida', 'salida ' || v_matricula, 'revision', p_foto_salida_user_agent);
  end if;

  return v_record;
end;
$$;


grant execute on function public.registrar_salida_segura(text, text, jsonb, text, numeric, numeric, numeric, text, text, jsonb, text, text, text, integer, integer, integer, timestamptz, text, text, boolean, text) to anon, authenticated;
notify pgrst, 'reload schema';