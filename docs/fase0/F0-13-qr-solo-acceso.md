# F0-13 QR solo acceso/ruteo

Fecha: 2026-07-09
Linear: `JAR-37`

## Objetivo

Confirmar que el QR no valida salida, identidad, permisos ni estado operativo.

## Estado actual observado

En `app.js`:

- `ACCESS_QR_URL` apunta a la app publica.
- `updateAccessQr()` genera QR de acceso con `ACCESS_QR_URL`.
- `updateAccessQr()` limpia `state.qrToken = ""`.
- El label visual dice `QR de acceso`.
- La salida llama `registrar_salida_segura` con `p_token_qr: null`.
- La salida local marca:
  - `qrSalida = "no_aplica"`
  - `tokenQrUsado = "no_aplica"`
  - `qrValidado = false`
  - `qrObservacion = "No aplica: salida validada por matricula, foto, GPS y facial."`

Esto cumple la decision de degradar QR a acceso.

## Deuda legacy

Todavia existen elementos heredados:

- `QR_START`
- `QR_END`
- `QR_VALID_MINUTES`
- `makeQrToken()`
- `getExitUrl(token)`
- campos `tokenQrUsado`, `qrValidado`, `qrObservacion`
- SQL historico de hotfix QR y remove QR exit validation

No parecen usarse para validar salida en el flujo actual, pero deben eliminarse o aislarse cuando se consolide Fase 0.

## Regla final

QR puede:

- abrir la PWA;
- abrir ruta de sitio;
- preseleccionar sitio;
- facilitar registro rapido.

QR no puede:

- validar salida;
- validar identidad;
- contener token operativo;
- contener token de salida;
- autorizar admin;
- cambiar rol;
- cerrar asistencia.

## Formato recomendado futuro

```txt
https://registro-de-as.vercel.app/#sitio/{site_public_slug}
```

O:

```txt
https://registro-de-as.vercel.app/?site={site_public_slug}
```

El slug/key solo rutea o vincula usuario normal tras validacion backend. No otorga permisos.

## Validacion de salida

La salida debe depender de:

- usuario autenticado o identificador validado;
- entrada activa;
- evidencia de salida;
- GPS si aplica;
- politica del sitio;
- hora servidor;
- facial opcional;
- RPC backend.

## Pruebas negativas

1. Abrir `#salida?token=falso`: no debe validar salida por token.
2. Registrar salida sin entrada: bloqueado.
3. Registrar salida duplicada: bloqueado.
4. QR con parametro admin: no debe elevar rol.
5. QR de sitio A no da acceso a datos sitio B.

## Estado

El flujo actual ya esta orientado a QR solo acceso. Queda deuda legacy por limpiar en implementacion posterior.
