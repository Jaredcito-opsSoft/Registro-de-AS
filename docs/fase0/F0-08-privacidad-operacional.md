# F0-08 Privacidad operacional

Fecha: 2026-07-09
Linear: `JAR-32`

## Objetivo

Convertir privacidad en requisitos tecnicos verificables antes de capturar fotos, GPS, documentos o metadatos con datos reales.

Este documento no sustituye revision legal. Es una base tecnica para implementar privacidad operativa.

## Datos tratados por el sistema

- Nombre.
- Email.
- Identificador configurable.
- Fotografia de rostro.
- Fotografia de salida.
- Documento oficial, solo si se activa en fase futura.
- Ubicacion GPS.
- Metadatos de evidencia: hash, MIME, tamano, resolucion, fecha, user agent, device label.
- Historial de asistencia.
- Correcciones.
- Exportaciones.
- Logs de auditoria.

## Tablas requeridas

### privacy_notices

Avisos versionados por organizacion/sitio.

Campos minimos:

- `id`
- `organizacion_id`
- `sitio_id`
- `version`
- `titulo`
- `url_o_texto`
- `vigente_desde`
- `vigente_hasta`
- `activo`
- `created_at`

### privacy_consents

Consentimientos aceptados/revocados.

Campos minimos:

- `id`
- `usuario_id`
- `notice_id`
- `accepted_at`
- `revoked_at`
- `metodo`
- `user_agent_hash`
- `created_at`

### privacy_requests

Solicitudes ARCO/privacidad.

Campos minimos:

- `id`
- `usuario_id`
- `organizacion_id`
- `tipo`
- `estado`
- `fecha_solicitud`
- `fecha_respuesta`
- `respuesta`
- `created_at`

### retention_policies

Politicas de retencion por tipo de dato.

Campos minimos:

- `id`
- `organizacion_id`
- `sitio_id`
- `tipo_dato`
- `dias_retencion`
- `accion`
- `activo`
- `created_at`

## Flujo minimo de consentimiento

1. Usuario inicia registro o primer acceso.
2. Sistema detecta organizacion/sitio.
3. Sistema obtiene aviso vigente.
4. Usuario ve finalidad: asistencia, evidencia, GPS, auditoria y reportes.
5. Usuario acepta antes de capturar evidencia/GPS.
6. Se guarda `privacy_consents`.
7. Registro de entrada/salida valida consentimiento vigente si la politica lo requiere.

## Politica inicial de retencion sugerida

Estos valores son tecnicos iniciales y deben validarse legalmente:

| Tipo de dato | Retencion sugerida | Accion |
|---|---:|---|
| Asistencias | 365 dias | conservar/archivar |
| Fotos rostro | 90-180 dias | eliminar o archivar seguro |
| GPS | 90-180 dias | eliminar o agregar anonimizado |
| Documentos oficiales | 30-90 dias | eliminar seguro |
| Audit logs | 365 dias | conservar |
| Export logs | 365 dias | conservar |
| Consentimientos | vigencia + 365 dias | conservar |

## Bloqueos antes de datos reales

No capturar datos reales sensibles si falta cualquiera de estos puntos:

- aviso vigente;
- consentimiento registrado;
- bucket privado;
- RLS/RPC;
- retencion definida;
- auditoria de evidencia;
- politica de documento oficial si aplica;
- revision legal minima.

## Reglas de minimizacion

- No pedir documento oficial por defecto.
- No guardar fotos en base64.
- No guardar signed URLs.
- No incluir fotos/documentos en CSV.
- No registrar datos sensibles completos en logs.
- No cachear fotos, GPS, registros ni respuestas privadas.

## Derechos del usuario

El sistema debe permitir o preparar:

- consultar registros propios;
- ver correcciones propias;
- ver consentimiento aceptado;
- solicitar acceso/correccion/cancelacion/oposicion mediante `privacy_requests`;
- recibir notificacion cuando una asistencia sea corregida.

## Eventos auditables

- `privacy.notice.accepted`
- `privacy.notice.revoked`
- `evidence.signed_url.generated`
- `attendance.corrected`
- `attendance.exported`
- `site.policy.changed`
- `user.role.changed`

## Estado actual del repo

- Hay metadata de evidencia y GPS.
- Hay `audit_logs` en SQL historico.
- Falta flujo real de aviso/consentimiento.
- Falta retencion implementada.
- Falta ARCO/privacidad en UI.

## Estado

Checklist tecnico listo. Bloquea produccion con datos reales hasta implementacion y revision legal.
