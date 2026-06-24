const STORAGE_KEY = "registro_asistencia_qr_v1";
const DEMO_KEY = "registro_asistencia_demo_mode";
const ADMIN_LOG_KEY = "registro_asistencia_admin_log_v1";
const ADMIN_KEY = "ADMIN123";
const QR_START = { hour: 16, minute: 30 };
const QR_END = { hour: 17, minute: 10 };
const QR_VALID_MINUTES = 5;
const FACE_MODEL_URL = "models";
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
    latitudSalida: null,
    longitudSalida: null,
    precisionUbicacion: null,
    distanciaEmpresaMetros: null,
    ubicacionObservacion: "",
    retoVida: "",
    retoVidaCumplido: false,
    retoVidaObservacion: "",
    riesgo: "normal",
    alertas: [],
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

function nowParts(date = new Date()) {
  return {
    date: date.toLocaleDateString("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    time: date.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function todayIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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
  });
}

function minutesFromStart(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
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
    ubicacionValidada: Boolean(row.ubicacion_validada),
    latitudSalida: row.latitud_salida ?? null,
    longitudSalida: row.longitud_salida ?? null,
    precisionUbicacion: row.precision_ubicacion ?? null,
    distanciaEmpresaMetros: row.distancia_empresa_metros ?? null,
    ubicacionObservacion: row.ubicacion_observacion || "",
    retoVida: row.reto_vida || "",
    retoVidaCumplido: Boolean(row.reto_vida_cumplido),
    retoVidaObservacion: row.reto_vida_observacion || "",
    riesgo: row.riesgo || "normal",
    alertas: row.alertas || [],
  });
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

async function uploadEvidence(dataUrl, matricula, kind) {
  if (!CLOUD_ENABLED) return dataUrl;
  const cleanMatricula = normalizeMatricula(matricula).replace(/[^A-Z0-9_-]/g, "");
  const path = `${todayIso()}/${cleanMatricula}/${kind}.jpg`;
  const blob = dataUrlToBlob(dataUrl);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");

  const response = await fetch(`${SUPABASE.url}/storage/v1/object/${SUPABASE.bucket}/${encodedPath}`, {
    method: "POST",
    headers: cloudHeaders({
      "Content-Type": blob.type || "image/jpeg",
      "x-upsert": "false",
    }),
    body: blob,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "No se pudo subir la evidencia");
  }

  return `${SUPABASE.url}/storage/v1/object/public/${SUPABASE.bucket}/${encodedPath}`;
}
async function insertEntryRecord({ nombre, matricula, fotoEntrada, descriptorEntrada }) {
  if (!CLOUD_ENABLED) {
    const localRecord = normalizeRecord({
      id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()),
      nombre,
      matricula,
      fecha: todayIso(),
      horaEntrada: nowParts().time,
      fotoEntrada,
      horaSalida: "",
      fotoSalida: "",
      qrSalida: "",
      estado: "entrada_registrada",
      validacionIdentidad: "pendiente",
      descriptorEntrada,
      rostroEntradaDetectado: true,
      serverTimeEntrada: new Date().toISOString(),
    });
    state.records.unshift(localRecord);
    persistLocalSnapshot();
    return localRecord;
  }

  const fotoUrl = await uploadEvidence(fotoEntrada, matricula, "entrada");
  const row = await callAdminRpc("registrar_entrada_segura", {
    p_nombre: nombre,
    p_matricula: matricula,
    p_foto_entrada_url: fotoUrl,
    p_descriptor_entrada: descriptorEntrada,
    p_rostro_entrada_detectado: true,
  });
  return rowToRecord(row);
}
async function updateExitRecord(record, { fotoSalida, qrToken, descriptorSalida, location, lifeChallenge }) {
  if (!CLOUD_ENABLED) {
    const faceValidation = evaluateFaceMatch(record.descriptorEntrada, descriptorSalida);
    record.horaSalida = nowParts().time;
    record.fotoSalida = fotoSalida;
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
    record.ubicacionValidada = location.estado === "ubicacion_correcta";
    record.precisionUbicacion = location.precision ?? null;
    record.retoVida = lifeChallenge;
    record.retoVidaCumplido = Boolean(lifeChallenge);
    record.riesgo = record.ubicacionValidada && faceValidation.status === "identidad_validada" ? "normal" : "revision_multiple";
    persistLocalSnapshot();
    return record;
  }

  const fotoUrl = await uploadEvidence(fotoSalida, record.matricula, "salida");
  const row = await callAdminRpc("registrar_salida_segura", {
    p_matricula: record.matricula,
    p_foto_salida_url: fotoUrl,
    p_descriptor_salida: descriptorSalida,
    p_token_qr: qrToken,
    p_latitud: location.latitud ?? null,
    p_longitud: location.longitud ?? null,
    p_precision: location.precision ?? null,
    p_ubicacion_estado: location.estado || "ubicacion_denegada",
    p_reto_vida: lifeChallenge || "",
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

function setLocationStatus(message, tone = "neutral") {
  if (!els.locationStatus) return;
  els.locationStatus.textContent = message;
  els.locationStatus.dataset.tone = tone;
}

function requestExitLocation() {
  setLocationStatus("Solicitando ubicacion para validar presencia.", "pending");
  if (!navigator.geolocation) {
    setLocationStatus("No se pudo obtener tu ubicacion. El registro quedara en revision.", "danger");
    return Promise.resolve({ estado: "ubicacion_denegada" });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          estado: position.coords.accuracy > 200 ? "ubicacion_imprecisa" : "ubicacion_correcta",
          latitud: Number(position.coords.latitude.toFixed(7)),
          longitud: Number(position.coords.longitude.toFixed(7)),
          precision: Math.round(position.coords.accuracy),
        };
        setLocationStatus(
          location.estado === "ubicacion_correcta"
            ? "Ubicacion recibida; el servidor validara el radio permitido."
            : "Precision GPS baja; el servidor marcara revision si corresponde.",
          location.estado === "ubicacion_correcta" ? "success" : "pending"
        );
        resolve(location);
      },
      () => {
        setLocationStatus("No se pudo obtener tu ubicacion. El registro quedara en revision.", "danger");
        resolve({ estado: "ubicacion_denegada" });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
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

  try {
    const record = await insertEntryRecord({
      nombre,
      matricula,
      fotoEntrada: state.entryPhoto,
      descriptorEntrada: state.entryFace.descriptor,
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
    showToast(CLOUD_ENABLED ? "Entrada registrada correctamente." : "Entrada registrada localmente.");
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
  return "neutral";
}

function riskLabel(value) {
  const labels = {
    normal: "Normal",
    revision_ubicacion: "Revision ubicacion",
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
  return "neutral";
}

function booleanBadge(value, trueText = "Si", falseText = "No") {
  return `<span class="badge ${value ? "success" : "warning"}">${value ? trueText : falseText}</span>`;
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
function renderRecords() {
  updateSummary();
  els.recordsBody.innerHTML = "";
  els.emptyRecords.classList.toggle("is-hidden", state.records.length > 0);

  state.records.forEach((record) => {
    const row = document.createElement("tr");
    const statusClass = statusBadgeClass(record.estado);
    const identityClass = identityBadgeClass(record.validacionIdentidad);
    const riskClass = riskBadgeClass(record.riesgo);
    const adminClass = record.modificado_por_admin ? "success" : "neutral";
    row.innerHTML = `
      <td>${imageCell(record.fotoEntrada, "Entrada")}</td>
      <td>${imageCell(record.fotoSalida, "Salida")}</td>
      <td>${escapeHtml(record.nombre)}</td>
      <td>${escapeHtml(record.matricula)}</td>
      <td>${escapeHtml(displayDate(record.fecha))}</td>
      <td>${escapeHtml(record.horaEntrada)}</td>
      <td>${escapeHtml(record.horaSalida || "Pendiente")}</td>
      <td><span class="badge ${statusClass}">${escapeHtml(statusLabel(record.estado))}</span></td>
      <td><span class="badge ${identityClass}">${escapeHtml(identityLabel(record.validacionIdentidad))}</span></td>
      <td>${escapeHtml(formatSimilarity(record.similitudFacial))}</td>
      <td>${booleanBadge(record.qrValidado, "Validado", "Pendiente")}</td>
      <td>${booleanBadge(record.ubicacionValidada, "Correcta", "Revision")}</td>
      <td>${escapeHtml(formatMeters(record.precisionUbicacion))}</td>
      <td>${escapeHtml(formatMeters(record.distanciaEmpresaMetros))}</td>
      <td>${escapeHtml(record.retoVida || "Pendiente")}</td>
      <td><span class="badge ${riskClass}">${escapeHtml(riskLabel(record.riesgo))}</span></td>
      <td>${escapeHtml(record.observacion || record.observaciones || "Sin observacion")}</td>
      <td>${escapeHtml(record.observacion_admin || "Sin observacion")}</td>
      <td><span class="badge ${adminClass}">${record.modificado_por_admin ? "Si" : "No"}</span></td>
      <td class="admin-only ${state.isAdmin ? "" : "is-hidden"}">
        <div class="row-actions">
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
  return `<a href="${src}" target="_blank" rel="noopener"><img class="thumb" src="${src}" alt="${alt}" /></a>`;
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
    "Reto de vida",
    "Reto cumplido",
    "Riesgo",
    "Alertas",
    "Metodo de salida",
    "Observacion",
    "Observacion administrativa",
    "Modificado por administrativo",
  ];

  const rows = state.records.map((record) => [
    record.nombre,
    record.matricula,
    displayDate(record.fecha),
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
    record.retoVida,
    record.retoVidaCumplido ? "Si" : "No",
    riskLabel(record.riesgo),
    Array.isArray(record.alertas) ? record.alertas.join(" | ") : JSON.stringify(record.alertas || []),
    record.metodoSalida,
    record.observacion || record.observaciones,
    record.observacion_admin,
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

  if (window.location.hash.startsWith("#salida")) {
    showView("exit");
  }
}

init();
