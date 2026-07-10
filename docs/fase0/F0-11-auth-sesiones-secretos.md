# F0-11 Supabase Auth, sesiones, secretos y mitigaciones

Fecha: 2026-07-09
Linear: `JAR-35`

## Estado actual observado

Archivos revisados:

- `auth.js`
- `supabase-config.js`
- `app.js`
- `service-worker.js`

Hallazgos:

- `auth.js` usa Supabase Auth via REST.
- El token se guarda en `localStorage` bajo `registro_asistencia_token`.
- `supabase-config.js` contiene URL del proyecto, anon/publishable key y bucket.
- No se observo service role key en los archivos revisados.
- `app.js` usa el token para `Authorization: Bearer`.
- `service-worker.js` no intercepta requests externas a Supabase.

## Decision temporal

Para MVP SPA/PWA, se acepta temporalmente sesion en cliente con mitigaciones.

Esto no equivale a seguridad final de produccion empresarial.

## Mitigaciones obligatorias

- Nunca usar service role en frontend.
- No duplicar tokens en otros stores.
- No registrar token en logs.
- No cachear tokens en Service Worker.
- No incluir tokens en URLs.
- No guardar respuestas privadas de Supabase en Cache Storage.
- RLS debe proteger datos aunque el usuario manipule el cliente.
- Explicar que `localStorage` es deuda aceptada temporalmente.

## Mejoras futuras

Evaluar en una fase posterior:

- Supabase JS con manejo de sesion controlado;
- backend/BFF;
- cookies HTTP-only;
- SSR/middleware;
- expiracion/refresh controlado;
- politicas anti-sesion robada.

## Revision de secretos

### Permitido en frontend

- Supabase URL.
- Supabase anon/publishable key.

### Prohibido en frontend/repo

- service role key;
- claves privadas;
- JWT secret;
- credenciales de correo;
- tokens de deploy;
- keys admin reales.

## Riesgos actuales

- Token en `localStorage` puede ser robado ante XSS.
- `ADMIN123` sigue presente en `app.js` y SQL antiguo; debe quedar demo/local, no permiso real.
- `supabase-config.js` contiene anon key hardcodeada. Es aceptable para cliente, pero conviene mover a env/build cuando se formalice pipeline.

## Plan de rotacion ante filtracion

1. Revocar/rotar clave filtrada en Supabase.
2. Invalidar sesiones si aplica.
3. Revisar logs de acceso.
4. Buscar exposicion en GitHub/Vercel.
5. Corregir origen.
6. Documentar incidente.

## Pruebas

- Buscar `service_role`, `SUPABASE_SERVICE`, `JWT_SECRET`, `ADMIN123`.
- Confirmar que Service Worker no cachea Supabase.
- Confirmar que tokens no aparecen en URLs ni CSV.
- Confirmar que RLS bloquea datos ajenos aunque haya token valido.

## Estado

Estrategia documentada. Apta para dev/MVP controlado, no para produccion con datos reales sin RLS, Storage privado y hardening adicional.
