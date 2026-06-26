# Sistema Web de Asistencia con Foto, QR y Validacion Facial Ligera

Prototipo web para registrar entrada y salida con evidencia fotografica, QR de
salida por horario, historial global y acciones administrativas protegidas.

Esta version agrega una validacion facial ligera: compara la foto de entrada con
la foto de salida de la misma matricula y fecha. No es biometria empresarial ni
login avanzado; es una ayuda de auditoria para detectar salidas dudosas.

## Como ejecutarlo

Opcion recomendada:

1. Abre la carpeta en VS Code.
2. Usa Live Server o ejecuta un servidor local.
3. Abre la URL local en Chrome, Edge o Firefox.
4. Permite el acceso a la camara.

Tambien puede desplegarse como sitio estatico en Vercel. En produccion, Vercel
entrega HTTPS, requerido por los navegadores para activar camara.

## Lista global con Supabase

La app usa Supabase para compartir la lista entre dispositivos:

- Tabla: `public.asistencias`
- Bucket: `attendance-photos`
- Configuracion frontend: `supabase-config.js`

Las fotos se guardan con estructura:

```text
attendance-photos/YYYY-MM-DD/MATRICULA/entrada.jpg
attendance-photos/YYYY-MM-DD/MATRICULA/salida.jpg
```

## Validacion facial

La app carga `face-api.js` por CDN y sirve los modelos desde `models/`:

- `tiny_face_detector_model`
- `face_landmark_68_model`
- `face_recognition_model`

Reglas principales:

- Si no hay rostro, no se guarda la foto.
- Si hay mas de un rostro, no se guarda la foto.
- Si hay un rostro, se guarda el descriptor facial.
- En salida se compara descriptor de salida contra descriptor de entrada.
- Si la coincidencia es buena, queda `identidad_validada`.
- Si es dudosa, queda `revision_administrativa` y se guarda la salida.
- Si es mala, queda `fallida` y se marca para revision.

## Funciones incluidas

- Registro de entrada con foto, nombre, matricula, fecha y hora automatica.
- Deteccion de exactamente un rostro en entrada y salida.
- Registro de salida con matricula, foto de salida y QR vigente.
- Comparacion facial entre foto de entrada y foto de salida.
- QR disponible de 4:30 p. m. a 5:10 p. m.
- Modo prueba para habilitar la salida fuera del horario real.
- Evita duplicar registros por matricula y fecha.
- Tabla global con miniaturas, identidad, similitud y observaciones.
- Exportacion a CSV compatible con Excel.
- Clave administrativa simple para acciones sensibles.
- Auditoria local basica de exportaciones, limpiezas, eliminaciones y observaciones.

## Seguridad del prototipo

La vista de registros es de consulta para usuarios generales. Las acciones de
exportar, limpiar datos, eliminar registros y editar observaciones requieren la
clave administrativa del prototipo:

```text
[Tu contraseña]
```

Esta clave sigue siendo una proteccion del Proyecto. Para produccion real conviene, tú como usuario te conviene mover administracion a Supabase Auth, roles y funciones Edge.

No se usa `service_role_key` en frontend. La app usa una publishable key y RLS
con permisos por columnas para limitar inserciones de entrada y actualizaciones
de salida.

## Nota tecnica

El archivo `supabase-schema.sql` documenta la estructura aplicada en Supabase.
La app conserva una copia local de lectura como respaldo, pero el flujo normal
usa Supabase como fuente global.

## Refuerzo antifraude

La salida ahora se valida con varias capas desde Supabase, no desde la hora del navegador:

- Hora de servidor con zona `America/Mexico_City`.
- QR dinamico generado por RPC y con expiracion de servidor.
- Registro de entrada mediante `registrar_entrada_segura`.
- Registro de salida mediante `registrar_salida_segura`.
- GPS capturado en salida y evaluado en Supabase.
- Reto de vida sencillo antes de la foto de salida.
- Riesgo automatico: `normal`, `revision_ubicacion`, `revision_identidad`, `revision_qr`, `revision_horario`, `revision_multiple`, `sospechoso`.
- Historial y CSV con QR, ubicacion, precision, distancia, reto y alertas.

Los clientes anonimos ya no tienen permisos directos de `insert` o `update` sobre
`public.asistencias`; solo pueden leer registros. Las escrituras pasan por RPCs
con validaciones de servidor.

### Configurar sitio real

El HITO 1 agrega el panel administrativo **Configuracion del sitio** dentro de
Registros. Al desbloquear admin se puede guardar el sitio oficial, direccion,
coordenadas, radio permitido, horarios y zona horaria.

La fuente oficial ahora es `public.sitios`; `public.app_config` queda solo como
compatibilidad de migracion. Solo debe existir un sitio activo para el MVP.

Mientras el sitio activo no este configurado, la salida conserva la evidencia GPS
pero queda marcada para revision administrativa en lugar de `normal`.

La migracion del HITO 1 queda documentada en
`supabase-site-admin-migration.sql`.
