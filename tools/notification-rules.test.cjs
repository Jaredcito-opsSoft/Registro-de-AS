const assert = require("node:assert/strict");
const rules = require("../notification-rules.js");

const site = {
  hora_entrada_inicio: "08:00",
  hora_entrada_fin: "08:15",
  hora_salida_inicio: "17:00",
  hora_salida_fin: "17:15",
  zona_horaria: "America/Mexico_City",
  configuracion: { dias_laborales: [1, 2, 3, 4, 5] },
};

const schedule = rules.resolveSchedule({ site, deviceTimezone: "UTC" });
assert.equal(schedule.source, "site");
assert.equal(schedule.timezone, "America/Mexico_City");
assert.deepEqual(schedule.workdays, [1, 2, 3, 4, 5]);

const mondayLate = new Date("2026-07-13T14:20:00Z");
assert.equal(rules.decideReminder({ now: mondayLate, schedule, attendance: {} }).type, "entry");
assert.equal(rules.decideReminder({ now: mondayLate, schedule, attendance: { horaEntrada: "08:03" } }).reason, "not-due");

const mondayExitLate = new Date("2026-07-13T23:20:00Z");
assert.equal(rules.decideReminder({ now: mondayExitLate, schedule, attendance: { horaEntrada: "08:03" } }).type, "exit");
assert.equal(rules.decideReminder({ now: mondayExitLate, schedule, attendance: { horaEntrada: "08:03", horaSalida: "17:04" } }).reason, "not-due");

assert.equal(rules.decideReminder({ now: mondayLate, schedule, attendance: {}, sentAttempts: { entry: 2 } }).reason, "attempt-limit");
assert.equal(rules.dedupeKey({ userId: "u1", organizationId: "o1", date: "2026-07-13", type: "entry", attempt: 1 }), "u1:o1:2026-07-13:entry:1");

const noCalendar = rules.resolveSchedule({ site: { ...site, configuracion: {} } });
assert.equal(rules.decideReminder({ now: mondayLate, schedule: noCalendar, attendance: {} }).reason, "calendar-not-configured");

const holiday = rules.resolveSchedule({ site: { ...site, configuracion: { dias_laborales: [1, 2, 3, 4, 5], excepciones: ["2026-07-13"] } } });
assert.equal(rules.decideReminder({ now: mondayLate, schedule: holiday, attendance: {} }).reason, "not-a-workday");

const night = rules.resolveSchedule({ site: {
  hora_entrada_inicio: "21:30",
  hora_entrada_fin: "22:00",
  hora_salida_inicio: "05:30",
  hora_salida_fin: "06:00",
  zona_horaria: "UTC",
  configuracion: { dias_laborales: [1] },
} });
const tuesdayAfterNightShift = new Date("2026-07-14T06:10:00Z");
const nightDecision = rules.decideReminder({ now: tuesdayAfterNightShift, schedule: night, attendance: { horaEntrada: "21:45" } });
assert.equal(nightDecision.type, "exit");
assert.equal(nightDecision.shiftDate, "2026-07-13");

console.log("notification-rules: 12 assertions passed");
