# F0-06 Contratos RPC criticos

Fecha: 2026-07-09
Linear: `JAR-30`

## Objetivo

Definir contratos backend para que entrada, salida, evidencias, correcciones, exportaciones y configuracion no dependan de validaciones de frontend.

## Reglas globales

Toda RPC sensible debe:

- usar `auth.uid()`;
- cargar `current_app_user()`;
- rechazar usuario inactivo;
- validar rol y alcance;
- usar hora servidor;
- no confiar en tenant enviado por cliente sin validarlo;
- auditar acciones sensibles;
- devolver errores controlados.

## `register_entry`

### Entrada

- `p_sitio_id uuid`
- `p_identificador text`
- `p_evidence jsonb`
- `p_location jsonb`
- `p_client_context jsonb`

### Validaciones

- Usuario autenticado y activo.
- Sitio activo y dentro de alcance.
- Identificador coincide con usuario o flujo de registro permitido.
- Consentimiento vigente si politica lo requiere.
- No existe asistencia activa del mismo usuario/sitio/fecha.
- Evidencia requerida completa.
- GPS requerido segun politica del sitio.
- Hora desde servidor.

### Resultado

- `asistencia_id`
- `estado`
- `riesgo`
- `folio_interno`
- `entrada_at`
- advertencias/revision si aplica.

### Errores esperados

- `USER_INACTIVE`
- `SITE_FORBIDDEN`
- `CONSENT_REQUIRED`
- `DUPLICATE_ENTRY`
- `EVIDENCE_REQUIRED`
- `GPS_REQUIRED`

## `register_exit`

### Entrada

- `p_sitio_id uuid`
- `p_identificador text`
- `p_evidence jsonb`
- `p_location jsonb`
- `p_face_match jsonb`
- `p_client_context jsonb`

### Validaciones

- Usuario autenticado y activo.
- Entrada activa del mismo dia.
- Salida no registrada.
- Evidencia salida completa.
- GPS requerido segun politica.
- Facial opcional si el sitio lo requiere.
- El usuario/identificador pertenece al mismo registro.

### Resultado

- `asistencia_id`
- `salida_at`
- `estado`
- `riesgo`
- resumen de entrada/salida.

### Errores esperados

- `NO_ACTIVE_ENTRY`
- `DUPLICATE_EXIT`
- `IDENTIFIER_MISMATCH`
- `EVIDENCE_REQUIRED`
- `GPS_REQUIRED`
- `FACE_REVIEW_REQUIRED`

## `get_signed_evidence_url`

### Entrada

- `p_evidence_id uuid`
- `p_reason text`

### Validaciones

- Usuario autenticado y activo.
- Evidencia existe.
- Alcance permitido segun rol/scope.
- Motivo obligatorio para admin/superadmin si evidencia es documento oficial.
- TTL corto.

### Resultado

- `signed_url`
- `expires_in`
- `evidence_type`

### Auditoria

Insertar `audit_logs`:

- accion: `evidence.signed_url.generated`
- actor
- evidencia
- asistencia
- organizacion/sitio
- motivo

## `correct_attendance`

### Entrada

- `p_asistencia_id uuid`
- `p_changes jsonb`
- `p_motivo text`

### Validaciones

- Rol `admin` o `superadmin`.
- Alcance permitido.
- Motivo no vacio.
- No permitir cambios silenciosos.
- No permitir borrar historial.

### Resultado

- `correction_id`
- `asistencia_id`
- `estado_actualizado`

### Efectos

- Insert en `attendance_corrections`.
- Insert en `audit_logs`.
- Insert en `user_notifications`.

## `export_attendance_csv`

### Entrada

- `p_filters jsonb`
- `p_columns text[]`

### Validaciones

- Rol `admin` o `superadmin`.
- Filtros dentro de alcance.
- Columnas permitidas.
- No fotos.
- No documentos.
- No signed URLs.

### Resultado

- `export_id`
- dataset o URL temporal de descarga segun implementacion futura.

### Auditoria

- Insert en `exports`.
- Insert en `audit_logs`.

## `configure_site_policy`

### Entrada

- `p_sitio_id uuid`
- `p_patch jsonb`
- `p_motivo text`

### Campos configurables

- `gps_policy`
- `evidence_policy`
- `radio_metros`
- `zona_horaria`
- `activo`
- configuracion de identificador.

### Validaciones

- Admin con alcance organizacion/sitio o superadmin.
- Documento oficial solo si hay aviso, consentimiento y retencion definidos.
- Motivo requerido en cambios sensibles.

### Resultado

- sitio actualizado.
- resumen de cambios.

## Errores de contrato

Formato sugerido:

```json
{
  "code": "SITE_FORBIDDEN",
  "message": "No tienes permisos para operar este sitio.",
  "details": {}
}
```

## Pruebas minimas

1. Entrada duplicada bloqueada.
2. Salida sin entrada bloqueada.
3. Salida duplicada bloqueada.
4. Usuario A intenta salida de usuario B: bloqueado.
5. Admin org A exporta org B: bloqueado.
6. Evidencia ajena no genera signed URL.
7. Correccion sin motivo bloqueada.
8. Configurar documento oficial sin politica privacy/retention: bloqueado.

## Estado

Contratos listos para borrador SQL/Edge Function.

SQL draft asociado:

- `docs/fase0/sql-drafts/f0_rpc_functions.sql`

No reemplaza aun la implementacion existente. Debe probarse en dev/staging antes de conectar frontend.
