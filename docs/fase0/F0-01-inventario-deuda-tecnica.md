# F0-01 Inventario de app existente y deuda tecnica

Fecha: 2026-07-09
Repo local: `C:\Users\LG\Downloads\Registro AS\Registro-de-AS`
Linear: `JAR-25`

## Dictamen

No conviene empezar de cero.

El repositorio ya contiene una base aprovechable: PWA, autenticacion con Supabase Auth, registro de entrada/salida, captura de camara, GPS, evidencia con metadata, dashboard administrativo, organizaciones/sitios, roles iniciales y migraciones SQL por hitos.

Lo correcto es conservar la base y convertirla en arquitectura Fase 0 controlada. El riesgo no es falta de avance, sino deuda acumulada: piezas antiguas conviven con nuevas, hay controles administrativos heredados, Storage aun expone URL publica y el modelo sigue usando `matricula` como concepto central.

## Estado del repositorio

- Rama local: `main`
- Remoto: `https://github.com/Jaredcito-opsSoft/Registro-de-AS.git`
- Estado observado: rama local adelante de `origin/main` y con cambios sin commitear.
- Archivos modificados al inicio de esta revision:
  - `app.js`
  - `index.html`
  - `styles.css`
  - `skills-lock.json`
  - `.codex/` sin seguimiento

## Inventario de archivos principales

### Frontend/app shell

- `index.html`: estructura principal de vistas, login, entrada, salida, registros, admin, perfil y PWA.
- `styles.css`: sistema visual actual, layout responsive y paneles.
- `app.js`: logica principal de navegacion, asistencia, camara, GPS, evidencias, roles, admin, dashboard, PWA install y reportes.
- `auth.js`: wrapper manual de Supabase Auth por REST.
- `supabase-config.js`: configuracion publica de Supabase y bucket.
- `manifest.webmanifest`: manifest PWA.
- `service-worker.js`: cache de App Shell/assets.
- `icons/`: iconos PWA.
- `models/`: modelos face-api para validacion facial ligera.

### SQL/migraciones existentes

- `supabase-schema.sql`: esquema base antiguo con `matricula`, asistencia y admin key.
- `supabase-site-admin-migration.sql`: sitio activo y configuracion de ubicacion.
- `supabase-hito2-image-metadata.sql`: metadata de imagen/evidencia.
- `supabase-hito3-geolocation-evidence.sql`: geolocalizacion/evidencia.
- `supabase-hito3-1-location-validation.sql`: validacion de ubicacion.
- `supabase-remove-qr-exit-validation.sql`: elimina QR como validador de salida.
- `supabase-hito5-multiempresa-foundation.sql`: base multiempresa.
- `supabase-hito6-roles-permissions.sql`: roles/permisos iniciales.
- `supabase-rbac-cleanup.sql`: limpieza RBAC, potencialmente riesgosa por revertir columnas/politicas.
- `supabase-registro-fix.sql`: correcciones de registro/perfil.
- `supabase-hotfix-qr-token-pgcrypto.sql`: hotfix QR antiguo.
- `supabase-antifraud-migration.sql`: controles antifraude iniciales.

## Flujos existentes

### Conservar

- PWA instalable y manifest.
- Registro de entrada/salida.
- Captura de camara.
- Captura GPS.
- Validacion facial ligera entrada/salida.
- Evidencia con hash, MIME, tamano, dimensiones, user agent y device label.
- Dashboard administrativo con filtros.
- Roles de UI como base de UX.
- Migraciones por hitos como historial tecnico.

### Corregir

- `ADMIN_KEY = "ADMIN123"` sigue en `app.js` y aparece en SQL antiguo. Debe quedar solo demo/local, nunca permiso real.
- `requestAdminAccess()` todavia existe como mecanismo de desbloqueo UI. Debe depender exclusivamente del rol autenticado real.
- `uploadEvidence()` construye URL publica con `/storage/v1/object/public/`. Esto contradice Fase 0: evidencias deben estar en bucket privado y mostrarse via signed URLs.
- `auth.js` guarda token en `localStorage`. Puede aceptarse temporalmente en SPA/PWA solo si se documenta como decision consciente y se prohibe cachearlo en service worker o duplicarlo.
- `loadLocalRecords()` y `persistLocalSnapshot()` usan `localStorage` para registros. Para Fase 0, no debe persistir asistencia/evidencia sensible localmente salvo modo demo claramente aislado.
- El dominio del modelo sigue usando `matricula`. Debe migrarse a `identificador` con label configurable por sitio.
- Hay migraciones con objetivos contradictorios, por ejemplo `supabase-rbac-cleanup.sql` parece revertir partes RBAC. Requiere clasificacion antes de aplicar cualquier SQL.
- `git diff --check` falla por trailing whitespace en cambios actuales.

### Reemplazar o redisenar

- Modelo de datos basado en `matricula` como clave universal.
- Almacenamiento de evidencia mediante URL publica.
- Exportacion CSV que incluye rutas internas de Storage si no se limita por contrato.
- Admin local/desbloqueo por key.
- SQL disperso por hitos sin plan de migracion unico/versionado.

### Eliminar o aislar

- Uso productivo de `ADMIN123`.
- Cualquier QR o token que valide salida.
- Cualquier bucket publico para fotos/documentos/evidencias.
- Cualquier cache PWA de Auth, Supabase, RPCs, fotos, reportes, CSV o datos personales.
- Modo operativo/demo si se mezcla con datos reales.

## Validaciones ejecutadas

### Sintaxis JS

Comandos:

```powershell
node --check app.js
node --check auth.js
node --check service-worker.js
```

Resultado: PASA. No se reportaron errores de sintaxis.

### Git diff whitespace

Comando:

```powershell
git diff --check
```

Resultado inicial: FALLA por trailing whitespace en `app.js` e `index.html`.

Accion tomada: se limpiaron espacios finales sin modificar logica ni diseno.

Resultado posterior: PASA.

Observacion restante:

- Git mantiene warnings de CRLF en `app.js`, `index.html` y `skills-lock.json`. No bloquean `git diff --check`, pero conviene normalizar line endings con `.gitattributes` en una tarea separada.

## Riesgos principales antes de seguir

1. Seguridad administrativa heredada por `ADMIN123`.
2. Evidencias potencialmente publicas por URL Storage publica.
3. Persistencia local de registros/tokens sin estrategia formal documentada.
4. RLS/RPC aun no consolidado contra modelo final.
5. Multiempresa parcialmente avanzada, pero no probada con aislamiento negativo completo.
6. Modelo centrado en `matricula`, no `identificador` configurable.
7. SQL de hitos disperso y potencialmente contradictorio.
8. Cambios locales sin commitear y rama local adelante de `origin/main`.
9. PWA necesita auditoria para confirmar que solo cachea App Shell/assets.
10. Dashboard/admin existe, pero debe quedar gobernado por permisos backend, no solo UI.

## Recomendacion de ejecucion

Trabajar sobre el repo actual, no empezar desde cero.

Orden recomendado inmediato:

1. Crear rama segura para Fase 0 desde el estado actual.
2. Corregir `git diff --check` sin tocar funcionalidad. Hecho en esta revision.
3. Documentar estrategia Auth/tokens como decision temporal.
4. Clasificar migraciones SQL: conservar, reemplazar, obsoleta, peligrosa.
5. Crear modelo Fase 0 consolidado con `identificador`.
6. Definir matriz simple de roles: `superadmin`, `admin`, `operador`, `usuario`; separar rol de alcance.
7. Consolidar RLS/RPC sobre ese modelo.
8. Cambiar evidencia hacia Storage privado/signed URLs.
9. Revisar PWA/cache.
10. Ejecutar pruebas negativas multiempresa con datos demo.

## Estado de JAR-25

Este documento cubre el inventario inicial y mapa de deuda tecnica.

Estado sugerido: mantener `In Progress` hasta completar:

- clasificacion de migraciones SQL una por una;
- evidencia de PWA/cache;
- evidencia de Storage;
- matriz resumida de flujos funcionales tras prueba manual.
