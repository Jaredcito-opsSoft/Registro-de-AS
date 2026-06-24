const STORAGE_KEY = "registro_asistencia_qr_v1";
const DEMO_KEY = "registro_asistencia_demo_mode";
const ADMIN_LOG_KEY = "registro_asistencia_admin_log_v1";
const ADMIN_KEY = "ADMIN123";
const QR_START = { hour: 16, minute: 30 };
const QR_END = { hour: 17, minute: 10 };
const QR_VALID_MINUTES = 5;
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
    observaciones: "",
    observacion_admin: "",
    modificado_por_admin: false,
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
    qrSalida: row.qr_salida || "",
    estado: row.estado,
    bloqueado: row.bloqueado,
    observaciones: row.observaciones || "",
    observacion_admin: row.observacion_admin || "",
    modificado_por_admin: Boolean(row.modificado_por_admin),
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
  const path = `${todayIso()}/${cleanMatricula}-${kind}-${Date.now()}.jpg`;
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

async function insertEntryRecord({ nombre, matricula, fotoEntrada }) {
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
      estado: "Entrada registrada",
    });
    state.records.unshift(localRecord);
    persistLocalSnapshot();
    return localRecord;
  }

  const fotoUrl = await uploadEvidence(fotoEntrada, matricula, "entrada");
  const [row] = await supabaseRequest("/rest/v1/asistencias?select=*", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      nombre,
      matricula,
      fecha: todayIso(),
      hora_entrada: new Date().toISOString(),
      foto_entrada_url: fotoUrl,
      estado: "Entrada registrada",
      bloqueado: true,
    }),
  });
  return rowToRecord(row);
}

async function updateExitRecord(record, { fotoSalida, qrToken }) {
  if (!CLOUD_ENABLED) {
    record.horaSalida = nowParts().time;
    record.fotoSalida = fotoSalida;
    record.qrSalida = qrToken;
    record.estado = "Asistencia completa";
    record.observaciones = "Salida validada por QR";
    persistLocalSnapshot();
    return record;
  }

  const fotoUrl = await uploadEvidence(fotoSalida, record.matricula, "salida");
  const [row] = await supabaseRequest(`/rest/v1/asistencias?id=eq.${encodeURIComponent(record.id)}&select=*`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      hora_salida: new Date().toISOString(),
      foto_salida_url: fotoUrl,
      qr_salida: qrToken,
      estado: "Asistencia completa",
      observaciones: "Salida validada por QR",
      updated_at: new Date().toISOString(),
    }),
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

function updateClockAndQr() {
  const now = new Date();
  const { time } = nowParts(now);
  const isOpen = isQrWindowOpen(now);
  const token = makeQrToken(now);
  const exitUrl = getExitUrl(token);

  state.qrToken = token;
  els.clockLabel.textContent = time;
  els.qrWindowLabel.textContent = isOpen ? "QR disponible" : "QR bloqueado";
  els.qrMessage.textContent = isOpen
    ? "El QR esta vigente. Puede abrir el registro de salida."
    : "El QR de salida no esta disponible fuera del horario permitido.";

  els.qrBox.classList.toggle("is-disabled", !isOpen);
  els.qrImage.hidden = !isOpen;
  els.qrDirectLink.hidden = !isOpen;
  els.qrTokenLabel.textContent = isOpen ? `Token: ${token}` : "Token: no disponible";
  els.qrDirectLink.href = exitUrl;
  els.qrImage.src = isOpen
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(exitUrl)}`
    : "";

  els.exitGuard.textContent = isOpen
    ? "QR vigente. Captura la foto de salida y escribe la matricula."
    : "Salida bloqueada. El QR solo esta disponible de 4:30 p. m. a 5:10 p. m.";
  els.exitGuard.classList.toggle("is-blocked", !isOpen);
}

function showView(name) {
  $$('[data-view]').forEach((view) => {
    view.classList.toggle("is-hidden", view.dataset.view !== name);
  });

  setActiveNavigation(name);
  if (name !== "entry") stopCamera("entry");
  if (name !== "exit") stopCamera("exit");
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

async function startCamera(kind) {
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;
  const button = kind === "entry" ? els.takeEntryPhoto : els.takeExitPhoto;

  try {
    stopCamera(kind);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    state[`${kind}Stream`] = stream;
    button.disabled = false;
    showToast("Camara activada. Ya puedes tomar la foto.");
  } catch (error) {
    showToast("No se pudo acceder a la camara. Revisa permisos o usa localhost.");
  }
}

function stopCamera(kind) {
  const stream = state[`${kind}Stream`];
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;
  const button = kind === "entry" ? els.takeEntryPhoto : els.takeExitPhoto;

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  state[`${kind}Stream`] = null;
  video.srcObject = null;
  button.disabled = true;
}

function takePhoto(kind) {
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;
  const canvas = kind === "entry" ? els.entryCanvas : els.exitCanvas;
  const preview = kind === "entry" ? els.entryPreview : els.exitPreview;

  if (!video.videoWidth) {
    showToast("Primero activa la camara.");
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL("image/jpeg", 0.78);
  state[`${kind}Photo`] = image;
  preview.src = image;
  preview.classList.remove("is-hidden");
  showToast("Foto capturada correctamente.");
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

  if (!state.entryPhoto || !nombre || !matricula) {
    showToast("Falta foto, nombre o matricula para guardar la entrada.");
    return;
  }

  await refreshRecords({ silent: true });

  if (todayRecordByMatricula(matricula)) {
    showToast("Ya existe un registro para esa matricula el dia de hoy.");
    return;
  }

  try {
    const record = await insertEntryRecord({ nombre, matricula, fotoEntrada: state.entryPhoto });
    state.records.unshift(record);
    persistLocalSnapshot();
    state.entryPhoto = "";
    els.entryForm.reset();
    els.entryPreview.classList.add("is-hidden");
    stopCamera("entry");
    await refreshRecords({ silent: true });
    showToast(CLOUD_ENABLED ? "Entrada guardada en lista global." : "Entrada registrada localmente.");
  } catch (error) {
    showToast("No se pudo guardar la entrada global. Intenta de nuevo.");
  }
}

async function handleExitSubmit(event) {
  event.preventDefault();

  if (!isQrWindowOpen()) {
    showToast("No se puede registrar salida fuera del horario permitido.");
    return;
  }

  const matricula = normalizeMatricula(els.exitMatricula.value);

  if (!matricula || !state.exitPhoto) {
    showToast("Falta matricula o foto de salida.");
    return;
  }

  await refreshRecords({ silent: true });
  const record = todayRecordByMatricula(matricula);

  if (!record) {
    showToast("No existe entrada registrada hoy para esa matricula.");
    return;
  }

  if (record.horaSalida) {
    showToast("La salida de esa matricula ya fue registrada.");
    return;
  }

  try {
    await updateExitRecord(record, { fotoSalida: state.exitPhoto, qrToken: state.qrToken });
    state.exitPhoto = "";
    els.exitForm.reset();
    els.exitPreview.classList.add("is-hidden");
    stopCamera("exit");
    await refreshRecords({ silent: true });
    showToast(CLOUD_ENABLED ? "Salida guardada en lista global." : "Salida registrada localmente.");
  } catch (error) {
    showToast("No se pudo guardar la salida global. Intenta de nuevo.");
  }
}

function renderRecords() {
  updateSummary();
  els.recordsBody.innerHTML = "";
  els.emptyRecords.classList.toggle("is-hidden", state.records.length > 0);

  state.records.forEach((record) => {
    const row = document.createElement("tr");
    const statusClass = record.estado === "Asistencia completa" ? "" : "pending";
    const adminClass = record.modificado_por_admin ? "" : "pending";
    row.innerHTML = `
      <td>${imageCell(record.fotoEntrada, "Entrada")}</td>
      <td>${imageCell(record.fotoSalida, "Salida")}</td>
      <td>${escapeHtml(record.nombre)}</td>
      <td>${escapeHtml(record.matricula)}</td>
      <td>${escapeHtml(displayDate(record.fecha))}</td>
      <td>${escapeHtml(record.horaEntrada)}</td>
      <td>${escapeHtml(record.horaSalida || "Pendiente")}</td>
      <td><span class="badge ${statusClass}">${escapeHtml(record.estado)}</span></td>
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
  const completed = state.records.filter((record) => record.estado === "Asistencia completa").length;
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
    showToast("Modo administrativo desbloqueado.");
    return true;
  }
  if (value !== null) showToast("Clave administrativa incorrecta.");
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
    "Estado",
    "QR usado",
    "Observaciones",
    "Observacion administrativa",
    "Modificado por administrativo",
  ];

  const rows = state.records.map((record) => [
    record.nombre,
    record.matricula,
    displayDate(record.fecha),
    record.horaEntrada,
    record.horaSalida,
    record.estado,
    record.qrSalida,
    record.observaciones,
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
  updateClockAndQr();
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

  setInterval(updateClockAndQr, 1000);
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
    updateClockAndQr();
    showToast(state.demoMode ? "Modo prueba activado." : "Modo prueba desactivado.");
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
