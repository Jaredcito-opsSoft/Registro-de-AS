# F0-02 Backlog tecnico priorizado

Fecha: 2026-07-09
Linear project: Asistencia Multiempresa - Fase 0 Base Tecnica

## Objetivo

Convertir el Plan Maestro en ejecucion controlada para tres frentes de trabajo, sin construir produccion ni usar datos reales sensibles.

## Decisiones operativas

- No empezar de cero.
- Trabajar sobre el repo actual.
- Priorizar seguridad, datos y permisos antes de UI grande.
- Mantener roles simples para MVP: `superadmin`, `admin`, `operador`, `usuario`.
- Separar rol de alcance con `scope_type`: `global`, `organizacion`, `sitio`, `propio`.
- Mantener `supervisor` y `admin_sitio/admin_organizacion` como posibles configuraciones futuras, no como roles obligatorios iniciales.

## Orden recomendado

### Bloque 1 - Base de control

1. `JAR-25` Inventario y deuda tecnica.
2. `JAR-26` Backlog tecnico versionado.
3. `JAR-42` Politica de ramas, PRs y separacion de trabajo.
4. `JAR-44` Ambientes, secretos, backups, rollback e incidentes.

### Bloque 2 - Datos y permisos

5. `JAR-27` Modelo de datos multiempresa.
6. `JAR-28` Matriz de permisos.
7. `JAR-29` RLS y pruebas negativas.
8. `JAR-30` RPCs criticas.

### Bloque 3 - Evidencia, privacidad y Auth

9. `JAR-31` Storage privado y signed URLs.
10. `JAR-32` Privacidad operacional.
11. `JAR-33` Documento oficial como alto riesgo.
12. `JAR-35` Supabase Auth, sesiones y secretos.

### Bloque 4 - Datos demo y seguridad verificable

13. `JAR-34` Seed/demo multiempresa.
14. `JAR-43` Threat model y pruebas de seguridad.
15. `JAR-36` PWA sin cache sensible.
16. `JAR-37` QR solo acceso/ruteo.

### Bloque 5 - Frontend y flujos

17. `JAR-38` Contratos API/RPC para frontend.
18. `JAR-39` Cascaron UI mobile-first.
19. `JAR-40` Reportes, CSV y auditoria de exportaciones.
20. `JAR-41` Migracion, respaldo y rollback.

### Bloque 6 - Cierre

21. `JAR-45` Checklist mobile-first.
22. `JAR-46` Auditoria de cierre Fase 0.

## Reglas de dependencia

- `JAR-29` depende de `JAR-27` y `JAR-28`.
- `JAR-30` depende de `JAR-27`, `JAR-28` y el borrador de `JAR-29`.
- `JAR-31` depende del modelo de `evidencias` y `audit_logs`.
- `JAR-38` depende de `JAR-30` y `JAR-31`.
- `JAR-39` no debe implementar logica sensible hasta tener contratos de `JAR-38`.
- `JAR-45` y `JAR-46` dependen de evidencias de todos los bloques.

## Bloqueantes

- Storage publico para evidencia.
- `ADMIN123` como permiso real.
- RLS/RPC no probados.
- Service role o secretos en frontend.
- QR validando salida.
- Usuario de una organizacion viendo datos de otra.
- App usando datos reales sensibles en dev.

## Mayores

- Migracion incompleta de `matricula` a `identificador`.
- Snapshots/records en `localStorage`.
- Falta de seed multiempresa.
- Falta de rollback documentado.
- Warnings de CRLF sin politica `.gitattributes`.

## Sugerencias

- Crear rama `fase0/base-tecnica`.
- Agregar `.gitattributes` en tarea separada.
- Crear carpeta `supabase/migrations` para migraciones nuevas consolidadas, sin borrar historiales antiguos todavia.
- Mantener docs Fase 0 en `docs/fase0`.

## Estado

Backlog de Linear ya existe y cubre Fase 0. Este archivo fija orden, dependencias y criterios de bloqueo para ejecucion rapida.
