# Handoff Frente B - Backend / datos / seguridad

Fecha: 2026-07-09

## Dueño temporal

Frente B.

## No tocar

- Layout visual.
- Rediseño frontend.
- Componentes UI.
- Flujos visuales de la compañera en Frente A.

## Entregables listos

### Documentacion

- `F0-03-modelo-datos-multiempresa.md`
- `F0-04-matriz-permisos.md`
- `F0-05-rls-aislamiento.md`
- `F0-06-contratos-rpc.md`
- `F0-07-storage-privado-signed-urls.md`
- `F0-10-seed-demo-multiempresa.md`
- `F0-11-auth-sesiones-secretos.md`
- `F0-14-contratos-frontend.md`
- `F0-16-reportes-csv-auditoria.md`
- `F0-17-migracion-respaldo-rollback.md`
- `F0-19-threat-model.md`
- `F0-20-ambientes-secretos-backups.md`

### SQL drafts

- `sql-drafts/f0_schema_foundation.sql`
- `sql-drafts/f0_rls_policies.sql`
- `sql-drafts/f0_rpc_functions.sql`
- `sql-drafts/f0_storage_private.sql`
- `sql-drafts/f0_seed_demo_multiempresa.sql`
- `sql-drafts/f0_negative_tests.sql`

## Contratos para Frente A

Frontend debe consultar:

- `F0-14-contratos-frontend.md`
- `F0-06-contratos-rpc.md`
- `F0-07-storage-privado-signed-urls.md`

Frontend no debe:

- inventar permisos;
- usar QR como validador;
- leer evidencia publica;
- asumir que ocultar botones es seguridad;
- persistir datos sensibles offline.

## Bloqueado hasta conectar Supabase dev/staging

- Ejecutar SQL drafts.
- Probar RLS real.
- Probar Storage privado real.
- Probar signed URLs.
- Cargar seed demo.
- Conectar frontend a RPCs nuevas.

## Requisitos para siguiente paso

1. Instalar Supabase CLI o conectar Supabase MCP.
2. Introspeccionar DB actual.
3. Crear rama `feature/f0-backend-security`.
4. Convertir SQL drafts en migraciones oficiales.
5. Aplicar en dev/staging.
6. Ejecutar `f0_negative_tests.sql`.
7. Pasar evidencia a `JAR-46`.

## Estado

Backend esta listo para pasar de draft a migraciones cuando exista entorno Supabase dev/staging conectado.
