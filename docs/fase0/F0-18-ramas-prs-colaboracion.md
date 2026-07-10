# F0-18 Politica de ramas, PRs y colaboracion

Fecha: 2026-07-09
Linear: `JAR-42`

## Ramas

- `main`: estable, protegida.
- `develop` o `staging`: integracion.
- `feature/f0-JAR-XX-descripcion`: nuevas tareas.
- `fix/JAR-XX-descripcion`: correcciones.
- `migration/JAR-XX-descripcion`: cambios SQL/migraciones.

## Reglas

1. Nadie trabaja directo en `main`.
2. Todo cambio entra por PR.
3. Cada PR referencia issue Linear.
4. Migraciones requieren revision Backend/datos/seguridad.
5. RLS/Storage/Auth requiere revision de seguridad.
6. UI grande no se mezcla con RLS/migraciones.
7. Cada PR incluye pruebas y rollback.
8. No se suben secrets.

## Frentes

### Frente A - Frontend/mobile-first

- UI;
- camara;
- GPS;
- PWA;
- estados y errores.

### Frente B - Backend/datos/seguridad

- SQL;
- RLS;
- RPCs;
- Storage;
- Auth;
- migraciones.

### Frente C - Producto/QA/documentacion

- backlog;
- criterios;
- pruebas;
- evidencias;
- auditoria.

## Plantilla

Se agrego `.github/pull_request_template.md`.

## Estado

Politica lista para que trabajen tres desarrolladores sin pisarse.
