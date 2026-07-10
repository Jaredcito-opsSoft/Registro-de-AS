# F0-19 Threat model y pruebas de seguridad

Fecha: 2026-07-09
Linear: `JAR-43`

## Objetivo

Identificar amenazas principales del sistema multiempresa y definir mitigaciones/pruebas antes de usar datos reales.

## Tabla de amenazas

| Amenaza | Actor | Impacto | Mitigacion | Prueba requerida | Estado |
|---|---|---|---|---|---|
| Usuario A ve datos de organizacion B | Usuario autenticado | Fuga multiempresa critica | RLS por `organizacion_id`, helpers de alcance, RPC valida usuario actual | `f0_negative_tests.sql` caso 1 | Draft |
| Admin A exporta organizacion B | Admin malicioso/error | Fuga masiva | RPC `export_attendance_csv`, RLS, filtros por alcance | Admin A consulta/exporta B: bloqueado | Pendiente RPC export |
| Operador A ve sitio B | Operador | Fuga por sitio | `can_access_site`, RLS en `sitios`, `asistencias`, `usuarios_app` | Caso 5 negative tests | Draft |
| Usuario eleva su rol | Usuario manipula cliente | Toma de privilegios | Update policy impide cambiar `rol`, `scope_type`, org/sitio | Update `rol='admin'`: falla | Draft |
| `ADMIN123` usado como permiso real | Usuario interno/externo | Escalada admin | Eliminar permiso real por key; roles desde DB/Auth | Buscar `ADMIN123`; flujo admin requiere rol | Pendiente refactor legacy |
| Service role expuesto | Cualquiera | Control total DB | Nunca en frontend/repo; busqueda CI | `rg service_role SUPABASE_SERVICE JWT_SECRET` | Revisado sin secreto real |
| Bucket publico de evidencia | Cualquiera con URL | Fuga fotos/docs | Bucket privado `evidence-private`, signed URLs | `/object/public` no funciona | Draft Storage |
| Signed URL compartida | Usuario autorizado | Acceso temporal fuera del sistema | TTL 5-15 min, auditoria, no persistir | URL expira, log auditado | Pendiente implementacion |
| Fotos en base64 en DB | Desarrollador/error | DB pesada/fuga | Guardar metadata + path privado | Revisar columnas/base64 | Pendiente migracion |
| Documento oficial sin consentimiento | Operacion/admin | Riesgo legal alto | Documento desactivado por defecto; politica privacy/retention | Activar documento sin aviso: bloqueado | Documentado |
| GPS manipulado | Usuario | Asistencia fraudulenta | Politica sitio, distancia/radio, precision, riesgo/revision | GPS fuera radio marca revision/bloqueo | Pendiente RPC final |
| Entrada duplicada | Usuario | Datos inconsistentes | Unique por usuario/sitio/fecha + RPC | register_entry duplicado falla | Draft RPC |
| Salida sin entrada | Usuario | Registro falso | RPC busca entrada activa | register_exit sin entrada falla | Draft RPC |
| Salida duplicada | Usuario | Datos inconsistentes | RPC bloquea `salida_at is not null` | Doble salida falla | Draft RPC |
| Correccion silenciosa | Admin | Manipulacion historial | `correct_attendance` exige motivo + before/after + audit + notificacion | Correccion sin motivo falla | Draft RPC |
| CSV contiene evidencia | Admin/export | Fuga masiva | Contrato CSV prohíbe fotos/docs/signed URLs | Revisar columnas export | Documentado |
| PWA cachea datos sensibles | Service Worker | Fuga local | Cache solo App Shell/mismo origen/assets | Inspeccionar Cache Storage | SW revisado, prueba manual pendiente |
| QR usado como token de salida | Usuario | Bypass flujo | QR solo ruteo, salida por RPC | `#salida?token=falso` no valida | Flujo actual cumple, legacy pendiente |
| Logs contienen datos sensibles | Dev/admin | Fuga secundaria | No guardar fotos, docs, tokens, signed URLs | Revisar audit_logs | Pendiente implementacion |
| Migracion rompe datos previos | Equipo dev | Perdida/bug productivo | Backup, staging, rollback, migracion incremental | Restaurar staging | Pendiente entorno |

## Bloqueantes antes de datos reales

- RLS/RPC no ejecutados ni probados en dev/staging.
- Storage privado no aplicado.
- `ADMIN123` sigue en legacy.
- No hay revision legal del aviso/retencion.
- No hay prueba mobile-first final.

## Pruebas fuente

- `docs/fase0/sql-drafts/f0_negative_tests.sql`
- `docs/fase0/sql-drafts/f0_rls_policies.sql`
- `docs/fase0/sql-drafts/f0_rpc_functions.sql`
- `docs/fase0/sql-drafts/f0_storage_private.sql`

## Estado

Threat model listo para auditoria Fase 0. Debe actualizarse conforme se apliquen migraciones reales.
