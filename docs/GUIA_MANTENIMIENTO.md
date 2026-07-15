# Guia de mantenimiento

Esta guia define como cambiar el proyecto sin romper autenticacion, aislamiento
multiempresa, asistencia ni cache PWA.

## Antes de empezar

1. Lee el issue y delimita el flujo, rol y ambiente afectados.
2. Ejecuta `git status --short` y conserva cambios ajenos.
3. Revisa el ultimo historial con `git log -10 --oneline`.
4. Confirma en que ambiente de Supabase se va a trabajar.
5. Reproduce el problema en local antes de editar.
6. Identifica si el cambio pertenece a cliente, RPC/RLS, Storage o PWA.

No se deben usar credenciales personales para pruebas automatizadas ni incluirlas
en documentos, capturas, commits o logs.

## Reglas que no deben romperse

### Autorizacion

- El frontend oculta o muestra controles, pero no concede permisos reales.
- Toda accion sensible debe validar al usuario autenticado con `auth.uid()`.
- No confiar en rol, organizacion o sitio enviados por el navegador.
- No usar `user_metadata` como fuente de autorizacion.
- `supervisor` conserva su rol al cambiar de sitio.
- `admin` conserva su rol y alcance organizacional aunque tenga un sitio principal.
- Solo la capacidad owner puede alterar el ciclo de vida protegido de superadmins.
- `ADMIN123` solo puede existir como ayuda local/demo y nunca habilitar produccion.

### Multiempresa

- Toda lectura o escritura sensible debe quedar limitada por `organizacion_id`.
- Cuando aplique, tambien debe limitarse por `sitio_id` o `usuario_sitios_alcance`.
- Un admin no puede administrar otra organizacion.
- Un supervisor no puede ampliar su propio alcance.
- Un usuario solo puede consultar su propio perfil e historial.
- Cada cambio de permisos requiere al menos una prueba negativa entre organizacion A y B.

### Evidencia y privacidad

- Nunca usar `service_role` en cliente.
- No guardar fotos en base64 dentro de tablas o LocalStorage.
- No crear URLs publicas permanentes para evidencia sensible.
- Las URLs firmadas deben ser temporales y no guardarse en logs o CSV.
- El Service Worker no debe cachear fotos, GPS, reportes, Auth, REST ni RPC.

### Asistencia

- La hora de servidor es la referencia oficial.
- La salida requiere una entrada activa del ciclo correspondiente.
- GPS, foto y reglas de sitio se validan en backend.
- El QR solo abre/rutea; no valida asistencia ni permisos.
- Las excepciones de admin/superadmin deben ser explicitas y auditables.

## Donde hacer cada cambio

| Necesidad | Archivos principales | Validacion minima |
| --- | --- | --- |
| Texto o estructura de vista | `index.html` | Smoke movil/escritorio. |
| Estilo, responsive o tokens | `styles.css` | Capturas y overflow. |
| Navegacion o estado de UI | `app.js` | `node --check` + flujo manual. |
| Login, registro o renovacion | `auth.js`, `app.js` | Login, registro, recarga y logout. |
| Regla de asistencia | Migracion RPC + `app.js` | Entrada, salida y casos negativos. |
| Rol o alcance | Migracion RLS/RPC + panel admin | Matriz de roles y aislamiento A/B. |
| Organizacion o sitio | Migracion + seccion admin | Alta, edicion, alcance y auditoria. |
| Avatar o evidencia | Storage/RLS + `app.js` | Dos dispositivos y URL expirada. |
| PWA/cache | `service-worker.js`, versiones de assets | Smoke de cache y recarga limpia. |

## Cambios de base de datos

### Disciplina de migraciones

1. No edites una migracion ya aplicada para corregir produccion.
2. Crea una migracion incremental con prefijo de fecha/hora unico.
3. Usa nombres `snake_case` y califica columnas ambiguas con alias.
4. Incluye `revoke` y `grant` explicitos para cada RPC sensible.
5. Si usas `security definer`, fija `search_path`, valida `auth.uid()` y no dejes
   ejecucion a `PUBLIC` o `anon` salvo una justificacion auditada.
6. Habilita RLS en tablas expuestas y agrega politicas por operacion.
7. Documenta precondiciones, rollback y prueba negativa.
8. Compara el historial remoto antes de ejecutar cualquier `db push`.

Los archivos `supabase-*.sql` de la raiz son historicos. No deben ejecutarse en
secuencia. La ubicacion canonica para cambios nuevos es `supabase/migrations/`.

### Riesgo actual de migraciones

Hay archivos con el mismo prefijo `20260713190000`. Antes de aplicar nuevas
migraciones, se debe determinar cual ya existe en el ambiente remoto, consolidar
el orden y asignar identificadores unicos a cualquier archivo aun no aplicado.
No se debe resolver renombrando a ciegas un archivo que ya figure en el historial.

### Lista de comprobacion SQL

- La funcion obtiene al actor desde la sesion, no desde un email enviado por cliente.
- El rol esta normalizado y su alcance se verifica dentro de la funcion.
- Las consultas incluyen organizacion y sitio cuando corresponde.
- `update` y `delete` tienen filtros de pertenencia.
- Los nombres ambiguos estan calificados (`u.usuario_id`, `a.usuario_id`, etc.).
- La accion sensible escribe un evento en `audit_logs`.
- La funcion devuelve solo las columnas necesarias.
- Existe una prueba de acceso permitido y otra de acceso denegado.

## Cambios de autenticacion

El orden de inicializacion es una invariante:

1. Recuperar o renovar la sesion de Supabase Auth.
2. Activar la sesion operativa del dispositivo.
3. Obtener `currentAppUser` y sus alcances.
4. Cargar directorios y datos protegidos.

Si se invierte el orden, las RPC protegidas pueden invalidar el acceso antes de
que la aplicacion termine de iniciar.

Pruebas obligatorias al tocar Auth:

- login valido e invalido;
- registro con organizacion y sitio;
- recarga con sesion existente;
- cierre de sesion;
- inicio en segundo dispositivo;
- cuenta inactiva;
- usuario, supervisor, admin y superadmin.

## Cambios de roles y sitios

Rol y sitio son conceptos separados:

- cambiar sitio no cambia rol;
- cambiar rol no borra sitio;
- `sitio_id` representa el sitio principal;
- `usuario_sitios_alcance` representa sitios adicionales;
- admin tiene alcance por organizacion;
- supervisor recibe uno o varios sitios de forma explicita.

Al modificar esta area, prueba estas transiciones:

1. Usuario cambia de sitio y sigue siendo usuario.
2. Usuario sube a supervisor y recibe alcance.
3. Supervisor cambia de sitio y conserva rol.
4. Admin recibe o cambia sitio y conserva rol organizacional.
5. Superadmin degrada un admin sin borrar su sitio.
6. Admin no puede degradar o eliminar una cuenta fuera de su autoridad.
7. Superadmin no puede destruir otro superadmin protegido sin capacidad owner.

## Cambios de PWA

Cuando cambie un asset servido al navegador, sincroniza estas tres versiones:

- query de `styles.css` y scripts en `index.html`;
- `LOCAL_ASSET_VERSION` en `app.js`;
- `CACHE_VERSION` en `service-worker.js`.

La version actual usa el sufijo `2.55-auth-session-order`. Un cambio de
documentacion no requiere modificarlo.

Despues de cambiar la version:

1. Recarga la app dos veces.
2. Confirma que el Service Worker activo usa el cache nuevo.
3. Comprueba que los caches antiguos se eliminan.
4. Ejecuta el smoke de seguridad PWA.
5. Verifica que no aparezcan Auth, RPC, fotos o GPS en Cache Storage.

## Diagnostico de problemas comunes

| Sintoma | Revisar primero |
| --- | --- |
| Nadie puede iniciar sesion | Orden Auth/sesion operativa y consola de red. |
| El rol aparece incorrecto | `get_current_app_user`, migraciones de reconciliacion y duplicados en `usuarios_app`. |
| Cambiar sitio degrada el rol | RPC de asignacion: sitio y rol deben actualizarse por separado. |
| Guardar asignacion no hace nada | Evento del boton, payload, respuesta RPC y permisos del actor. |
| Asistencia no aparece al admin | `organizacion_id`, `sitio_id`, sitio de entrada y filtros de la RPC/directorio. |
| Error `usuario_id is ambiguous` | Calificar cada columna PL/pgSQL con alias y crear migracion correctiva. |
| Foto de perfil desaparece | Bucket privado, path por `auth.uid()`, URL firmada y sesion activa. |
| Interfaz muestra codigo viejo | Versiones de assets, Service Worker y cache del navegador. |
| PWA funciona offline con datos | Es un fallo: offline debe ser pasivo y bloquear escritura. |

## Trabajo entre varias personas

- Divide por frontera: UI, Auth, asistencia RPC, roles/RLS, Storage o pruebas.
- Antes de editar, comunica archivos que se van a tocar.
- No mezcles redisenos con migraciones de seguridad en el mismo commit.
- No reviertas cambios ajenos para resolver conflictos.
- Cada commit debe tener una sola intencion verificable.
- Entrega evidencia: ambiente, rol, organizacion/sitio, comando, resultado y riesgo.
- La persona que modifica una RPC es responsable de su prueba negativa.

Consulta [F0-18](fase0/F0-18-ramas-prs-colaboracion.md) para el flujo de PRs.

## Definicion de terminado

Un cambio no esta terminado solo porque la interfaz se vea correcta. Debe cumplir:

- codigo sintacticamente valido;
- caso principal probado;
- error esperado probado;
- rol y alcance correctos;
- sin datos de otra organizacion;
- sin errores de consola ni 404;
- responsive cuando afecta UI;
- cache seguro cuando afecta assets;
- migracion y rollback documentados cuando afecta Supabase;
- documentacion actualizada si cambia arquitectura o operacion.
