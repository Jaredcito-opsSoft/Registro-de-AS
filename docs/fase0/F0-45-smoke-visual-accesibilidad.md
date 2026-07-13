# F0-45 Smoke visual y accesibilidad

## Alcance

Revision local del flujo simplificado en Inicio, Registro, Mis registros y Perfil. No se modificaron backend, SQL, Auth, camara, ubicacion, QR, persistencia ni permisos.

## Viewports revisados

- 320 x 720
- 375 x 844
- 390 x 844
- 430 x 844
- 768 x 844
- 1024 x 844

## Resultados

- Sin desplazamiento horizontal en las vistas revisadas.
- Navegacion inferior fija de 68 px con cuatro destinos y `aria-current` correcto.
- Contenido protegido con padding inferior mayor que la barra movil.
- Controles visibles con nombre accesible.
- Nombre e identificador de Registro se completan desde la sesion y no aparecen como campos editables.
- Campos de solo lectura de rol y alcance con `aria-label` explicito.
- Foco visible reforzado en filas editables y campos de solo lectura de Perfil.
- Accesos de Inicio y botones compactos ajustados a un minimo tactil de 44 px.
- Acciones principales usan violeta oscuro para mejorar contraste con texto blanco.
- El control decorativo de tres puntos no existe en Desglose de registros.
- Sin desplazamiento horizontal en los seis tamanos.
- Mis registros presenta resumen de jornadas, filtros compactos y estado vacio orientativo.
- Tarjetas de jornada pendiente y completa verificadas con datos efimeros no persistentes.
- Las validaciones de identidad, evidencia y ubicacion usan divulgacion progresiva.
- Smoke automatizado: 136 comprobaciones aprobadas, 0 fallos.

## Flujos comprobados

- Inicio a Registro.
- Registro decide Entrada, Salida o jornada completa segun el registro del dia.
- Inicio a Mis registros.
- Inicio a Perfil.
- Estado activo de la navegacion en cada ruta.
- Identidad de sesion visible como resumen y campos internos ocultos.
- Presencia de controles de camara y ubicacion en Registro.

## Limites de la prueba

- No se aceptaron permisos de camara ni ubicacion.
- No se guardaron asistencias reales.
- No se probo una sesion administrativa autenticada.
- No se completo una entrada o salida porque requiere permisos de camara, ubicacion y una captura facial valida.
