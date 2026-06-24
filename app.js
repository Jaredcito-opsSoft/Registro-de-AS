const STORAGE_KEY = "registro_asistencia_qr_v1";
const DEMO_KEY = "registro_asistencia_demo_mode";
const ADMIN_LOG_KEY = "registro_asistencia_admin_log_v1";
const ADMIN_KEY = "ADMIN123";
const QR_START = { hour: 16, minute: 30 };
const QR_END = { hour: 17, minute: 10 };
const QR_VALID_MINUTES = 5;

const state = {
  records: loadRecords(),
  adminLog: loadAdminLog(),
  demoMode: localStorage.getItem(DEMO_KEY) === "true",
  isAdmin: false,
  entryPhoto: "",
  exitPhoto: "",
  entryStream: null,
  exitStream: null,
  qrToken: "",
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

function loadRecords() {
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

function saveRecords() {
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
  const day = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `SALIDA-${day}-${bucket}`;
}

function getExitUrl(token) {
  const base = window.location.href.split("#")[0];
  return `${base}#salida?token=${encodeURIComponent(token)}`;
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
  if (name === "records") renderRecords();
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
  }, 3200);
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
  const { date } = nowParts();
  return state.records.find(
    (record) => record.fecha === date && record.matricula === matricula
  );
}

function handleEntrySubmit(event) {
  event.preventDefault();

  const nombre = els.entryName.value.trim();
  const matricula = normalizeMatricula(els.entryMatricula.value);
  const { date, time } = nowParts();

  if (!state.entryPhoto || !nombre || !matricula) {
    showToast("Falta foto, nombre o matricula para guardar la entrada.");
    return;
  }

  if (todayRecordByMatricula(matricula)) {
    showToast("Ya existe un registro para esa matricula el dia de hoy.");
    return;
  }

  state.records.unshift({
    id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : String(Date.now()),
    nombre,
    matricula,
    fecha: date,
    horaEntrada: time,
    fotoEntrada: state.entryPhoto,
    horaSalida: "",
    fotoSalida: "",
    qrSalida: "",
    estado: "Entrada registrada",
    bloqueado: true,
    observaciones: "",
    observacion_admin: "",
    modificado_por_admin: false,
  });

  saveRecords();
  state.entryPhoto = "";
  els.entryForm.reset();
  els.entryPreview.classList.add("is-hidden");
  stopCamera("entry");
  showToast("Entrada registrada correctamente.");
  renderRecords();
}

function handleExitSubmit(event) {
  event.preventDefault();

  if (!isQrWindowOpen()) {
    showToast("No se puede registrar salida fuera del horario permitido.");
    return;
  }

  const matricula = normalizeMatricula(els.exitMatricula.value);
  const record = todayRecordByMatricula(matricula);
  const { time } = nowParts();

  if (!matricula || !state.exitPhoto) {
    showToast("Falta matricula o foto de salida.");
    return;
  }

  if (!record) {
    showToast("No existe entrada registrada hoy para esa matricula.");
    return;
  }

  if (record.horaSalida) {
    showToast("La salida de esa matricula ya fue registrada.");
    return;
  }

  record.horaSalida = time;
  record.fotoSalida = state.exitPhoto;
  record.qrSalida = state.qrToken;
  record.estado = "Asistencia completa";
  record.observaciones = "Salida validada por QR";
  record.bloqueado = true;

  saveRecords();
  state.exitPhoto = "";
  els.exitForm.reset();
  els.exitPreview.classList.add("is-hidden");
  stopCamera("exit");
  showToast("Salida registrada correctamente.");
  renderRecords();
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
      <td>${escapeHtml(record.fecha)}</td>
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
  return `<img class="thumb" src="${src}" alt="${alt}" />`;
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
    : "Modo lectura activo. No se pueden modificar horarios, fotos, estados ni eliminar registros.";
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
    record.fecha,
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
  link.download = `asistencia-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  addAdminLog("Exportacion CSV", `${state.records.length} registros exportados`);
  showToast("CSV exportado correctamente.");
}

function csvCell(value) {
  const text = String(value ?? "").replaceAll('"', '""');
  return `"${text}"`;
}

function clearRecords() {
  if (!requestAdminAccess()) return;
  if (!state.records.length) {
    showToast("No hay datos para limpiar.");
    return;
  }

  if (confirm("Deseas eliminar todos los registros guardados en este navegador?")) {
    const total = state.records.length;
    state.records = [];
    saveRecords();
    addAdminLog("Limpieza de datos", `${total} registros eliminados`);
    renderRecords();
    showToast("Registros eliminados por administrativo.");
  }
}

function editAdminObservation(id) {
  if (!requestAdminAccess()) return;
  const record = state.records.find((item) => item.id === id);
  if (!record) return;

  const value = prompt(
    `Observacion administrativa para ${record.matricula}:`,
    record.observacion_admin || ""
  );
  if (value === null) return;

  record.observacion_admin = value.trim();
  record.modificado_por_admin = true;
  saveRecords();
  addAdminLog("Observacion editada", `${record.matricula} - ${record.observacion_admin || "Sin texto"}`);
  renderRecords();
  showToast("Observacion administrativa guardada.");
}

function deleteRecord(id) {
  if (!requestAdminAccess()) return;
  const record = state.records.find((item) => item.id === id);
  if (!record) return;

  if (confirm(`Deseas eliminar el registro de ${record.matricula}?`)) {
    state.records = state.records.filter((item) => item.id !== id);
    saveRecords();
    addAdminLog("Registro eliminado", `${record.matricula} del ${record.fecha}`);
    renderRecords();
    showToast("Registro eliminado por administrativo.");
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

function init() {
  els.demoMode.checked = state.demoMode;
  updateClockAndQr();
  renderRecords();
  renderAdminAudit();
  updateAdminControls();
  setActiveNavigation("home");

  setInterval(updateClockAndQr, 1000);

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


