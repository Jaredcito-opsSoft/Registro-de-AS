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

### Centro de organizaciones y sitios (Hito 14)

Migracion: `supabase-hito14-organization-site-hub.sql`

RPC: `admin_list_organization_hubs`

- Superadmin recibe todas las organizaciones; admin recibe solo su organizacion.
- Cada organizacion incluye `sitios` con ubicacion, radio, zona horaria, horarios, politicas y etiqueta de identificador.
- Los conteos de usuarios y asistencias son informativos; no amplian el alcance del rol.

RPC: `admin_upsert_organization`

- Solo superadmin puede crear o editar.
- La identidad y el rol se obtienen de `auth.uid()`; el cliente no envia usuario ni rol.
- La clave es obligatoria al crear y opcional al editar.

RPC: `admin_delete_organization`

- Elimina solo cuando no existen usuarios ni asistencias vinculadas.
- Si existe historial, desactiva la organizacion y sus sitios sin borrar evidencia.

RPC: `admin_upsert_site`

- Superadmin opera cualquier organizacion; admin queda limitado por su organizacion/sitio.
- Valida coordenadas, radio, zona horaria, ventanas de entrada/salida y politicas.
- Permite varios sitios activos por organizacion.

RPC: `admin_delete_site`

- Elimina un sitio vacio.
- Si tiene usuarios o asistencias, lo desactiva y conserva el historial.

La tabla `site_identifier_config` no tiene acceso directo desde cliente. Su lectura y escritura pasan por las RPC anteriores.

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
