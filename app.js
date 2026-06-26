const STORAGE_KEY = "registro_asistencia_qr_v1";
const DEMO_KEY = "registro_asistencia_demo_mode";
const ADMIN_LOG_KEY = "registro_asistencia_admin_log_v1";
const ADMIN_KEY = "ADMIN123";
const QR_START = { hour: 16, minute: 30 };
const QR_END = { hour: 17, minute: 10 };
const QR_VALID_MINUTES = 5;
const FACE_MODEL_URL = "models";
const DEFAULT_TIMEZONE = "America/Mexico_City";
const FACE_DISTANCE_STRONG = 0.46;
const FACE_DISTANCE_REVIEW = 0.62;
const LIFE_CHALLENGES = [
  "Mira a la izquierda",
  "Mira a la derecha",
  "Sonrie",
  "Levanta la mano derecha",
  "Levanta la mano izquierda",
  "Toca tu oreja",
  "Acercate ligeramente a la camara",
];
const SUPABASE = window.SUPABASE_CONFIG || {};
const CLOUD_ENABLED = Boolean(SUPABASE.url && SUPABASE.publishableKey && SUPABASE.bucket);
const PHOTO_BUCKET = SUPABASE.bucket || "attendance-photos";
const GEO_PRECISION_MAX_METERS = 200;

const state = {
  records: loadLocalRecords(),
  adminLog: loadAdminLog(),
  demoMode: localStorage.getItem(DEMO_KEY) === "true",
  isAdmin: false,
  entryPhoto: "",
  exitPhoto: "",
  entryStream: null,
  exitStream: null,
  qrToken: "",
  loadingRecords: false,
  facialModelsLoaded: false,
  facialModelsError: false,
  entryFace: null,
  exitFace: null,
  lifeChallenge: "",
  serverQr: null,
  serverClockOffset: 0,
  nextQrRefreshAt: 0,
  activeSite: null,
  adminLocation: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  clockLabel: $("#clockLabel"),
  qrWindowLabel: $("#qrWindowLabel"),
  qrMessage: $("#qrMessage"),
  qrBox: $("#qrBox"),
  qrImage: $("#qrImage"),
  qrDirectLink: $("#qrDirectLink"),
  qrTokenLabel: $("#qrTokenLabel"),
  demoMode: $("#demoMode"),
  toast: $("#toast"),
  faceStatus: $("#faceStatus"),
  entryFaceStatus: $("#entryFaceStatus"),
  exitFaceStatus: $("#exitFaceStatus"),
  lifeChallenge: $("#lifeChallenge"),
  entryLocationStatus: $("#entryLocationStatus"),
  locationStatus: $("#locationStatus"),
  entryVideo: $("#entryVideo"),
  entryCanvas: $("#entryCanvas"),
  entryPreview: $("#entryPreview"),
  startEntryCamera: $("#startEntryCamera"),
  takeEntryPhoto: $("#takeEntryPhoto"),
  entryForm: $("#entryForm"),
  entryName: $("#entryName"),
  entryMatricula: $("#entryMatricula"),
  exitGuard: $("#exitGuard"),
  exitVideo: $("#exitVideo"),
  exitCanvas: $("#exitCanvas"),
  exitPreview: $("#exitPreview"),
  startExitCamera: $("#startExitCamera"),
  takeExitPhoto: $("#takeExitPhoto"),
  exitForm: $("#exitForm"),
  exitMatricula: $("#exitMatricula"),
  recordsBody: $("#recordsBody"),
  emptyRecords: $("#emptyRecords"),
  unlockAdmin: $("#unlockAdmin"),
  lockAdmin: $("#lockAdmin"),
  exportCsv: $("#exportCsv"),
  clearRecords: $("#clearRecords"),
  adminStatus: $("#adminStatus"),
  adminAudit: $("#adminAudit"),
  totalRecords: $("#totalRecords"),
  completedRecords: $("#completedRecords"),
  pendingRecords: $("#pendingRecords"),
  siteStatusBadge: $("#siteStatusBadge"),
  siteStatusSummary: $("#siteStatusSummary"),
  siteNameLabel: $("#siteNameLabel"),
  siteAddressLabel: $("#siteAddressLabel"),
  siteCoordsLabel: $("#siteCoordsLabel"),
  siteRadiusLabel: $("#siteRadiusLabel"),
  siteEntryHoursLabel: $("#siteEntryHoursLabel"),
  siteExitHoursLabel: $("#siteExitHoursLabel"),
  siteTimezoneLabel: $("#siteTimezoneLabel"),
  sitePrecisionLabel: $("#sitePrecisionLabel"),
  siteTestResult: $("#siteTestResult"),
  siteForm: $("#siteForm"),
  siteName: $("#siteName"),
  siteAddress: $("#siteAddress"),
  siteLat: $("#siteLat"),
  siteLng: $("#siteLng"),
  siteRadius: $("#siteRadius"),
  siteEntryStart: $("#siteEntryStart"),
  siteEntryEnd: $("#siteEntryEnd"),
  siteExitStart: $("#siteExitStart"),
  siteExitEnd: $("#siteExitEnd"),
  siteTimezone: $("#siteTimezone"),
  siteActive: $("#siteActive"),
  useAdminLocation: $("#useAdminLocation"),
  testAdminLocation: $("#testAdminLocation"),
  evidenceModal: $("#evidenceModal"),
  evidenceBody: $("#evidenceBody"),
  closeEvidence: $("#closeEvidence"),
};

function loadLocalRecords() {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map(normalizeRecord);
  } catch {
    return [];
  }
}

function normalizeRecord(record) {
  return {
    bloqueado: true,
    observacion: "",
    observaciones: "",
    observacion_admin: "",
    modificado_por_admin: false,
    descriptorEntrada: null,
    descriptorSalida: null,
    rostroEntradaDetectado: false,
    rostroSalidaDetectado: false,
    similitudFacial: null,
    validacionIdentidad: "pendiente",
    metodoSalida: "",
    tokenQrUsado: "",
    serverTimeEntrada: "",
    serverTimeSalida: "",
    horarioValidado: false,
    horarioObservacion: "",
    qrValidado: false,
    qrObservacion: "",
    ubicacionValidada: false,
    latitudEntrada: null,
    longitudEntrada: null,
    precisionEntrada: null,
    distanciaEntradaMetros: null,
    ubicacionEntradaValidada: false,
    ubicacionEntradaObservacion: "",
    sitioEntradaId: "",
    sitioEntradaNombre: "",
    latitudSalida: null,
    longitudSalida: null,
    precisionSalida: null,
    distanciaSalidaMetros: null,
    ubicacionSalidaValidada: false,
    ubicacionSalidaObservacion: "",
    sitioSalidaId: "",
    sitioSalidaNombre: "",
    precisionUbicacion: null,
    distanciaEmpresaMetros: null,
    ubicacionObservacion: "",
    retoVida: "",
    retoVidaCumplido: false,
    retoVidaObservacion: "",
    riesgo: "normal",
    alertas: [],
    sitioId: "",
    sitioNombre: "",
    radioMetros: null,
    fotoEntradaMetadata: null,
    fotoSalidaMetadata: null,
    fotoEntradaHash: "",
    fotoSalidaHash: "",
    fotoEntradaStoragePath: "",
    fotoSalidaStoragePath: "",
    fotoEntradaMime: "",
    fotoSalidaMime: "",
    fotoEntradaSizeBytes: null,
    fotoSalidaSizeBytes: null,
    fotoEntradaWidth: null,
    fotoEntradaHeight: null,
    fotoSalidaWidth: null,
    fotoSalidaHeight: null,
    fotoEntradaCapturedAt: "",
    fotoSalidaCapturedAt: "",
    fotoEntradaUserAgent: "",
    fotoSalidaUserAgent: "",
    fotoEntradaDeviceLabel: "",
    fotoSalidaDeviceLabel: "",
    fotosPrivadas: true,
    evidenciaEntradaCompleta: false,
    evidenciaSalidaCompleta: false,
    evidenciaObservacion: "",
    evidenciaEntradaGeolocalizada: false,
    evidenciaSalidaGeolocalizada: false,
    evidenciaGeolocalizadaObservacion: "",
    ...record,
  };
}
function persistLocalSnapshot() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
}

function loadAdminLog() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_LOG_KEY)) || [];
  } catch {
    return [];
  }
}

function saveAdminLog() {
  localStorage.setItem(ADMIN_LOG_KEY, JSON.stringify(state.adminLog));
}

function addAdminLog(action, detail) {
  const { date, time } = nowParts();
  state.adminLog.unshift({ action, detail, date, time });
  state.adminLog = state.adminLog.slice(0, 8);
  saveAdminLog();
  renderAdminAudit();
  if (CLOUD_ENABLED && state.isAdmin) {
    callAdminRpc("admin_log_event", {
      p_admin_key: ADMIN_KEY,
      p_accion: action,
      p_detalle: detail,
      p_resultado: "ok",
    }).catch(() => undefined);
  }
}

function getOperationalTimezone() {
  return state.activeSite?.zona_horaria || DEFAULT_TIMEZONE;
}

function nowParts(date = new Date()) {
  return {
    date: date.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: getOperationalTimezone(),
    }),
    time: date.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: getOperationalTimezone(),
    }),
  };
}

function todayIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: getOperationalTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || String(date.getFullYear());
  const month = parts.find((part) => part.type === "month")?.value || String(date.getMonth() + 1).padStart(2, "0");
  const day = parts.find((part) => part.type === "day")?.value || String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(isoDate) {
  if (!isoDate || !isoDate.includes("-")) return isoDate || "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function displayTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: getOperationalTimezone(),
  });
}

function minutesFromStart(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getOperationalTimezone(),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function isQrWindowOpen(date = new Date()) {
  if (state.demoMode) return true;
  const current = minutesFromStart(date);
  const start = QR_START.hour * 60 + QR_START.minute;
  const end = QR_END.hour * 60 + QR_END.minute;
  return current >= start && current <= end;
}

function makeQrToken(date = new Date()) {
  const bucket = Math.floor(date.getTime() / (QR_VALID_MINUTES * 60 * 1000));
  const day = todayIso(date).replaceAll("-", "");
  return `SALIDA-${day}-${bucket}`;
}

function getExitUrl(token) {
  const base = window.location.href.split("#")[0];
  return `${base}#salida?token=${encodeURIComponent(token)}`;
}

function cloudHeaders(extra = {}) {
  return {
    apikey: SUPABASE.publishableKey,
    Authorization: `Bearer ${SUPABASE.publishableKey}`,
    ...extra,
  };
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE.url}${path}`, {
    ...options,
    headers: cloudHeaders(options.headers || {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase error ${response.status}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function rowToRecord(row) {
  return normalizeRecord({
    id: row.id,
    nombre: row.nombre,
    matricula: row.matricula,
    fecha: row.fecha,
    horaEntrada: displayTime(row.hora_entrada),
    fotoEntrada: row.foto_entrada_url,
    horaSalida: displayTime(row.hora_salida),
    fotoSalida: row.foto_salida_url || "",
    qrSalida: row.token_qr_usado || row.qr_salida || "",
    estado: row.estado,
    bloqueado: row.bloqueado,
    observacion: row.observacion || row.observaciones || "",
    observaciones: row.observaciones || row.observacion || "",
    observacion_admin: row.observacion_admin || "",
    modificado_por_admin: Boolean(row.modificado_por_admin),
    descriptorEntrada: row.descriptor_entrada || null,
    descriptorSalida: row.descriptor_salida || null,
    rostroEntradaDetectado: Boolean(row.rostro_entrada_detectado),
    rostroSalidaDetectado: Boolean(row.rostro_salida_detectado),
    similitudFacial: row.similitud_facial ?? null,
    validacionIdentidad: row.validacion_identidad || "pendiente",
    metodoSalida: row.metodo_salida || "",
    tokenQrUsado: row.token_qr_usado || row.qr_salida || "",
    serverTimeEntrada: row.server_time_entrada || "",
    serverTimeSalida: row.server_time_salida || "",
    horarioValidado: Boolean(row.horario_validado),
    horarioObservacion: row.horario_observacion || "",
    qrValidado: Boolean(row.qr_validado),
    qrObservacion: row.qr_observacion || "",
    ubicacionValidada: Boolean(row.ubicacion_salida_validada ?? row.ubicacion_validada),
    latitudEntrada: row.latitud_entrada ?? null,
    longitudEntrada: row.longitud_entrada ?? null,
    precisionEntrada: row.precision_entrada ?? null,
    distanciaEntradaMetros: row.distancia_entrada_metros ?? null,
    ubicacionEntradaValidada: Boolean(row.ubicacion_entrada_validada),
    ubicacionEntradaObservacion: row.ubicacion_entrada_observacion || "",
    sitioEntradaId: row.sitio_entrada_id || "",
    sitioEntradaNombre: row.sitio_entrada_nombre || row.sitio_nombre || "",
    latitudSalida: row.latitud_salida ?? null,
    longitudSalida: row.longitud_salida ?? null,
    precisionSalida: row.precision_salida ?? row.precision_ubicacion ?? null,
    distanciaSalidaMetros: row.distancia_salida_metros ?? row.distancia_empresa_metros ?? null,
    ubicacionSalidaValidada: Boolean(row.ubicacion_salida_validada ?? row.ubicacion_validada),
    ubicacionSalidaObservacion: row.ubicacion_salida_observacion || row.ubicacion_observacion || "",
    sitioSalidaId: row.sitio_salida_id || row.sitio_id || "",
    sitioSalidaNombre: row.sitio_salida_nombre || row.sitio_nombre || "",
    precisionUbicacion: row.precision_salida ?? row.precision_ubicacion ?? null,
    distanciaEmpresaMetros: row.distancia_salida_metros ?? row.distancia_empresa_metros ?? null,
    ubicacionObservacion: row.ubicacion_salida_observacion || row.ubicacion_observacion || "",
    retoVida: row.reto_vida || "",
    retoVidaCumplido: Boolean(row.reto_vida_cumplido),
    retoVidaObservacion: row.reto_vida_observacion || "",
    riesgo: row.riesgo || "normal",
    alertas: row.alertas || [],
    sitioId: row.sitio_id || "",
    sitioNombre: row.sitio_nombre || "",
    radioMetros: row.radio_metros ?? null,
    fotoEntradaMetadata: row.foto_entrada_metadata || null,
    fotoSalidaMetadata: row.foto_salida_metadata || null,
    fotoEntradaHash: row.foto_entrada_hash || "",
    fotoSalidaHash: row.foto_salida_hash || "",
    fotoEntradaStoragePath: row.foto_entrada_storage_path || "",
    fotoSalidaStoragePath: row.foto_salida_storage_path || "",
    fotoEntradaMime: row.foto_entrada_mime || "",
    fotoSalidaMime: row.foto_salida_mime || "",
    fotoEntradaSizeBytes: row.foto_entrada_size_bytes ?? null,
    fotoSalidaSizeBytes: row.foto_salida_size_bytes ?? null,
    fotoEntradaWidth: row.foto_entrada_width ?? null,
    fotoEntradaHeight: row.foto_entrada_height ?? null,
    fotoSalidaWidth: row.foto_salida_width ?? null,
    fotoSalidaHeight: row.foto_salida_height ?? null,
    fotoEntradaCapturedAt: row.foto_entrada_captured_at || "",
    fotoSalidaCapturedAt: row.foto_salida_captured_at || "",
    fotoEntradaUserAgent: row.foto_entrada_user_agent || "",
    fotoSalidaUserAgent: row.foto_salida_user_agent || "",
    fotoEntradaDeviceLabel: row.foto_entrada_device_label || "",
    fotoSalidaDeviceLabel: row.foto_salida_device_label || "",
    fotosPrivadas: row.fotos_privadas !== false,
    evidenciaEntradaCompleta: Boolean(row.evidencia_entrada_completa),
    evidenciaSalidaCompleta: Boolean(row.evidencia_salida_completa),
    evidenciaObservacion: row.evidencia_observacion || "",
    evidenciaEntradaGeolocalizada: Boolean(row.evidencia_entrada_geolocalizada),
    evidenciaSalidaGeolocalizada: Boolean(row.evidencia_salida_geolocalizada),
    evidenciaGeolocalizadaObservacion: row.evidencia_geolocalizada_observacion || "",
  });
}
function normalizeTimeInput(value, fallback) {
  const text = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(text)) return text;
  if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text.slice(0, 5);
  return fallback;
}

function getRpcFirstRow(result) {
  if (Array.isArray(result)) return result[0] || null;
  return result || null;
}

function hasConfiguredSite(site = state.activeSite) {
  return Boolean(site && site.configured !== false && site.id && site.latitud !== null && site.longitud !== null);
}

function siteTimeRange(start, end) {
  const first = normalizeTimeInput(start, "--:--");
  const last = normalizeTimeInput(end, "--:--");
  return first + " - " + last;
}

function setSiteMessage(message, tone = "neutral") {
  if (!els.siteTestResult) return;
  els.siteTestResult.textContent = message;
  els.siteTestResult.dataset.tone = tone;
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSiteLocationValidation(validation, fallbackPrecision = null) {
  if (!validation || validation.configured === false) {
    return {
      configured: false,
      estado: "sitio_no_configurado",
      tone: "warning",
      message: "No hay sitio activo configurado.",
    };
  }

  const distance = toFiniteNumber(validation.distancia_metros);
  const radius = toFiniteNumber(validation.radio_metros);
  const precision = toFiniteNumber(validation.precision_metros ?? fallbackPrecision);
  const precisionLimit = toFiniteNumber(validation.precision_maxima_metros) ?? GEO_PRECISION_MAX_METERS;
  const insideRadius = typeof validation.dentro_radio === "boolean"
    ? validation.dentro_radio
    : distance !== null && radius !== null && distance <= radius;
  const precisionOk = typeof validation.precision_aceptable === "boolean"
    ? validation.precision_aceptable
    : precision !== null && precision <= precisionLimit;
  const validated = typeof validation.validado === "boolean"
    ? validation.validado
    : insideRadius && precisionOk;

  let estado = validation.estado || validation.observacion || "";
  if (!estado || estado === "precision_insuficiente") {
    if (validated) estado = "ubicacion_validada";
    else if (insideRadius && !precisionOk) estado = "dentro_radio_precision_baja";
    else estado = "fuera_de_radio";
  }

  const distanceText = formatMeters(distance);
  const radiusText = formatMeters(radius);
  const precisionText = formatMeters(precision);

  if (estado === "ubicacion_validada" || validated) {
    return {
      configured: true,
      estado: "ubicacion_validada",
      tone: "success",
      message: "Ubicacion validada: " + distanceText + " de " + radiusText + ". Precision: " + precisionText + ".",
    };
  }

  if (estado === "dentro_radio_precision_baja" || (insideRadius && !precisionOk)) {
    return {
      configured: true,
      estado: "dentro_radio_precision_baja",
      tone: "warning",
      message: "Estas dentro del radio, pero la precision GPS es baja. Distancia: " + distanceText + " de " + radiusText + ". Precision: " + precisionText + ".",
    };
  }

  if (estado === "gps_no_disponible" || estado === "gps_denegado") {
    return {
      configured: true,
      estado,
      tone: "warning",
      message: "No se pudo obtener la ubicacion. Revisa permisos del navegador.",
    };
  }

  return {
    configured: true,
    estado: "fuera_de_radio",
    tone: "danger",
    message: "Ubicacion fuera del radio permitido. Distancia: " + distanceText + " de " + radiusText + ". Precision: " + precisionText + ".",
  };
}

function fillSiteForm(site) {
  if (!els.siteForm) return;
  const configured = hasConfiguredSite(site);
  els.siteName.value = configured ? site.nombre || "" : "";
  els.siteAddress.value = configured ? site.direccion || "" : "";
  els.siteLat.value = configured && site.latitud !== null ? Number(site.latitud).toFixed(6) : "";
  els.siteLng.value = configured && site.longitud !== null ? Number(site.longitud).toFixed(6) : "";
  els.siteRadius.value = configured ? site.radio_metros || 150 : 150;
  els.siteEntryStart.value = normalizeTimeInput(configured ? site.hora_entrada_inicio : "", "07:30");
  els.siteEntryEnd.value = normalizeTimeInput(configured ? site.hora_entrada_fin : "", "08:15");
  els.siteExitStart.value = normalizeTimeInput(configured ? site.hora_salida_inicio : "", "16:30");
  els.siteExitEnd.value = normalizeTimeInput(configured ? site.hora_salida_fin : "", "17:10");
  els.siteTimezone.value = configured ? site.zona_horaria || "America/Mexico_City" : "America/Mexico_City";
  els.siteActive.checked = configured ? Boolean(site.activo) : true;
}

function renderActiveSite(site) {
  state.activeSite = site || null;
  const configured = hasConfiguredSite(site);
  if (!els.siteStatusBadge) return;

  els.siteStatusBadge.className = "badge " + (configured ? "success" : "warning");
  els.siteStatusBadge.textContent = configured ? "Sitio activo" : "Sitio pendiente";
  els.siteStatusSummary.textContent = configured
    ? "La validacion de salidas usa esta ubicacion y horarios desde Supabase."
    : "Configura el sitio oficial para activar la validacion global de ubicacion.";
  els.siteNameLabel.textContent = configured ? site.nombre || "Sitio sin nombre" : "Sin sitio configurado";
  els.siteAddressLabel.textContent = configured ? site.direccion || "Direccion no capturada" : "Pendiente de direccion";
  els.siteCoordsLabel.textContent = configured
    ? Number(site.latitud).toFixed(6) + ", " + Number(site.longitud).toFixed(6)
    : "Pendiente";
  els.siteRadiusLabel.textContent = configured ? formatMeters(site.radio_metros) : "Pendiente";
  els.siteEntryHoursLabel.textContent = configured ? siteTimeRange(site.hora_entrada_inicio, site.hora_entrada_fin) : "07:30 - 08:15";
  els.siteExitHoursLabel.textContent = configured ? siteTimeRange(site.hora_salida_inicio, site.hora_salida_fin) : "16:30 - 17:10";
  els.siteTimezoneLabel.textContent = configured ? site.zona_horaria || "America/Mexico_City" : "America/Mexico_City";
  els.sitePrecisionLabel.textContent = state.adminLocation
    ? "Ultima precision: " + formatMeters(state.adminLocation.accuracy)
    : "Sin prueba reciente";
  fillSiteForm(site);
  setSiteMessage(configured ? "Listo para validar ubicacion." : "Captura nombre, coordenadas, radio y horarios.", configured ? "success" : "warning");
}

async function loadActiveSite({ silent = false } = {}) {
  if (!CLOUD_ENABLED) {
    renderActiveSite(null);
    if (!silent) setSiteMessage("Supabase no esta configurado en este entorno.", "danger");
    return null;
  }

  try {
    const result = await callAdminRpc("get_active_site", {});
    const site = getRpcFirstRow(result);
    renderActiveSite(site);
    return site;
  } catch (error) {
    renderActiveSite(null);
    if (!silent) setSiteMessage("No se pudo consultar el sitio activo.", "danger");
    return null;
  }
}

function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalizacion no disponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

async function useAdminLocation() {
  if (!requestAdminAccess()) return;
  setSiteMessage("Obteniendo ubicacion actual del administrador...", "warning");
  try {
    const position = await getBrowserLocation();
    state.adminLocation = {
      latitud: position.coords.latitude,
      longitud: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
    els.siteLat.value = position.coords.latitude.toFixed(6);
    els.siteLng.value = position.coords.longitude.toFixed(6);
    els.sitePrecisionLabel.textContent = "Ultima precision: " + formatMeters(position.coords.accuracy);
    setSiteMessage("Ubicacion cargada en el formulario. Revisa el radio antes de guardar.", "success");
  } catch (error) {
    setSiteMessage("No se pudo obtener ubicacion. Revisa permisos del navegador.", "danger");
  }
}

async function testAdminLocation() {
  if (!requestAdminAccess()) return;
  if (!CLOUD_ENABLED) {
    setSiteMessage("La prueba requiere Supabase activo.", "danger");
    return;
  }

  setSiteMessage("Validando ubicacion actual contra el sitio activo...", "warning");
  try {
    const position = await getBrowserLocation();
    state.adminLocation = {
      latitud: position.coords.latitude,
      longitud: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
    els.sitePrecisionLabel.textContent = "Ultima precision: " + formatMeters(position.coords.accuracy);
    const result = await callAdminRpc("validate_location_for_site", {
      p_latitud: position.coords.latitude,
      p_longitud: position.coords.longitude,
      p_precision: position.coords.accuracy,
    });
    const validation = normalizeSiteLocationValidation(getRpcFirstRow(result), position.coords.accuracy);
    setSiteMessage(validation.message, validation.tone);
  } catch (error) {
    setSiteMessage("No se pudo obtener la ubicacion. Revisa permisos del navegador.", "warning");
  }
}

function validateSiteForm(data) {
  if (!data.nombre) return "Captura el nombre del sitio.";
  if (Number.isNaN(data.latitud) || data.latitud < -90 || data.latitud > 90) return "Latitud invalida.";
  if (Number.isNaN(data.longitud) || data.longitud < -180 || data.longitud > 180) return "Longitud invalida.";
  if (!Number.isInteger(data.radio) || data.radio < 20 || data.radio > 1000) return "El radio debe estar entre 20 y 1000 metros.";
  if (!data.zonaHoraria) return "Captura la zona horaria.";
  if (data.horaEntradaInicio >= data.horaEntradaFin) return "El horario de entrada debe cerrar despues de iniciar.";
  if (data.horaSalidaInicio >= data.horaSalidaFin) return "El horario de salida debe cerrar despues de iniciar.";
  return "";
}

async function handleSiteSubmit(event) {
  event.preventDefault();
  if (!requestAdminAccess()) return;
  if (!CLOUD_ENABLED) {
    setSiteMessage("No se puede guardar sin Supabase configurado.", "danger");
    return;
  }

  const data = {
    nombre: els.siteName.value.trim(),
    direccion: els.siteAddress.value.trim(),
    latitud: Number(els.siteLat.value),
    longitud: Number(els.siteLng.value),
    radio: Number.parseInt(els.siteRadius.value, 10),
    horaEntradaInicio: normalizeTimeInput(els.siteEntryStart.value, "07:30"),
    horaEntradaFin: normalizeTimeInput(els.siteEntryEnd.value, "08:15"),
    horaSalidaInicio: normalizeTimeInput(els.siteExitStart.value, "16:30"),
    horaSalidaFin: normalizeTimeInput(els.siteExitEnd.value, "17:10"),
    zonaHoraria: els.siteTimezone.value.trim() || "America/Mexico_City",
    activo: els.siteActive.checked,
  };
  const error = validateSiteForm(data);
  if (error) {
    setSiteMessage(error, "danger");
    return;
  }

  setSiteMessage("Guardando configuracion del sitio...", "warning");
  try {
    await callAdminRpc("upsert_site_config", {
      p_admin_key: ADMIN_KEY,
      p_nombre: data.nombre,
      p_direccion: data.direccion,
      p_latitud: data.latitud,
      p_longitud: data.longitud,
      p_radio_metros: data.radio,
      p_hora_entrada_inicio: data.horaEntradaInicio,
      p_hora_entrada_fin: data.horaEntradaFin,
      p_hora_salida_inicio: data.horaSalidaInicio,
      p_hora_salida_fin: data.horaSalidaFin,
      p_zona_horaria: data.zonaHoraria,
      p_activo: data.activo,
    });
    addAdminLog("Sitio actualizado", data.nombre + " (" + data.radio + " m)");
    await loadActiveSite({ silent: true });
    await updateClockAndQr({ force: true });
    showToast("Configuracion del sitio guardada.");
  } catch (error) {
    setSiteMessage("No se pudo guardar. Verifica la clave, datos y permisos RLS.", "danger");
  }
}
async function refreshRecords({ silent = false } = {}) {
  if (!CLOUD_ENABLED) {
    renderRecords();
    return;
  }

  try {
    state.loadingRecords = true;
    const rows = await supabaseRequest("/rest/v1/asistencias?select=*&order=fecha.desc,hora_entrada.desc");
    state.records = (rows || []).map(rowToRecord);
    persistLocalSnapshot();
    renderRecords();
  } catch (error) {
    if (!silent) showToast("No se pudo cargar la lista global. Revisa la conexion.");
    renderRecords();
  } finally {
    state.loadingRecords = false;
  }
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Blob(blob) {
  if (!globalThis.crypto?.subtle) return "";
  const buffer = await blob.arrayBuffer();
  return arrayBufferToHex(await crypto.subtle.digest("SHA-256", buffer));
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.onerror = () => resolve({ width: null, height: null });
    image.src = dataUrl;
  });
}

function getCameraDeviceLabel(kind) {
  const stream = state[`${kind}Stream`];
  const track = stream?.getVideoTracks?.()[0];
  return track?.label || "Camara del navegador";
}

function normalizeEvidenceLocation(location = null) {
  if (!location) {
    return {
      estado: "ubicacion_pendiente",
      latitud: null,
      longitud: null,
      precision: null,
      sitio_id: state.activeSite?.id || null,
      sitio_nombre: state.activeSite?.nombre || "",
      distancia_metros: null,
      validada: false,
      observacion: "Ubicacion pendiente de validacion por servidor.",
    };
  }

  return {
    estado: location.estado || "ubicacion_pendiente",
    latitud: location.latitud ?? null,
    longitud: location.longitud ?? null,
    precision: location.precision ?? null,
    sitio_id: location.sitioId || state.activeSite?.id || null,
    sitio_nombre: location.sitioNombre || state.activeSite?.nombre || "",
    distancia_metros: location.distanciaMetros ?? null,
    validada: Boolean(location.validada ?? location.estado === "ubicacion_correcta"),
    observacion: location.observacion || "La ubicacion sera validada contra el sitio activo.",
  };
}

async function buildImageEvidence(dataUrl, matricula, kind, location = null) {
  const blob = dataUrlToBlob(dataUrl);
  const dimensions = await getImageDimensions(dataUrl);
  const capturedAt = new Date().toISOString();
  const cleanMatricula = normalizeMatricula(matricula).replace(/[^A-Z0-9_-]/g, "") || "SIN_MATRICULA";
  const path = `${todayIso()}/${cleanMatricula}/${kind}-${Date.now()}.jpg`;
  const hash = await sha256Blob(blob);
  const deviceLabel = getCameraDeviceLabel(kind);
  const metadata = {
    capture_type: kind === "entry" ? "entrada" : "salida",
    sha256: hash,
    mime: blob.type || "image/jpeg",
    size_bytes: blob.size,
    width: dimensions.width,
    height: dimensions.height,
    captured_at_client: capturedAt,
    uploaded_at_server: null,
    user_agent: navigator.userAgent || "",
    device_label: deviceLabel,
    storage_bucket: PHOTO_BUCKET,
    storage_path: CLOUD_ENABLED ? path : "local_data_url",
    source: "browser_camera",
    timezone: getOperationalTimezone(),
    location: normalizeEvidenceLocation(location),
  };

  return {
    blob,
    url: dataUrl,
    path: CLOUD_ENABLED ? path : "local_data_url",
    metadata,
    hash,
    mime: metadata.mime,
    sizeBytes: blob.size,
    width: dimensions.width,
    height: dimensions.height,
    capturedAt,
    userAgent: metadata.user_agent,
    deviceLabel,
    private: true,
    complete: Boolean(hash && blob.size && dimensions.width && dimensions.height),
  };
}

async function uploadEvidence(dataUrl, matricula, kind, location = null) {
  const evidence = await buildImageEvidence(dataUrl, matricula, kind, location);
  if (!CLOUD_ENABLED) return evidence;

  const encodedPath = evidence.path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE.url}/storage/v1/object/${PHOTO_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: cloudHeaders({
      "Content-Type": evidence.mime || "image/jpeg",
      "x-upsert": "false",
    }),
    body: evidence.blob,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "No se pudo subir la evidencia");
  }

  evidence.url = `${SUPABASE.url}/storage/v1/object/public/${PHOTO_BUCKET}/${encodedPath}`;
  evidence.metadata.uploaded_at_server = new Date().toISOString();
  evidence.metadata.storage_path = evidence.path;
  return evidence;
}
async function insertEntryRecord({ nombre, matricula, fotoEntrada, descriptorEntrada, location }) {
  const evidence = await uploadEvidence(fotoEntrada, matricula, "entry", location);

  if (!CLOUD_ENABLED) {
    const localRecord = normalizeRecord({
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()),
      nombre,
      matricula,
      fecha: todayIso(),
      horaEntrada: nowParts().time,
      fotoEntrada: evidence.url,
      horaSalida: "",
      fotoSalida: "",
      qrSalida: "",
      estado: "entrada_registrada",
      validacionIdentidad: "pendiente",
      descriptorEntrada,
      rostroEntradaDetectado: true,
      serverTimeEntrada: new Date().toISOString(),
      fotoEntradaMetadata: evidence.metadata,
      fotoEntradaHash: evidence.hash,
      fotoEntradaStoragePath: evidence.path,
      fotoEntradaMime: evidence.mime,
      fotoEntradaSizeBytes: evidence.sizeBytes,
      fotoEntradaWidth: evidence.width,
      fotoEntradaHeight: evidence.height,
      fotoEntradaCapturedAt: evidence.capturedAt,
      fotoEntradaUserAgent: evidence.userAgent,
      fotoEntradaDeviceLabel: evidence.deviceLabel,
      fotosPrivadas: evidence.private,
      latitudEntrada: location.latitud ?? null,
      longitudEntrada: location.longitud ?? null,
      precisionEntrada: location.precision ?? null,
      ubicacionEntradaValidada: location.estado === "ubicacion_correcta",
      ubicacionEntradaObservacion: location.observacion || "Ubicacion de entrada capturada localmente.",
      evidenciaEntradaCompleta: evidence.complete,
      evidenciaEntradaGeolocalizada: Boolean(location.latitud && location.longitud && location.estado === "ubicacion_correcta"),
      evidenciaGeolocalizadaObservacion: location.observacion || "Ubicacion de entrada capturada localmente.",
      evidenciaObservacion: evidence.complete ? "" : "Metadatos de entrada incompletos.",
    });
    state.records.unshift(localRecord);
    persistLocalSnapshot();
    return localRecord;
  }

  const row = await callAdminRpc("registrar_entrada_segura", {
    p_nombre: nombre,
    p_matricula: matricula,
    p_foto_entrada_url: evidence.url,
    p_descriptor_entrada: descriptorEntrada,
    p_rostro_entrada_detectado: true,
    p_foto_entrada_metadata: evidence.metadata,
    p_foto_entrada_hash: evidence.hash,
    p_foto_entrada_storage_path: evidence.path,
    p_foto_entrada_mime: evidence.mime,
    p_foto_entrada_size_bytes: evidence.sizeBytes,
    p_foto_entrada_width: evidence.width,
    p_foto_entrada_height: evidence.height,
    p_foto_entrada_captured_at: evidence.capturedAt,
    p_foto_entrada_user_agent: evidence.userAgent,
    p_foto_entrada_device_label: evidence.deviceLabel,
    p_fotos_privadas: evidence.private,
    p_evidencia_entrada_completa: evidence.complete,
    p_evidencia_observacion: evidence.complete ? "" : "Metadatos de entrada incompletos.",
    p_latitud_entrada: location.latitud ?? null,
    p_longitud_entrada: location.longitud ?? null,
    p_precision_entrada: location.precision ?? null,
    p_ubicacion_entrada_estado: location.estado || "ubicacion_denegada",
  });
  return rowToRecord(row);
}
async function updateExitRecord(record, { fotoSalida, qrToken, descriptorSalida, location, lifeChallenge }) {
  const evidence = await uploadEvidence(fotoSalida, record.matricula, "exit", location);

  if (!CLOUD_ENABLED) {
    const faceValidation = evaluateFaceMatch(record.descriptorEntrada, descriptorSalida);
    record.horaSalida = nowParts().time;
    record.fotoSalida = evidence.url;
    record.qrSalida = qrToken;
    record.tokenQrUsado = qrToken;
    record.descriptorSalida = descriptorSalida;
    record.rostroSalidaDetectado = true;
    record.similitudFacial = faceValidation.similarity;
    record.validacionIdentidad = faceValidation.status;
    record.estado = faceValidation.estado;
    record.observacion = faceValidation.observacion;
    record.observaciones = faceValidation.observacion;
    record.metodoSalida = "qr_horario";
    record.qrValidado = true;
    record.latitudSalida = location.latitud ?? null;
    record.longitudSalida = location.longitud ?? null;
    record.precisionSalida = location.precision ?? null;
    record.ubicacionSalidaValidada = location.estado === "ubicacion_correcta";
    record.ubicacionSalidaObservacion = location.observacion || "Ubicacion de salida capturada localmente.";
    record.ubicacionValidada = record.ubicacionSalidaValidada;
    record.precisionUbicacion = record.precisionSalida;
    record.retoVida = lifeChallenge;
    record.retoVidaCumplido = Boolean(lifeChallenge);
    record.riesgo = record.ubicacionValidada && faceValidation.status === "identidad_validada" ? "normal" : "revision_multiple";
    record.fotoSalidaMetadata = evidence.metadata;
    record.fotoSalidaHash = evidence.hash;
    record.fotoSalidaStoragePath = evidence.path;
    record.fotoSalidaMime = evidence.mime;
    record.fotoSalidaSizeBytes = evidence.sizeBytes;
    record.fotoSalidaWidth = evidence.width;
    record.fotoSalidaHeight = evidence.height;
    record.fotoSalidaCapturedAt = evidence.capturedAt;
    record.fotoSalidaUserAgent = evidence.userAgent;
    record.fotoSalidaDeviceLabel = evidence.deviceLabel;
    record.fotosPrivadas = evidence.private;
    record.evidenciaSalidaCompleta = evidence.complete;
    record.evidenciaSalidaGeolocalizada = Boolean(location.latitud && location.longitud && location.estado === "ubicacion_correcta");
    record.evidenciaGeolocalizadaObservacion = location.observacion || record.evidenciaGeolocalizadaObservacion;
    record.evidenciaObservacion = evidence.complete ? record.evidenciaObservacion : "Metadatos de salida incompletos.";
    persistLocalSnapshot();
    return record;
  }

  const row = await callAdminRpc("registrar_salida_segura", {
    p_matricula: record.matricula,
    p_foto_salida_url: evidence.url,
    p_descriptor_salida: descriptorSalida,
    p_token_qr: qrToken,
    p_latitud: location.latitud ?? null,
    p_longitud: location.longitud ?? null,
    p_precision: location.precision ?? null,
    p_ubicacion_estado: location.estado || "ubicacion_denegada",
    p_reto_vida: lifeChallenge || "",
    p_foto_salida_metadata: evidence.metadata,
    p_foto_salida_hash: evidence.hash,
    p_foto_salida_storage_path: evidence.path,
    p_foto_salida_mime: evidence.mime,
    p_foto_salida_size_bytes: evidence.sizeBytes,
    p_foto_salida_width: evidence.width,
    p_foto_salida_height: evidence.height,
    p_foto_salida_captured_at: evidence.capturedAt,
    p_foto_salida_user_agent: evidence.userAgent,
    p_foto_salida_device_label: evidence.deviceLabel,
    p_evidencia_salida_completa: evidence.complete,
    p_evidencia_observacion: evidence.complete ? "" : "Metadatos de salida incompletos.",
  });
  return rowToRecord(row);
}
async function callAdminRpc(functionName, payload) {
  return supabaseRequest(`/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

async function fetchServerQrToken() {
  if (state.demoMode) {
    const now = new Date();
    return {
      token: makeQrToken(now),
      server_time: now.toISOString(),
      expires_at: new Date(now.getTime() + QR_VALID_MINUTES * 60 * 1000).toISOString(),
      is_open: true,
      message: CLOUD_ENABLED ? "QR de prueba visible. La salida global seguira validando Supabase." : "QR de prueba local valido.",
    };
  }

  if (!CLOUD_ENABLED) {
    const now = new Date();
    const isOpen = isQrWindowOpen(now);
    return {
      token: isOpen ? makeQrToken(now) : null,
      server_time: now.toISOString(),
      expires_at: isOpen ? new Date(now.getTime() + QR_VALID_MINUTES * 60 * 1000).toISOString() : null,
      is_open: isOpen,
      message: isOpen ? "QR valido." : "Salida bloqueada por horario local de prueba.",
    };
  }
  return callAdminRpc("get_current_qr_token", {});
}
async function updateClockAndQr({ force = false } = {}) {
  const now = new Date();
  if (!force && state.serverQr && Date.now() < state.nextQrRefreshAt) {
    const serverNow = new Date(Date.now() + state.serverClockOffset);
    els.clockLabel.textContent = displayTime(serverNow.toISOString());
    return;
  }

  try {
    const qr = await fetchServerQrToken();
    state.serverQr = qr;
    state.nextQrRefreshAt = Date.now() + 12000;
    if (qr.server_time) state.serverClockOffset = new Date(qr.server_time).getTime() - Date.now();

    const isOpen = Boolean(qr.is_open && qr.token);
    const token = qr.token || "";
    const exitUrl = token ? getExitUrl(token) : "#salida";

    state.qrToken = token;
    els.clockLabel.textContent = displayTime(qr.server_time || now.toISOString());
    els.qrWindowLabel.textContent = isOpen ? "QR servidor disponible" : "QR servidor bloqueado";
    els.qrMessage.textContent = isOpen
      ? "QR valido. La vigencia y horario se validan con Supabase."
      : (qr.message || "La salida aun no esta disponible.");

    els.qrBox.classList.toggle("is-disabled", !isOpen);
    els.qrImage.hidden = !isOpen;
    els.qrDirectLink.hidden = !isOpen;
    els.qrTokenLabel.textContent = isOpen
      ? `Expira: ${displayTime(qr.expires_at)} | Token servidor`
      : "Token: no disponible";
    els.qrDirectLink.href = exitUrl;
    els.qrImage.src = isOpen
      ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(exitUrl)}`
      : "";

    els.exitGuard.textContent = isOpen
      ? "QR vigente. La hora se valida con el servidor; completa foto, reto y ubicacion."
      : "Salida bloqueada. El QR solo esta disponible de 4:30 p. m. a 5:10 p. m. con hora de servidor.";
    els.exitGuard.classList.toggle("is-blocked", !isOpen);
  } catch (error) {
    els.qrWindowLabel.textContent = "QR no disponible";
    els.qrMessage.textContent = "No se pudo validar QR con servidor. Revisa la conexion.";
    els.qrBox.classList.add("is-disabled");
    els.qrImage.hidden = true;
    els.qrDirectLink.hidden = true;
    els.exitGuard.textContent = "Salida bloqueada hasta recuperar validacion de servidor.";
    els.exitGuard.classList.add("is-blocked");
  }
}
function showView(name) {
  $$('[data-view]').forEach((view) => {
    view.classList.toggle("is-hidden", view.dataset.view !== name);
  });

  setActiveNavigation(name);
  if (name !== "entry") stopCamera("entry");
  if (name !== "exit") stopCamera("exit");
  if (name === "entry") {
    setEntryLocationStatus("La ubicacion se solicitara al guardar entrada.");
  }
  if (name === "exit") {
    pickLifeChallenge();
    setLocationStatus("La ubicacion se solicitara al guardar salida.");
    updateClockAndQr({ force: true });
  }
  if (name === "records" || name === "home") refreshRecords({ silent: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setActiveNavigation(name) {
  $$(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.target === name);
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 3600);
}

function setFaceStatus(element, message, tone = "neutral") {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

function syncCaptureControls() {
  const canUseFace = state.facialModelsLoaded && !state.facialModelsError;
  els.startEntryCamera.disabled = !canUseFace;
  els.startExitCamera.disabled = !canUseFace;
  els.takeEntryPhoto.disabled = !canUseFace || !state.entryStream;
  els.takeExitPhoto.disabled = !canUseFace || !state.exitStream;
}

async function loadFaceModels() {
  if (!window.faceapi) {
    state.facialModelsError = true;
    setFaceStatus(els.faceStatus, "Error al cargar modelos faciales.", "danger");
    syncCaptureControls();
    return;
  }

  try {
    setFaceStatus(els.faceStatus, "Cargando modelos de reconocimiento facial...", "pending");
    syncCaptureControls();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
    ]);
    state.facialModelsLoaded = true;
    setFaceStatus(els.faceStatus, "Modelos cargados correctamente.", "success");
  } catch (error) {
    state.facialModelsError = true;
    setFaceStatus(els.faceStatus, "Error al cargar modelos faciales.", "danger");
  } finally {
    syncCaptureControls();
  }
}

function descriptorToArray(descriptor) {
  return Array.from(descriptor).map((value) => Number(value.toFixed(6)));
}

function clearCapturedFace(kind) {
  state[`${kind}Photo`] = "";
  state[`${kind}Face`] = null;
  const preview = kind === "entry" ? els.entryPreview : els.exitPreview;
  preview.removeAttribute("src");
  preview.classList.add("is-hidden");
}

async function detectSingleFace(canvas, kind) {
  const status = kind === "entry" ? els.entryFaceStatus : els.exitFaceStatus;
  setFaceStatus(status, "Analizando rostro...", "pending");
  const detections = await faceapi
    .detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (detections.length === 0) {
    const message = "No se detecto un rostro. Vuelve a tomar la fotografia.";
    setFaceStatus(status, message, "danger");
    showToast(message);
    return null;
  }

  if (detections.length > 1) {
    const message = "Se detectaron varias personas. La foto debe mostrar solo al usuario.";
    setFaceStatus(status, message, "danger");
    showToast(message);
    return null;
  }

  const descriptor = descriptorToArray(detections[0].descriptor);
  const message = kind === "entry" ? "Rostro detectado correctamente." : "Rostro de salida detectado correctamente.";
  setFaceStatus(status, message, "success");
  showToast(message);
  return { descriptor, detected: true };
}

function facialDistance(entryDescriptor, exitDescriptor) {
  if (!Array.isArray(entryDescriptor) || !Array.isArray(exitDescriptor)) return null;
  if (entryDescriptor.length !== exitDescriptor.length) return null;
  const total = entryDescriptor.reduce((sum, value, index) => {
    const diff = Number(value) - Number(exitDescriptor[index]);
    return sum + diff * diff;
  }, 0);
  return Math.sqrt(total);
}

function evaluateFaceMatch(entryDescriptor, exitDescriptor) {
  const distance = facialDistance(entryDescriptor, exitDescriptor);
  if (distance === null) {
    return {
      status: "revision_administrativa",
      estado: "revision_requerida",
      similarity: null,
      distance: null,
      observacion: "No fue posible comparar la foto de salida con la entrada.",
      toast: "Salida registrada, requiere revision administrativa.",
    };
  }

  const similarity = Number(Math.max(0, 1 - distance).toFixed(4));
  if (distance <= FACE_DISTANCE_STRONG) {
    return {
      status: "identidad_validada",
      estado: "asistencia_completa",
      similarity,
      distance,
      observacion: "La foto de salida coincide con la foto de entrada.",
      toast: "Identidad validada.",
    };
  }

  if (distance <= FACE_DISTANCE_REVIEW) {
    return {
      status: "revision_administrativa",
      estado: "revision_requerida",
      similarity,
      distance,
      observacion: "La salida fue registrada, pero la coincidencia facial requiere revision.",
      toast: "Salida registrada, requiere revision administrativa.",
    };
  }

  return {
    status: "fallida",
    estado: "revision_requerida",
    similarity,
    distance,
    observacion: "La foto de salida no parece coincidir con la foto de entrada.",
    toast: "La foto no coincide suficientemente con la entrada.",
  };
}

function getIncomingQrToken() {
  const [, query = ""] = window.location.hash.split("?");
  return new URLSearchParams(query).get("token") || "";
}

function isCurrentQrToken(token) {
  if (!CLOUD_ENABLED) return state.demoMode || (Boolean(token) && token === makeQrToken(new Date()));
  return Boolean(token) && Boolean(state.serverQr?.is_open) && token === state.qrToken;
}

function pickLifeChallenge() {
  state.lifeChallenge = LIFE_CHALLENGES[Math.floor(Math.random() * LIFE_CHALLENGES.length)];
  if (els.lifeChallenge) els.lifeChallenge.textContent = state.lifeChallenge;
}

function setEntryLocationStatus(message, tone = "neutral") {
  if (!els.entryLocationStatus) return;
  els.entryLocationStatus.textContent = message;
  els.entryLocationStatus.dataset.tone = tone;
}

function locationDeniedAudit(kind) {
  const action = kind === "entry" ? "gps_denegado_entrada" : "gps_denegado_salida";
  addAdminLog(action, kind === "entry" ? "Ubicacion de entrada no autorizada." : "Ubicacion de salida no autorizada.");
}

function setAttendanceLocationStatus(kind, message, tone = "neutral") {
  if (kind === "entry") setEntryLocationStatus(message, tone);
  else setLocationStatus(message, tone);
}

function requestAttendanceLocation(kind) {
  const label = kind === "entry" ? "entrada" : "salida";
  setAttendanceLocationStatus(kind, "Solicitando ubicacion para validar presencia.", "pending");
  if (!navigator.geolocation) {
    const observacion = "No se pudo obtener ubicacion de " + label + ". El registro quedara en revision.";
    setAttendanceLocationStatus(kind, observacion, "danger");
    locationDeniedAudit(kind);
    return Promise.resolve({ estado: "ubicacion_denegada", observacion });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          estado: position.coords.accuracy > 200 ? "ubicacion_imprecisa" : "ubicacion_correcta",
          latitud: Number(position.coords.latitude.toFixed(7)),
          longitud: Number(position.coords.longitude.toFixed(7)),
          precision: Math.round(position.coords.accuracy),
          sitioId: state.activeSite?.id || "",
          sitioNombre: state.activeSite?.nombre || "",
        };
        location.observacion = location.estado === "ubicacion_correcta"
          ? "Ubicacion capturada. Se validara contra el sitio activo."
          : "Precision GPS baja; el registro quedara en revision si el servidor lo confirma.";
        setAttendanceLocationStatus(
          kind,
          location.estado === "ubicacion_correcta"
            ? "Ubicacion capturada. Se validara contra el sitio activo."
            : "Precision GPS baja; el servidor marcara revision si corresponde.",
          location.estado === "ubicacion_correcta" ? "success" : "pending"
        );
        resolve(location);
      },
      () => {
        const observacion = kind === "entry"
          ? "Ubicacion de entrada no autorizada por el navegador."
          : "No se pudo obtener ubicacion de salida. El registro quedara en revision.";
        setAttendanceLocationStatus(kind, "No se pudo obtener ubicacion. El registro quedara en revision.", "danger");
        locationDeniedAudit(kind);
        resolve({ estado: "ubicacion_denegada", observacion });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

function setLocationStatus(message, tone = "neutral") {
  if (!els.locationStatus) return;
  els.locationStatus.textContent = message;
  els.locationStatus.dataset.tone = tone;
}

function requestExitLocation() {
  return requestAttendanceLocation("exit");
}
async function startCamera(kind) {
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;

  if (!state.facialModelsLoaded) {
    showToast("Espera a que carguen los modelos faciales.");
    return;
  }

  try {
    stopCamera(kind);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    state[`${kind}Stream`] = stream;
    syncCaptureControls();
    showToast("Camara activada. Ya puedes tomar la foto.");
  } catch (error) {
    showToast("No se pudo acceder a la camara. Revisa permisos o usa HTTPS.");
  }
}

function stopCamera(kind) {
  const stream = state[`${kind}Stream`];
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  state[`${kind}Stream`] = null;
  video.srcObject = null;
  syncCaptureControls();
}

async function takePhoto(kind) {
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;
  const canvas = kind === "entry" ? els.entryCanvas : els.exitCanvas;
  const preview = kind === "entry" ? els.entryPreview : els.exitPreview;

  if (!state.facialModelsLoaded) {
    showToast("Los modelos faciales aun no estan listos.");
    return;
  }

  if (!video.videoWidth) {
    showToast("Primero activa la camara.");
    return;
  }

  const maxWidth = 960;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

  try {
    const face = await detectSingleFace(canvas, kind);
    if (!face) {
      clearCapturedFace(kind);
      return;
    }

    const image = canvas.toDataURL("image/jpeg", 0.72);
    state[`${kind}Photo`] = image;
    state[`${kind}Face`] = face;
    preview.src = image;
    preview.classList.remove("is-hidden");
  } catch (error) {
    clearCapturedFace(kind);
    showToast("No se pudo analizar el rostro. Vuelve a tomar la foto.");
  }
}

function normalizeMatricula(value) {
  return value.trim().toUpperCase();
}

function todayRecordByMatricula(matricula) {
  const today = todayIso();
  return state.records.find(
    (record) => record.fecha === today && record.matricula === matricula
  );
}

async function handleEntrySubmit(event) {
  event.preventDefault();

  const nombre = els.entryName.value.trim();
  const matricula = normalizeMatricula(els.entryMatricula.value);

  if (!state.entryPhoto || !state.entryFace || !nombre || !matricula) {
    showToast("Falta foto con rostro valido, nombre o matricula para guardar la entrada.");
    return;
  }

  await refreshRecords({ silent: true });

  if (todayRecordByMatricula(matricula)) {
    showToast("Ya existe un registro para esa matricula el dia de hoy.");
    return;
  }

  const location = await requestAttendanceLocation("entry");

  try {
    const record = await insertEntryRecord({
      nombre,
      matricula,
      fotoEntrada: state.entryPhoto,
      descriptorEntrada: state.entryFace.descriptor,
      location,
    });
    state.records.unshift(record);
    persistLocalSnapshot();
    state.entryPhoto = "";
    state.entryFace = null;
    els.entryForm.reset();
    els.entryPreview.classList.add("is-hidden");
    setFaceStatus(els.entryFaceStatus, "Listo para nueva captura.");
    stopCamera("entry");
    await refreshRecords({ silent: true });
    showToast(record.riesgo === "normal" || record.riesgo === "entrada_registrada" ? "Entrada registrada correctamente." : "Entrada registrada, requiere revision administrativa.");
  } catch (error) {
    showToast("No se pudo guardar la entrada global. Intenta de nuevo.");
  }
}
async function handleExitSubmit(event) {
  event.preventDefault();

  await updateClockAndQr({ force: true });
  const qrToken = getIncomingQrToken() || state.qrToken;
  if (!isCurrentQrToken(qrToken)) {
    showToast("El QR ha expirado. Escanea el codigo actual.");
    return;
  }

  const matricula = normalizeMatricula(els.exitMatricula.value);

  if (!matricula || !state.exitPhoto || !state.exitFace) {
    showToast("Falta matricula o foto de salida con rostro valido.");
    return;
  }

  await refreshRecords({ silent: true });
  let record = todayRecordByMatricula(matricula);

  if (!record && CLOUD_ENABLED) {
    record = normalizeRecord({ matricula });
  }

  if (!record) {
    showToast("No existe una entrada registrada para esta matricula el dia de hoy.");
    return;
  }

  if (record.horaSalida) {
    showToast("La salida de esa matricula ya fue registrada.");
    return;
  }

  const location = await requestExitLocation();

  try {
    const updated = await updateExitRecord(record, {
      fotoSalida: state.exitPhoto,
      qrToken,
      descriptorSalida: state.exitFace.descriptor,
      location,
      lifeChallenge: state.lifeChallenge,
    });
    state.exitPhoto = "";
    state.exitFace = null;
    els.exitForm.reset();
    els.exitPreview.classList.add("is-hidden");
    setFaceStatus(els.exitFaceStatus, "Listo para nueva captura.");
    pickLifeChallenge();
    stopCamera("exit");
    await refreshRecords({ silent: true });
    showToast(updated.riesgo === "normal" ? "Salida registrada y validada." : "Salida registrada, pero requiere revision administrativa.");
  } catch (error) {
    const message = error.message?.includes("QR") ? error.message : "No se pudo guardar la salida segura. Intenta de nuevo.";
    showToast(message);
  }
}
function statusLabel(value) {
  const labels = {
    entrada_registrada: "Entrada registrada",
    asistencia_completa: "Asistencia completa",
    revision_requerida: "Revision requerida",
    fallida: "Fallida",
    "Entrada registrada": "Entrada registrada",
    "Asistencia completa": "Asistencia completa",
  };
  return labels[value] || value || "Pendiente";
}

function statusBadgeClass(value) {
  if (["asistencia_completa", "Asistencia completa"].includes(value)) return "success";
  if (value === "revision_requerida") return "warning";
  if (value === "fallida") return "danger";
  return "pending";
}

function identityLabel(value) {
  const labels = {
    identidad_validada: "Identidad validada",
    revision_administrativa: "Revision administrativa",
    fallida: "Fallida",
    pendiente: "Pendiente",
  };
  return labels[value] || "Pendiente";
}

function identityBadgeClass(value) {
  if (value === "identidad_validada") return "success";
  if (value === "revision_administrativa") return "warning";
  if (value === "fallida") return "danger";
  return "default";
}

function riskLabel(value) {
  const labels = {
    normal: "Normal",
    revision_ubicacion: "Revision ubicacion",
    revision_ubicacion_entrada: "Revision ubicacion entrada",
    revision_ubicacion_salida: "Revision ubicacion salida",
    revision_identidad: "Revision identidad",
    revision_qr: "Revision QR",
    revision_horario: "Revision horario",
    revision_multiple: "Revision multiple",
    sospechoso: "Sospechoso",
  };
  return labels[value] || "Normal";
}

function riskBadgeClass(value) {
  if (value === "normal") return "success";
  if (value === "sospechoso") return "danger";
  if (String(value || "").startsWith("revision")) return "warning";
  return "default";
}

function booleanBadge(value, trueText = "Si", falseText = "No") {
  return `<span class="badge ${value ? "success" : "pending"}">${value ? trueText : falseText}</span>`;
}

function formatSimilarity(value) {
  if (value === null || value === undefined || value === "") return "Pendiente";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "Pendiente";
  return `${Math.round(numeric * 100)}%`;
}

function formatMeters(value) {
  if (value === null || value === undefined || value === "") return "Pendiente";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "Pendiente";
  return `${Math.round(numeric)} m`;
}
function formatBytes(value) {
  const numeric = Number(value);
  if (!numeric || Number.isNaN(numeric)) return "Pendiente";
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`;
  return `${(numeric / 1024 / 1024).toFixed(2)} MB`;
}

function shortHash(value) {
  return value ? `${String(value).slice(0, 10)}...` : "Sin hash";
}

function resolutionText(width, height) {
  return width && height ? `${width} x ${height}` : "Pendiente";
}

function hasCompleteEvidence(record) {
  return Boolean(record.evidenciaEntradaCompleta && (record.horaSalida ? record.evidenciaSalidaCompleta : true));
}

function hasCompleteGeoEvidence(record) {
  return Boolean(record.evidenciaEntradaGeolocalizada && (record.horaSalida ? record.evidenciaSalidaGeolocalizada : true));
}

function evidenceCell(record) {
  const complete = hasCompleteEvidence(record);
  const hash = record.fotoSalidaHash || record.fotoEntradaHash;
  return `
    <div class="evidence-cell">
      <span class="badge ${complete ? "success" : "warning"}">${complete ? "Completa" : "Parcial"}</span>
      <small>${escapeHtml(shortHash(hash))}</small>
      <small>${escapeHtml(formatBytes(record.fotoSalidaSizeBytes || record.fotoEntradaSizeBytes))}</small>
      <small>Geo: ${hasCompleteGeoEvidence(record) ? "Completa" : "Parcial"}</small>
    </div>
  `;
}

async function getSignedEvidenceUrl(record, kind) {
  const path = kind === "entrada" ? record.fotoEntradaStoragePath : record.fotoSalidaStoragePath;
  const fallback = kind === "entrada" ? record.fotoEntrada : record.fotoSalida;
  if (!CLOUD_ENABLED || !path || path === "local_data_url") return fallback;

  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${SUPABASE.url}/storage/v1/object/sign/${PHOTO_BUCKET}/${encodedPath}`, {
      method: "POST",
      headers: cloudHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: 300 }),
    });
    if (!response.ok) throw new Error("signed_url_error");
    const data = await response.json();
    const signedUrl = data.signedURL || data.signedUrl || data.url || "";
    if (signedUrl) {
      addAdminLog("signed_url_generada", `${record.matricula} ${kind}`);
      return signedUrl.startsWith("http") ? signedUrl : `${SUPABASE.url}${signedUrl}`;
    }
  } catch (error) {
    addAdminLog("error_visualizar_evidencia", `${record.matricula} ${kind}`);
  }
  return fallback;
}

function evidenceField(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Pendiente")}</strong></div>`;
}

function metadataBlock(title, fields) {
  return `
    <section class="evidence-detail-card">
      <h4>${escapeHtml(title)}</h4>
      <div class="evidence-detail-grid">${fields.join("")}</div>
    </section>
  `;
}

async function showEvidenceDetail(id) {
  if (!requestAdminAccess()) return;
  const record = state.records.find((item) => item.id === id);
  if (!record || !els.evidenceModal || !els.evidenceBody) return;

  addAdminLog("evidencia_geolocalizada_visualizada", `${record.matricula} ${displayDate(record.fecha)}`);
  const entradaUrl = await getSignedEvidenceUrl(record, "entrada");
  const salidaUrl = await getSignedEvidenceUrl(record, "salida");

  els.evidenceBody.innerHTML = `
    <div class="evidence-photo-grid">
      <figure>
        ${entradaUrl ? `<img src="${entradaUrl}" alt="Evidencia de entrada" />` : `<div class="photo-placeholder">Sin foto de entrada</div>`}
        <figcaption>Entrada</figcaption>
      </figure>
      <figure>
        ${salidaUrl ? `<img src="${salidaUrl}" alt="Evidencia de salida" />` : `<div class="photo-placeholder">Sin foto de salida</div>`}
        <figcaption>Salida</figcaption>
      </figure>
    </div>
    ${metadataBlock("Identificacion", [
      evidenceField("Nombre", record.nombre),
      evidenceField("Matricula", record.matricula),
      evidenceField("Fecha", displayDate(record.fecha)),
      evidenceField("Estado", statusLabel(record.estado)),
    ])}
    ${metadataBlock("Foto de entrada", [
      evidenceField("Hash SHA-256", record.fotoEntradaHash),
      evidenceField("Resolucion", resolutionText(record.fotoEntradaWidth, record.fotoEntradaHeight)),
      evidenceField("Tamano", formatBytes(record.fotoEntradaSizeBytes)),
      evidenceField("MIME", record.fotoEntradaMime),
      evidenceField("Storage path", record.fotoEntradaStoragePath),
      evidenceField("Captura cliente", displayTime(record.fotoEntradaCapturedAt) || record.fotoEntradaCapturedAt),
      evidenceField("Dispositivo", record.fotoEntradaDeviceLabel),
      evidenceField("GPS entrada", record.latitudEntrada && record.longitudEntrada ? `${record.latitudEntrada}, ${record.longitudEntrada}` : "Pendiente"),
      evidenceField("Precision entrada", formatMeters(record.precisionEntrada)),
      evidenceField("Distancia entrada", formatMeters(record.distanciaEntradaMetros)),
      evidenceField("Sitio entrada", record.sitioEntradaNombre || record.sitioEntradaId),
      evidenceField("Ubicacion entrada", record.ubicacionEntradaValidada ? "Validada" : "Revision"),
      evidenceField("Obs. entrada", record.ubicacionEntradaObservacion),
    ])}
    ${metadataBlock("Foto de salida", [
      evidenceField("Hash SHA-256", record.fotoSalidaHash),
      evidenceField("Resolucion", resolutionText(record.fotoSalidaWidth, record.fotoSalidaHeight)),
      evidenceField("Tamano", formatBytes(record.fotoSalidaSizeBytes)),
      evidenceField("MIME", record.fotoSalidaMime),
      evidenceField("Storage path", record.fotoSalidaStoragePath),
      evidenceField("Captura cliente", displayTime(record.fotoSalidaCapturedAt) || record.fotoSalidaCapturedAt),
      evidenceField("Dispositivo", record.fotoSalidaDeviceLabel),
      evidenceField("GPS salida", record.latitudSalida && record.longitudSalida ? `${record.latitudSalida}, ${record.longitudSalida}` : "Pendiente"),
      evidenceField("Precision salida", formatMeters(record.precisionSalida || record.precisionUbicacion)),
      evidenceField("Distancia salida", formatMeters(record.distanciaSalidaMetros || record.distanciaEmpresaMetros)),
      evidenceField("Sitio salida", record.sitioSalidaNombre || record.sitioSalidaId),
      evidenceField("Ubicacion salida", record.ubicacionSalidaValidada ? "Validada" : "Revision"),
      evidenceField("Obs. salida", record.ubicacionSalidaObservacion),
    ])}
    ${metadataBlock("Validaciones", [
      evidenceField("QR usado", record.tokenQrUsado || record.qrSalida),
      evidenceField("Geo entrada", record.evidenciaEntradaGeolocalizada ? "Completa" : "Parcial"),
      evidenceField("Geo salida", record.evidenciaSalidaGeolocalizada ? "Completa" : "Parcial"),
      evidenceField("Observacion geo", record.evidenciaGeolocalizadaObservacion),
      evidenceField("Reto", record.retoVida),
      evidenceField("Riesgo", riskLabel(record.riesgo)),
      evidenceField("Observacion", record.observacion || record.observaciones),
      evidenceField("Privacidad", record.fotosPrivadas ? "Preparado para fotos privadas" : "URL publica temporal"),
    ])}
  `;
  els.evidenceModal.hidden = false;
  els.closeEvidence?.focus();
}

function closeEvidenceDetail() {
  if (!els.evidenceModal) return;
  els.evidenceModal.hidden = true;
  if (els.evidenceBody) els.evidenceBody.innerHTML = "";
}
function renderRecords() {
  updateSummary();
  els.recordsBody.innerHTML = "";
  els.emptyRecords.classList.toggle("is-hidden", state.records.length > 0);

  state.records.forEach((record) => {
    const row = document.createElement("tr");
    const statusClass = statusBadgeClass(record.estado);
    const identityClass = identityBadgeClass(record.validacionIdentidad);
    const riskClass = riskBadgeClass(record.riesgo);
    const adminClass = record.modificado_por_admin ? "admin" : "default";
    row.innerHTML = `
      <td>${imageCell(record.fotoEntrada, "Entrada")}</td>
      <td>${imageCell(record.fotoSalida, "Salida")}</td>
      <td>${escapeHtml(record.nombre)}</td>
      <td>${escapeHtml(record.matricula)}</td>
      <td>${escapeHtml(record.sitioNombre || "Sin sitio")}</td>
      <td>${escapeHtml(formatMeters(record.radioMetros))}</td>
      <td>${escapeHtml(displayDate(record.fecha))}</td>
      <td>${escapeHtml(record.horaEntrada)}</td>
      <td>${escapeHtml(record.horaSalida || "Pendiente")}</td>
      <td><span class="badge ${statusClass}">${escapeHtml(statusLabel(record.estado))}</span></td>
      <td><span class="badge ${identityClass}">${escapeHtml(identityLabel(record.validacionIdentidad))}</span></td>
      <td>${escapeHtml(formatSimilarity(record.similitudFacial))}</td>
      <td>${booleanBadge(record.qrValidado, "Validado", "Pendiente")}</td>
      <td>${booleanBadge(record.ubicacionEntradaValidada && (record.horaSalida ? record.ubicacionSalidaValidada : true), "Correcta", "Revision")}</td>
      <td>${escapeHtml(formatMeters(record.precisionSalida || record.precisionEntrada || record.precisionUbicacion))}</td>
      <td>${escapeHtml(formatMeters(record.distanciaSalidaMetros || record.distanciaEntradaMetros || record.distanciaEmpresaMetros))}</td>
      <td>${escapeHtml(record.retoVida || "Pendiente")}</td>
      <td><span class="badge ${riskClass}">${escapeHtml(riskLabel(record.riesgo))}</span></td>
      <td>${evidenceCell(record)}</td>
      <td>${escapeHtml(record.observacion || record.observaciones || "Sin observacion")}</td>
      <td>${escapeHtml(record.observacion_admin || "Sin observacion")}</td>
      <td><span class="badge ${adminClass}">${record.modificado_por_admin ? "Si" : "No"}</span></td>
      <td class="admin-only ${state.isAdmin ? "" : "is-hidden"}">
        <div class="row-actions">
          <button class="secondary mini" data-action="view-evidence" data-id="${record.id}">Ver evidencia</button>
          <button class="ghost mini" data-action="edit-observation" data-id="${record.id}">Observacion</button>
          <button class="danger mini" data-action="delete-record" data-id="${record.id}">Eliminar</button>
        </div>
      </td>
    `;
    els.recordsBody.appendChild(row);
  });

  updateAdminControls();
}
function updateSummary() {
  const completed = state.records.filter((record) => ["asistencia_completa", "Asistencia completa"].includes(record.estado)).length;
  const pending = state.records.length - completed;
  els.totalRecords.textContent = state.records.length;
  els.completedRecords.textContent = completed;
  els.pendingRecords.textContent = pending;
}
function imageCell(src, alt) {
  if (!src) return `<span class="muted">Sin foto</span>`;
  return `<span class="badge default">Foto protegida</span>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requestAdminAccess() {
  if (state.isAdmin) return true;
  const value = prompt("Ingresa la clave administrativa para continuar:");
  if (value === ADMIN_KEY) {
    state.isAdmin = true;
    updateAdminControls();
    renderRecords();
    loadActiveSite({ silent: true });
    addAdminLog("Desbloqueo admin", "Modo administrativo activado");
    showToast("Modo administrativo desbloqueado.");
    return true;
  }
  if (value !== null) {
    state.adminLog.unshift({ ...nowParts(), action: "Intento admin fallido", detail: "Clave incorrecta" });
    saveAdminLog();
    renderAdminAudit();
    showToast("Clave administrativa incorrecta.");
  }
  return false;
}

function lockAdmin() {
  state.isAdmin = false;
  updateAdminControls();
  renderRecords();
  showToast("Modo administrativo bloqueado.");
}

function updateAdminControls() {
  $$(".admin-control, .admin-only").forEach((element) => {
    element.classList.toggle("is-hidden", !state.isAdmin);
  });
  els.unlockAdmin.classList.toggle("is-hidden", state.isAdmin);
  els.lockAdmin.classList.toggle("is-hidden", !state.isAdmin);
  els.adminStatus.classList.toggle("is-blocked", !state.isAdmin);
  els.adminStatus.textContent = state.isAdmin
    ? "Modo administrativo activo. Las acciones sensibles quedaran registradas en auditoria."
    : CLOUD_ENABLED
      ? "Lista global activa. Los usuarios pueden consultar registros; las acciones sensibles requieren clave."
      : "Modo local activo. Configura Supabase para lista global.";
}

function renderAdminAudit() {
  if (!state.adminLog.length) {
    els.adminAudit.textContent = "No hay acciones administrativas registradas.";
    return;
  }

  els.adminAudit.innerHTML = state.adminLog
    .map((item) => `${escapeHtml(item.date)} ${escapeHtml(item.time)} - ${escapeHtml(item.action)}: ${escapeHtml(item.detail)}`)
    .join("<br>");
}

function exportCsv() {
  if (!requestAdminAccess()) return;
  if (!state.records.length) {
    showToast("No hay registros para exportar.");
    return;
  }

  const headers = [
    "Nombre",
    "Matricula",
    "Fecha",
    "Sitio",
    "Sitio ID",
    "Radio metros",
    "Hora de entrada",
    "Hora de salida",
    "Server time entrada",
    "Server time salida",
    "Foto de entrada",
    "Foto de salida",
    "Estado",
    "Validacion de identidad",
    "Similitud facial",
    "QR validado",
    "Token QR usado",
    "QR observacion",
    "Horario validado",
    "Horario observacion",
    "Ubicacion validada",
    "Distancia empresa metros",
    "Precision ubicacion",
    "Ubicacion observacion",
    "latitud_entrada",
    "longitud_entrada",
    "precision_entrada",
    "distancia_entrada_metros",
    "ubicacion_entrada_validada",
    "ubicacion_entrada_observacion",
    "sitio_entrada_id",
    "latitud_salida",
    "longitud_salida",
    "precision_salida",
    "distancia_salida_metros",
    "ubicacion_salida_validada",
    "ubicacion_salida_observacion",
    "sitio_salida_id",
    "evidencia_entrada_geolocalizada",
    "evidencia_salida_geolocalizada",
    "evidencia_geolocalizada_observacion",
    "Reto de vida",
    "Reto cumplido",
    "Riesgo",
    "Alertas",
    "Metodo de salida",
    "Observacion",
    "Observacion administrativa",
    "foto_entrada_hash",
    "foto_salida_hash",
    "foto_entrada_size_bytes",
    "foto_salida_size_bytes",
    "foto_entrada_resolution",
    "foto_salida_resolution",
    "foto_entrada_mime",
    "foto_salida_mime",
    "foto_entrada_storage_path",
    "foto_salida_storage_path",
    "fotos_privadas",
    "evidencia_completa",
    "evidencia_observacion",
    "Modificado por administrativo",
  ];

  const rows = state.records.map((record) => [
    record.nombre,
    record.matricula,
    displayDate(record.fecha),
    record.sitioNombre,
    record.sitioId,
    record.radioMetros,
    record.horaEntrada,
    record.horaSalida,
    record.serverTimeEntrada,
    record.serverTimeSalida,
    record.fotoEntrada,
    record.fotoSalida,
    statusLabel(record.estado),
    identityLabel(record.validacionIdentidad),
    formatSimilarity(record.similitudFacial),
    record.qrValidado ? "Si" : "No",
    record.tokenQrUsado || record.qrSalida,
    record.qrObservacion,
    record.horarioValidado ? "Si" : "No",
    record.horarioObservacion,
    record.ubicacionValidada ? "Si" : "No",
    record.distanciaEmpresaMetros,
    record.precisionUbicacion,
    record.ubicacionObservacion,
    record.latitudEntrada,
    record.longitudEntrada,
    record.precisionEntrada,
    record.distanciaEntradaMetros,
    record.ubicacionEntradaValidada ? "Si" : "No",
    record.ubicacionEntradaObservacion,
    record.sitioEntradaId,
    record.latitudSalida,
    record.longitudSalida,
    record.precisionSalida || record.precisionUbicacion,
    record.distanciaSalidaMetros || record.distanciaEmpresaMetros,
    record.ubicacionSalidaValidada ? "Si" : "No",
    record.ubicacionSalidaObservacion,
    record.sitioSalidaId,
    record.evidenciaEntradaGeolocalizada ? "Si" : "No",
    record.evidenciaSalidaGeolocalizada ? "Si" : "No",
    record.evidenciaGeolocalizadaObservacion,
    record.retoVida,
    record.retoVidaCumplido ? "Si" : "No",
    riskLabel(record.riesgo),
    Array.isArray(record.alertas) ? record.alertas.join(" | ") : JSON.stringify(record.alertas || []),
    record.metodoSalida,
    record.observacion || record.observaciones,
    record.observacion_admin,
    record.fotoEntradaHash,
    record.fotoSalidaHash,
    record.fotoEntradaSizeBytes,
    record.fotoSalidaSizeBytes,
    resolutionText(record.fotoEntradaWidth, record.fotoEntradaHeight),
    resolutionText(record.fotoSalidaWidth, record.fotoSalidaHeight),
    record.fotoEntradaMime,
    record.fotoSalidaMime,
    record.fotoEntradaStoragePath,
    record.fotoSalidaStoragePath,
    record.fotosPrivadas ? "Si" : "No",
    hasCompleteEvidence(record) ? "Si" : "No",
    record.evidenciaObservacion,
    record.modificado_por_admin ? "Si" : "No",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `asistencia-${todayIso()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  addAdminLog("Exportacion CSV", `${state.records.length} registros exportados`);
  showToast("CSV exportado correctamente.");
}
function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

async function clearRecords() {
  if (!requestAdminAccess()) return;
  if (!state.records.length) {
    showToast("No hay datos para limpiar.");
    return;
  }

  if (!confirm("Deseas eliminar todos los registros globales?")) return;

  try {
    if (CLOUD_ENABLED) {
      const deleted = await callAdminRpc("admin_clear_asistencias", { p_admin_key: ADMIN_KEY });
      addAdminLog("Limpieza global", `${deleted || state.records.length} registros eliminados`);
      await refreshRecords({ silent: true });
    } else {
      const total = state.records.length;
      state.records = [];
      persistLocalSnapshot();
      addAdminLog("Limpieza local", `${total} registros eliminados`);
      renderRecords();
    }
    showToast("Registros eliminados por administrativo.");
  } catch (error) {
    showToast("No se pudo limpiar la lista global.");
  }
}

async function editAdminObservation(id) {
  if (!requestAdminAccess()) return;
  const record = state.records.find((item) => item.id === id);
  if (!record) return;

  const value = prompt(
    `Observacion administrativa para ${record.matricula}:`,
    record.observacion_admin || ""
  );
  if (value === null) return;

  try {
    if (CLOUD_ENABLED) {
      await callAdminRpc("admin_update_observacion_asistencia", {
        p_id: id,
        p_admin_key: ADMIN_KEY,
        p_observacion: value.trim(),
      });
      await refreshRecords({ silent: true });
    } else {
      record.observacion_admin = value.trim();
      record.modificado_por_admin = true;
      persistLocalSnapshot();
      renderRecords();
    }
    addAdminLog("Observacion editada", `${record.matricula} - ${value.trim() || "Sin texto"}`);
    showToast("Observacion administrativa guardada.");
  } catch (error) {
    showToast("No se pudo guardar la observacion global.");
  }
}

async function deleteRecord(id) {
  if (!requestAdminAccess()) return;
  const record = state.records.find((item) => item.id === id);
  if (!record) return;

  if (!confirm(`Deseas eliminar el registro de ${record.matricula}?`)) return;

  try {
    if (CLOUD_ENABLED) {
      await callAdminRpc("admin_delete_asistencia", { p_id: id, p_admin_key: ADMIN_KEY });
      await refreshRecords({ silent: true });
    } else {
      state.records = state.records.filter((item) => item.id !== id);
      persistLocalSnapshot();
      renderRecords();
    }
    addAdminLog("Registro eliminado", `${record.matricula} del ${displayDate(record.fecha)}`);
    showToast("Registro eliminado por administrativo.");
  } catch (error) {
    showToast("No se pudo eliminar el registro global.");
  }
}

function handleRecordAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  if (button.dataset.action === "view-evidence") {
    showEvidenceDetail(button.dataset.id);
  }

  if (button.dataset.action === "edit-observation") {
    editAdminObservation(button.dataset.id);
  }

  if (button.dataset.action === "delete-record") {
    deleteRecord(button.dataset.id);
  }
}

async function init() {
  els.demoMode.checked = state.demoMode;
  setFaceStatus(els.entryFaceStatus, "Espera a que carguen los modelos faciales.", "pending");
  setFaceStatus(els.exitFaceStatus, "Espera a que carguen los modelos faciales.", "pending");
  syncCaptureControls();
  loadFaceModels();
  updateClockAndQr({ force: true });
  loadActiveSite({ silent: true });
  renderRecords();
  renderAdminAudit();
  updateAdminControls();
  setActiveNavigation("home");

  if (CLOUD_ENABLED) {
    await refreshRecords({ silent: true });
    showToast("Lista global conectada a Supabase.");
  } else {
    showToast("Modo local: falta configurar Supabase.");
  }

  setInterval(() => updateClockAndQr(), 1000);
  setInterval(() => refreshRecords({ silent: true }), 30000);

  $$('[data-target]').forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.target));
  });

  els.qrDirectLink.addEventListener("click", (event) => {
    event.preventDefault();
    window.history.replaceState(null, "", "#salida");
    showView("exit");
  });

  els.demoMode.addEventListener("change", () => {
    state.demoMode = els.demoMode.checked;
    localStorage.setItem(DEMO_KEY, String(state.demoMode));
    updateClockAndQr({ force: true });
    showToast(state.demoMode ? "Modo prueba local activado. En Supabase la salida sigue validando hora de servidor." : "Modo prueba desactivado.");
  });

  els.startEntryCamera.addEventListener("click", () => startCamera("entry"));
  els.takeEntryPhoto.addEventListener("click", () => takePhoto("entry"));
  els.entryForm.addEventListener("submit", handleEntrySubmit);

  els.startExitCamera.addEventListener("click", () => startCamera("exit"));
  els.takeExitPhoto.addEventListener("click", () => takePhoto("exit"));
  els.exitForm.addEventListener("submit", handleExitSubmit);

  els.unlockAdmin.addEventListener("click", requestAdminAccess);
  els.lockAdmin.addEventListener("click", lockAdmin);
  els.exportCsv.addEventListener("click", exportCsv);
  els.clearRecords.addEventListener("click", clearRecords);
  els.recordsBody.addEventListener("click", handleRecordAction);
  els.closeEvidence?.addEventListener("click", closeEvidenceDetail);
  els.evidenceModal?.addEventListener("click", (event) => {
    if (event.target === els.evidenceModal) closeEvidenceDetail();
  });
  els.siteForm?.addEventListener("submit", handleSiteSubmit);
  els.useAdminLocation?.addEventListener("click", useAdminLocation);
  els.testAdminLocation?.addEventListener("click", testAdminLocation);

  if (window.location.hash.startsWith("#salida")) {
    showView("exit");
  }
}

init();
