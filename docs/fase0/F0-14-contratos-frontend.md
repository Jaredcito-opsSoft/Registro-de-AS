# F0-14 Contratos API/RPC para frontend mobile-first

Fecha: 2026-07-09
Linear: `JAR-38`

## Objetivo

Definir los contratos que el frontend debe consumir sin depender de datos simulados permanentes ni permisos solo visuales.

## Estado comun de respuesta

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "meta": {
    "request_id": "uuid",
    "server_time": "2026-07-09T17:00:00Z"
  }
}
```

Error:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "SITE_FORBIDDEN",
    "message": "No tienes permisos para operar este sitio.",
    "details": {}
  }
}
```

## Contratos

### Perfil operativo

RPC futura: `get_current_app_context`

Devuelve:

- usuario;
- rol;
- scope;
- organizacion;
- sitio;
- permisos resumidos;
- aviso/consentimiento vigente.

### Configuracion del sitio

RPC futura: `get_site_operational_config`

Devuelve:

- `gps_policy`;
- `evidence_policy`;
- `identifier_label`;
- `zona_horaria`;
- `radio_metros`;
- flags UI.

### Entrada

RPC: `register_entry`

Frontend envia:

- `sitio_id`;
- `identificador`;
- evidence metadata;
- location;
- context.

Frontend recibe:

- asistencia;
- estado;
- riesgo;
- folio;
- mensajes.

### Salida

RPC: `register_exit`

Frontend envia:

- `sitio_id`;
- `identificador`;
- evidence metadata;
- location;
- face match si aplica.

Frontend recibe:

- asistencia cerrada;
- hora servidor;
- estado/riesgo.

### Mis registros

RPC futura: `get_my_attendance`

Solo devuelve registros propios.

### Registros admin

RPC futura: `get_attendance_admin_view`

Respeta alcance por rol/scope.

### Evidencia

RPC: `get_signed_evidence_url`

Nunca devolver URL publica persistente.

## Estados UI minimos

- loading;
- unauthenticated;
- forbidden;
- offline;
- camera_denied;
- gps_denied;
- review;
- success;
- blocking_error.

## Mock temporal

Permitido solo si:

- vive en archivo separado;
- usa datos demo;
- no se mezcla con produccion;
- esta marcado como `demoOnly`.

## Estado

Contrato listo para orientar refactor frontend sin romper flujos actuales.
