# F0-09 Documento oficial como evidencia de alto riesgo

Fecha: 2026-07-09
Linear: `JAR-33`

## Decision

La captura de INE, cedula o documento oficial completo queda desactivada por defecto.

No se considera evidencia normal. Es evidencia de alto riesgo y requiere condiciones adicionales.

## Condiciones para activacion por sitio

Un sitio solo puede activar documento oficial si existe:

- justificacion operativa documentada;
- aviso de privacidad vigente;
- consentimiento especifico;
- politica de retencion especifica;
- Storage privado;
- signed URLs con TTL corto;
- auditoria de visualizacion;
- permisos restringidos;
- revision legal minima.

## Politica tecnica

Campo sugerido en `sitios`:

```txt
evidence_policy = rostro | foto_simple | documento | rostro_documento
```

Valor default:

```txt
rostro
```

`documento` y `rostro_documento` deben bloquearse si no existe configuracion de privacidad y retencion.

## Prohibiciones

- No pedir documento oficial por defecto.
- No usar bucket publico.
- No guardar base64.
- No mostrar miniaturas publicas.
- No incrustar documento en CSV.
- No enviar documento a logs.
- No cachear documento en Service Worker, Cache Storage, IndexedDB, LocalStorage o SessionStorage.
- No permitir visualizacion sin auditoria.

## Acceso

### usuario

Puede ver si entrego documento y su estado. Visualizacion completa solo si se decide explicitamente y con URL temporal.

### operador

No ve documento completo por defecto.

### admin

Puede solicitar signed URL si esta dentro de alcance y justifica motivo.

### superadmin

Puede solicitar signed URL global con auditoria estricta y motivo.

## Auditoria de visualizacion

Cada visualizacion debe registrar:

- actor;
- rol;
- organizacion;
- sitio;
- asistencia;
- evidencia;
- motivo;
- fecha;
- resultado.

## Retencion inicial sugerida

Documento oficial:

- 30 a 90 dias, salvo necesidad legal/operativa justificada.
- Eliminacion segura o archivo restringido.

Este valor requiere revision legal antes de datos reales.

## Pruebas negativas

1. Sitio sin politica no puede pedir documento.
2. Sitio sin aviso vigente no puede pedir documento.
3. Sitio sin consentimiento no puede guardar documento.
4. Operador no puede generar signed URL de documento.
5. CSV no incluye documento ni signed URL.
6. Bucket publico no permite documento.
7. Logs no contienen documento ni URL.

## Estado actual del repo

- La app actual maneja evidencia fotografica, pero no debe activar documento oficial real todavia.
- El modelo Fase 0 contempla `evidence_policy`.
- Falta enforcement backend para bloquear documento sin privacidad/retencion.

## Estado

Politica tecnica-operativa lista. Documento oficial sigue fuera de uso real hasta aprobacion legal y controles implementados.
