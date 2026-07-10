-- F0 negative tests draft.
-- Ejecutar manualmente en dev/staging con usuarios autenticados distintos.
-- Este archivo documenta pruebas esperadas; no es una suite automatizada completa.

-- Caso 1: usuario A no debe ver asistencias de organizacion B.
-- Como usuario.a@demo.local:
select *
from public.asistencias
where organizacion_id in (
  select id from public.organizaciones where slug = 'empresa-demo-sur'
);
-- Esperado: 0 filas.

-- Caso 2: admin A no debe ver usuarios B.
-- Como admin.a@demo.local:
select *
from public.usuarios_app
where organizacion_id in (
  select id from public.organizaciones where slug = 'empresa-demo-sur'
);
-- Esperado: 0 filas.

-- Caso 3: usuario no debe elevar rol.
-- Como usuario.a@demo.local:
update public.usuarios_app
set rol = 'admin'
where email = 'usuario.a@demo.local';
-- Esperado: error RLS o 0 filas actualizadas.

-- Caso 4: salida sin entrada activa debe fallar.
-- Como usuario sin asistencia activa:
select public.register_exit(
  (select s.id from public.sitios s join public.organizaciones o on o.id = s.organizacion_id where o.slug = 'escuela-demo-norte' limit 1),
  'A-1001',
  '{"bucket":"evidence-private","path":"demo/exit.jpg","tipo":"salida_rostro"}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb
);
-- Esperado: NO_ACTIVE_ENTRY o DUPLICATE_EXIT segun seed.

-- Caso 5: operador sitio A no debe ver sitio B.
-- Como operador.a@demo.local:
select *
from public.sitios
where organizacion_id in (
  select id from public.organizaciones where slug = 'empresa-demo-sur'
);
-- Esperado: 0 filas.
