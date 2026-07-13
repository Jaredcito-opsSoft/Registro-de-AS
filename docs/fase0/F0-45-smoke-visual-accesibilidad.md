# F0-45 Smoke visual y accesibilidad

## Alcance

Revision local del flujo simplificado en Inicio, Registro, Mis registros y Perfil. No se modificaron backend, SQL, Auth, QR ni contratos remotos.

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
- Inicio presenta bienvenida personalizada y reloj sin indicador En vivo.
- Preferencias de camara y ubicacion visibles como interruptores en Perfil.
- El aviso de permisos se oculta al conceder camara y ubicacion y reaparece si falta cualquiera de los dos.
- Registro inicia la camara automaticamente y elimina el paso intermedio Activar camara.
- Selector Estado validado dentro de su contenedor en anchos iPhone, con fuente de 16 px.
- Avatar local verificado antes y despues de recargar mediante IndexedDB.
- Admin superadmin revisado con datos reales a 305 y 375 px utiles, sin desbordamiento de pagina.
- Filtros, formularios y controles de Admin colapsan a una columna; Asistencias conserva desplazamiento dentro de la tabla.
- Smoke automatizado: 178 comprobaciones aprobadas, 0 fallos.

## Flujos comprobados

- Inicio a Registro.
- Registro decide Entrada, Salida o jornada completa segun el registro del dia.
- Inicio a Mis registros.
- Inicio a Perfil.
- Estado activo de la navegacion en cada ruta.
- Identidad de sesion visible como resumen y campos internos ocultos.
- Camara automatica en Registro con permisos concedidos y sin boton de activacion adicional.

## Limites de la prueba

- Los permisos se validaron con camara y geolocalizacion simuladas por el navegador de pruebas.
- No se guardaron asistencias reales.
- La sesion administrativa autenticada se recorrio en modo lectura; no se crearon, editaron ni eliminaron datos.
- No se completo una entrada o salida porque requiere permisos de camara, ubicacion y una captura facial valida.
