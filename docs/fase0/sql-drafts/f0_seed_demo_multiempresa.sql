-- F0 seed demo multiempresa.
-- NO usar datos reales.
-- Ejecutar solo cuando el modelo Fase 0 exista en dev/staging.

begin;

insert into public.organizaciones (nombre, tipo, slug, estado, plan)
values
  ('Escuela Demo Norte', 'escuela', 'escuela-demo-norte', 'activa', 'mvp'),
  ('Empresa Demo Sur', 'empresa', 'empresa-demo-sur', 'activa', 'mvp')
on conflict (slug) do update
set nombre = excluded.nombre,
    tipo = excluded.tipo,
    estado = excluded.estado,
    plan = excluded.plan;

insert into public.sitios (
  organizacion_id,
  nombre,
  direccion,
  latitud,
  longitud,
  radio_metros,
  zona_horaria,
  gps_policy,
  evidence_policy,
  activo
)
select o.id, 'Campus A1', 'Direccion demo A', 19.432600, -99.133200, 100,
       'America/Mexico_City', 'revision', 'rostro', true
from public.organizaciones o
where o.slug = 'escuela-demo-norte'
on conflict (organizacion_id, nombre) do update
set activo = true,
    gps_policy = excluded.gps_policy,
    evidence_policy = excluded.evidence_policy;

insert into public.sitios (
  organizacion_id,
  nombre,
  direccion,
  latitud,
  longitud,
  radio_metros,
  zona_horaria,
  gps_policy,
  evidence_policy,
  activo
)
select o.id, 'Sucursal B1', 'Direccion demo B', 20.967400, -89.592600, 100,
       'America/Mexico_City', 'revision', 'rostro', true
from public.organizaciones o
where o.slug = 'empresa-demo-sur'
on conflict (organizacion_id, nombre) do update
set activo = true,
    gps_policy = excluded.gps_policy,
    evidence_policy = excluded.evidence_policy;

insert into public.site_identifier_config (
  organizacion_id,
  sitio_id,
  label,
  tipo,
  requerido,
  unico_por_sitio,
  mascara_visual
)
select o.id, s.id, 'Matricula', 'texto', true, true, null
from public.organizaciones o
join public.sitios s on s.organizacion_id = o.id
where o.slug in ('escuela-demo-norte', 'empresa-demo-sur')
on conflict do nothing;

insert into public.usuarios_app (
  organizacion_id,
  sitio_id,
  nombre,
  email,
  identificador,
  rol,
  scope_type,
  activo
)
select o.id, s.id, 'Usuario Demo A', 'usuario.a@demo.local', 'A-1001', 'usuario', 'propio', true
from public.organizaciones o join public.sitios s on s.organizacion_id = o.id
where o.slug = 'escuela-demo-norte'
on conflict do nothing;

insert into public.usuarios_app (
  organizacion_id,
  sitio_id,
  nombre,
  email,
  identificador,
  rol,
  scope_type,
  activo
)
select o.id, s.id, 'Operador Demo A', 'operador.a@demo.local', 'A-2001', 'operador', 'sitio', true
from public.organizaciones o join public.sitios s on s.organizacion_id = o.id
where o.slug = 'escuela-demo-norte'
on conflict do nothing;

insert into public.usuarios_app (
  organizacion_id,
  sitio_id,
  nombre,
  email,
  identificador,
  rol,
  scope_type,
  activo
)
select o.id, s.id, 'Admin Demo A', 'admin.a@demo.local', 'A-3001', 'admin', 'organizacion', true
from public.organizaciones o join public.sitios s on s.organizacion_id = o.id
where o.slug = 'escuela-demo-norte'
on conflict do nothing;

insert into public.usuarios_app (
  organizacion_id,
  sitio_id,
  nombre,
  email,
  identificador,
  rol,
  scope_type,
  activo
)
select o.id, s.id, 'Usuario Demo B', 'usuario.b@demo.local', 'B-1001', 'usuario', 'propio', true
from public.organizaciones o join public.sitios s on s.organizacion_id = o.id
where o.slug = 'empresa-demo-sur'
on conflict do nothing;

insert into public.usuarios_app (
  organizacion_id,
  sitio_id,
  nombre,
  email,
  identificador,
  rol,
  scope_type,
  activo
)
select o.id, s.id, 'Operador Demo B', 'operador.b@demo.local', 'B-2001', 'operador', 'sitio', true
from public.organizaciones o join public.sitios s on s.organizacion_id = o.id
where o.slug = 'empresa-demo-sur'
on conflict do nothing;

insert into public.usuarios_app (
  organizacion_id,
  sitio_id,
  nombre,
  email,
  identificador,
  rol,
  scope_type,
  activo
)
select o.id, s.id, 'Admin Demo B', 'admin.b@demo.local', 'B-3001', 'admin', 'organizacion', true
from public.organizaciones o join public.sitios s on s.organizacion_id = o.id
where o.slug = 'empresa-demo-sur'
on conflict do nothing;

insert into public.usuarios_app (
  organizacion_id,
  sitio_id,
  nombre,
  email,
  identificador,
  rol,
  scope_type,
  activo
)
select o.id, null, 'Superadmin Demo', 'superadmin@demo.local', 'GLOBAL-0001', 'superadmin', 'global', true
from public.organizaciones o
where o.slug = 'escuela-demo-norte'
on conflict do nothing;

-- Asistencias demo sin evidencia real.
insert into public.asistencias (
  organizacion_id,
  sitio_id,
  usuario_id,
  identificador_snapshot,
  fecha,
  entrada_at,
  salida_at,
  estado,
  riesgo,
  folio_interno
)
select u.organizacion_id, u.sitio_id, u.id, u.identificador, current_date,
       now() - interval '8 hours', now() - interval '1 hours',
       'completa', 'normal', 'DEMO-A-COMPLETA'
from public.usuarios_app u
where u.email = 'usuario.a@demo.local'
on conflict do nothing;

insert into public.asistencias (
  organizacion_id,
  sitio_id,
  usuario_id,
  identificador_snapshot,
  fecha,
  entrada_at,
  salida_at,
  estado,
  riesgo,
  folio_interno
)
select u.organizacion_id, u.sitio_id, u.id, u.identificador, current_date,
       now() - interval '7 hours', null,
       'pendiente_salida', 'normal', 'DEMO-B-PENDIENTE'
from public.usuarios_app u
where u.email = 'usuario.b@demo.local'
on conflict do nothing;

commit;
