# F0-17 Migracion, respaldo y rollback

Fecha: 2026-07-09
Linear: `JAR-41`

## Objetivo

Evolucionar la app existente sin romper login, entrada, salida, camara, GPS, evidencias, admin ni PWA.

## Regla

No ejecutar migraciones en produccion hasta tener:

- respaldo;
- staging;
- pruebas;
- rollback;
- aprobacion.

## Plan por pasos

1. Congelar rama base.
2. Respaldar base de datos y Storage.
3. Introspeccionar esquema actual real de Supabase.
4. Crear migracion consolidada Fase 0 en rama.
5. Aplicar en dev/staging.
6. Cargar seed demo.
7. Ejecutar pruebas negativas.
8. Validar flujos criticos.
9. Preparar rollback.
10. Revisar con equipo antes de merge.

## Migracion de `matricula` a `identificador`

- Agregar `identificador`.
- Copiar `matricula` a `identificador`.
- Crear `site_identifier_config` con label `Matricula` para sitio inicial.
- Mantener `matricula` temporalmente si el frontend actual lo necesita.
- Cambiar UI por etapas.
- Eliminar `matricula` solo en fase posterior.

## Checklist regresion

- login;
- registro;
- entrada;
- salida;
- camara;
- GPS;
- evidencia;
- admin;
- reportes;
- PWA install;
- offline pasivo;
- QR acceso.

## Rollback

Si falla migracion:

1. Detener despliegue.
2. Restaurar backup DB si hubo cambios destructivos.
3. Restaurar Storage si aplica.
4. Revertir PR.
5. Invalidar cache/service worker si cambian assets criticos.
6. Documentar incidente.

## Estado

Plan listo. Falta ejecutar en staging/dev real.
