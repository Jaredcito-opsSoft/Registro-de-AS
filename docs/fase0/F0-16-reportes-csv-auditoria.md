# F0-16 Reportes, CSV y auditoria de exportaciones

Fecha: 2026-07-09
Linear: `JAR-40`

## Objetivo

Definir exportacion util sin exponer fotos, documentos, signed URLs ni datos excesivos.

## Filtros minimos

- fecha inicio;
- fecha fin;
- organizacion;
- sitio;
- estado;
- riesgo;
- nombre;
- identificador;
- tipo evidencia.

## Columnas permitidas CSV

- organizacion;
- sitio;
- usuario_nombre;
- identificador_visible;
- fecha;
- entrada_at;
- salida_at;
- estado;
- riesgo;
- gps_entrada_estado;
- gps_salida_estado;
- tipo_evidencia;
- evidencia_estado;
- folio_interno;
- observacion_admin;
- correccion_existente;
- exportado_at.

## Prohibido en CSV

- fotos;
- documentos;
- signed URLs;
- paths privados si no son estrictamente necesarios;
- hashes completos si no aportan al usuario;
- datos sensibles no operativos.

## Auditoria requerida

Insert en `exports`:

- actor;
- rol;
- organizacion;
- sitio;
- filtros;
- columnas;
- fecha;
- cantidad de filas;
- resultado.

Insert en `audit_logs`:

- accion: `attendance.exported`;
- detalle resumido;
- no incluir CSV completo.

## Pruebas negativas

1. Usuario normal no exporta.
2. Operador no exporta por defecto.
3. Admin A no exporta organizacion B.
4. CSV no incluye fotos/documentos/signed URLs.
5. Export queda auditado.

## Estado

Contrato listo para implementar `export_attendance_csv`.
