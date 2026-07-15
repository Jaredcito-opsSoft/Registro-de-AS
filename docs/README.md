# Indice de documentacion

Este directorio concentra la documentacion tecnica y operativa del proyecto.
Su objetivo es permitir que una persona nueva pueda ubicar el codigo correcto,
entender los limites de seguridad y continuar el desarrollo sin reactivar logica
antigua por accidente.

## Lectura recomendada

1. [README del proyecto](../README.md): alcance, tecnologias e inicio local.
2. [Guia de entrada](../AGENTS.md): protocolo obligatorio para personas y agentes de IA.
3. [Arquitectura actual](ARQUITECTURA_ACTUAL.md): componentes, datos, roles y flujos.
4. [Guia de mantenimiento](GUIA_MANTENIMIENTO.md): como cambiar el sistema de forma segura.
5. [Pruebas y despliegue](PRUEBAS_Y_DESPLIEGUE.md): validaciones, PWA y salida a Vercel.

## Fuente de verdad

Cuando dos documentos se contradigan, usa este orden:

1. Comportamiento del codigo de la rama que se esta probando.
2. Migraciones confirmadas como aplicadas en el proyecto Supabase del ambiente.
3. [Arquitectura actual](ARQUITECTURA_ACTUAL.md).
4. [Guia de mantenimiento](GUIA_MANTENIMIENTO.md).
5. Documentos de `docs/fase0/`, que describen decisiones, contratos y criterios de aceptacion.
6. Prompts y archivos SQL de hitos anteriores.

La existencia de una migracion en el repositorio **no demuestra** que haya sido
aplicada en Supabase. Siempre se debe comparar el historial local con el remoto.

## Documentos de Fase 0

| Documento | Tema |
| --- | --- |
| [F0-01](fase0/F0-01-inventario-deuda-tecnica.md) | Inventario de deuda tecnica. |
| [F0-03](fase0/F0-03-modelo-datos-multiempresa.md) | Modelo de datos objetivo. |
| [F0-04](fase0/F0-04-matriz-permisos.md) | Roles, alcance y permisos. |
| [F0-05](fase0/F0-05-rls-aislamiento.md) | Estrategia RLS y aislamiento. |
| [F0-06](fase0/F0-06-contratos-rpc.md) | Contratos de funciones RPC. |
| [F0-07](fase0/F0-07-storage-privado-signed-urls.md) | Evidencia privada y URL firmada. |
| [F0-08](fase0/F0-08-privacidad-operacional.md) | Privacidad, consentimiento y retencion. |
| [F0-11](fase0/F0-11-auth-sesiones-secretos.md) | Auth, sesiones y secretos. |
| [F0-12](fase0/F0-12-pwa-cache-seguro.md) | Cache seguro y offline pasivo. |
| [F0-13](fase0/F0-13-qr-solo-acceso.md) | QR solo como acceso/ruteo. |
| [F0-17](fase0/F0-17-migracion-respaldo-rollback.md) | Migracion, respaldo y rollback. |
| [F0-18](fase0/F0-18-ramas-prs-colaboracion.md) | Trabajo paralelo y revisiones. |
| [F0-19](fase0/F0-19-threat-model.md) | Modelo de amenazas. |
| [F0-20](fase0/F0-20-ambientes-secretos-backups.md) | Ambientes y respaldos. |
| [F0-45](fase0/F0-45-smoke-visual-accesibilidad.md) | Smoke visual y accesibilidad. |
| [F0-46](fase0/F0-46-multisite-isolation-smoke.md) | Prueba negativa multiempresa. |

## Material historico

- `prompt_backoffice_admin_superadmin_mvp.md` describe una direccion de producto,
  no un contrato ejecutable.
- Los archivos `supabase-*.sql` de la raiz son hitos y parches historicos. No se
  deben ejecutar en lote ni usar para reconstruir una base actual sin auditoria.

## Como mantener este indice

Al cerrar una funcionalidad importante:

1. Actualiza `ARQUITECTURA_ACTUAL.md` si cambia un flujo, rol, tabla o frontera.
2. Actualiza `GUIA_MANTENIMIENTO.md` si cambia el procedimiento operativo.
3. Registra la prueba nueva en `PRUEBAS_Y_DESPLIEGUE.md`.
4. Marca claramente lo implementado, parcial o planeado.
5. No guardes credenciales, tokens, datos personales ni capturas sensibles.
