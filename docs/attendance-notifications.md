# Notificaciones de entrada y salida

## Alcance implementado

La PWA evalua recordatorios mientras esta abierta o instalada y en ejecucion. Puede mostrar un aviso interno y, si el usuario lo autoriza desde Perfil, una notificacion del sistema. No se afirma soporte con la aplicacion cerrada: para eso se necesita push remoto, suscripciones Web Push y un programador seguro en backend.

## Fuente del horario

La resolucion usa esta prioridad:

1. Horario o turno individual, si el contrato del usuario lo expone.
2. Horario del sitio asignado al usuario.
3. Horario de la organizacion, si existe.
4. Si no existe una fuente verificable, no se envia ningun recordatorio.

La zona horaria se resuelve desde horario, sitio, organizacion, sistema y dispositivo, en ese orden. Las ventanas actuales de `sitios` (`hora_entrada_inicio/fin` y `hora_salida_inicio/fin`) son la fuente efectiva. El fin de cada ventana es el momento de recordatorio y ya representa la tolerancia configurada por el operador.

## Calendario laboral pendiente

El esquema y el RPC `get_active_site()` actuales no exponen dias laborables, feriados ni excepciones. El motor acepta `dias_laborales` y `excepciones` cuando se incluyan en el sitio, organizacion o su objeto `configuracion`, pero mientras ese dato no exista el estado es `calendar-not-configured` y no se notificara. Esto evita inventar lunes a viernes o enviar avisos en descansos.

Para habilitar recordatorios reales en produccion, backend debe exponer de forma segura:

- `dias_laborales`: arreglo ISO de 1 (lunes) a 7 (domingo).
- `excepciones`: fechas `YYYY-MM-DD` sin jornada.
- Opcionalmente un turno individual con las mismas cuatro horas y zona horaria.

## Reglas

- Entrada: despues de `hora_entrada_fin`, solo si no hay entrada del usuario para la fecha operativa.
- Salida: despues de `hora_salida_fin`, solo si existe entrada y no existe salida.
- Maximo dos intentos por tipo, separados por 30 minutos.
- La clave de deduplicacion es `usuario:organizacion:fecha:tipo:intento` y se conserva en `localStorage`.
- Las jornadas nocturnas asignan la salida posterior a medianoche a la fecha de inicio del turno.
- Al registrar entrada o salida, la siguiente evaluacion cancela el aviso que ya no corresponde.

## Preferencias y privacidad

La preferencia se guarda por usuario en el dispositivo. El permiso del navegador solo se solicita mediante una accion explicita en Perfil. Desactivar el interruptor detiene avisos de esta app, aunque el permiso del sistema permanezca concedido.

## Pruebas locales

Ejecutar:

```powershell
node tools/notification-rules.test.cjs
```

Las pruebas cubren prioridad del sitio, entrada pendiente, salida pendiente, registro completo, limite de intentos, deduplicacion, calendario ausente, excepciones y jornada nocturna.
