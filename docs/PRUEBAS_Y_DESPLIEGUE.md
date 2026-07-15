# Pruebas y despliegue

Esta guia separa las comprobaciones locales, las pruebas con Supabase y el
despliegue. No ejecutes pruebas destructivas contra produccion.

## Matriz de ambientes

| Ambiente | Uso | Datos permitidos |
| --- | --- | --- |
| Local | UI, sintaxis y mocks | Datos ficticios. |
| Dev | Migraciones, RLS/RPC y flujos completos | Cuentas demo. |
| Staging | Regresion previa a produccion | Datos de prueba controlados. |
| Produccion | Operacion real y smokes de solo lectura | Datos reales con minimo acceso. |

No uses tokens de produccion en scripts locales ni los guardes en `.env` versionado.

## Verificacion rapida

Desde la raiz del proyecto:

```powershell
node --check app.js
node --check auth.js
node --check service-worker.js
node tools/notification-rules.test.cjs
git diff --check
```

`fase0-security-check.mjs` es un auditor de patrones. Algunos hallazgos pueden ser
deuda conocida, por lo que debe leerse su salida y no tratarse como una prueba
funcional completa.

```powershell
node tools/fase0-security-check.mjs
```

Usa `--strict` solo cuando el issue exige que toda deuda detectada falle el proceso.

### Smoke PWA opcional

Si la rama contiene `tools/pwa-cache-security-smoke.mjs`, ejecutalo junto con la
revision manual de Cache Storage. Su resultado debe interpretarse junto con el
guard efectivo de `service-worker.js`: el Service Worker puede usar condiciones
equivalentes o mas restrictivas que la cadena exacta buscada por un smoke.

## Smoke visual

`tools/visual-smoke.mjs` usa Playwright y escribe capturas en
`tools/smoke-output/`. Necesita que la aplicacion ya este servida. Esa carpeta
esta ignorada por Git y sus capturas no deben versionarse.

```powershell
$env:SMOKE_BASE_URL = "http://127.0.0.1:5174"
node tools/visual-smoke.mjs
```

Revisa al menos:

- login y registro;
- inicio;
- entrada/salida y permisos de camara/GPS;
- mis registros;
- perfil;
- navegacion y overflow en movil;
- panel administrativo segun rol;
- consola y solicitudes 404/500.

Las capturas generadas son artefactos temporales. No las confirmes si contienen
datos personales.

## Smoke autenticado de administracion

`tools/admin-prod-smoke.mjs` se usa para comprobaciones administrativas de solo
lectura. Antes de ejecutarlo, inspecciona el script y confirma que el ambiente,
las credenciales y las acciones sean las esperadas.

No automatices eliminaciones, cambios de rol ni purgas en produccion.

## Prueba negativa multiempresa

`tools/multisite-isolation-smoke.mjs` consulta Supabase con tokens efimeros de dos
organizaciones. No crea ni modifica datos.

Variables requeridas:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
MULTISITE_ADMIN_A_TOKEN
MULTISITE_ADMIN_B_TOKEN
MULTISITE_USER_A_TOKEN
MULTISITE_ORG_A_ID
MULTISITE_ORG_B_ID
MULTISITE_USER_B_ID
MULTISITE_SITE_B_ID
MULTISITE_USER_A_APP_ID
```

Ejecucion:

```powershell
node tools/multisite-isolation-smoke.mjs
```

Resultado minimo esperado:

- admin A no lista ni modifica organizacion B;
- admin B no lista organizacion A;
- usuario regular no abre directorios administrativos;
- usuario regular solo lee su perfil;
- una asignacion cruzada es rechazada por backend.

## Pruebas funcionales por rol

### Usuario

1. Registrarse eligiendo organizacion y sitio validos.
2. Iniciar sesion y conservar el sitio asignado.
3. Registrar entrada con una foto y GPS.
4. Bloquear una entrada duplicada cuando la regla del sitio lo exige.
5. Registrar salida solo con entrada activa.
6. Ver unicamente su historial y sus fotos permitidas.

### Supervisor

1. Ver solo sus sitios asignados.
2. Consultar asistencia y evidencia de esos sitios.
3. Agregar notas o revision cuando este permitido.
4. Cambiar de sitio sin perder el rol.
5. No eliminar usuarios ni ampliar su propio alcance.

### Admin

1. Ver solo su organizacion y sus sitios.
2. Gestionar usuarios y asignar supervisores dentro de su alcance.
3. Configurar horarios del sitio segun permisos.
4. No leer, modificar o eliminar otra organizacion.
5. Registrar ciclos privilegiados cuando la regla backend este habilitada.

### Superadmin y owner

1. Ver todas las organizaciones.
2. Crear y administrar organizaciones/sitios.
3. Cambiar roles dentro de las protecciones definidas.
4. No degradar ni eliminar un superadmin protegido sin capacidad owner.
5. Confirmar que toda accion destructiva pide confirmacion y genera auditoria.

## Validacion de una migracion

Antes de aplicar SQL:

1. Haz respaldo o confirma el mecanismo de recuperacion del ambiente.
2. Verifica que el prefijo de la migracion sea unico.
3. Compara el historial local y remoto con la CLI de Supabase.
4. Revisa el diff SQL, firmas de RPC, `revoke/grant`, RLS y `search_path`.
5. Ejecuta primero en dev.
6. Prueba caso permitido y caso denegado A/B.
7. Registra evidencia y plan de rollback.
8. Solo entonces promueve a staging y produccion.

Consulta la ayuda instalada antes de usar comandos que puedan cambiar la base:

```powershell
npx supabase --help
npx supabase migration --help
npx supabase db --help
```

Nunca deduzcas el estado remoto solo por los nombres de archivo del repositorio.

## Despliegue en Vercel

El proyecto es estatico y Vercel despliega la rama conectada. Antes de hacer push:

1. Confirma `git status` y que no se incluyan archivos ajenos o artefactos.
2. Ejecuta la verificacion rapida.
3. Ejecuta smoke visual si cambian HTML, CSS o JS.
4. Sincroniza versiones de assets si cambia codigo servido.
5. Confirma que las migraciones necesarias ya esten aplicadas en el ambiente correcto.
6. Revisa que `supabase-config.js` contenga solo configuracion publica.
7. Haz commit con una intencion clara y push solo con autorizacion del responsable.

Despues del despliegue:

1. Confirma respuesta HTTP 200.
2. Revisa consola y red sin 404/500.
3. Fuerza una actualizacion controlada del Service Worker.
4. Ejecuta un smoke de solo lectura por rol.
5. Valida un flujo real de entrada/salida con una cuenta demo autorizada.
6. Revisa auditoria y que no haya datos cruzados entre organizaciones.

## Evidencia de aceptacion

Cada issue debe cerrar con:

```text
Issue:
Ambiente:
Usuario y rol:
Organizacion/sitio:
Comando o pasos:
Resultado esperado:
Resultado obtenido:
Estado: PASA / FALLA / BLOQUEADO
Archivos modificados:
Captura o salida relevante:
Riesgos restantes:
Siguiente paso:
```

No adjuntes tokens, contrasenas, documentos, fotos faciales ni ubicaciones reales.

## Gate de produccion

No se debe desplegar una funcionalidad sensible si ocurre cualquiera de estos casos:

- la migracion no fue probada en dev/staging;
- falta RLS o una RPC confia en datos de alcance enviados por cliente;
- falla una prueba negativa entre organizaciones;
- una evidencia queda publica;
- el Service Worker cachea datos privados;
- el frontend contiene secretos;
- el flujo de login o sesion no pasa para los cuatro roles;
- no existe rollback o respaldo para un cambio destructivo.
