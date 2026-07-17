-- Estados explícitos para el flujo de foto simple sin reconocimiento facial.

alter table public.asistencias
  drop constraint if exists asistencias_validacion_identidad_check;

alter table public.asistencias
  add constraint asistencias_validacion_identidad_check
  check (validacion_identidad = any (array[
    'identidad_validada'::text,
    'revision_administrativa'::text,
    'fallida'::text,
    'pendiente'::text,
    'foto_registrada'::text
  ]));

alter table public.asistencias
  drop constraint if exists asistencias_riesgo_check;

alter table public.asistencias
  add constraint asistencias_riesgo_check
  check (riesgo = any (array[
    'normal'::text,
    'revision_ubicacion'::text,
    'revision_ubicacion_entrada'::text,
    'revision_ubicacion_salida'::text,
    'revision_identidad'::text,
    'revision_qr'::text,
    'revision_horario'::text,
    'revision_multiple'::text,
    'revision_evidencia'::text,
    'sospechoso'::text
  ]));
