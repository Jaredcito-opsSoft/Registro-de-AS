(function attachAttendanceNotificationRules(globalScope) {
  "use strict";

  const DAY_ALIASES = {
    0: 7,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    domingo: 7,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
  };

  function timeToMinutes(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return (hours * 60) + minutes;
  }

  function normalizeDays(value) {
    if (!Array.isArray(value)) return null;
    const days = value
      .map((day) => DAY_ALIASES[String(day).trim().toLowerCase()])
      .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
    return days.length ? [...new Set(days)] : null;
  }

  function scheduleCandidate(source, label) {
    if (!source || typeof source !== "object") return null;
    const config = source.configuracion && typeof source.configuracion === "object"
      ? source.configuracion
      : {};
    const entryStart = source.hora_entrada_inicio || source.entry_start || config.hora_entrada_inicio;
    const entryEnd = source.hora_entrada_fin || source.entry_end || config.hora_entrada_fin;
    const exitStart = source.hora_salida_inicio || source.exit_start || config.hora_salida_inicio;
    const exitEnd = source.hora_salida_fin || source.exit_end || config.hora_salida_fin;
    if ([entryStart, entryEnd, exitStart, exitEnd].some((value) => timeToMinutes(value) === null)) return null;
    const workdays = normalizeDays(source.dias_laborales || source.workdays || config.dias_laborales || config.workdays);
    const exceptions = Array.isArray(source.excepciones || config.excepciones)
      ? (source.excepciones || config.excepciones).map(String)
      : [];
    return {
      source: label,
      entryStart: String(entryStart).slice(0, 5),
      entryEnd: String(entryEnd).slice(0, 5),
      exitStart: String(exitStart).slice(0, 5),
      exitEnd: String(exitEnd).slice(0, 5),
      timezone: source.zona_horaria || source.timezone || config.zona_horaria || config.timezone || "",
      workdays,
      exceptions,
      calendarConfigured: Boolean(workdays),
    };
  }

  function resolveSchedule({ user, site, organization, systemTimezone, deviceTimezone } = {}) {
    const individual = scheduleCandidate(user?.turno || user?.horario || user?.schedule, "individual");
    const siteSchedule = scheduleCandidate(site, "site");
    const organizationSchedule = scheduleCandidate(organization, "organization");
    const schedule = individual || siteSchedule || organizationSchedule;
    if (!schedule) return { configured: false, reason: "schedule-not-configured" };
    return {
      ...schedule,
      configured: true,
      timezone: schedule.timezone
        || site?.zona_horaria
        || organization?.zona_horaria
        || systemTimezone
        || deviceTimezone
        || "UTC",
    };
  }

  function zonedParts(date, timezone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(date);
    const value = (type) => parts.find((part) => part.type === type)?.value || "";
    const weekdayNames = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return {
      date: `${value("year")}-${value("month")}-${value("day")}`,
      minute: (Number(value("hour")) * 60) + Number(value("minute")),
      weekday: weekdayNames[value("weekday")],
    };
  }

  function previousIsoDate(isoDate) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function previousWeekday(day) {
    return day === 1 ? 7 : day - 1;
  }

  function getShiftMoment(now, schedule) {
    const local = zonedParts(now, schedule.timezone);
    const entryDeadline = timeToMinutes(schedule.entryEnd);
    let exitDeadline = timeToMinutes(schedule.exitEnd);
    const crossesMidnight = exitDeadline <= entryDeadline;
    let minute = local.minute;
    let shiftDate = local.date;
    let shiftWeekday = local.weekday;
    if (crossesMidnight) {
      exitDeadline += 1440;
      if (minute < timeToMinutes(schedule.entryStart)) {
        minute += 1440;
        shiftDate = previousIsoDate(local.date);
        shiftWeekday = previousWeekday(local.weekday);
      }
    }
    return { ...local, minute, shiftDate, shiftWeekday, entryDeadline, exitDeadline, crossesMidnight };
  }

  function isScheduledWorkday(schedule, moment) {
    if (!schedule.calendarConfigured || !schedule.workdays) return false;
    if (!schedule.workdays.includes(moment.shiftWeekday)) return false;
    return !schedule.exceptions.includes(moment.shiftDate);
  }

  function decideReminder({ now = new Date(), schedule, attendance, sentAttempts = {}, maxAttempts = 2, repeatMinutes = 30 } = {}) {
    if (!schedule?.configured) return { type: null, reason: "schedule-not-configured" };
    if (!schedule.calendarConfigured) return { type: null, reason: "calendar-not-configured" };
    const moment = getShiftMoment(now, schedule);
    if (!isScheduledWorkday(schedule, moment)) return { type: null, reason: "not-a-workday", moment };

    const hasEntry = Boolean(attendance?.horaEntrada || attendance?.entryAt);
    const hasExit = Boolean(attendance?.horaSalida || attendance?.exitAt);
    const candidates = [
      { type: "entry", pending: !hasEntry, deadline: moment.entryDeadline },
      { type: "exit", pending: hasEntry && !hasExit, deadline: moment.exitDeadline },
    ];
    for (const candidate of candidates) {
      if (!candidate.pending) continue;
      const attempts = Number(sentAttempts[candidate.type] || 0);
      if (attempts >= maxAttempts) return { type: null, reason: "attempt-limit", moment };
      const dueAt = candidate.deadline + (attempts * repeatMinutes);
      if (moment.minute >= dueAt) {
        return { type: candidate.type, attempt: attempts + 1, shiftDate: moment.shiftDate, moment };
      }
    }
    return { type: null, reason: "not-due", moment };
  }

  function dedupeKey({ userId, organizationId, date, type, attempt }) {
    return [userId, organizationId, date, type, attempt].map((value) => String(value || "none")).join(":");
  }

  const api = { decideReminder, dedupeKey, getShiftMoment, normalizeDays, resolveSchedule, timeToMinutes, zonedParts };
  globalScope.AttendanceNotificationRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
