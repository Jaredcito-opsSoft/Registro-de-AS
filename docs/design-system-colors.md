# Sistema de color de Asistencia QR

## Objetivo

Mantener una interfaz de asistencia clara y operativa con una sola familia violeta suave y colores semanticos reservados para estados reales.

## Paleta oficial

| Uso | Token | Valor |
| --- | --- | --- |
| Estructura | `--color-primary` | `#746F9F` |
| Estructura activa | `--color-primary-strong` | `#514C76` |
| Violeta secundario | `--color-primary-secondary` | `#918CB5` |
| Superficie estructural suave | `--color-primary-soft` | `#F0EEF7` |
| Exito | `--color-success` | `#42C55E` |
| Advertencia | `--color-warning` | `#F59E0B` |
| Error | `--color-danger` | `#EF4444` |
| Fondo | `--color-background` | `#F8F7FB` |
| Superficie | `--color-surface` | `#FFFFFF` |
| Borde | `--color-border` | `#E3E0EB` |

## Uso

- El violeta suave organiza navegacion, cabeceras, tarjeta de hora, iconos, botones y formularios.
- El violeta oscuro identifica estados activos y acciones principales.
- El verde se usa en estados activos, completos y exitosos.
- El ambar comunica advertencias o pendientes; el rojo oscuro, errores o acciones destructivas.
- Fondos y tarjetas usan neutros claros; no se usan gradientes decorativos en la interfaz operativa.

## Componentes modificados

Se actualizaron tokens globales, navegacion movil, tarjeta de hora, botones, entradas de formulario, estados, perfil, login, tarjetas de registros y superficies administrativas.

## Accesibilidad

Los estados mantienen texto descriptivo ademas del color. Los focos usan un anillo violeta y los campos conservan contraste entre fondo, texto, borde y placeholder.

## Pruebas realizadas

Se verifican visualmente Inicio, navegacion movil, Entrada, Salida y Perfil en el servidor local. Las comprobaciones de sintaxis se realizan con `node --check`; este repositorio no incluye `package.json` para ejecutar lint o build.

## Pendientes

Revisar la paleta con una sesion administrativa autenticada cuando haya datos de prueba disponibles, para validar todos los estados de tablas y directorios.
