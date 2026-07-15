# Rediseno azul de CheckIn App

## Objetivo

Unificar la interfaz con una familia azul suave, luminosa y tecnologica. La aplicacion conserva fondos neutros, tarjetas blancas y colores semanticos solo para estados reales.

## Paleta oficial

| Uso | Token | Valor |
| --- | --- | --- |
| Azul principal | `--color-primary` | `#5F86A6` |
| Azul activo | `--color-primary-strong` | `#456A89` |
| Azul secundario | `--color-primary-secondary` | `#7EA4C1` |
| Azul suave | `--color-primary-soft` | `#E8F0F6` |
| Azul muy suave | `--color-primary-faint` | `#F3F7FA` |
| Fondo | `--color-background` | `#F6F8FA` |
| Superficie | `--color-surface` | `#FFFFFF` |
| Borde | `--color-border` | `#DCE5EC` |
| Texto | `--color-text` | `#1F2937` |
| Exito | `--color-success` | `#2F9E73` |
| Advertencia | `--color-warning` | `#D5A13B` |
| Error | `--color-danger` | `#C95D63` |

## Aplicacion

- La tarjeta de hora usa azul principal, texto blanco y un indicador verde para el estado en vivo.
- El desglose usa azul para totales, verde para completos y ambar para pendientes.
- La navegacion inferior mantiene iconos de 22 px, texto de 11 px y una superficie azul suave para la vista activa.
- Los botones principales usan azul principal; los secundarios usan azul suave y texto azul oscuro.
- Los formularios usan fondo blanco, borde azul grisaceo y foco azul.
- Perfil y Mis registros comparten tarjetas blancas, iconos azules y estados semanticos.

## Elementos sin funcion eliminados

Se elimino el control decorativo de tres puntos del encabezado de Desglose de registros. Los controles de navegacion, camara, ubicacion, QR, entrada, salida, registros y perfil se conservaron porque tienen una accion real.

## Accesibilidad y responsive

Se conservan `aria-label`, `aria-current`, focos visibles, areas tactiles de al menos 44 px y soporte para movimiento reducido. La revision visual cubre 320, 375, 390, 430, 768 y 1024 px sin desplazamiento horizontal.

## Pruebas

Se ejecutan `node --check` para JavaScript, `git diff --check` y una revision visual de Inicio, Entrada, Salida y Perfil. No existe `package.json`, por lo que el repositorio no ofrece comandos npm de lint o build.

## Pendientes

Validar tablas administrativas con una sesion autenticada y datos de prueba completos.
