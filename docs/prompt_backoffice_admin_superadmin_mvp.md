# Prompt guia para evolucionar el backoffice Admin/Superadmin MVP

## Rol del agente

Actua como senior fullstack product engineer + security-minded UI/UX engineer.

Debes evolucionar el backoffice de la Web App/PWA `CheckIn App` sin rehacer el proyecto desde cero. El objetivo es convertir el panel actual en un MVP administrativo claro, usable y alineado al Plan Maestro: multiempresa, roles, sitios, usuarios, keys de acceso, asistencias, evidencia y auditoria.

## Contexto del proyecto

Repositorio:

- `Jaredcito-opsSoft/Registro-de-AS`

Ruta local:

- `C:\Users\LG\Downloads\Registro AS\Registro-de-AS`

Stack actual:

- `index.html`
- `styles.css`
- `app.js`
- `auth.js`
- `service-worker.js`
- `manifest.webmanifest`
- Supabase Auth
- Supabase Database
- Supabase Storage
- Deploy en Vercel

La app ya tiene:

- Login/registro.
- Supabase Auth.
- Roles base.
- Registro de entrada/salida.
- Foto/camara.
- GPS.
- Validacion facial ligera.
- Mis registros.
- Panel Admin/Superadmin inicial.
- Organizaciones/sitios en etapa MVP.
- Service Worker/PWA.

## Regla principal

No rehacer el proyecto.

Trabajar incrementalmente sobre el codigo actual, sin romper:

- login;
- registro;
- sesion;
- entrada;
- salida;
- camara;
- GPS;
- validacion facial;
- mis registros;
- PWA;
- service worker;
- Supabase Auth;
- datos existentes.

## Objetivo del backoffice MVP

Crear un panel administrativo claro con tres experiencias separadas:

1. `superadmin`
2. `admin`
3. `usuario`

Cada rol debe ver solo lo que le corresponde.

El panel debe permitir, en escala MVP:

- Superadmin crea organizaciones.
- Superadmin crea o registra sitios.
- Superadmin genera o asigna keys de acceso.
- Superadmin puede crear/asignar admins a una organizacion/sitio.
- Admin usa una key entregada por superadmin para administrar su sitio.
- Admin configura su sitio y usuarios.
- Usuario registra asistencia y consulta solo sus registros.

## Roles oficiales del MVP

### Usuario

Puede:

- Registrar entrada.
- Registrar salida.
- Ver sus propios registros.
- Ver su evidencia propia cuando este permitido.
- Ver su perfil.

No puede:

- Ver Admin.
- Ver usuarios de otros sitios.
- Ver registros de otros usuarios.
- Crear sitios.
- Crear organizaciones.
- Exportar informacion global.

### Admin de sitio

Representa a una empresa, escuela, negocio o sitio especifico.

Puede:

- Entrar al panel Admin.
- Ver resumen de su sitio.
- Ver usuarios de su sitio.
- Ver registros de su sitio.
- Configurar datos del sitio si tiene permiso:
  - nombre;
  - direccion;
  - coordenadas;
  - radio GPS;
  - horarios;
  - zona horaria;
  - reglas operativas basicas.
- Invitar o registrar usuarios de su sitio si el MVP lo permite.
- Consultar evidencia de usuarios de su sitio.
- Exportar registros de su sitio si tiene permiso.

No puede:

- Ver todas las organizaciones.
- Ver todos los sitios.
- Crear superadmins.
- Administrar otros sitios.
- Cambiar politicas globales.
- Ver registros de otra empresa/escuela/sitio.

### Superadmin

Es el administrador central del ecosistema.

Puede:

- Ver todo.
- Crear organizaciones.
- Crear sitios.
- Generar keys de acceso.
- Asignar admins a organizaciones o sitios.
- Ver usuarios por sitio.
- Ver asistencias globales.
- Ver auditoria global.
- Activar/desactivar organizaciones.
- Activar/desactivar sitios.
- Configurar parametros globales MVP.

Debe poder responder rapidamente:

- Que organizaciones existen.
- Que sitios existen.
- Que admin administra cada sitio.
- Cuantos usuarios tiene cada sitio.
- Cuantos registros hay por sitio.
- Que usuarios no tienen sitio.
- Que sitios no tienen key.
- Que admins no tienen sitio asignado.

## Concepto de Organizacion, Sitio y Key

### Organizacion

Responde:

> A que empresa, escuela, negocio o institucion pertenece el sistema?

Ejemplos:

- Colegio Central
- CelLab
- Hub Tech
- Restaurante La Plaza

Campos MVP:

- `id`
- `nombre`
- `tipo`
- `slug`
- `clave_acceso` o `org_key`
- `estado`
- `created_at`

### Sitio

Responde:

> Desde que ubicacion fisica se registran asistencias?

Ejemplos:

- CelLab Tuxtla
- Hub Tech Principal
- Planta Norte
- Campus Centro

Campos MVP:

- `id`
- `organizacion_id`
- `nombre`
- `direccion`
- `latitud`
- `longitud`
- `radio_metros`
- `zona_horaria`
- `entrada_inicio`
- `entrada_fin`
- `salida_inicio`
- `salida_fin`
- `site_key`
- `estado`
- `admin_user_id` o relacion equivalente

### Key de acceso

La key es una llave operativa que entrega el superadmin.

Debe servir para:

- Asociar un admin a una organizacion/sitio.
- Permitir registro de usuarios dentro de una organizacion/sitio.
- Evitar que usuarios se registren en sitios incorrectos.

Tipos sugeridos:

- `org_key`: llave de organizacion.
- `site_key`: llave de sitio.
- `admin_invite_key`: llave para convertir/asignar un admin.

Reglas MVP:

- Solo superadmin puede generar o regenerar keys.
- Admin puede ver la key de su sitio si el plan lo permite, pero no crear keys globales.
- Usuario normal no ve keys.
- Las keys no deben ser passwords.
- Las keys deben poder rotarse.
- En produccion deben manejarse en backend/RLS/RPC, no como secreto real en frontend.

## Flujo esperado: Superadmin crea sitio y entrega key a admin

1. Superadmin entra al panel.
2. Abre seccion `Organizaciones`.
3. Crea o selecciona una organizacion.
4. Abre seccion `Sitios y horarios`.
5. Crea un sitio:
   - nombre;
   - direccion;
   - coordenadas;
   - radio;
   - horarios;
   - zona horaria.
6. El sistema genera o permite definir `site_key`.
7. Superadmin crea/asigna un admin:
   - correo;
   - nombre;
   - organizacion;
   - sitio;
   - rol `admin`.
8. El admin inicia sesion o se registra usando la key.
9. El admin ve solo su sitio.
10. Usuarios normales se registran usando la key de organizacion/sitio.

## Flujo esperado: Admin administra su sitio

1. Admin inicia sesion.
2. Entra directamente al panel Admin.
3. Ve resumen de su sitio:
   - usuarios;
   - registros de hoy;
   - pendientes de salida;
   - incidencias GPS/facial;
   - horarios configurados.
4. Puede editar datos permitidos de su sitio.
5. Puede ver usuarios del sitio.
6. Puede ver asistencias del sitio.
7. No puede ver datos de otros sitios.

## Flujo esperado: Usuario

1. Usuario se registra o inicia sesion.
2. Debe quedar asociado a una organizacion/sitio.
3. Registra entrada/salida.
4. Ve solo sus propios registros.
5. No ve Admin.

## Backoffice visual MVP

El panel Admin/Superadmin debe dividirse en secciones reales:

### 1. Resumen

Debe mostrar:

- total de registros visibles;
- asistencias de hoy;
- usuarios por sitio;
- pendientes de salida;
- alertas GPS/facial;
- sitios sin admin;
- usuarios sin sitio;
- accesos rapidos.

Para superadmin:

- vista global.

Para admin:

- solo su sitio.

### 2. Organizaciones

Superadmin:

- lista de organizaciones;
- crear organizacion;
- editar estado basico;
- ver cantidad de sitios, usuarios y asistencias;
- ver/generar `org_key`.

Admin:

- solo ve su organizacion en modo lectura o edicion limitada.

### 3. Sitios y horarios

Superadmin:

- lista de sitios por organizacion;
- crear sitio;
- asignar admin;
- generar/regenerar `site_key`;
- activar/desactivar sitio.

Admin:

- ver su sitio;
- editar ubicacion, radio y horarios si tiene permiso;
- no cambiar organizacion ni asignar otros admins.

### 4. Usuarios

Superadmin:

- ver todos los usuarios;
- filtrar por organizacion/sitio;
- asignar rol;
- asignar sitio;
- ver usuarios sin sitio;
- crear/invitar admin.

Admin:

- ver usuarios de su sitio;
- no ver usuarios de otros sitios;
- no asignar superadmin;
- puede registrar o invitar usuarios si el MVP lo habilita.

### 5. Asistencias

Superadmin:

- ver registros globales;
- filtrar por organizacion/sitio/usuario/estado/riesgo/fecha;
- ver evidencia;
- exportar si aplica.

Admin:

- ver registros de su sitio;
- ver evidencia de su sitio;
- exportar su sitio si aplica.

Usuario:

- no usa esta seccion admin.

### 6. Auditoria

Superadmin:

- auditoria global.

Admin:

- auditoria de su sitio.

Usuario:

- no ve auditoria.

## Estado actual detectado

El panel ya tiene piezas iniciales:

- dashboard operativo;
- asistencia global;
- organizacion principal;
- sitio activo;
- usuarios por sitio derivado de registros;
- formularios de organizacion/sitio;
- auditoria.

Pero todavia falta:

- separar claramente admin vs superadmin;
- flujo claro para generar/asignar key;
- flujo claro para crear/asignar admin;
- vista de usuarios como seccion propia;
- filtros admin moviles;
- mejorar labels/copy;
- que la UI explique que parte es MVP y que parte requiere backend/RLS.

## Reglas de implementacion rapida

Prioridad para sacar MVP rapido:

1. No bloquear asistencia.
2. No romper login.
3. No romper Admin visible para superadmin.
4. Separar secciones.
5. Agregar UI de keys y asignacion admin aunque algunas acciones sean preparadas/MVP.
6. Si backend no esta listo, mostrar estado:
   - `Preparado para conectar con Supabase`
   - `Pendiente de RPC/RLS`
   - `Accion MVP local`
7. No simular seguridad real en frontend.
8. Toda accion sensible debe quedar marcada como pendiente de backend si no existe RPC.

## Criterios de aceptacion MVP

### Superadmin

- Entra y ve `Admin`.
- En Admin ve secciones:
  - Resumen;
  - Organizaciones;
  - Sitios y horarios;
  - Usuarios;
  - Asistencias;
  - Auditoria.
- Puede ver usuarios por sitio.
- Puede identificar usuarios sin sitio.
- Puede ver/generar/copiar keys en UI MVP.
- Puede crear sitio si backend lo permite.
- Si backend no lo permite, la UI debe decir que falta RPC/RLS.

### Admin

- Entra y ve Admin.
- Solo ve su sitio/organizacion.
- No ve datos globales.
- No ve controles superadmin.
- Puede configurar su sitio si tiene permiso.

### Usuario

- No ve Admin.
- Ve solo sus registros.
- Puede registrar entrada/salida.

## Validaciones obligatorias por cambio

Siempre ejecutar:

```bash
node --check app.js
node --check auth.js
node --check service-worker.js
git diff --check
```

Siempre verificar local:

- servidor responde 200;
- login superadmin;
- Admin visible;
- secciones Admin cambian;
- usuario normal no ve Admin;
- mobile 390px sin overflow;
- desktop no rompe.

## Prompt de ejecucion para el siguiente cambio

Implementa el siguiente incremento del backoffice MVP:

1. Crear seccion real `Usuarios`.
2. Mostrar usuarios agrupados por sitio.
3. Mostrar usuarios sin sitio.
4. Agregar card MVP para `Asignar admin a sitio`.
5. Agregar campo/accion visual para copiar o regenerar `site_key`.
6. No tocar RLS/RPC si no es necesario.
7. Si una accion requiere backend, dejar mensaje claro:
   `Pendiente de RPC segura en Supabase`.
8. Validar con superadmin y usuario normal.
