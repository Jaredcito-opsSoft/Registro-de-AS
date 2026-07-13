# Sistema visual violeta de Asistencia QR

## Direccion

Interfaz operativa mobile-first con fondo claro, superficies blancas y una identidad violeta sobria. La tarjeta de hora conserva el mayor peso visual; registros, estados y acciones mantienen una jerarquia compacta para uso frecuente desde telefono.

## Paleta y tokens

| Uso | Token | Valor |
| --- | --- | --- |
| Primario | `--color-primary` | `#746F9F` |
| Primario oscuro | `--color-primary-strong` | `#514C76` |
| Primario medio | `--color-primary-secondary` | `#918CB5` |
| Primario suave | `--color-primary-soft` | `#F0EEF7` |
| Fondo | `--color-background` | `#F8F7FB` |
| Superficie | `--color-surface` | `#FFFFFF` |
| Borde | `--color-border` | `#E3E0EB` |
| Texto principal | `--color-text` | `#23243A` |
| Texto secundario | `--color-text-secondary` | `#6D6F80` |
| Texto tenue | `--color-text-subtle` | `#9699AA` |
| Icono inactivo | `--color-icon-muted` | `#8E93A7` |
| Exito | `--color-success` | `#42C55E` |
| Advertencia | `--color-warning` | `#F59E0B` |
| Error | `--color-danger` | `#EF4444` |

Los colores semanticos se reservan para exito, advertencia y error. Las variantes suaves usan transparencia del mismo token, sin introducir colores decorativos adicionales.

## Tipografia y superficies

- Familia existente: Inter con Segoe UI y sans-serif como respaldo.
- Jerarquia basada en peso, contraste y espacio; no se cambia el tamano con el ancho del viewport.
- Tarjetas blancas, bordes discretos y sombras violetas de baja opacidad.
- Radios existentes conservados para evitar alterar geometria y comportamiento responsive.

## Componentes

- Tarjeta de hora: fondo violeta principal, texto blanco e indicador en vivo verde.
- Reloj de Inicio: etiqueta superior, indicador textual `EN VIVO`, icono circular lavanda, hora tabular y fecha larga localizada en espanol.
- Navegacion: cinco destinos existentes, activo violeta oscuro, fondo activo lavanda e iconos de 20 a 23 px.
- Botones: principal violeta oscuro, secundario blanco con borde violeta y terciario lavanda.
- Formularios: superficie blanca, borde neutro, foco violeta y estados de error semanticos.
- Perfil y registros: tarjetas blancas, separadores suaves e iconografia violeta.
- Chips: dimensiones consistentes; verde solo cuando el estado esta realmente activo.

## Responsive y accesibilidad

- La navegacion movil mantiene 68 px de alto y areas tactiles minimas de 44 px.
- El contenido reserva espacio inferior para que la navegacion no tape acciones ni formularios.
- Se conservan `aria-label`, `aria-current`, etiquetas visibles y foco por teclado.
- Los estados incluyen texto y no dependen exclusivamente del color.
- Se conserva el soporte existente para `prefers-reduced-motion`.

## Alcance

Solo se modifica presentacion en `styles.css`, la version de cache CSS en `index.html` y documentacion. No se modifican JavaScript, Auth, backend, Supabase, camara, geolocalizacion, QR, reconocimiento facial, persistencia ni permisos.

## Elementos eliminados

No se eliminaron controles funcionales en esta iteracion. La base local ya no muestra el menu decorativo del desglose ni el acceso rapido QR sin funcion.

## Pruebas

- `git diff --check`.
- `node --check app.js`.
- `node --check auth.js`.
- Smoke visual completado en las rutas Inicio, Entrada, Salida, Mis registros y Perfil.
- Sin desborde horizontal en 320, 375, 390 y 430 px; navegacion de 68 px y reserva inferior de 96 px.
- Filtros de registros y administracion ajustados a un area tactil minima de 44 px.
- Sin desborde horizontal adicional en 768 y 1024 px.
- La hora se verifico con actualizacion real entre dos lecturas consecutivas del intervalo existente.
- Entrada, Salida, Mis registros y Perfil conservaron su vista activa durante el smoke posterior al cambio del reloj.
- El repositorio no incluye `package.json`; no existen scripts `npm run lint` ni `npm run build`.
