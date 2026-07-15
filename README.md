# Asistencia QR

Web App/PWA multiempresa para registrar y supervisar asistencias con fotografia,
ubicacion GPS, control por sitio y permisos por rol. El proyecto se encuentra en
estado **MVP funcional en evolucion**: los flujos principales existen, pero las
migraciones y los controles de seguridad deben validarse en un ambiente de
desarrollo o staging antes de promover cambios a produccion.

## Funciones actuales

- Inicio de sesion y registro con Supabase Auth.
- Organizaciones y varios sitios por organizacion.
- Roles `usuario`, `supervisor`, `admin` y `superadmin`.
- Entrada y salida con foto, GPS, horario y hora de servidor.
- Validacion de un solo rostro y comparacion facial como apoyo de revision.
- Historial propio para usuarios y vista operativa segun alcance para personal autorizado.
- Administracion de organizaciones, sitios, usuarios, roles y alcances.
- Evidencia, auditoria, exportacion y control de asistencias.
- Instalacion como PWA y cache exclusivo del App Shell.
- Sesion operativa por dispositivo para reducir el uso simultaneo de una cuenta.

El QR se considera un medio de acceso o ruteo. No debe conceder permisos ni ser
la autoridad final para validar identidad, asistencia o salida.

## Tecnologias

- HTML5, CSS y JavaScript sin framework de frontend.
- Supabase Auth, PostgreSQL, RPC, RLS y Storage.
- `face-api.js` y modelos locales en `models/`.
- Service Worker y Web App Manifest para la PWA.
- Vercel para el despliegue del sitio estatico.
- Playwright y scripts Node.js para pruebas de humo.

## Inicio local

El repositorio no depende de un proceso de compilacion. Debe servirse por HTTP;
no se recomienda abrir `index.html` directamente.

1. Abre la carpeta del proyecto en VS Code.
2. Inicia Live Server en el puerto `5174`, o usa un servidor estatico equivalente.
3. Abre `http://127.0.0.1:5174/`.
4. Autoriza camara y ubicacion cuando el navegador lo solicite.

Camara, geolocalizacion, Service Worker y PWA requieren `localhost` o HTTPS.

## Archivos principales

| Archivo o carpeta | Responsabilidad |
| --- | --- |
| `index.html` | Estructura de vistas, formularios y navegacion de la SPA. |
| `styles.css` | Sistema visual y comportamiento responsive. |
| `app.js` | Estado, vistas, asistencia, administracion, camara, GPS y llamadas RPC. |
| `auth.js` | Sesion de Supabase Auth y operaciones de autenticacion. |
| `supabase-config.js` | URL y publishable key del cliente. Nunca debe contener `service_role`. |
| `service-worker.js` | Cache del App Shell y soporte PWA pasivo. |
| `notification-rules.js` | Reglas de recordatorios de asistencia. |
| `supabase/migrations/` | Migraciones incrementales de base de datos. |
| `tools/` | Smoke tests, validaciones y utilidades de auditoria. |
| `docs/` | Arquitectura, mantenimiento, pruebas y decisiones de Fase 0. |

## Documentacion

Empieza por [docs/README.md](docs/README.md).

Antes de modificar codigo, sigue [AGENTS.md](AGENTS.md). Es la guia corta para
desarrolladores y agentes de IA.

- [Arquitectura actual](docs/ARQUITECTURA_ACTUAL.md)
- [Guia de mantenimiento](docs/GUIA_MANTENIMIENTO.md)
- [Pruebas y despliegue](docs/PRUEBAS_Y_DESPLIEGUE.md)
- [Matriz de permisos](docs/fase0/F0-04-matriz-permisos.md)
- [Contratos RPC](docs/fase0/F0-06-contratos-rpc.md)
- [PWA y cache seguro](docs/fase0/F0-12-pwa-cache-seguro.md)

## Reglas de seguridad

- El frontend nunca es la autoridad final de permisos.
- Las acciones sensibles deben validar `auth.uid()`, rol y alcance en RLS/RPC.
- Nunca agregar `service_role`, contrasenas o tokens de sesion al repositorio.
- No confiar en `user_metadata` para autorizar acciones.
- Las evidencias deben permanecer privadas y entregarse mediante URL firmada temporal.
- No registrar asistencias offline ni cachear datos personales en el Service Worker.
- No aplicar todos los archivos SQL de la raiz: son historicos. Las nuevas
  modificaciones deben entrar como migraciones revisadas en `supabase/migrations/`.

## Verificacion minima

```powershell
node --check app.js
node --check auth.js
node --check service-worker.js
node tools/notification-rules.test.cjs
git diff --check
```

Las pruebas autenticadas y multiempresa requieren cuentas de prueba, tokens
efimeros y un ambiente controlado. Consulta
[docs/PRUEBAS_Y_DESPLIEGUE.md](docs/PRUEBAS_Y_DESPLIEGUE.md) antes de ejecutarlas.
