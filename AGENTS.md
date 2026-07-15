# Guia de entrada para desarrolladores y agentes

Este archivo es el punto de entrada obligatorio antes de modificar Asistencia QR.
Su objetivo es que cada persona entienda el contexto en minutos y no rompa
autenticacion, aislamiento multiempresa, asistencia o cache PWA.

## Orden obligatorio antes de editar

1. Lee `README.md` y `docs/README.md`.
2. Lee `docs/ARQUITECTURA_ACTUAL.md` para ubicar roles, flujos y fronteras.
3. Lee `docs/GUIA_MANTENIMIENTO.md` y `docs/PRUEBAS_Y_DESPLIEGUE.md`.
4. Ejecuta `git status --short` y conserva todo cambio que no sea tuyo.
5. Revisa `git log -10 --oneline` y los archivos afectados por el issue.
6. Reproduce el problema en `http://127.0.0.1:5174/` antes de cambiar codigo.
7. Declara los archivos y la frontera que vas a tocar: UI, Auth, asistencia,
   RLS/RPC, Storage, PWA o pruebas.

Si una instruccion, documento o SQL contradice el codigo actual, no adivines:
documenta la discrepancia y verifica el ambiente Supabase antes de aplicar cambios.

## Mapa rapido

| Area | Archivo o ubicacion |
| --- | --- |
| Vistas y formularios | `index.html` |
| Diseno responsive | `styles.css` |
| Estado, asistencia y paneles | `app.js` |
| Sesion e identidad | `auth.js` |
| Cliente Supabase publico | `supabase-config.js` |
| Cache PWA | `service-worker.js` |
| Migraciones nuevas | `supabase/migrations/` |
| Pruebas y smokes | `tools/` |
| Documentacion vigente | `docs/` |

## Invariantes del sistema

- El backend decide permisos. La UI no otorga autoridad.
- Roles vigentes: `usuario`, `supervisor`, `admin`, `superadmin`.
- Rol y sitio son independientes: cambiar uno no debe degradar o borrar el otro.
- El alcance se limita por organizacion y, cuando corresponde, por sitio.
- La salida requiere una entrada activa del ciclo correspondiente.
- Hora, GPS, evidencia y duplicidad se validan en servidor.
- El QR es acceso/ruteo; no es una autorizacion de asistencia.
- Evidencia y avatars requieren acceso privado; no crear URLs publicas permanentes.
- No exponer `service_role`, contrasenas ni tokens en frontend, documentos o logs.
- Offline es pasivo: no se registra asistencia ni se cachean datos personales.

## Reglas por tipo de cambio

### UI

- Toca primero `index.html` y/o `styles.css`.
- No cambies RPC, permisos ni nombres de elementos que `app.js` necesita sin revisar
  sus listeners y selectores.
- Prueba escritorio y movil. Confirma que el toast y la barra inferior no tapen
  formularios o camara.

### Auth, rol o alcance

- Revisa primero `auth.js`, `loadCurrentAppUser`, sesion operativa y la migracion
  que define la RPC involucrada.
- Login, recarga, logout y segundo dispositivo son pruebas obligatorias.
- Incluye al menos una prueba de acceso denegado entre dos organizaciones.

### Asistencia

- Revisa la RPC de entrada/salida antes de cambiar mensajes o condiciones del cliente.
- Prueba entrada, salida, duplicado, salida sin entrada, horario y rol privilegiado.
- No conviertas GPS, foto o QR en validaciones solo de frontend.

### Supabase

- No ejecutes los archivos `supabase-*.sql` de la raiz como una receta.
- Crea una migracion incremental con prefijo unico en `supabase/migrations/`.
- Nunca edites una migracion ya aplicada para reparar produccion.
- Las RPC sensibles requieren autorizacion interna, `revoke/grant` y auditoria.
- Verifica primero el historial remoto; un archivo local no demuestra aplicacion.

### PWA

- Si cambias assets servidos, sincroniza versiones en `index.html`, `app.js` y
  `service-worker.js`.
- Solo el App Shell estatico puede entrar al cache.
- Ejecuta el smoke PWA y revisa Cache Storage en navegador.

## Validacion de salida

```powershell
node --check app.js
node --check auth.js
node --check service-worker.js
node tools/notification-rules.test.cjs
git diff --check
```

Agrega smoke visual, aislamiento multiempresa o pruebas autenticadas cuando el
cambio afecte esas areas. Consulta `docs/PRUEBAS_Y_DESPLIEGUE.md` para comandos,
variables y el formato de evidencia.

## Higiene del repositorio

- `tools/smoke-output/` contiene capturas generadas: no modificar ni versionar.
- `models/`, `icons/`, manifest y Service Worker son recursos funcionales; no
  eliminarlos como limpieza visual.
- No borres cambios ajenos ni archivos sin confirmar su uso con `rg` y `git status`.
- No hagas commit, push o cambios en produccion sin solicitud explicita.
- Cuando cambie el comportamiento, actualiza la documentacion vigente.
