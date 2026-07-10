# F0-20 Ambientes, secretos, backups, rollback e incidentes

Fecha: 2026-07-09
Linear: `JAR-44`

## Ambientes

### local

- Desarrollo individual.
- Sin datos reales.
- Puede usar seed demo.

### dev

- Integracion tecnica temprana.
- Datos demo.
- RLS/RPC en prueba.

### staging

- Replica controlada antes de produccion.
- Datos demo o anonimizados.
- Pruebas de backup/restore.

### prod

- Bloqueado hasta auditoria de cierre.
- Requiere legal, privacidad, RLS, Storage privado, backups y rollback.

## Secrets

Permitido en frontend:

- Supabase URL.
- anon/publishable key.

Prohibido:

- service role;
- JWT secret;
- SMTP secrets;
- Vercel tokens;
- claves admin reales;
- credenciales privadas.

## Backups

Antes de migraciones:

- dump DB;
- export metadata esquema;
- respaldo Storage;
- snapshot de variables de entorno sin exponer valores en docs.

## Restore

Debe probarse en staging:

1. Restaurar DB.
2. Verificar tablas criticas.
3. Verificar Storage.
4. Ejecutar smoke test.

## Incidentes

Flujo:

1. Detectar.
2. Bloquear acceso o pausar despliegue.
3. Rotar secretos.
4. Preservar evidencia tecnica.
5. Notificar internamente.
6. Corregir.
7. Documentar.

## Estado

Checklist operativo listo. Produccion sigue bloqueada.
