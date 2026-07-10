# F0-07 Storage privado y signed URLs

Fecha: 2026-07-09
Linear: `JAR-31`

## Objetivo

Definir almacenamiento seguro para evidencias sin URLs publicas permanentes.

## Problema actual

El repo actual genera evidencia con una URL publica:

```txt
/storage/v1/object/public/{bucket}/{path}
```

Esto no cumple Fase 0 para fotos, documentos ni evidencia sensible.

## Decision

Crear bucket privado:

```txt
evidence-private
```

No usar buckets publicos para evidencia.

## Path canonico

```txt
org/{organizacion_id}/site/{sitio_id}/attendance/{asistencia_id}/{tipo}/{uuid}.{ext}
```

Ejemplo:

```txt
org/1111/site/2222/attendance/3333/entrada_rostro/550e8400-e29b-41d4-a716-446655440000.jpg
```

## Metadata en base de datos

Tabla: `evidencias`

Guardar:

- `bucket`
- `path`
- `hash_sha256`
- `mime`
- `size_bytes`
- `width`
- `height`
- `tipo`
- `captured_at`
- `created_by`

No guardar:

- base64;
- signed URLs;
- URLs publicas;
- imagen embebida;
- documento en CSV.

## Politica de acceso

### Upload

Permitido solo para:

- usuario autenticado registrando evidencia propia;
- RPC/flujo controlado;
- admin/superadmin solo en operaciones justificadas.

Validar:

- usuario activo;
- organizacion/sitio;
- asistencia;
- tipo de evidencia permitido por sitio.

### Read

No lectura directa desde frontend.

Lectura mediante:

```txt
get_signed_evidence_url(evidence_id, reason)
```

### Signed URL

TTL recomendado:

- fotos rostro: 5 a 15 minutos;
- documentos oficiales: 5 minutos;
- thumbnails futuras: evaluar solo si no son publicas.

Reglas:

- No persistir signed URL.
- No incluir signed URL en CSV.
- No guardar signed URL en logs.
- Auditar generacion y visualizacion.

## Auditoria

Cada generacion debe registrar:

- actor;
- rol;
- organizacion;
- sitio;
- asistencia;
- evidencia;
- tipo;
- motivo;
- fecha;
- resultado.

Accion sugerida:

```txt
evidence.signed_url.generated
```

## Documento oficial

Documento oficial completo:

- desactivado por defecto;
- requiere politica por sitio;
- requiere aviso y consentimiento;
- requiere retencion especifica;
- requiere motivo para visualizacion;
- no se muestra a operador salvo permiso explicito;
- no se exporta.

## Pruebas negativas

1. Bucket no es publico.
2. URL publica `/object/public` no funciona.
3. Usuario A no genera URL de evidencia B.
4. Admin sitio A no genera URL de sitio B.
5. Signed URL expira.
6. CSV no incluye signed URL.
7. Logs no incluyen signed URL.
8. Usuario desactivado no genera nuevas URLs.

## Cambios futuros en codigo

En `app.js`, reemplazar:

- generacion de `evidence.url` publica;
- visualizacion directa de foto por URL publica;
- paths basados en matricula.

Por:

- upload a bucket privado;
- guardar solo metadata;
- mostrar evidencia con `get_signed_evidence_url`;
- paths basados en org/sitio/asistencia/tipo/uuid.

## Estado

Diseno listo para implementacion.

SQL draft asociado:

- `docs/fase0/sql-drafts/f0_storage_private.sql`

Bloqueante antes de datos reales. Debe verificarse con politicas reales de Supabase Storage y signed URLs.
