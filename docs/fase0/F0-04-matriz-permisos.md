# F0-04 Matriz de permisos por rol, alcance y accion

Fecha: 2026-07-09
Linear: `JAR-28`

## Decision MVP

Usar cuatro roles:

- `superadmin`
- `admin`
- `operador`
- `usuario`

Separar rol de alcance:

- `global`
- `organizacion`
- `sitio`
- `propio`

Esto evita inflar roles como `admin_sitio`, `admin_organizacion` o `supervisor` en la primera version. Esas diferencias se modelan con `scope_type`, `organizacion_id` y `sitio_id`.

## Definiciones

### superadmin

Alcance: global.

Uso:

- soporte central;
- creacion de organizaciones;
- asignacion de admins;
- auditoria global.

Restriccion:

- todo acceso a evidencia sensible debe auditarse.

### admin

Alcance: organizacion o sitio.

Uso:

- configurar sitio;
- administrar usuarios de su alcance;
- revisar asistencias;
- corregir con motivo;
- exportar con auditoria.

### operador

Alcance: sitio.

Uso:

- revisar asistencia diaria;
- validar pendientes/revision;
- ver evidencia necesaria del sitio si la politica lo permite;
- no configurar permisos criticos.

### usuario

Alcance: propio.

Uso:

- registrar entrada/salida propia;
- ver historial propio;
- ver notificaciones propias;
- ver evidencia propia.

## Matriz resumida

| Recurso/accion | usuario | operador | admin | superadmin |
|---|---:|---:|---:|---:|
| Ver perfil propio | Si | Si | Si | Si |
| Actualizar perfil propio basico | Si | Si | Si | Si |
| Registrar entrada propia | Si | Si | Si | Si |
| Registrar salida propia | Si | Si | Si | Si |
| Ver registros propios | Si | Si | Si | Si |
| Ver registros del sitio | No | Si | Si si alcance sitio/org | Si |
| Ver registros de organizacion | No | No | Si si alcance org | Si |
| Ver otra organizacion | No | No | No | Si, auditado |
| Ver evidencia propia | Si | Si | Si | Si |
| Ver evidencia de otros | No | Si, sitio y politica | Si, alcance | Si, auditado |
| Generar signed URL evidencia | Propia | Sitio | Alcance | Global auditado |
| Exportar CSV | No | No por defecto | Si, alcance | Si |
| Corregir asistencia | No | No por defecto | Si con motivo | Si con motivo |
| Eliminar asistencia | No | No | No en MVP | No en MVP |
| Configurar sitio | No | No | Si si alcance | Si |
| Crear organizacion | No | No | No | Si |
| Crear sitio | No | No | Si si admin org | Si |
| Asignar roles | No | No | Solo usuarios no-admin de su alcance si se permite | Si |
| Ver audit logs | Propios limitados | Sitio limitado | Alcance | Global |
| Cambiar politicas evidencia/GPS | No | No | Si | Si |
| Capturar documento oficial | Solo si sitio lo requiere y consiente | No como admin | Configura politica, no captura por otros | Configura global, auditado |

## Matriz por tabla

### organizaciones

- `usuario`: no lectura directa salvo nombre de su organizacion en perfil.
- `operador`: lectura de su organizacion.
- `admin`: lectura de su organizacion; update limitado si `scope_type = organizacion`.
- `superadmin`: CRUD global.

### sitios

- `usuario`: lectura del sitio asignado.
- `operador`: lectura de su sitio.
- `admin`: CRUD de sitio dentro de alcance.
- `superadmin`: CRUD global.

### usuarios_app

- `usuario`: lectura propia; update basico propio.
- `operador`: lectura de usuarios de su sitio, sin datos sensibles innecesarios.
- `admin`: lectura y activacion/desactivacion dentro de alcance.
- `superadmin`: gestion global.

### asistencias

- `usuario`: crear/leer propias via RPC.
- `operador`: leer sitio; marcar observacion si se habilita.
- `admin`: leer/corregir/exportar alcance.
- `superadmin`: leer/corregir/exportar global con auditoria.

### evidencias

- Sin acceso publico directo.
- Lectura siempre via RPC `get_signed_evidence_url`.
- `usuario`: evidencia propia.
- `operador`: evidencia de sitio si la politica lo permite.
- `admin`: evidencia de alcance.
- `superadmin`: global auditado.

### ubicaciones

- Mismo alcance que `asistencias`.
- No exponer coordenadas a roles sin necesidad operacional.

### audit_logs

- `usuario`: eventos propios resumidos/notificaciones.
- `operador`: no por defecto.
- `admin`: audit logs de su alcance.
- `superadmin`: global.

### privacy_notices / privacy_consents

- `usuario`: leer aviso vigente y consentimiento propio.
- `admin`: ver estado de consentimiento dentro de alcance.
- `superadmin`: global.

### exports

- `usuario`: no.
- `operador`: no por defecto.
- `admin`: crear export dentro de alcance.
- `superadmin`: crear export global.

### attendance_corrections

- `usuario`: leer correcciones propias.
- `operador`: no por defecto.
- `admin`: crear correccion con motivo dentro de alcance.
- `superadmin`: crear global con motivo.

## Pruebas negativas obligatorias

1. Usuario A no puede leer asistencia de usuario B.
2. Usuario A no puede generar signed URL de evidencia de B.
3. Operador de sitio A no puede leer sitio B.
4. Admin de organizacion A no puede leer organizacion B.
5. Admin de sitio A no puede exportar sitio B.
6. Usuario no puede modificar `rol`, `scope_type`, `organizacion_id` ni `sitio_id`.
7. QR/key de sitio no puede crear admin.
8. Frontend manipulado con otro `organizacion_id` debe fallar en RPC/RLS.
9. Export CSV no incluye fotos, documentos, signed URLs ni paths privados si no son necesarios.
10. Service role no aparece en frontend, repo ni bundle.

## Reglas para RLS/RPC

- El frontend no decide permisos finales.
- Toda RPC debe resolver usuario actual desde `auth.uid()`.
- No confiar en `organizacion_id` o `sitio_id` enviados por cliente.
- Las funciones `SECURITY DEFINER` requieren `search_path` fijo y validacion interna.
- Toda accion sensible debe registrar `audit_logs`.

## Estado

Esta matriz reemplaza la proliferacion de roles por un modelo simple de rol + alcance, apto para MVP y facil de traducir a RLS/RPC.
