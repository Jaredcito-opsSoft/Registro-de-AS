# F0-12 PWA y cache seguro

Fecha: 2026-07-09
Linear: `JAR-36`

## Archivos revisados

- `service-worker.js`
- `manifest.webmanifest`
- `supabase-config.js`
- `app.js`

## Estado actual

`service-worker.js` cachea:

- `/`
- `/index.html`
- `/styles.css`
- `/app.js`
- `/supabase-config.js`
- `/manifest.webmanifest`
- iconos PWA.

El fetch handler:

- solo procesa `GET`;
- solo procesa requests del mismo origen;
- no intercepta Supabase porque Supabase es otro origen;
- solo cachea si `isStaticAsset(url)` coincide;
- para navegacion offline devuelve `/index.html`.

## Dictamen

Buen punto de partida para App Shell/offline pasivo.

No se observa cache directo de Supabase, fotos, RPCs, reportes o CSV en Service Worker.

## Riesgos

- Se cachea `supabase-config.js`, que contiene anon/publishable key. Esto es normalmente aceptable para cliente, pero debe asumirse como publica.
- `app.js` contiene logica legacy y nombres sensibles como `ADMIN123`; al cachearse `app.js`, cualquier secreto real ahi seria grave.
- `localStorage` guarda token y snapshots/registros fuera del Service Worker; esto debe tratarse en Auth/privacidad.

## Rutas cacheables

Permitidas:

- App Shell.
- CSS.
- JS publico.
- manifest.
- iconos.
- modelos face-api si se decide cachearlos y no contienen datos personales.

## Rutas no cacheables

Prohibidas:

- Supabase Auth.
- Supabase REST.
- Supabase Storage.
- RPCs.
- fotos.
- documentos.
- signed URLs.
- registros.
- reportes.
- CSV.
- respuestas privadas.
- ubicaciones GPS.
- datos de usuarios/organizaciones.

## Reglas futuras

- Mantener `url.origin !== self.location.origin` como salida temprana.
- No agregar rutas dinamicas de API a `STATIC_ASSETS`.
- No usar cache-first para rutas privadas.
- Offline solo muestra shell y mensaje de conexion requerida.
- No registrar asistencia offline.
- No guardar evidencia para sincronizar despues.

## Pruebas esperadas

1. Instalar PWA.
2. Abrir offline y confirmar App Shell.
3. Intentar registrar asistencia offline: debe bloquear y pedir conexion.
4. Revisar Cache Storage: solo assets estaticos.
5. Confirmar que no hay fotos/documentos/CSV/respuestas Supabase en cache.

## Estado

Diseno de cache seguro listo. Service Worker actual es compatible con offline pasivo, pero requiere prueba manual en navegador.
