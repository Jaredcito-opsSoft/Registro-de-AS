# F0-46: Smoke de aislamiento multiempresa

Este smoke prueba separacion de datos con dos organizaciones demo. No usar cuentas reales ni tokens persistentes.

## Datos de prueba requeridos

- Organizacion A con un admin y un usuario regular.
- Organizacion B con un admin y un usuario regular.
- Un sitio activo en cada organizacion.
- Tokens efimeros de Supabase Auth para cada cuenta demo.

## Ejecucion

Configura variables de entorno solo en la terminal local y ejecuta:

```powershell
node tools/multisite-isolation-smoke.mjs
```

El script exige `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, los tokens de Admin A, Admin B y Usuario A, los IDs de ambas organizaciones, el ID de Usuario B, el ID de Sitio B y el ID de perfil de Usuario A.

## Criterios de aceptacion

| Caso | Resultado esperado |
| --- | --- |
| Admin A lista usuarios | Todas las filas pertenecen a Organizacion A. |
| Admin B lista usuarios | Todas las filas pertenecen a Organizacion B. |
| Admin A intenta asignar Usuario B al Sitio B | La RPC responde error y no modifica datos. |
| Usuario regular consulta directorio | La RPC responde error. |
| Usuario regular consulta `usuarios_app` | Solo recibe su propio perfil. |

Registra cada corrida con la plantilla de evidencia de aceptacion del proyecto. Una falla es bloqueante para liberar aislamiento multiempresa.
