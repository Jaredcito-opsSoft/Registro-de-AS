-- Registro rápido con foto simple. Conserva sesión, sitio, horario, GPS,
-- evidencia privada y auditoría de los RPC endurecidos existentes.

create or replace function public.registrar_entrada_foto_segura(
  p_nombre text,
  p_matricula text,
  p_foto_entrada_url text,
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
  p_ubicacion_entrada_estado text default null,
  p_sitio_id uuid default null
)
returns public.asistencias
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_row public.asistencias%rowtype;
begin
  -- El descriptor técnico no representa un rostro: solo mantiene compatibilidad
  -- con el RPC heredado mientras se reutilizan todas sus validaciones de seguridad.
  v_row := public.registrar_entrada_segura(
    p_nombre,
    p_matricula,
    p_foto_entrada_url,
    jsonb_build_array(0),
    true,
    p_foto_entrada_metadata,
    p_foto_entrada_hash,
    p_foto_entrada_storage_path,
    p_foto_entrada_mime,
    p_foto_entrada_size_bytes,
    p_foto_entrada_width,
    p_foto_entrada_height,
    p_foto_entrada_captured_at,
    p_foto_entrada_user_agent,
    p_foto_entrada_device_label,
    p_fotos_privadas,
    p_evidencia_entrada_completa,
    p_evidencia_observacion,
    p_latitud_entrada,
    p_longitud_entrada,
    p_precision_entrada,
    p_ubicacion_entrada_estado,
    p_sitio_id
  );

  update public.asistencias
  set descriptor_entrada = null,
      rostro_entrada_detectado = false,
      similitud_facial = null,
      validacion_identidad = 'foto_registrada',
      updated_at = clock_timestamp()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.registrar_salida_foto_segura(
  p_matricula text,
  p_foto_salida_url text,
  p_token_qr text default null,
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
  v_row public.asistencias%rowtype;
begin
  v_row := public.registrar_salida_segura(
    p_matricula,
    p_foto_salida_url,
    jsonb_build_array(0),
    p_token_qr,
    p_latitud,
    p_longitud,
    p_precision,
    p_ubicacion_estado,
    p_reto_vida,
    p_foto_salida_metadata,
    p_foto_salida_hash,
    p_foto_salida_storage_path,
    p_foto_salida_mime,
    p_foto_salida_size_bytes,
    p_foto_salida_width,
    p_foto_salida_height,
    p_foto_salida_captured_at,
    p_foto_salida_user_agent,
    p_foto_salida_device_label,
    p_evidencia_salida_completa,
    p_evidencia_observacion
  );

  update public.asistencias
  set descriptor_salida = null,
      rostro_salida_detectado = false,
      similitud_facial = null,
      validacion_identidad = 'foto_registrada',
      metodo_salida = 'matricula_foto_gps',
      qr_observacion = 'No aplica: salida validada por identificador, foto y GPS.',
      alertas = coalesce(alertas, '[]'::jsonb)
        - 'identidad_no_comparable'
        - 'identidad_dudosa'
        - 'identidad_fallida',
      riesgo = case
        when not coalesce(ubicacion_entrada_validada, false)
          and not coalesce(ubicacion_salida_validada, false) then 'revision_multiple'
        when not coalesce(ubicacion_salida_validada, false) then 'revision_ubicacion_salida'
        when not coalesce(ubicacion_entrada_validada, false) then 'revision_ubicacion_entrada'
        when not coalesce(evidencia_entrada_completa, false)
          or not coalesce(evidencia_salida_completa, false) then 'revision_evidencia'
        else 'normal'
      end,
      estado = case
        when coalesce(ubicacion_entrada_validada, false)
          and coalesce(ubicacion_salida_validada, false)
          and coalesce(evidencia_entrada_completa, false)
          and coalesce(evidencia_salida_completa, false) then 'asistencia_completa'
        else 'revision_requerida'
      end,
      observacion = concat_ws(' ', 'Salida registrada con foto simple.', nullif(ubicacion_salida_observacion, '')),
      observaciones = concat_ws(' ', 'Salida registrada con foto simple.', nullif(ubicacion_salida_observacion, '')),
      updated_at = clock_timestamp()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.registrar_entrada_foto_segura(
  text, text, text, jsonb, text, text, text, integer, integer, integer,
  timestamptz, text, text, boolean, boolean, text, numeric, numeric, numeric, text, uuid
) from public, anon;
revoke all on function public.registrar_salida_foto_segura(
  text, text, text, numeric, numeric, numeric, text, text, jsonb, text, text,
  text, integer, integer, integer, timestamptz, text, text, boolean, text
) from public, anon;

grant execute on function public.registrar_entrada_foto_segura(
  text, text, text, jsonb, text, text, text, integer, integer, integer,
  timestamptz, text, text, boolean, boolean, text, numeric, numeric, numeric, text, uuid
) to authenticated;
grant execute on function public.registrar_salida_foto_segura(
  text, text, text, numeric, numeric, numeric, text, text, jsonb, text, text,
  text, integer, integer, integer, timestamptz, text, text, boolean, text
) to authenticated;

comment on function public.registrar_entrada_foto_segura(
  text, text, text, jsonb, text, text, text, integer, integer, integer,
  timestamptz, text, text, boolean, boolean, text, numeric, numeric, numeric, text, uuid
) is 'Registra entrada con foto simple, GPS, sitio, horario y evidencia privada; sin reconocimiento facial.';
comment on function public.registrar_salida_foto_segura(
  text, text, text, numeric, numeric, numeric, text, text, jsonb, text, text,
  text, integer, integer, integer, timestamptz, text, text, boolean, text
) is 'Registra salida con foto simple, GPS y evidencia privada; sin reconocimiento facial.';
