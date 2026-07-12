# Resumen de contexto del proyecto Registro de Asistencia AS

## Proyecto

Web App/PWA de registro de asistencia para entorno multiempresa, orientada a uso movil y operativo. El repositorio base es:

- GitHub: `Jaredcito-opsSoft/Registro-de-AS`
- Ruta local principal: `C:\Users\LG\Downloads\Registro AS\Registro-de-AS`
- Despliegue actual: Vercel, pendiente de volver a produccion despues de revisar cambios locales.

La app busca evolucionar de prototipo funcional a MVP empresarial controlado, con roles, permisos, organizaciones, sitios, evidencia, auditoria y separacion multiempresa.

## Stack actual

- Frontend vanilla: `index.html`, `styles.css`, `app.js`
- Autenticacion: Supabase Auth mediante `auth.js`
- Base de datos y storage: Supabase
- PWA: `manifest.webmanifest` y `service-worker.js`
- Deploy: Vercel
- Persistencia temporal/local todavia presente en algunas rutas por compatibilidad de MVP.

## Objetivo funcional del sistema

1. Un usuario registra entrada con nombre, matricula, foto, GPS y validacion facial cuando aplica.
2. El sistema guarda asistencia y evidencia.
3. El usuario puede registrar salida usando matricula, foto, GPS y token/flujo QR.
4. El usuario debe poder consultar sus propios registros y evidencias.
5. Admin/superadmin pueden consultar y administrar datos segun alcance.
6. Cada organizacion/sitio debe tener configuraciones propias: horarios, ubicacion, radio GPS, politicas y usuarios.

## Roles acordados

Roles principales esperados:

- `usuario`: registra asistencia y ve solo sus propios registros.
- `supervisor` u `operador`: rol intermedio para apoyo operativo, segun configuracion futura.
- `admin`: administra su sitio/organizacion, usuarios y registros dentro de su alcance.
- `superadmin`: administra todo el entorno multiempresa, organizaciones, sitios, roles y configuracion global.

Notas importantes:

- Ya se trabajo en separar superadmin/admin/usuario, pero el panel superadmin todavia requiere consolidacion.
- Se elimino la idea de usar una clave publica como permiso real de produccion.
- `ADMIN123` solo debe quedar como demo/local, no como elevacion real en produccion.

## Hitos y avances realizados

### Base funcional

- App de asistencia con vistas principales:
  - Inicio
  - Entrada
  - Salida
  - Mis registros
  - Perfil
  - Admin / administracion central segun rol
- Registro de entrada con foto/camara.
- Registro de salida con busqueda por matricula.
- Control para evitar salida sin entrada activa del mismo dia.
- Control para evitar salida duplicada.
- Tabla/listado de registros.
- Exportacion CSV en rutas administrativas.

### Supabase y multiempresa

Se agregaron o prepararon archivos SQL para:

- Esquema base: `supabase-schema.sql`
- Fundacion multiempresa: `supabase-hito5-multiempresa-foundation.sql`
- Roles y permisos: `supabase-hito6-roles-permissions.sql`
- Privacidad y rachas: `supabase-hito8-privacy-streak.sql`
- Admin de organizacion/sitio: `supabase-hito9-org-admin.sql`
- Afiliacion y superadmins: `supabase-hito10-affiliation-superadmins.sql`
- Separacion admin/superadmin: `supabase-hito11-admin-role-separation.sql`
- Restriccion de desbloqueo admin: `supabase-hito12-restrict-admin-unlock.sql`
- Metadatos de imagen/evidencia: `supabase-hito2-image-metadata.sql`
- Geolocalizacion/evidencia: `supabase-hito3-geolocation-evidence.sql`
- Validacion de ubicacion: `supabase-hito3-1-location-validation.sql`
- Antifraude: `supabase-antifraud-migration.sql`
- Fixes de QR/token/registro.

Pendiente clave:

- Auditar que RLS/RPC esten realmente implementadas y probadas con datos de dos organizaciones.
- Confirmar Storage privado y signed URLs para evidencia.
- Confirmar que la UI nunca filtre datos solo en frontend cuando el backend debe bloquear.

### Seguridad

Se trabajo en:

- Bloquear elevacion administrativa por prompt en produccion.
- Hacer que acciones admin dependan del rol autenticado.
- Permitir admin solo si `currentAppUser.role` es `admin` o `superadmin`.
- Registrar intentos fallidos de admin en auditoria local cuando sea posible.
- Mantener clave demo solo en local/demo.

Puntos pendientes:

- Confirmar RLS por tabla/accion.
- Confirmar matriz de permisos final.
- Confirmar pruebas negativas multiempresa:
  - Usuario de organizacion A no ve datos de B.
  - Admin de sitio A no ve usuarios/registros de sitio B.
  - Superadmin si puede ver todo.

### QR y salida

Se hizo un ajuste temporal porque el QR de salida tenia bug con horario 4:30 p.m.

Regla temporal aplicada:

- QR de salida visible todo el dia.
- No se elimina token ni QR dinamico.
- La salida se valida por matricula con entrada activa del mismo dia.
- Si no existe entrada activa: bloquear.
- Si ya tiene salida: bloquear.
- TODO pendiente: restaurar ventana horaria 16:30-17:10 cuando se corrija validacion por servidor.

### PWA/offline

Existe `service-worker.js`.

Pendiente importante:

- Auditar cache seguro.
- Evitar cachear datos sensibles, fotos, tokens, evidencias, registros, respuestas privadas o datos multiempresa.
- Definir rutas cacheables/no cacheables.
- Confirmar que offline sea pasivo, no operativo con datos sensibles.

## Cambios recientes de UI/UX movil

Se esta llevando el diseño hacia una experiencia movil inspirada en apps iOS tipo Salud/Drive:

- Mobile-first.
- Color principal rojo/naranja institucional, decidido por el equipo.
- Cards limpias, bordes suaves, buen espaciado.
- Bottom nav movil con:
  - Inicio
  - Entrada
  - Salida
  - Mis registros
  - Perfil
- Se cambio "Registros" a "Mis registros" para usuario normal.
- Se permitio que usuarios con permiso `view_own_records` vean su propia vista de registros.
- Se elimino el punto rojo mal colocado en la bottom nav movil.
- Se movio el toast en movil a la parte superior para que no tape formularios, camara ni barra inferior.
- Se eliminaron cards/botones redundantes de flujo en inicio y se sustituyeron por informacion mas relevante.
- Se agrego widget tipo racha:
  - `Racha personal`
  - dias activos
  - horas acumuladas de la semana
  - CTA `Ver mis registros`
- Se limpio parte de estilos inline y se movieron a clases/tokens:
  - login mark
  - filtros
  - botones de limpiar filtros
  - actividad reciente
  - encabezado admin de registros
  - perfil readonly

Archivos tocados recientemente:

- `index.html`
- `styles.css`
- `app.js`

## Perfil de usuario

Se mejoro la vista de perfil:

- Campos en modo lectura para informacion autenticada.
- Mejor layout movil.
- Boton de cerrar sesion en perfil movil.
- Se retiro presentacion cruda de textos largos y se preparo para una visual mas limpia.

Pendiente:

- Convertir el perfil en un panel mas util para usuario:
  - Datos de usuario
  - Organizacion/sitio
  - Resumen de asistencia
  - Acceso a evidencias propias
  - Privacidad/consentimientos

## Registros propios y fotos

Decision funcional:

- El usuario debe poder ver sus propios registros y fotos/evidencias.
- No debe ver registros de otros usuarios.
- Admin de sitio/organizacion ve solo su alcance.
- Superadmin ve todo.

Estado actual:

- La vista `Mis registros` ya esta visible para permisos `view_own_records`.
- El filtrado frontend usa matricula del usuario actual para registros propios.

Pendiente importante:

- Implementar/verificar acceso seguro a evidencias propias via backend/Supabase Storage privado.
- No exponer fotos con URLs publicas.
- No depender solo del filtrado frontend.

## Problemas detectados o pendientes

1. La separacion multiempresa debe demostrarse en backend con RLS/RPC y pruebas negativas.
2. El service worker debe auditarse para cache seguro.
3. El panel superadmin debe consolidarse como dashboard operativo real:
   - crear/borrar organizaciones
   - crear/borrar sitios
   - asignar admins
   - ver usuarios por sitio/organizacion
   - configurar politicas globales
4. El panel admin de sitio debe ser distinto al superadmin:
   - solo su sitio/organizacion
   - usuarios propios
   - registros propios del sitio
   - configuracion permitida
5. El usuario normal no debe ver controles admin ni desbloqueo admin.
6. Hay que revisar textos sin acentos en algunas cadenas para mantener consistencia.
7. Verificar si hay recursos 404 en local antes de produccion.
8. Antes de Vercel:
   - correr validaciones
   - revisar responsive movil
   - confirmar variables Supabase/Vercel
   - confirmar que no se suban secrets

## Validaciones recientes realizadas

Se ejecuto:

- `node --check app.js`
- `node --check service-worker.js`
- `git diff --check`
- Prueba local en navegador movil con Playwright/headless.
- Servidor local respondiendo `200` en `http://127.0.0.1:5174/`.

Resultado reciente:

- Sin errores de sintaxis JS.
- Sin errores `null` o referencias rotas detectadas durante la prueba.
- Sin overflow horizontal en movil.
- Toast ya no tapa bottom nav.
- Punto rojo de bottom nav eliminado.

## Reglas de trabajo acordadas

- No rehacer el proyecto desde cero.
- Trabajar sobre lo que ya existe en `main`.
- No romper frontend ni backend.
- No tocar Supabase mas de lo necesario en cambios visuales.
- Mantener cambios acotados.
- Cada cambio debe verificarse en servidor local.
- Antes de produccion Vercel, validar localmente.
- En equipo:
  - Evitar pisar trabajo de otros agentes/devs.
  - Separar frentes de trabajo.
  - Documentar cambios y evidencia.

## Recomendacion para el siguiente agente

Antes de implementar, revisar:

1. `git status`
2. cambios recientes en `index.html`, `styles.css`, `app.js`
3. estado de scripts SQL de Supabase
4. permisos actuales en `auth.js` y `app.js`
5. service worker y caches

Prioridad recomendada antes de produccion:

1. Backend/RLS/RPC multiempresa.
2. Storage privado y evidencia.
3. Panel superadmin/admin bien separado.
4. Registros propios con fotos para usuario.
5. Auditoria PWA/cache.
6. QA movil completo.
