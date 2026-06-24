# Sistema Web de Asistencia con Foto y QR de Salida

Prototipo web para registrar entrada y salida con evidencia fotografica, QR de
salida por horario, historial global y acciones administrativas protegidas.

## Como ejecutarlo

Opcion recomendada:

1. Abre la carpeta en VS Code.
2. Usa Live Server o ejecuta un servidor local.
3. Abre la URL local en Chrome, Edge o Firefox.
4. Permite el acceso a la camara.

Tambien puede desplegarse como sitio estatico en Vercel.

## Lista global con Supabase

La app ya no depende solo de LocalStorage. Usa Supabase para compartir la lista
entre dispositivos:

- Tabla: `public.asistencias`
- Bucket: `evidencias-asistencia`
- Configuracion frontend: `supabase-config.js`

Las fotos se suben al bucket y la tabla guarda las URLs publicas.

## Funciones incluidas

- Registro de entrada con foto, nombre, matricula, fecha y hora automatica.
- Registro de salida con matricula, foto de salida y QR vigente.
- QR disponible de 4:30 p. m. a 5:10 p. m.
- Modo prueba para habilitar la salida fuera del horario real.
- Evita duplicar registros por matricula y fecha.
- Tabla global con miniaturas de evidencia.
- Exportacion a CSV compatible con Excel.
- Clave administrativa simple para acciones sensibles.
- Auditoria local basica de exportaciones, limpiezas, eliminaciones y observaciones.

## Seguridad del prototipo

La vista de registros es de consulta para usuarios generales. Las acciones de
exportar, limpiar datos, eliminar registros y editar observaciones requieren la
clave administrativa del prototipo:

```text
ADMIN123
```

Esta clave sigue siendo una proteccion de MVP. Para produccion real conviene
mover administracion a Supabase Auth, roles y funciones Edge.

## Nota tecnica

El archivo `supabase-schema.sql` documenta la estructura aplicada en Supabase.
La app conserva una copia local de lectura como respaldo, pero el flujo normal
usa Supabase como fuente global.
