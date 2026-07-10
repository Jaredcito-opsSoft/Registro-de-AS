# F0-03 Modelo de datos multiempresa

Fecha: 2026-07-09
Linear: `JAR-27`

## Objetivo

Definir el modelo objetivo para el MVP multiempresa sin ejecutar migraciones en produccion. Este modelo debe servir como base para RLS, RPCs, Storage privado, reportes y migracion desde el esquema actual.

## Principios

- `organizacion_id` separa tenants.
- `sitio_id` separa unidades operativas dentro de una organizacion.
- `role` define capacidad general.
- `scope_type` define alcance: `global`, `organizacion`, `sitio`, `propio`.
- `matricula` se migra a `identificador`.
- La asistencia guarda `identificador_snapshot` para trazabilidad historica.
- Evidencias no se guardan en base64 ni en URLs publicas.

## Roles MVP

- `superadmin`: alcance global.
- `admin`: alcance por organizacion o sitio.
- `operador`: revision operativa limitada por sitio.
- `usuario`: solo registros propios.

## Tablas objetivo

### organizaciones

Proposito: tenant principal.

Campos:

- `id uuid primary key`
- `nombre text not null`
- `tipo text not null default 'empresa'`
- `slug text unique not null`
- `estado text not null default 'activa'`
- `plan text not null default 'mvp'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz`

Indices:

- `organizaciones_slug_idx unique (slug)`
- `organizaciones_estado_idx (estado)`

### sitios

Proposito: sede, campus, sucursal o unidad operativa.

Campos:

- `id uuid primary key`
- `organizacion_id uuid not null references organizaciones(id)`
- `nombre text not null`
- `direccion text`
- `latitud double precision`
- `longitud double precision`
- `radio_metros integer default 100`
- `zona_horaria text not null default 'America/Mexico_City'`
- `gps_policy text not null default 'revision'`
- `evidence_policy text not null default 'rostro'`
- `activo boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz`

Indices:

- `sitios_org_idx (organizacion_id)`
- `sitios_org_activo_idx (organizacion_id, activo)`
- `sitios_org_nombre_unique unique (organizacion_id, nombre)`

### site_identifier_config

Proposito: permitir que cada sitio llame al identificador como matricula, codigo, folio, numero de empleado, etc.

Campos:

- `id uuid primary key`
- `organizacion_id uuid not null references organizaciones(id)`
- `sitio_id uuid not null references sitios(id)`
- `label text not null default 'Identificador'`
- `tipo text not null default 'texto'`
- `requerido boolean not null default true`
- `unico_por_sitio boolean not null default true`
- `mascara_visual text`
- `validacion_regex text`
- `created_at timestamptz not null default now()`

Restricciones:

- Una configuracion activa por sitio en MVP.

### usuarios_app

Proposito: perfil operativo vinculado a Supabase Auth.

Campos:

- `id uuid primary key`
- `auth_user_id uuid unique`
- `organizacion_id uuid not null references organizaciones(id)`
- `sitio_id uuid references sitios(id)`
- `nombre text not null`
- `email text not null`
- `identificador text not null`
- `rol text not null default 'usuario'`
- `scope_type text not null default 'propio'`
- `activo boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz`

Indices/restricciones:

- `usuarios_app_auth_user_unique unique (auth_user_id)`
- `usuarios_app_org_email_idx (organizacion_id, lower(email))`
- `usuarios_app_identificador_unique unique (organizacion_id, sitio_id, identificador) where activo = true`

Migracion:

- `matricula` antigua pasa a `identificador`.
- Si no existe sitio, crear sitio demo/inicial por organizacion.

### asistencias

Proposito: registro diario principal.

Campos:

- `id uuid primary key`
- `organizacion_id uuid not null references organizaciones(id)`
- `sitio_id uuid not null references sitios(id)`
- `usuario_id uuid not null references usuarios_app(id)`
- `identificador_snapshot text not null`
- `fecha date not null`
- `entrada_at timestamptz`
- `salida_at timestamptz`
- `estado text not null default 'pendiente_salida'`
- `riesgo text not null default 'normal'`
- `folio_interno text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz`

Restricciones:

- `unique (organizacion_id, sitio_id, usuario_id, fecha)`
- salida no puede existir sin entrada, validado por RPC.

### evidencias

Proposito: metadata de fotos/documentos. El archivo vive en Storage privado.

Campos:

- `id uuid primary key`
- `organizacion_id uuid not null references organizaciones(id)`
- `sitio_id uuid not null references sitios(id)`
- `asistencia_id uuid not null references asistencias(id)`
- `tipo text not null` (`entrada_rostro`, `salida_rostro`, `documento`, `foto_simple`)
- `bucket text not null`
- `path text not null`
- `hash_sha256 text`
- `mime text`
- `size_bytes bigint`
- `width integer`
- `height integer`
- `captured_at timestamptz`
- `created_by uuid references usuarios_app(id)`
- `created_at timestamptz not null default now()`

Restricciones:

- `unique (bucket, path)`
- No guardar signed URLs.
- No guardar base64.

### ubicaciones

Proposito: GPS de entrada/salida.

Campos:

- `id uuid primary key`
- `organizacion_id uuid not null references organizaciones(id)`
- `sitio_id uuid not null references sitios(id)`
- `asistencia_id uuid not null references asistencias(id)`
- `tipo text not null` (`entrada`, `salida`)
- `latitud double precision`
- `longitud double precision`
- `precision_metros double precision`
- `distancia_metros double precision`
- `validado boolean`
- `observacion text`
- `created_at timestamptz not null default now()`

### audit_logs

Proposito: bitacora append-only.

Campos:

- `id uuid primary key`
- `organizacion_id uuid references organizaciones(id)`
- `sitio_id uuid references sitios(id)`
- `actor_user_id uuid references usuarios_app(id)`
- `accion text not null`
- `entidad text not null`
- `entity_id uuid`
- `detalle_json jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Regla:

- No exponer escritura directa desde frontend.
- No guardar fotos, tokens, signed URLs ni documentos en logs.

### privacy_notices

Proposito: avisos versionados.

Campos:

- `id uuid primary key`
- `organizacion_id uuid references organizaciones(id)`
- `sitio_id uuid references sitios(id)`
- `version text not null`
- `titulo text not null`
- `url_o_texto text not null`
- `vigente_desde timestamptz not null`
- `vigente_hasta timestamptz`
- `activo boolean not null default true`
- `created_at timestamptz not null default now()`

### privacy_consents

Proposito: evidencia de consentimiento.

Campos:

- `id uuid primary key`
- `usuario_id uuid not null references usuarios_app(id)`
- `notice_id uuid not null references privacy_notices(id)`
- `accepted_at timestamptz not null default now()`
- `revoked_at timestamptz`
- `metodo text not null default 'web'`
- `user_agent_hash text`
- `created_at timestamptz not null default now()`

### privacy_requests

Proposito: solicitudes ARCO/privacidad.

Campos:

- `id uuid primary key`
- `usuario_id uuid references usuarios_app(id)`
- `organizacion_id uuid references organizaciones(id)`
- `tipo text not null`
- `estado text not null default 'recibida'`
- `fecha_solicitud timestamptz not null default now()`
- `fecha_respuesta timestamptz`
- `respuesta text`
- `created_at timestamptz not null default now()`

### retention_policies

Proposito: reglas de conservacion.

Campos:

- `id uuid primary key`
- `organizacion_id uuid references organizaciones(id)`
- `sitio_id uuid references sitios(id)`
- `tipo_dato text not null`
- `dias_retencion integer not null`
- `accion text not null default 'archivar'`
- `activo boolean not null default true`
- `created_at timestamptz not null default now()`

### exports

Proposito: auditoria de exportaciones.

Campos:

- `id uuid primary key`
- `organizacion_id uuid not null references organizaciones(id)`
- `sitio_id uuid references sitios(id)`
- `actor_user_id uuid not null references usuarios_app(id)`
- `filtros_json jsonb not null default '{}'::jsonb`
- `columnas text[] not null`
- `created_at timestamptz not null default now()`

### attendance_corrections

Proposito: trazabilidad de correcciones.

Campos:

- `id uuid primary key`
- `asistencia_id uuid not null references asistencias(id)`
- `admin_id uuid not null references usuarios_app(id)`
- `motivo text not null`
- `antes_json jsonb not null`
- `despues_json jsonb not null`
- `notificado_usuario boolean not null default false`
- `fecha_notificacion timestamptz`
- `created_at timestamptz not null default now()`

### user_notifications

Proposito: avisos al usuario.

Campos:

- `id uuid primary key`
- `usuario_id uuid not null references usuarios_app(id)`
- `tipo text not null`
- `titulo text not null`
- `mensaje text not null`
- `read_at timestamptz`
- `created_at timestamptz not null default now()`

## Clasificacion inicial de SQL existente

### Conservar como referencia historica

- `supabase-hito2-image-metadata.sql`
- `supabase-hito3-geolocation-evidence.sql`
- `supabase-hito3-1-location-validation.sql`
- `supabase-hito5-multiempresa-foundation.sql`
- `supabase-hito6-roles-permissions.sql`
- `supabase-registro-fix.sql`

### Reemplazar por migracion consolidada Fase 0

- `supabase-schema.sql`
- `supabase-site-admin-migration.sql`
- `supabase-remove-qr-exit-validation.sql`

### Revisar con cuidado antes de aplicar

- `supabase-rbac-cleanup.sql`
- `supabase-hotfix-qr-token-pgcrypto.sql`
- `supabase-antifraud-migration.sql`

## Riesgos

- Migraciones viejas usan `matricula`, `ADMIN123` y/o Storage publico.
- Puede haber columnas ya aplicadas en Supabase que no coincidan con este modelo.
- Se requiere introspeccion real de Supabase antes de ejecutar nuevas migraciones.

## Proxima accion

Crear una migracion nueva consolidada Fase 0 en una carpeta separada, sin borrar SQL antiguo todavia.
