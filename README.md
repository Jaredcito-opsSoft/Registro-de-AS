# Sistema Web de Asistencia con Foto y QR de Salida

Prototipo web sencillo para registrar entrada y salida con evidencia fotografica,
validacion por horario, historial en modo lectura y acciones administrativas
protegidas por clave.

## Como ejecutarlo

Opcion rapida:

1. Abre `index.html` en Chrome, Edge o Firefox.
2. Permite el acceso a la camara cuando el navegador lo solicite.

Opcion recomendada para camara:

1. Abre la carpeta en VS Code.
2. Usa Live Server o ejecuta un servidor local.
3. Abre la URL local en el navegador.

## Funciones incluidas

- Registro de entrada con foto, nombre, matricula, fecha y hora automatica.
- Registro de salida con matricula, foto de salida y QR vigente.
- QR disponible de 4:30 p. m. a 5:10 p. m.
- Modo prueba para habilitar la salida fuera del horario real.
- Evita duplicar registros por matricula y fecha.
- Tabla con miniaturas de evidencia en modo solo lectura.
- Persistencia en LocalStorage.
- Exportacion a CSV compatible con Excel.
- Clave administrativa simple para acciones sensibles.
- Auditoria basica de exportaciones, limpiezas, eliminaciones y observaciones.

## Seguridad del prototipo

La vista de registros es de consulta para usuarios generales. Las acciones de
exportar, limpiar datos, eliminar registros y editar observaciones requieren la
clave administrativa del prototipo:

```text
ADMIN123
```

La clave esta definida como constante en `app.js` para mantener el MVP simple,
sin login completo ni backend.

## Nota para demostracion

El QR se genera con un servicio externo de imagen. Si no hay internet, el boton
"Abrir registro de salida" sigue disponible cuando el horario o el modo prueba
estan activos.
