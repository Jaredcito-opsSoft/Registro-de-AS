# F0-05 Diseno RLS para aislamiento multiempresa

Fecha: 2026-07-09
Linear: `JAR-29`

## Objetivo

Definir politicas RLS para que Supabase/Postgres rechace accesos fuera de organizacion, sitio o rol aunque el frontend sea manipulado.

## Principios

- RLS es obligatorio en tablas sensibles.
- El frontend no decide el alcance final.
- Las RPCs validan acciones complejas.
- `auth.uid()` debe mapearse a `usuarios_app.auth_user_id`.
- No confiar ciegamente en `organizacion_id` o `sitio_id` enviados por cliente.
- Las evidencias no se leen directo: se acceden via RPC de signed URL.

## Funciones auxiliares sugeridas

### `current_app_user()`

Devuelve el perfil activo del usuario autenticado:

- `user_id`
- `auth_user_id`
- `organizacion_id`
- `sitio_id`
- `rol`
- `scope_type`
- `activo`

Reglas:

- Si no hay `auth.uid()`, retorna null.
- Si usuario no existe o esta inactivo, retorna null.

### `current_role_rank()`

Orden sugerido:

- `usuario = 10`
- `operador = 20`
- `admin = 30`
- `superadmin = 40`

### `can_access_org(target_organizacion_id)`

Verdadero si:

- superadmin;
- usuario pertenece a esa organizacion.

### `can_access_site(target_sitio_id)`

Verdadero si:

- superadmin;
- admin con scope organizacion de esa org;
- admin/operador con scope sitio igual;
- usuario propio solo via tablas relacionadas a su registro.

## Politicas por tabla

### organizaciones

Select:

- `superadmin`: todas.
- `admin`, `operador`, `usuario`: solo su organizacion.

Insert/update/delete:

- Solo `superadmin`.
- `admin` organizacion podria actualizar campos no criticos en fase futura mediante RPC, no directo.

### sitios

Select:

- `superadmin`: todos.
- `admin` org: sitios de su organizacion.
- `admin` sitio / `operador`: sitio asignado.
- `usuario`: sitio asignado.

Insert/update:

- `superadmin`.
- `admin` con `scope_type = organizacion` via RPC `configure_site_policy`.

Delete:

- No en MVP. Usar `activo = false`.

### usuarios_app

Select:

- `usuario`: propio.
- `operador`: usuarios de su sitio, campos limitados si se usa vista.
- `admin`: usuarios dentro de alcance.
- `superadmin`: todos.

Update:

- `usuario`: datos basicos propios, nunca `rol`, `scope_type`, `organizacion_id`, `sitio_id`, `activo`.
- `admin`: activar/desactivar usuarios dentro de alcance, no superadmin.
- `superadmin`: global.

Insert:

- Registro normal via RPC/invitacion, no insercion libre.

### asistencias

Select:

- `usuario`: propias.
- `operador`: sitio asignado.
- `admin`: alcance org/sitio.
- `superadmin`: todas.

Insert/update:

- Via RPC `register_entry` y `register_exit`.
- Correcciones via RPC `correct_attendance`.
- No updates libres desde frontend.

Delete:

- No en MVP.

### evidencias

Select:

- No directo para frontend si contiene paths privados.
- Crear una vista segura si hace falta metadata no sensible.

Insert:

- Via RPC/flujo backend despues de subir archivo a Storage privado.

Accesso al archivo:

- Solo via `get_signed_evidence_url`.

### ubicaciones

Select:

- Mismo alcance que asistencia.
- Coordenadas pueden limitarse por rol/vista si se considera sensible.

Insert/update:

- Via `register_entry`/`register_exit`.

### audit_logs

Select:

- `admin`: logs de su alcance.
- `superadmin`: global.
- `usuario`: no directo; puede ver notificaciones/resumen propio.

Insert:

- Solo RPCs/funciones internas.

Update/delete:

- Prohibido.

### privacy_consents

Select:

- `usuario`: propio.
- `admin`: usuarios de su alcance.
- `superadmin`: global.

Insert:

- Usuario propio mediante flujo de consentimiento.

Update:

- Revocacion via RPC/flujo controlado.

### exports

Select:

- `admin`: exportaciones de su alcance.
- `superadmin`: global.

Insert:

- Via RPC `export_attendance_csv`.

## Division RLS vs RPC

RLS debe bloquear:

- lectura de tenant ajeno;
- lectura de sitio ajeno;
- lectura de evidencia metadata ajena;
- update directo de roles/alcance;
- update/delete directo de asistencias;
- acceso a logs fuera de alcance.

RPC debe validar:

- duplicados;
- entrada activa;
- salida duplicada;
- politicas GPS/evidencia;
- consentimiento vigente;
- cambios de configuracion;
- auditoria;
- exportacion;
- signed URLs.

## Pruebas negativas minimas

1. Usuario A consulta `asistencias` de organizacion B: debe devolver 0 filas o error RLS.
2. Admin sitio A consulta sitio B: debe devolver 0 filas o error.
3. Operador modifica asistencia: debe fallar salvo RPC permitida.
4. Usuario intenta update `rol = admin`: debe fallar.
5. Usuario intenta generar signed URL de otro usuario: debe fallar.
6. Admin org A exporta org B: debe fallar.
7. Anon consulta `evidencias`: debe fallar.
8. Anon consulta `audit_logs`: debe fallar.

## Riesgos

- RLS con funciones `SECURITY DEFINER` mal configuradas puede saltarse aislamiento.
- Politicas muy complejas pueden degradar performance si faltan indices.
- El repo actual tiene SQL historico con permisos amplios que debe reemplazarse cuidadosamente.

## Estado

Documento listo para traducir a migracion SQL revisada.

SQL draft asociado:

- `docs/fase0/sql-drafts/f0_rls_policies.sql`
- `docs/fase0/sql-drafts/f0_negative_tests.sql`

No ejecutar sin introspeccion previa de Supabase, respaldo y revision con `supabase db advisors` o equivalente.
