# Avatar local y reloj de CheckIn App

## Cambios realizados

- Se agrego un avatar circular en la esquina superior derecha del encabezado.
- El avatar superior es un boton directo a la vista Perfil y no abre menus flotantes.
- Agregar, cambiar y quitar foto se realiza exclusivamente dentro de la tarjeta de identidad de Perfil.
- Se conserva la tarjeta violeta del reloj con icono circular, hora real y fecha localizada.
- El encabezado usa una cuadricula mobile-first para mantener titulo, avatar y chips sin superposiciones.

## Foto local

La seleccion usa un `input type="file"` con `accept="image/*"`. El archivo se valida como imagen y se limita a 5 MB antes de crear una vista previa con `URL.createObjectURL(file)`.

El archivo se guarda por usuario en IndexedDB dentro del dispositivo. No se usa Supabase, Storage, `fetch`, una API de carga ni el modelo remoto de usuario. Cada carga crea un Object URL temporal que se revoca al cambiar la foto, quitarla, detectar un error o cerrar la pagina.

Si no hay foto valida, el encabezado muestra un icono violeta y Perfil muestra las iniciales reales. Al seleccionar una foto, el mismo Object URL actualiza ambas vistas. Quitar foto restaura inmediatamente ambos fallbacks.

## Tarjeta del reloj

- Fondo solido `#746F9F`.
- Icono de reloj dentro de un circulo blanco al 92 por ciento.
- Hora tabular obtenida por el intervalo existente en `updateHeaderStatus`.
- Fecha real formateada con `toLocaleDateString("es-MX")` y la zona horaria operativa.
- Sin texto o indicador EN VIVO para reducir ruido visual.

## Accesibilidad

- El avatar superior usa un `button` con `aria-label="Ir a perfil"` y la navegacion existente `data-target="profile"`.
- El input de archivo queda visualmente oculto sin usar `display: none`.
- Las acciones tienen al menos 44 px de altura.
- La imagen tiene texto alternativo y los iconos decorativos usan `aria-hidden`.

## Archivos y componentes

- `index.html`: boton de avatar, editor dentro de Perfil, input local y versionado de recursos.
- `styles.css`: avatar superior, editor de Perfil y layout responsive.
- `app.js`: persistencia IndexedDB por usuario, validacion, sincronizacion de vistas, eliminacion y liberacion del Object URL.

## Pruebas

- Smoke visual completado en 320, 375, 390, 430, 768 y 1024 px sin desborde del encabezado, avatar, reloj o pagina.
- El avatar superior abre Perfil sin menu intermedio.
- Se verificaron el input `image/*`, el fallback inicial, la recarga persistente y el estado deshabilitado de Quitar foto sin imagen.
- `node --check app.js` y `node --check auth.js` completados sin errores.
- El repositorio no incluye `package.json`; no hay scripts disponibles para `npm run lint` o `npm run build`.

## Limite

La foto permanece solo en el navegador y dispositivo donde fue seleccionada. Todavia no se sincroniza entre dispositivos ni se guarda en Storage.
