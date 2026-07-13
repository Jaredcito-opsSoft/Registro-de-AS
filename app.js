const STORAGE_KEY = "registro_asistencia_qr_v1";
const DEMO_KEY = "registro_asistencia_demo_mode";
const ADMIN_LOG_KEY = "registro_asistencia_admin_log_v1";
const ADMIN_KEY = "ADMIN123";
const QR_START = { hour: 16, minute: 30 };
const QR_END = { hour: 17, minute: 10 };
const QR_VALID_MINUTES = 5;
const FACE_MODEL_URL = window.location.origin + "/models";
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
const LOCAL_ASSET_VERSION = "2.16-permission-toggle-source";
const ATTENDANCE_STREAK_RPC_ENABLED = SUPABASE.enableAttendanceStreakRpc === true;
const KNOWN_SUPERADMIN_EMAILS = new Set([
  "alexisdavid1177@gmail.com",
  "jaredcontacto.mx@gmail.com",
]);

const ROLE_DEFINITIONS = {
  usuario: {
    label: "Usuario",
    scope: "Puede registrar asistencia y consultar sus propios registros.",
    rank: 10,
    permissions: {
      register_attendance: true,
      view_own_records: true,
      view_site_records: false,
      view_all_records: false,
      view_evidence: false,
      export_records: false,
      manage_records: false,
      manage_site: false,
      manage_organization: false,
      manage_roles: false,
      view_audit: false,
    },
  },
  supervisor: {
    label: "Supervisor",
    scope: "Puede revisar registros y evidencia de su sitio operativo.",
    rank: 20,
    permissions: {
      register_attendance: true,
      view_own_records: true,
      view_site_records: true,
      view_all_records: false,
      view_evidence: true,
      export_records: false,
      manage_records: false,
      manage_site: false,
      manage_organization: false,
      manage_roles: false,
      view_audit: false,
    },
  },
  admin: {
    label: "Administrador",
    scope: "Administra su sitio u organizacion: registros, usuarios, ubicacion, fotos y auditoria local.",
    rank: 30,
    permissions: {
      register_attendance: true,
      view_own_records: true,
      view_site_records: true,
      view_all_records: false,
      view_evidence: true,
      export_records: true,
      manage_records: true,
      manage_site: true,
      manage_organization: false,
      manage_roles: false,
      view_audit: true,
    },
  },
  superadmin: {
    label: "Superadmin",
    scope: "Puede administrar organizaciones, roles y todo el entorno empresarial.",
    rank: 40,
    permissions: {
      register_attendance: true,
      view_own_records: true,
      view_site_records: true,
      view_all_records: true,
      view_evidence: true,
      export_records: true,
      manage_records: true,
      manage_site: true,
      manage_organization: true,
      manage_roles: true,
      view_audit: true,
    },
  },
};

const state = {
  records: loadLocalRecords(),
  adminLog: loadAdminLog(),
  demoMode: localStorage.getItem(DEMO_KEY) === "true",
  isAdmin: false,
  manualAdminUnlocked: false,
  entryPhoto: "",
  exitPhoto: "",
  entryStream: null,
  exitStream: null,
  loadingRecords: false,
  facialModelsLoaded: false,
  facialModelsError: false,
  entryFace: null,
  exitFace: null,
  lifeChallenge: "",
  serverClockOffset: 0,
  nextQrRefreshAt: 0,
  activeSite: null,
  adminLocation: null,
  exitActiveRecord: null,
  exitLookupSeq: 0,
  currentUser: null,
  currentAppUser: null,
  currentRole: "usuario",
  currentPermissions: { ...ROLE_DEFINITIONS.usuario.permissions },
  activeAdminSection: "summary",
  attendanceStreak: null,
  organizationHubs: [],
  selectedOrganizationId: null,
  managedSites: [],
  managedUsers: [],
  recordFilters: {
    date: "",
    status: "all",
    risk: "all",
    site: "all",
    user: "all",
    query: "",
  },
  permissionPreferences: { camera: true, location: true },
  permissionStatus: { camera: "unknown", location: "unknown" },
  permissionApprovals: { camera: false, location: false },
  permissionSelections: { camera: false, location: false },
  deferredInstallPrompt: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {};
let localAvatarObjectUrl = "";
const AVATAR_DB_NAME = "asistencia-profile-media";
const AVATAR_STORE_NAME = "avatars";

function populateElements() {
  els.clockLabel = $("#clockLabel");
  els.clockDateLabel = $("#clockDateLabel");
  els.homeAttendanceHint = $("#homeAttendanceHint");
  els.homeGreeting = $("#homeGreeting");
  els.homeWelcomeName = $("#homeWelcomeName");
  els.permissionOnboarding = $("#permissionOnboarding");
  els.permissionOnboardingTitle = $("#permissionOnboardingTitle");
  els.requestAttendancePermissions = $("#requestAttendancePermissions");
  els.profilePermissions = $("#profilePermissions");
  els.headerProfileAvatar = $("#headerProfileAvatar");
  els.headerAvatarImage = $("#headerAvatarImage");
  els.headerAvatarFallback = $("#headerAvatarFallback");
  els.profileAvatarInput = $("#profileAvatarInput");
  els.profileAvatarImage = $("#profileAvatarImage");
  els.profileAvatarFallback = $("#profileAvatarFallback");
  els.profileAvatarChangeLabel = $("#profileAvatarChangeLabel");
  els.removeProfileAvatar = $("#removeProfileAvatar");
  els.profileCameraEnabled = $("#profileCameraEnabled");
  els.profileLocationEnabled = $("#profileLocationEnabled");
  els.profileCameraPermissionStatus = $("#profileCameraPermissionStatus");
  els.profileLocationPermissionStatus = $("#profileLocationPermissionStatus");
  els.demoMode = $("#demoMode");
  els.toast = $("#toast");
  els.faceStatus = $("#faceStatus");
  els.entryFaceStatus = $("#entryFaceStatus");
  els.exitFaceStatus = $("#exitFaceStatus");
  els.lifeChallenge = $("#lifeChallenge");
  els.entryLocationStatus = $("#entryLocationStatus");
  els.locationStatus = $("#locationStatus");
  els.entryVideo = $("#entryVideo");
  els.entryCanvas = $("#entryCanvas");
  els.entryPreview = $("#entryPreview");
  els.startEntryCamera = $("#startEntryCamera");
  els.takeEntryPhoto = $("#takeEntryPhoto");
  els.entryForm = $("#entryForm");
  els.entryName = $("#entryName");
  els.entryMatricula = $("#entryMatricula");
  els.exitGuard = $("#exitGuard");
  els.exitVideo = $("#exitVideo");
  els.exitCanvas = $("#exitCanvas");
  els.exitPreview = $("#exitPreview");
  els.startExitCamera = $("#startExitCamera");
  els.takeExitPhoto = $("#takeExitPhoto");
  els.exitForm = $("#exitForm");
  els.exitMatricula = $("#exitMatricula");
  els.exitLookupInfo = $("#exitLookupInfo");
  els.recordsBody = $("#recordsBody");
  els.recordsMobileCards = $("#recordsMobileCards");
  els.mobileRecordsCount = $("#mobileRecordsCount");
  els.recordsSummaryTotal = $("#recordsSummaryTotal");
  els.recordsSummaryComplete = $("#recordsSummaryComplete");
  els.recordsSummaryPending = $("#recordsSummaryPending");
  els.emptyRecords = $("#emptyRecords");
  els.unlockAdmin = $("#unlockAdmin");
  els.lockAdmin = $("#lockAdmin");
  els.exportCsv = $("#exportCsv");
  els.clearRecords = $("#clearRecords");
  els.adminSectionHint = $("#adminSectionHint");
  els.adminRoleBadge = $("#adminRoleBadge");
  els.adminAudit = $("#adminAudit");
  els.recordsKicker = $("#recordsKicker");
  els.recordsTitle = $("#recordsTitle");
  els.recordsSubtitle = $("#recordsSubtitle");
  els.totalRecords = $("#totalRecords");
  els.completedRecords = $("#completedRecords");
  els.pendingRecords = $("#pendingRecords");
  els.totalProgress = $("#totalProgress");
  els.completedProgress = $("#completedProgress");
  els.pendingProgress = $("#pendingProgress");
  els.dashboardVisibleTotal = $("#dashboardVisibleTotal");
  els.dashboardToday = $("#dashboardToday");
  els.dashboardCompleted = $("#dashboardCompleted");
  els.dashboardPending = $("#dashboardPending");
  els.dashboardReview = $("#dashboardReview");
  els.dashboardIssues = $("#dashboardIssues");
  els.dashboardCompletionRate = $("#dashboardCompletionRate");
  els.dashboardScopeLabel = $("#dashboardScopeLabel");
  els.dashboardAlerts = $("#dashboardAlerts");
  els.siteUsersTotal = $("#siteUsersTotal");
  els.siteUsersList = $("#siteUsersList");
  els.filterDate = $("#filterDate");
  els.filterStatus = $("#filterStatus");
  els.filterRisk = $("#filterRisk");
  els.filterSite = $("#filterSite");
  els.filterUser = $("#filterUser");
  els.filterSearch = $("#filterSearch");
  els.clearDashboardFilters = $("#clearDashboardFilters");
  els.adminRecordsBody = $("#adminRecordsBody");
  els.adminEmptyRecords = $("#adminEmptyRecords");
  els.adminFilterDate = $("#adminFilterDate");
  els.adminFilterStatus = $("#adminFilterStatus");
  els.adminFilterRisk = $("#adminFilterRisk");
  els.adminFilterSite = $("#adminFilterSite");
  els.adminFilterUser = $("#adminFilterUser");
  els.adminFilterSearch = $("#adminFilterSearch");
  els.adminClearDashboardFilters = $("#adminClearDashboardFilters");
  els.dashboardLate = $("#dashboardLate");
  els.dashboardNoExit = $("#dashboardNoExit");
  els.orgStatusBadge = $("#orgStatusBadge");
  els.orgFoundationSummary = $("#orgFoundationSummary");
  els.orgNameLabel = $("#orgNameLabel");
  els.orgTypeLabel = $("#orgTypeLabel");
  els.orgSlugLabel = $("#orgSlugLabel");
  els.orgSitesLabel = $("#orgSitesLabel");
  els.orgUsersLabel = $("#orgUsersLabel");
  els.orgAttendancesLabel = $("#orgAttendancesLabel");
  els.organizationForm = $("#organizationForm");
  els.organizationList = $("#organizationList");
  els.organizationSearch = $("#organizationSearch");
  els.organizationDetail = $("#organizationDetail");
  els.organizationHubNotice = $("#organizationHubNotice");
  els.newOrganizationButton = $("#newOrganizationButton");
  els.editOrganizationButton = $("#editOrganizationButton");
  els.deleteOrganizationButton = $("#deleteOrganizationButton");
  els.cancelOrganizationEdit = $("#cancelOrganizationEdit");
  els.organizationFormTitle = $("#organizationFormTitle");
  els.organizationFormStatus = $("#organizationFormStatus");
  els.orgEditId = $("#orgEditId");
  els.orgActive = $("#orgActive");
  els.orgKeyHint = $("#orgKeyHint");
  els.siteDirectory = $("#siteDirectory");
  els.userDirectory = $("#userDirectory");
  els.adminUsersSummary = $("#adminUsersSummary");
  els.adminUsersScopeBadge = $("#adminUsersScopeBadge");
  els.adminUsersCount = $("#adminUsersCount");
  els.adminUsersNoSiteCount = $("#adminUsersNoSiteCount");
  els.adminUsersBySite = $("#adminUsersBySite");
  els.adminInviteEmail = $("#adminInviteEmail");
  els.adminInviteSite = $("#adminInviteSite");
  els.adminInviteKey = $("#adminInviteKey");
  els.prepareAdminInvite = $("#prepareAdminInvite");
  els.copyAdminInviteKey = $("#copyAdminInviteKey");
  els.adminInviteStatus = $("#adminInviteStatus");
  els.orgCreateName = $("#orgCreateName");
  els.orgCreateType = $("#orgCreateType");
  els.orgCreateSlug = $("#orgCreateSlug");
  els.orgCreateKey = $("#orgCreateKey");
  els.newSiteButton = $("#newSiteButton");
  els.cancelSiteEdit = $("#cancelSiteEdit");
  els.siteFormTitle = $("#siteFormTitle");
  els.siteEditId = $("#siteEditId");
  els.siteOrganizationId = $("#siteOrganizationId");
  els.siteStatusBadge = $("#siteStatusBadge");
  els.siteStatusSummary = $("#siteStatusSummary");
  els.siteNameLabel = $("#siteNameLabel");
  els.siteAddressLabel = $("#siteAddressLabel");
  els.siteCoordsLabel = $("#siteCoordsLabel");
  els.siteRadiusLabel = $("#siteRadiusLabel");
  els.siteEntryHoursLabel = $("#siteEntryHoursLabel");
  els.siteExitHoursLabel = $("#siteExitHoursLabel");
  els.siteTimezoneLabel = $("#siteTimezoneLabel");
  els.sitePrecisionLabel = $("#sitePrecisionLabel");
  els.siteTestResult = $("#siteTestResult");
  els.siteForm = $("#siteForm");
  els.siteName = $("#siteName");
  els.siteAddress = $("#siteAddress");
  els.siteLat = $("#siteLat");
  els.siteLng = $("#siteLng");
  els.siteRadius = $("#siteRadius");
  els.siteEntryStart = $("#siteEntryStart");
  els.siteEntryEnd = $("#siteEntryEnd");
  els.siteExitStart = $("#siteExitStart");
  els.siteExitEnd = $("#siteExitEnd");
  els.siteTimezone = $("#siteTimezone");
  els.siteGpsPolicy = $("#siteGpsPolicy");
  els.siteEvidencePolicy = $("#siteEvidencePolicy");
  els.siteIdentifierLabel = $("#siteIdentifierLabel");
  els.siteKey = $("#siteKey");
  els.siteActive = $("#siteActive");
  els.generateSiteKey = $("#generateSiteKey");
  els.copySiteKey = $("#copySiteKey");
  els.useAdminLocation = $("#useAdminLocation");
  els.testAdminLocation = $("#testAdminLocation");
  els.evidenceModal = $("#evidenceModal");
  els.evidenceBody = $("#evidenceBody");
  els.closeEvidence = $("#closeEvidence");
  els.entrySuccessPanel = $("#entrySuccessPanel");
  els.exitSuccessPanel = $("#exitSuccessPanel");
  els.loginView = $("#login-view");
  els.appShell = $(".app-shell");
  els.authForm = $("#authForm");
  els.authEmail = $("#authEmail");
  els.authPassword = $("#authPassword");
  els.authName = $("#authName");
  els.authMatricula = $("#authMatricula");
  els.authOrgKey = $("#authOrgKey");
  els.authOrgSelect = $("#authOrgSelect");
  els.authOrgSelectFallback = $("#authOrgSelectFallback");
  els.authOrgSelectFallbackWrap = $("#authOrgSelectFallbackWrap");
  els.authPhone = $("#authPhone");
  els.authOrgKeyWrap = $("#label-org-key-wrap");
  els.authOrgKeyToggle = $("#authOrgKeyToggle");
  els.authInputBadge = $("#authInputBadge");
  els.authSubmitBtn = $("#authSubmitBtn");
  els.guestAccessBtn = $("#guestAccessBtn");
  els.toggleLoginBtn = $("#toggle-login-btn");
  els.toggleRegisterBtn = $("#toggle-register-btn");
  els.labelName = $("#label-name");
  els.labelMatricula = $("#label-matricula");
  els.labelPhone = $("#label-phone");
  els.labelOrgSelect = $("#label-org-select");
  els.labelOrgKey = $("#label-org-key");
  els.labelEmailText = $("#label-email-text");
  els.labelEmailHint = $("#label-email-hint");
  els.emailNudgePanel = $("#emailNudgePanel");
  els.nudgeEmail = $("#nudgeEmail");
  els.nudgeEmailSubmit = $("#nudgeEmailSubmit");
  els.nudgeEmailDismiss = $("#nudgeEmailDismiss");
  els.loginTitle = $("#login-title");
  els.loginSubtitle = $("#login-subtitle");
  els.profileName = $("#profileName");
  els.profileMatricula = $("#profileMatricula");
  els.profileEmail = $("#profileEmail");
  els.profileRole = $("#profileRole");
  els.profileScope = $("#profileScope");
  els.streakDays = $("#streakDays");
  els.streakCompliance = $("#streakCompliance");
  els.streakSite = $("#streakSite");
  els.streakSchedule = $("#streakSchedule");
  els.streakSummary = $("#streakSummary");
  els.userInitials = $("#userInitials");
  els.btnLogout = $("#btn-logout");
  els.btnLogoutProfile = $("#btn-logout-profile");
  els.pwaInstallBanner = $("#pwaInstallBanner");
  els.pwaInstallButton = $("#pwaInstallButton");
  els.pwaInstallHelp = $("#pwaInstallHelp");
  els.profileForm = $("#profileForm");
  els.profileSubmitBtn = $("#save-profile-btn");
  els.homeStreakDays = $("#homeStreakDays");
  els.homeStreakHours = $("#homeStreakHours");
  els.appStatusBanner = $("#appStatusBanner");
}


function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isIosSafari() {
  const ua = window.navigator.userAgent || "";
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isWebKit = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  return isIos && isWebKit;
}

function updatePwaInstallUi() {
  if (!els.pwaInstallBanner) return;
  const canInstall = Boolean(state.deferredInstallPrompt);
  const showIosHelp = isIosSafari() && !isStandaloneDisplay();
  const shouldShow = !isStandaloneDisplay();

  els.pwaInstallBanner.classList.toggle("is-hidden", !shouldShow);
  els.pwaInstallButton?.classList.toggle("is-hidden", false);
  if (els.pwaInstallButton) els.pwaInstallButton.disabled = false;
  if (els.pwaInstallHelp) {
    els.pwaInstallHelp.classList.toggle("is-hidden", false);
    els.pwaInstallHelp.textContent = showIosHelp
      ? "En Safari: Compartir y Agregar a inicio."
      : "Tambien disponible desde el menu del navegador.";
  }
}

function setupPwaInstall() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`/service-worker.js?v=${LOCAL_ASSET_VERSION}`).then((registration) => {
        registration.update?.();
      }).catch(() => {
        console.warn("No se pudo registrar el service worker.");
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    updatePwaInstallUi();
  });

  window.addEventListener("appinstalled", () => {
    state.deferredInstallPrompt = null;
    updatePwaInstallUi();
    showToast("Asistencia QR instalada correctamente.");
  });

  els.pwaInstallButton?.addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) {
      showToast("Abre el menu del navegador y elige Instalar app o Agregar a pantalla de inicio.");
      return;
    }
    const promptEvent = state.deferredInstallPrompt;
    state.deferredInstallPrompt = null;
    promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    updatePwaInstallUi();
  });

  updatePwaInstallUi();
}

function updateConnectionUi() {
  if (!els.appStatusBanner) return;
  const isOnline = window.navigator.onLine !== false;

  els.appStatusBanner.classList.toggle("is-hidden", isOnline);
  els.appStatusBanner.dataset.tone = isOnline ? "success" : "warning";
  els.appStatusBanner.innerHTML = isOnline
    ? `<strong>Conexion recuperada</strong><span>La app puede volver a sincronizar cuando el backend este disponible.</span>`
    : `<strong>Sin conexion</strong><span>Modo lectura local. No se deben registrar asistencias productivas hasta recuperar conexion.</span>`;
}

function setupConnectionStatus() {
  updateConnectionUi();
  window.addEventListener("online", () => {
    updateConnectionUi();
    showToast("Conexion recuperada.");
  });
  window.addEventListener("offline", () => {
    updateConnectionUi();
    showToast("Sin conexion. Revisa la red antes de registrar asistencia.");
  });
}
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
      p_admin_key: getAdminRpcKey(),
      p_accion: action,
      p_detalle: detail,
      p_resultado: "ok",
    }).catch(() => undefined);
  }
}

function isLocalDemoEnvironment() {
  const host = window.location.hostname;
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(host);
  return isLocalHost || state.demoMode === true;
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

function displayLongDate(date = new Date()) {
  const formatted = date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: getOperationalTimezone(),
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function avatarStorageKey() {
  return String(state.currentUser?.id || state.currentUser?.email || "local-user");
}

function openAvatarDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    const request = indexedDB.open(AVATAR_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(AVATAR_STORE_NAME)) {
        request.result.createObjectStore(AVATAR_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB"));
  });
}

async function avatarStoreRequest(mode, operation) {
  const database = await openAvatarDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(AVATAR_STORE_NAME, mode);
    const store = transaction.objectStore(AVATAR_STORE_NAME);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo actualizar la foto"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

async function savePersistentAvatar(blob) {
  try {
    await avatarStoreRequest("readwrite", (store) => store.put(blob, avatarStorageKey()));
    return true;
  } catch {
    return false;
  }
}

async function deletePersistentAvatar() {
  try {
    await avatarStoreRequest("readwrite", (store) => store.delete(avatarStorageKey()));
  } catch {
    // La interfaz puede volver al avatar inicial aunque el almacenamiento no esté disponible.
  }
}

async function loadPersistentAvatar() {
  releaseLocalAvatarUrl();
  try {
    const blob = await avatarStoreRequest("readonly", (store) => store.get(avatarStorageKey()));
    if (!(blob instanceof Blob)) {
      showAvatarFallback();
      return;
    }
    localAvatarObjectUrl = URL.createObjectURL(blob);
    showLocalAvatar(localAvatarObjectUrl);
  } catch {
    showAvatarFallback();
  }
}

function releaseLocalAvatarUrl() {
  if (!localAvatarObjectUrl) return;
  URL.revokeObjectURL(localAvatarObjectUrl);
  localAvatarObjectUrl = "";
}

function showAvatarFallback() {
  [els.headerAvatarImage, els.profileAvatarImage].forEach((image) => {
    if (!image) return;
    image.hidden = true;
    image.removeAttribute("src");
  });
  els.headerAvatarFallback?.removeAttribute("hidden");
  els.profileAvatarFallback?.removeAttribute("hidden");
  if (els.profileAvatarChangeLabel) els.profileAvatarChangeLabel.textContent = "Agregar foto";
  if (els.removeProfileAvatar) els.removeProfileAvatar.disabled = true;
}

async function removeLocalAvatar({ notify = true, removeStored = true } = {}) {
  releaseLocalAvatarUrl();
  if (els.profileAvatarInput) els.profileAvatarInput.value = "";
  if (removeStored) await deletePersistentAvatar();
  showAvatarFallback();
  if (notify) showToast("Foto eliminada de este dispositivo.");
}

function showLocalAvatar(objectUrl) {
  [els.headerAvatarImage, els.profileAvatarImage].forEach((image) => {
    if (!image) return;
    image.src = objectUrl;
    image.hidden = false;
  });
  els.headerAvatarFallback?.setAttribute("hidden", "");
  els.profileAvatarFallback?.setAttribute("hidden", "");
  if (els.profileAvatarChangeLabel) els.profileAvatarChangeLabel.textContent = "Cambiar foto";
  if (els.removeProfileAvatar) els.removeProfileAvatar.disabled = false;
}

function handleLocalAvatarSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const imageExtension = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
  if (!file.type.startsWith("image/") && !imageExtension) {
    event.target.value = "";
    showToast("Selecciona un archivo de imagen válido.");
    return;
  }

  if (file.size > 15 * 1024 * 1024) {
    event.target.value = "";
    showToast("La foto debe pesar 15 MB o menos.");
    return;
  }

  const nextObjectUrl = URL.createObjectURL(file);
  const validationImage = new Image();
  validationImage.onload = async () => {
    try {
      const maxSide = 1200;
      const scale = Math.min(1, maxSide / Math.max(validationImage.naturalWidth, validationImage.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(validationImage.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(validationImage.naturalHeight * scale));
      canvas.getContext("2d").drawImage(validationImage, 0, 0, canvas.width, canvas.height);
      const avatarBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
      if (!(avatarBlob instanceof Blob)) throw new Error("No se pudo preparar la imagen");
      URL.revokeObjectURL(nextObjectUrl);
      releaseLocalAvatarUrl();
      localAvatarObjectUrl = URL.createObjectURL(avatarBlob);
      showLocalAvatar(localAvatarObjectUrl);
      const saved = await savePersistentAvatar(avatarBlob);
      event.target.value = "";
      showToast(saved ? "Foto guardada en este dispositivo." : "Foto aplicada; no se pudo guardar de forma permanente.");
    } catch {
      URL.revokeObjectURL(nextObjectUrl);
      event.target.value = "";
      showToast("No se pudo preparar la foto. Prueba con JPG o PNG.");
    }
  };
  validationImage.onerror = () => {
    URL.revokeObjectURL(nextObjectUrl);
    event.target.value = "";
    showToast("No se pudo leer la imagen seleccionada.");
  };
  validationImage.src = nextObjectUrl;
}

function permissionPreferencesKey() {
  const userKey = String(state.currentUser?.id || state.currentUser?.email || "local-user");
  return `asistencia_permission_preferences:${userKey}`;
}

function loadPermissionPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(permissionPreferencesKey()) || "null");
    state.permissionPreferences = {
      camera: saved?.camera !== false,
      location: saved?.location !== false,
    };
    state.permissionStatus = {
      camera: saved?.cameraStatus || "unknown",
      location: saved?.locationStatus || "unknown",
    };
    state.permissionApprovals = {
      camera: saved?.cameraApproved === true || saved?.cameraStatus === "granted",
      location: saved?.locationApproved === true || saved?.locationStatus === "granted",
    };
    state.permissionSelections = {
      camera: saved?.cameraEnabledByUser === true || Boolean(saved && saved.camera !== false),
      location: saved?.locationEnabledByUser === true || Boolean(saved && saved.location !== false),
    };
  } catch {
    state.permissionPreferences = { camera: true, location: true };
    state.permissionStatus = { camera: "unknown", location: "unknown" };
    state.permissionApprovals = { camera: false, location: false };
    state.permissionSelections = { camera: false, location: false };
  }
}

function savePermissionPreferences() {
  localStorage.setItem(permissionPreferencesKey(), JSON.stringify({
    ...state.permissionPreferences,
    cameraStatus: state.permissionStatus.camera,
    locationStatus: state.permissionStatus.location,
    cameraApproved: state.permissionApprovals.camera,
    locationApproved: state.permissionApprovals.location,
    cameraEnabledByUser: state.permissionSelections.camera,
    locationEnabledByUser: state.permissionSelections.location,
  }));
}

async function getBrowserPermissionState(name) {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const permission = await navigator.permissions.query({ name });
    return permission.state || "unknown";
  } catch {
    return "unknown";
  }
}

function permissionStatusCopy(kind) {
  if (!state.permissionPreferences[kind]) return "Desactivada en la app";
  const status = state.permissionStatus[kind];
  if (status === "granted") return "Permitida";
  if (status === "denied") return "Bloqueada en el navegador";
  return "Pendiente de activar";
}

function renderPermissionControls() {
  if (els.profileCameraEnabled) els.profileCameraEnabled.checked = state.permissionPreferences.camera;
  if (els.profileLocationEnabled) els.profileLocationEnabled.checked = state.permissionPreferences.location;
  if (els.profileCameraPermissionStatus) els.profileCameraPermissionStatus.textContent = permissionStatusCopy("camera");
  if (els.profileLocationPermissionStatus) els.profileLocationPermissionStatus.textContent = permissionStatusCopy("location");

  const missingPermissions = ["camera", "location"].filter(
    (kind) => !state.permissionPreferences[kind] || !state.permissionSelections[kind]
  );
  els.permissionOnboarding?.classList.toggle("is-hidden", missingPermissions.length === 0);
  if (els.permissionOnboardingTitle && missingPermissions.length) {
    const missingLabel = missingPermissions.length === 2
      ? "cámara y ubicación"
      : missingPermissions[0] === "camera" ? "cámara" : "ubicación";
    els.permissionOnboardingTitle.textContent = `Activa ${missingLabel}`;
  }
  if (els.requestAttendancePermissions) {
    els.requestAttendancePermissions.textContent = "Revisar permisos";
  }
}

function openPermissionSettings() {
  showView("profile");
  window.requestAnimationFrame(() => {
    els.profilePermissions?.scrollIntoView({ behavior: "smooth", block: "start" });
    els.profilePermissions?.focus({ preventScroll: true });
  });
}

async function syncPermissionState() {
  loadPermissionPreferences();
  const cameraState = state.permissionPreferences.camera
    ? await getBrowserPermissionState("camera")
    : "disabled";
  const locationState = state.permissionPreferences.location
    ? await getBrowserPermissionState("geolocation")
    : "disabled";
  [["camera", cameraState], ["location", locationState]].forEach(([kind, browserState]) => {
    if (browserState === "granted") {
      state.permissionStatus[kind] = "granted";
      state.permissionApprovals[kind] = true;
      state.permissionSelections[kind] = true;
    } else if (browserState === "denied") {
      state.permissionStatus[kind] = "denied";
      state.permissionApprovals[kind] = false;
    } else if (state.permissionApprovals[kind]) {
      state.permissionStatus[kind] = "granted";
    }
  });
  savePermissionPreferences();
  renderPermissionControls();
}

async function requestCameraAccess() {
  if (!state.permissionPreferences.camera) {
    state.permissionStatus.camera = "disabled";
    state.permissionApprovals.camera = false;
    savePermissionPreferences();
    renderPermissionControls();
    return false;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    state.permissionStatus.camera = "denied";
    state.permissionApprovals.camera = false;
    savePermissionPreferences();
    renderPermissionControls();
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    stream.getTracks().forEach((track) => track.stop());
    state.permissionStatus.camera = "granted";
    state.permissionApprovals.camera = true;
    state.permissionSelections.camera = true;
    savePermissionPreferences();
    renderPermissionControls();
    return true;
  } catch {
    state.permissionStatus.camera = "denied";
    state.permissionApprovals.camera = false;
    savePermissionPreferences();
    renderPermissionControls();
    return false;
  }
}

function requestLocationAccess() {
  if (!state.permissionPreferences.location || !navigator.geolocation) {
    state.permissionStatus.location = state.permissionPreferences.location ? "denied" : "disabled";
    state.permissionApprovals.location = false;
    savePermissionPreferences();
    renderPermissionControls();
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => {
        state.permissionStatus.location = "granted";
        state.permissionApprovals.location = true;
        state.permissionSelections.location = true;
        savePermissionPreferences();
        renderPermissionControls();
        resolve(true);
      },
      () => {
        state.permissionStatus.location = "denied";
        state.permissionApprovals.location = false;
        savePermissionPreferences();
        renderPermissionControls();
        resolve(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

async function requestInitialAttendancePermissions() {
  const cameraGranted = state.permissionStatus.camera === "granted" || await requestCameraAccess();
  const locationGranted = state.permissionStatus.location === "granted" || await requestLocationAccess();
  renderPermissionControls();
  if (cameraGranted && locationGranted) {
    showToast("Cámara y ubicación listas para registrar asistencia.");
  } else {
    showToast("Puedes revisar los permisos desde Perfil.");
  }
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
  const token = localStorage.getItem("registro_asistencia_token");
  return {
    apikey: SUPABASE.publishableKey,
    Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE.publishableKey}`,
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



function normalizeAppRole(role) {
  const value = String(role || "usuario").toLowerCase();
  return ROLE_DEFINITIONS[value] ? value : "usuario";
}

function getRoleDefinition(role = state.currentRole) {
  return ROLE_DEFINITIONS[normalizeAppRole(role)] || ROLE_DEFINITIONS.usuario;
}

function hasPermission(permission) {
  return Boolean(state.currentPermissions?.[permission]);
}

function hasAnyPermission(permissions) {
  return permissions.some((permission) => hasPermission(permission));
}

function isProductionEnvironment() {
  const host = window.location.hostname;
  if (!host || window.location.protocol === "file:") return false;
  return !["localhost", "127.0.0.1", "::1"].includes(host);
}

function canUseDemoAdminKey() {
  return !isProductionEnvironment() && state.demoMode;
}

function isDemoAdminUnlocked() {
  return canUseDemoAdminKey() && state.manualAdminUnlocked;
}

function getAdminRpcKey() {
  return canUseDemoAdminKey() ? ADMIN_KEY : "";
}

function hasAdminRole() {
  return getRoleDefinition(state.currentRole).rank >= ROLE_DEFINITIONS.admin.rank;
}

function canUseRoleAdminMode() {
  return hasAnyPermission(["manage_records", "manage_site", "export_records", "manage_organization", "manage_roles", "view_audit"]);
}

function isRoleAdminSession() {
  return Boolean(state.currentUser && !state.currentUser.isGuest && state.currentAppUser && hasAdminRole() && canUseRoleAdminMode());
}

function getCurrentUserMatricula() {
  return normalizeMatricula(state.currentAppUser?.matricula || state.currentUser?.user_metadata?.matricula || "");
}

function canViewRecord(record) {
  if (!state.currentUser) return false;
  if (isDemoAdminUnlocked() || hasPermission("view_all_records")) return true;

  if (hasPermission("view_site_records")) {
    const assignedSite = state.currentAppUser?.sitio_id;
    if (assignedSite) return [record.sitioId, record.sitioEntradaId, record.sitioSalidaId].includes(assignedSite);

    const assignedOrg = state.currentAppUser?.organizacion_id;
    if (assignedOrg && record.organizacionId) return record.organizacionId === assignedOrg;
    return false;
  }

  return hasPermission("view_own_records") && normalizeMatricula(record.matricula) === getCurrentUserMatricula();
}

function getVisibleRecords() {
  return state.records.filter(canViewRecord);
}

function applyAppUserSession(appUser) {
  const authUser = state.currentUser || {};
  const authEmail = String(authUser.email || appUser?.email || "").trim().toLowerCase();
  const isKnownSuperadmin = isKnownSuperadminEmail(authEmail);
  const fallbackSuperadmin = !appUser && isKnownSuperadmin
    ? {
      id: authUser.id || authEmail,
      nombre: authUser.user_metadata?.nombre || authUser.user_metadata?.full_name || authEmail,
      matricula: authUser.user_metadata?.matricula || authEmail.split("@")[0].toUpperCase(),
      email: authEmail,
      rol: "superadmin",
      permisos: { ...ROLE_DEFINITIONS.superadmin.permissions },
      organizacion_id: null,
      sitio_id: null,
      source: "frontend_superadmin_fallback",
    }
    : null;
  const effectiveAppUser = appUser || fallbackSuperadmin;
  if (effectiveAppUser && isKnownSuperadmin) {
    effectiveAppUser.rol = "superadmin";
    effectiveAppUser.permisos = { ...ROLE_DEFINITIONS.superadmin.permissions, ...(effectiveAppUser.permisos || {}) };
    effectiveAppUser.source = effectiveAppUser.source || "frontend_superadmin_override";
  }
  state.currentAppUser = effectiveAppUser || null;
  state.currentRole = normalizeAppRole(effectiveAppUser?.rol);
  state.currentPermissions = {
    ...getRoleDefinition(state.currentRole).permissions,
    ...(effectiveAppUser?.permisos || {}),
  };
  state.isAdmin = isRoleAdminSession() || isDemoAdminUnlocked();
  renderCurrentUserProfile();
}

function renderHomeWelcome(nombre = "Usuario") {
  const hour = Math.floor(minutesFromStart() / 60);
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const cleanName = String(nombre || "Usuario").trim();
  const firstName = (cleanName.includes("@") ? cleanName.split("@")[0] : cleanName.split(/\s+/)[0]) || "Usuario";
  if (els.homeGreeting) els.homeGreeting.textContent = greeting;
  if (els.homeWelcomeName) els.homeWelcomeName.textContent = firstName;
}

function renderCurrentUserProfile() {
  const appUser = state.currentAppUser;
  const authUser = state.currentUser || {};
  const metadata = authUser.user_metadata || {};
  const role = getRoleDefinition(state.currentRole);
  const nombre = appUser?.nombre || metadata.nombre || metadata.full_name || authUser.email || "Usuario";
  const matricula = appUser?.matricula || metadata.matricula || "-";
  const email = appUser?.email || authUser.email || "-";
  const initials = String(nombre).split(" ").filter(Boolean).map((part) => part[0].toUpperCase()).slice(0, 2).join("");

  if (els.userInitials) {
    els.userInitials.textContent = initials || "US";
  }
  if (els.profileName) els.profileName.value = nombre;
  if (els.profileMatricula) els.profileMatricula.value = matricula;
  if (els.profileEmail) els.profileEmail.value = email;
  if (els.profileRole) els.profileRole.value = role.label;
  if (els.profileScope) els.profileScope.value = role.scope;
  const profileDisplayName = document.querySelector("#profileDisplayName");
  const profileDisplayIdentifier = document.querySelector("#profileDisplayIdentifier");
  if (els.profileAvatarFallback) els.profileAvatarFallback.textContent = initials || "US";
  if (profileDisplayName) profileDisplayName.textContent = nombre;
  if (profileDisplayIdentifier) profileDisplayIdentifier.textContent = `Identificador: ${matricula}`;
  renderHomeWelcome(nombre);
  renderAttendanceStreak();
}

function renderAttendanceStreak() {
  const streak = state.attendanceStreak;
  if (!els.streakDays) return;

  if (!state.currentUser || !streak) {
    els.streakDays.textContent = "--";
    els.streakCompliance.textContent = "--";
    els.streakSite.textContent = state.currentUser ? "Sin datos todavia" : "Disponible al iniciar sesion";
    els.streakSchedule.textContent = "Horario del sitio pendiente";
    els.streakSummary.textContent = state.currentUser
      ? "Registra entrada y salida para calcular tu racha personal."
      : "La racha y cumplimiento se calculan solo con una cuenta autenticada.";
    return;
  }

  const compliance = Number(streak.cumplimiento_pct || 0);
  const entryHours = streak.horario_entrada || "--:-- - --:--";
  const exitHours = streak.horario_salida || "--:-- - --:--";
  const totalDays = Number(streak.dias_con_registro || 0);
  const completeDays = Number(streak.dias_cumplidos || 0);
  const reviewDays = Number(streak.dias_revision || 0);

  els.streakDays.textContent = String(streak.racha_actual || 0);
  els.streakCompliance.textContent = `${compliance.toFixed(compliance % 1 === 0 ? 0 : 1)}%`;
  els.streakSite.textContent = streak.sitio_nombre || "Sitio no asignado";
  els.streakSchedule.textContent = `Entrada ${entryHours} | Salida ${exitHours}`;
  els.streakSummary.textContent = `${completeDays} de ${totalDays} dias cumplidos. ${reviewDays} en revision.`;
}

function parseSupabaseError(error) {
  const raw = String(error?.message || error || "");
  try {
    const json = JSON.parse(raw);
    return json.message || json.error || json.hint || raw;
  } catch {
    return raw;
  }
}

function getKnownSuperadminMatricula(email = state.currentUser?.email) {
  return String(email || "").split("@")[0].toUpperCase();
}

function isKnownSuperadminEmail(email = state.currentUser?.email) {
  return KNOWN_SUPERADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}

async function loadCurrentAppUser({ silent = false } = {}) {
  if (!CLOUD_ENABLED || !state.currentUser) {
    applyAppUserSession(null);
    return null;
  }

  const metadata = state.currentUser.user_metadata || {};
  const authEmail = String(state.currentUser.email || "").trim().toLowerCase();
  const matricula = isKnownSuperadminEmail(authEmail)
    ? getKnownSuperadminMatricula(authEmail)
    : (metadata.matricula || "");
  try {
    const result = await callAdminRpc("get_current_app_user", {
      p_nombre: metadata.nombre || metadata.full_name || state.currentUser.email || "Usuario",
      p_matricula: matricula,
      p_org_key: metadata.organization_key || metadata.org_key || localStorage.getItem("registro_asistencia_org_key") || "",
    });
    const appUser = getRpcFirstRow(result);
    applyAppUserSession(appUser);
    if (isKnownSuperadminEmail(authEmail) && appUser?.rol !== "superadmin" && !silent) {
      showToast("Tu cuenta necesita rol superadmin en Supabase para crear organizaciones. Aplica supabase-hito13.");
    }
    return appUser;
  } catch (error) {
    applyAppUserSession(null);
    if (!silent) showToast("No se pudo cargar el rol del usuario. Se aplicaran permisos basicos.");
    return null;
  }
}


async function loadOrganizations({ silent = false } = {}) {
  if (!CLOUD_ENABLED || !state.currentUser || !localStorage.getItem("registro_asistencia_token") || !els.organizationList) return;
  try {
    const rows = await callAdminRpc("admin_list_organization_hubs", {});
    state.organizationHubs = Array.isArray(rows) ? rows : [];
    if (!state.organizationHubs.some((org) => org.id === state.selectedOrganizationId)) {
      state.selectedOrganizationId = state.organizationHubs[0]?.id || null;
    }
    renderOrganizations();
  } catch (error) {
    try {
      const [organizations, sites] = await Promise.all([
        callAdminRpc("get_manageable_organizations", {}),
        callAdminRpc("get_manageable_sites", {}),
      ]);
      state.organizationHubs = (organizations || []).map((org) => ({
        ...org,
        sitios: (sites || []).filter((site) => site.organizacion_id === org.id),
      }));
      state.selectedOrganizationId = state.organizationHubs.some((org) => org.id === state.selectedOrganizationId)
        ? state.selectedOrganizationId
        : state.organizationHubs[0]?.id || null;
      renderOrganizations();
      setOrganizationHubNotice("Vista compatible activa. Aplica la migracion Hito 14 para editar.", "warning");
    } catch (fallbackError) {
      state.organizationHubs = [];
      renderOrganizations();
      if (!silent) showToast("No se pudieron cargar organizaciones.");
    }
  }
}

function getSelectedOrganization() {
  return state.organizationHubs.find((org) => org.id === state.selectedOrganizationId) || null;
}

function setOrganizationHubNotice(message = "", tone = "warning") {
  if (!els.organizationHubNotice) return;
  els.organizationHubNotice.hidden = !message;
  els.organizationHubNotice.textContent = message;
  els.organizationHubNotice.dataset.tone = tone;
}

function renderOrganizations() {
  if (!els.organizationList) return;
  const rows = state.organizationHubs;
  const canManageOrg = hasPermission("manage_organization");
  document.querySelectorAll(".superadmin-only").forEach((element) => {
    element.classList.toggle("is-hidden", !canManageOrg);
  });
  if (!rows.length) {
    els.organizationList.innerHTML = `<div class="organization-empty"><strong>Sin organizaciones</strong><span>Crea la primera para agregar sitios.</span></div>`;
    renderSelectedOrganization(null);
    return;
  }
  const query = String(els.organizationSearch?.value || "").trim().toLowerCase();
  const visibleRows = rows.filter((org) => !query || `${org.nombre || ""} ${org.slug || ""}`.toLowerCase().includes(query));
  els.organizationList.innerHTML = visibleRows.map((org) => `
    <button class="organization-picker-item ${org.id === state.selectedOrganizationId ? "is-selected" : ""}" type="button" data-organization-id="${escapeHtml(org.id)}">
      <span><strong>${escapeHtml(org.nombre || "Organizacion")}</strong><small>${Number(org.sitios_total || org.sitios?.length || 0)} sitios</small></span>
      <span class="status-dot ${org.activo === false ? "is-inactive" : ""}" aria-label="${org.activo === false ? "Inactiva" : "Activa"}"></span>
    </button>
  `).join("");
  if (!visibleRows.length) els.organizationList.innerHTML = `<p class="muted-note">Sin coincidencias.</p>`;
  renderSelectedOrganization(getSelectedOrganization());
}

function renderSelectedOrganization(org) {
  if (!els.organizationDetail) return;
  els.organizationDetail.classList.toggle("is-empty", !org);
  els.orgNameLabel.textContent = org?.nombre || "Selecciona una organizacion";
  els.orgTypeLabel.textContent = org?.tipo ? org.tipo.replaceAll("_", " ") : "";
  if (els.orgSlugLabel) els.orgSlugLabel.textContent = org?.slug || "";
  els.orgSitesLabel.textContent = Number(org?.sitios_total || org?.sitios?.length || 0);
  els.orgUsersLabel.textContent = Number(org?.usuarios_total || 0);
  els.orgAttendancesLabel.textContent = Number(org?.asistencias_total || 0);
  els.orgStatusBadge.className = `badge ${!org ? "default" : org.activo === false ? "danger" : "success"}`;
  els.orgStatusBadge.textContent = !org ? "Sin seleccion" : org.activo === false ? "Inactiva" : "Activa";
  if (els.newSiteButton) els.newSiteButton.disabled = !org || org.activo === false;
  renderManagedSites(org?.sitios || []);
}

function renderManagedSites(rows = []) {
  state.managedSites = state.organizationHubs.flatMap((org) => org.sitios || []);
  populateAdminInviteSites();
  if (!els.siteDirectory) return;
  if (!rows.length) {
    els.siteDirectory.innerHTML = `<div class="organization-empty"><strong>Sin sitios</strong><span>Agrega la primera ubicacion operativa.</span></div>`;
    return;
  }
  els.siteDirectory.innerHTML = rows.map((site) => {
    const schedule = `${normalizeTimeInput(site.hora_entrada_inicio, "--:--")}–${normalizeTimeInput(site.hora_entrada_fin, "--:--")} · ${normalizeTimeInput(site.hora_salida_inicio, "--:--")}–${normalizeTimeInput(site.hora_salida_fin, "--:--")}`;
    return `
      <article class="organization-site-row">
        <div class="organization-site-icon" aria-hidden="true"></div>
        <div class="organization-site-copy">
          <div><strong>${escapeHtml(site.nombre || "Sitio sin nombre")}</strong><span class="badge ${site.activo === false ? "danger" : "success"}">${site.activo === false ? "Inactivo" : "Activo"}</span></div>
          <span>${escapeHtml(site.direccion || "Direccion pendiente")}</span>
          <small>${escapeHtml(schedule)} · ${escapeHtml(formatMeters(site.radio_metros))}</small>
        </div>
        <div class="organization-site-actions">
          <button class="ghost mini" type="button" data-site-action="edit" data-site-id="${escapeHtml(site.id)}">Editar</button>
          <button class="danger mini" type="button" data-site-action="delete" data-site-id="${escapeHtml(site.id)}">Eliminar</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderManagedUsers(rows = []) {
  state.managedUsers = Array.isArray(rows) ? rows : [];
  renderAdminUsersSection(getVisibleRecords());
  if (!els.userDirectory) return;
  if (!isRoleAdminSession() && !isDemoAdminUnlocked()) {
    els.userDirectory.innerHTML = `<p class="muted-note">Sin permisos para consultar usuarios.</p>`;
    return;
  }
  if (!rows.length) {
    els.userDirectory.innerHTML = `<p class="muted-note">No hay usuarios registrados en tu alcance.</p>`;
    return;
  }
  els.userDirectory.innerHTML = rows.map((user) => {
    const role = getRoleDefinition(user.rol);
    const active = user.activo ? "Activo" : "Inactivo";
    return `
      <article class="organization-item directory-item">
        <div>
          <strong>${escapeHtml(user.nombre || user.email || user.matricula || "Usuario")}</strong>
          <span>${escapeHtml(user.matricula || "Sin identificador")} - ${escapeHtml(user.email || "Sin correo")}</span>
          <small>${escapeHtml(user.organizacion_nombre || "Organizacion")} / ${escapeHtml(user.sitio_nombre || "Sin sitio asignado")}</small>
        </div>
        <div class="directory-actions">
          <span class="badge ${user.activo ? "success" : "danger"}">${escapeHtml(active)}</span>
          <span class="badge ${user.rol === "superadmin" ? "admin" : "default"}">${escapeHtml(role.label)}</span>
        </div>
      </article>
    `;
  }).join("");
}

async function loadAdminDirectories({ silent = false } = {}) {
  if (!CLOUD_ENABLED || !state.currentUser || !localStorage.getItem("registro_asistencia_token") || (!isRoleAdminSession() && !isDemoAdminUnlocked())) {
    renderManagedUsers([]);
    return;
  }
  try {
    const users = await callAdminRpc("get_manageable_users", {});
    renderManagedUsers(users || []);
  } catch (error) {
    if (!silent) showToast("No se pudieron cargar usuarios administrables.");
    renderManagedUsers([]);
  }
}

async function deleteManagedSite(siteId) {
  if (!siteId || !hasPermission("manage_site")) {
    showToast("No tienes permisos para modificar sitios.");
    return;
  }
  if (!confirm("Este sitio se desactivara si tiene asistencias historicas. Continuar?")) return;
  try {
    const result = await callAdminRpc("admin_delete_site", { p_site_id: siteId });
    const status = getRpcFirstRow(result);
    addAdminLog("Sitio desactivado/eliminado", status?.message || siteId);
    showToast(status?.message || "Sitio actualizado.");
    await loadActiveSite({ silent: true });
    await loadOrganizations({ silent: true });
  } catch (error) {
    showToast(`No se pudo eliminar el sitio: ${parseSupabaseError(error).slice(0, 120)}`);
  }
}

function handleSiteDirectoryAction(event) {
  const button = event.target.closest("[data-site-action]");
  if (!button) return;
  if (button.dataset.siteAction === "edit") openSiteEditor(button.dataset.siteId);
  if (button.dataset.siteAction === "delete") deleteManagedSite(button.dataset.siteId);
}

function selectOrganization(organizationId) {
  if (!state.organizationHubs.some((org) => org.id === organizationId)) return;
  state.selectedOrganizationId = organizationId;
  closeOrganizationEditor();
  closeSiteEditor();
  renderOrganizations();
}

function openOrganizationEditor(org = null) {
  if (!hasPermission("manage_organization") || !els.organizationForm) return;
  els.organizationForm.hidden = false;
  els.organizationForm.classList.remove("is-hidden");
  els.orgEditId.value = org?.id || "";
  els.orgCreateName.value = org?.nombre || "";
  els.orgCreateType.value = org?.tipo || "empresa";
  els.orgCreateSlug.value = org?.slug || "";
  els.orgCreateKey.value = "";
  els.orgActive.checked = org?.activo !== false;
  els.organizationFormTitle.textContent = org ? "Editar organizacion" : "Nueva organizacion";
  els.orgKeyHint.textContent = org ? "Vacia conserva la actual" : "Obligatoria al crear";
  els.organizationForm.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => els.orgCreateName.focus(), 250);
}

function closeOrganizationEditor() {
  if (!els.organizationForm) return;
  els.organizationForm.hidden = true;
  els.organizationForm.classList.add("is-hidden");
  els.organizationForm.reset();
}

function createOrganizationSlug(name, currentId = null) {
  const base = String(name || "organizacion")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "organizacion";
  const used = new Set(
    state.organizationHubs
      .filter((org) => org.id !== currentId)
      .map((org) => String(org.slug || "").toLowerCase()),
  );
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

async function deleteSelectedOrganization() {
  const org = getSelectedOrganization();
  if (!org || !hasPermission("manage_organization")) return;
  if (!confirm(`Eliminar ${org.nombre}? Si tiene historial se desactivara sin borrar registros.`)) return;
  try {
    const result = await callAdminRpc("admin_delete_organization", { p_id: org.id });
    const status = getRpcFirstRow(result);
    showToast(status?.message || "Organizacion actualizada.");
    state.selectedOrganizationId = null;
    await loadOrganizations({ silent: true });
  } catch (error) {
    showToast(`No se pudo eliminar: ${parseSupabaseError(error).slice(0, 120)}`);
  }
}

async function handleOrganizationSubmit(event) {
  event.preventDefault();
  if (!hasPermission("manage_organization")) {
    showToast("Solo superadmin puede modificar organizaciones.");
    return;
  }
  const nombre = els.orgCreateName?.value.trim() || "";
  const clave = els.orgCreateKey?.value.trim() || "";
  const id = els.orgEditId?.value || null;
  if (!nombre || (!id && clave.length < 8) || (clave && clave.length < 8)) {
    showToast("Captura el nombre y una clave de al menos 8 caracteres al crear.");
    return;
  }
  const slug = id
    ? (els.orgCreateSlug?.value.trim() || createOrganizationSlug(nombre, id))
    : createOrganizationSlug(nombre);
  try {
    await callAdminRpc("admin_upsert_organization", {
      p_id: id,
      p_nombre: nombre,
      p_tipo: els.orgCreateType?.value || "empresa",
      p_slug: slug,
      p_clave: clave,
      p_activo: els.orgActive?.checked !== false,
    });
    closeOrganizationEditor();
    await loadOrganizations({ silent: true });
    showToast(id ? "Organizacion actualizada." : "Organizacion creada.");
  } catch (error) {
    const detail = parseSupabaseError(error);
    const rpcPending = /admin_upsert_organization|PGRST202|schema cache/i.test(detail);
    if (rpcPending && !id) {
      try {
        await callAdminRpc("admin_create_organization", {
          p_nombre: nombre,
          p_tipo: els.orgCreateType?.value || "empresa",
          p_slug: slug,
          p_clave: clave,
          p_activo: els.orgActive?.checked !== false,
        });
        closeOrganizationEditor();
        await loadOrganizations({ silent: true });
        showToast("Organizacion creada. La edicion avanzada se activara con el Hito 14.");
        return;
      } catch (fallbackError) {
        const fallbackDetail = parseSupabaseError(fallbackError);
        if (/slug.*ambigu|ambigu.*slug/i.test(fallbackDetail)) {
          showToast("Supabase necesita el hotfix de organizaciones. Tus datos siguen en el formulario.");
          setOrganizationHubNotice("Pendiente: aplicar el hotfix de creacion en Supabase.", "warning");
          return;
        }
        showToast(`No se pudo crear la organizacion: ${fallbackDetail.slice(0, 120)}`);
        return;
      }
    }
    if (rpcPending) {
      showToast("La edicion estara disponible al aplicar la migracion Hito 14 en Supabase.");
      return;
    }
    showToast(`No se pudo guardar la organizacion: ${detail.slice(0, 120)}`);
  }
}
async function loadAttendanceStreak({ silent = false } = {}) {
  if (!CLOUD_ENABLED || !ATTENDANCE_STREAK_RPC_ENABLED || !state.currentUser || !localStorage.getItem("registro_asistencia_token")) {
    state.attendanceStreak = null;
    renderAttendanceStreak();
    return null;
  }

  try {
    const result = await callAdminRpc("get_attendance_streak", {});
    state.attendanceStreak = getRpcFirstRow(result);
    renderAttendanceStreak();
    return state.attendanceStreak;
  } catch (error) {
    state.attendanceStreak = null;
    renderAttendanceStreak();
    if (!silent) showToast("No se pudo cargar tu racha de asistencia.");
    return null;
  }
}
function renderOrganizationContext(context) {
  if (els.organizationDetail) return;
  if (!els.orgNameLabel) return;
  const configured = Boolean(context && context.organizacion_id);
  els.orgStatusBadge.className = "badge " + (configured ? "success" : "warning");
  els.orgStatusBadge.textContent = configured ? "Preparado" : "Pendiente";
  els.orgFoundationSummary.textContent = configured
    ? "Datos actuales agrupados para operar por organizacion sin obligar login todavia."
    : "La base multiempresa se activara cuando Supabase este disponible.";
  els.orgNameLabel.textContent = configured ? context.organizacion_nombre || "Organizacion principal" : "Organizacion principal";
  els.orgTypeLabel.textContent = configured ? context.organizacion_tipo || "empresa" : "empresa";
  els.orgSitesLabel.textContent = configured ? context.sitios_total ?? 0 : "0";
  els.orgUsersLabel.textContent = configured ? context.usuarios_total ?? 0 : "0";
  els.orgAttendancesLabel.textContent = configured ? context.asistencias_total ?? 0 : String(state.records.length || 0);
}

async function loadOrganizationContext({ silent = false } = {}) {
  if (!CLOUD_ENABLED) {
    renderOrganizationContext(null);
    return null;
  }

  try {
    const result = await callAdminRpc("get_organization_context", {});
    const context = getRpcFirstRow(result);
    renderOrganizationContext(context);
    return context;
  } catch (error) {
    renderOrganizationContext(null);
    if (!silent) showToast("No se pudo consultar la organizacion principal.");
    return null;
  }
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
  if (els.siteEditId) els.siteEditId.value = configured ? site.id || "" : "";
  if (els.siteOrganizationId) els.siteOrganizationId.value = configured ? site.organizacion_id || state.selectedOrganizationId || "" : state.selectedOrganizationId || "";
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
  if (els.siteGpsPolicy) els.siteGpsPolicy.value = configured ? site.gps_policy || "revision" : "revision";
  if (els.siteEvidencePolicy) els.siteEvidencePolicy.value = configured ? site.evidence_policy || "rostro" : "rostro";
  if (els.siteIdentifierLabel) els.siteIdentifierLabel.value = configured ? site.identificador_label || "Identificador" : "Identificador";
  if (els.siteKey) els.siteKey.value = "";
  els.siteActive.checked = configured ? Boolean(site.activo) : true;
}

function openSiteEditor(siteId = null) {
  const org = getSelectedOrganization();
  if (!org || !hasPermission("manage_site") || !els.siteForm) return;
  const site = (org.sitios || []).find((item) => item.id === siteId) || null;
  fillSiteForm(site);
  els.siteFormTitle.textContent = site ? "Editar sitio" : `Nuevo sitio en ${org.nombre}`;
  els.siteForm.hidden = false;
  els.siteForm.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => els.siteName.focus(), 250);
}

function closeSiteEditor() {
  if (!els.siteForm) return;
  els.siteForm.hidden = true;
  els.siteForm.reset();
  if (els.siteEditId) els.siteEditId.value = "";
}

function renderActiveSite(site) {
  state.activeSite = site || null;
  const configured = hasConfiguredSite(site);
  if (!els.siteStatusBadge) return;

  const siteIsActive = configured && site.activo !== false;
  els.siteStatusBadge.className = "badge " + (!configured ? "warning" : siteIsActive ? "success" : "danger");
  els.siteStatusBadge.textContent = !configured ? "Pendiente" : siteIsActive ? "Activo" : "Inactivo";
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
    if (els.sitePrecisionLabel) els.sitePrecisionLabel.textContent = "Ultima precision: " + formatMeters(position.coords.accuracy);
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
    if (els.sitePrecisionLabel) els.sitePrecisionLabel.textContent = "Ultima precision: " + formatMeters(position.coords.accuracy);
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
    claveSitio: els.siteKey?.value.trim() || "",
    gpsPolicy: els.siteGpsPolicy?.value || "revision",
    evidencePolicy: els.siteEvidencePolicy?.value || "rostro",
    identifierLabel: els.siteIdentifierLabel?.value.trim() || "Identificador",
  };
  const error = validateSiteForm(data);
  if (error) {
    setSiteMessage(error, "danger");
    return;
  }

  setSiteMessage("Guardando configuracion del sitio...", "warning");
  try {
    await callAdminRpc("admin_upsert_site", {
      p_id: els.siteEditId?.value || null,
      p_organization_id: els.siteOrganizationId?.value || state.selectedOrganizationId,
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
      p_gps_policy: data.gpsPolicy,
      p_evidence_policy: data.evidencePolicy,
      p_identificador_label: data.identifierLabel,
      p_clave: data.claveSitio || null,
      p_activo: data.activo,
    });
    addAdminLog("Sitio actualizado", data.nombre + " (" + data.radio + " m)");
    closeSiteEditor();
    await loadOrganizations({ silent: true });
    await updateHeaderStatus({ force: true });
    showToast("Sitio guardado.");
  } catch (error) {
    setSiteMessage(`No se pudo guardar: ${parseSupabaseError(error).slice(0, 120)}`, "danger");
  }
}
async function refreshRecords({ silent = false } = {}) {
  if (!CLOUD_ENABLED || !localStorage.getItem("registro_asistencia_token")) {
    renderRecords();
    return;
  }

  try {
    state.loadingRecords = true;
    const rows = await callAdminRpc("get_visible_asistencias", {});
    state.records = (rows || []).map(rowToRecord);
    persistLocalSnapshot();
    renderRecords();
    loadAttendanceStreak({ silent: true });
  } catch (error) {
    if (!silent) showToast("No se pudo cargar tu lista de registros permitidos. Revisa la conexion.");
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

  const payload = {
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
  };

  console.log("callAdminRpc - Enviando payload a registrar_entrada_segura:", payload);

  const row = await callAdminRpc("registrar_entrada_segura", payload);
  return rowToRecord(row);
}
async function updateExitRecord(record, { fotoSalida, descriptorSalida, location, lifeChallenge }) {
  const evidence = await uploadEvidence(fotoSalida, record.matricula, "exit", location);

  if (!CLOUD_ENABLED) {
    const faceValidation = evaluateFaceMatch(record.descriptorEntrada, descriptorSalida);
    record.horaSalida = nowParts().time;
    record.fotoSalida = evidence.url;
    record.qrSalida = "no_aplica";
    record.tokenQrUsado = "no_aplica";
    record.descriptorSalida = descriptorSalida;
    record.rostroSalidaDetectado = true;
    record.similitudFacial = faceValidation.similarity;
    record.validacionIdentidad = faceValidation.status;
    record.estado = faceValidation.estado;
    record.observacion = faceValidation.observacion;
    record.observaciones = faceValidation.observacion;
    record.metodoSalida = "matricula_foto_gps";
    record.qrValidado = false;
    record.qrObservacion = "No aplica: salida validada por identificador, foto, GPS y facial.";
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
    p_token_qr: null,
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

function updateHeaderStatus() {
  const now = new Date();
  const isoNow = now.toISOString();
  const visibleTime = displayTime(isoNow);
  if (els.clockLabel) {
    els.clockLabel.textContent = visibleTime;
    els.clockLabel.dateTime = isoNow;
    els.clockLabel.setAttribute("aria-label", `Hora del sistema: ${visibleTime}`);
  }
  if (els.clockDateLabel) {
    els.clockDateLabel.textContent = displayLongDate(now);
    els.clockDateLabel.dateTime = todayIso(now);
  }
  els.exitGuard.textContent = "Ingresa tu identificación para buscar tu entrada activa.";
  els.exitGuard.classList.remove("is-blocked");

  const headerQr = $("#headerQrState");
  if (headerQr) {
    headerQr.textContent = "QR: acceso";
    headerQr.dataset.tone = "active";
  }
}

function hideGuidedPanels() {
  els.entrySuccessPanel?.classList.add("is-hidden");
  els.exitSuccessPanel?.classList.add("is-hidden");
}

function showGuidedPanel(kind) {
  hideGuidedPanels();
  const panel = kind === "entry" ? els.entrySuccessPanel : els.exitSuccessPanel;
  panel?.classList.remove("is-hidden");
}

function showView(name) {
  if (name === "records") {
    const canViewRecordsTab = hasAnyPermission(["view_own_records", "view_site_records", "view_all_records"]);
    if (!canViewRecordsTab) {
      console.warn("Navegación rechazada: permiso insuficiente para la vista de registros.");
      showView("home");
      return;
    }
  }

  if (name === "admin") {
    const isAdminOrSuper = ["admin", "superadmin"].includes(state.currentRole);
    if (!isAdminOrSuper) {
      console.warn("Navegación rechazada: permiso insuficiente para la vista de administración.");
      showView("home");
      return;
    }
  }

  hideGuidedPanels();
  let targetName = name;

  if (targetName === "admin" && !isRoleAdminSession() && !isDemoAdminUnlocked()) {
    showToast("Para acciones administrativas inicia sesi\u00f3n con una cuenta admin.");
    targetName = "home";
  }

  const actualView = targetName;
  document.querySelectorAll('[data-view]').forEach((view) => {
    view.classList.toggle("is-hidden", view.dataset.view !== actualView);
  });
  if (els.headerProfileAvatar) els.headerProfileAvatar.hidden = actualView === "profile";

  const navigationTarget = ["entry", "exit", "attendance-complete"].includes(targetName)
    ? "attendance"
    : targetName;
  setActiveNavigation(navigationTarget);
  renderRolePanelCopy(navigationTarget);
  if (actualView === "home") updateAttendanceShortcut();
  if (actualView !== "entry") stopCamera("entry");
  if (actualView !== "exit") stopCamera("exit");
  if (actualView === "entry") {
    setEntryLocationStatus("La ubicacion se solicitara al guardar entrada.");
    window.setTimeout(() => ensureAttendanceCamera("entry"), 0);
  }
  if (actualView === "exit") {
    pickLifeChallenge();
    setLocationStatus("La ubicacion se solicitara al guardar salida.");
    if (els.exitMatricula.value.trim()) {
      validateExitMatricula();
    } else {
      resetExitActiveRecord();
    }
    updateHeaderStatus({ force: true });
    window.setTimeout(() => ensureAttendanceCamera("exit"), 0);
  }
  if (actualView === "records" || actualView === "admin" || actualView === "home") refreshRecords({ silent: true });
  if (targetName === "admin") {
    showAdminSection("summary");
    loadAdminDirectories({ silent: true });
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setActiveNavigation(name) {
  document.querySelectorAll(".nav-button, .sidebar-user-btn").forEach((button) => {
    const isActive = button.dataset.target === name;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function renderRolePanelCopy(activeTarget = "records") {
  const role = getRoleDefinition();
  const isAdminTarget = activeTarget === "admin" || isRoleAdminSession() || isDemoAdminUnlocked();
  if (els.recordsKicker) els.recordsKicker.textContent = isAdminTarget ? "Panel operativo" : "Tu asistencia";
  if (els.recordsTitle) {
    els.recordsTitle.textContent = isAdminTarget
      ? (hasPermission("manage_organization") ? "Administracion central" : "Administracion del sitio")
      : "Mis registros";
  }
  if (els.recordsSubtitle) {
    els.recordsSubtitle.textContent = isAdminTarget
      ? role.scope
      : "Revisa tus jornadas y comprueba si falta una salida.";
  }
  if (els.dashboardScopeLabel) {
    els.dashboardScopeLabel.textContent = hasPermission("view_all_records")
      ? "Mostrando todas las organizaciones permitidas para superadmin."
      : hasPermission("view_site_records")
        ? "Mostrando registros del sitio u organizacion asignada."
        : "Mostrando solo tus registros personales.";
  }
}

const ADMIN_SECTION_COPY = {
  summary: "Resumen del dia, alertas y distribucion por sitio.",
  organizations: "Administra organizaciones, ubicaciones, horarios y politicas.",
  users: "Consulta personas por sitio, pendientes sin sitio y asignacion admin.",
  attendances: "Filtra registros, revisa evidencia y exporta si tienes permiso.",
  audit: "Historial de acciones administrativas visibles para tu rol.",
};

function showAdminSection(section = "summary") {
  const target = section || "summary";
  state.activeAdminSection = target;
  document.querySelectorAll("[data-admin-section]").forEach((element) => {
    const shouldShow = element.dataset.adminSection === target;
    element.classList.toggle("is-hidden", !shouldShow);
  });
  document.querySelectorAll("[data-admin-section-target]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminSectionTarget === target);
  });
  if (els.adminSectionHint) {
    els.adminSectionHint.textContent = ADMIN_SECTION_COPY[target] || ADMIN_SECTION_COPY.summary;
  }
  document.querySelector(".admin-quick-actions")?.classList.toggle("is-hidden", target !== "summary");
  const activeNav = document.querySelector(`.admin-nav-pill[data-admin-section-target="${target}"]`);
  activeNav?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  if (target === "users") renderAdminUsersSection(getVisibleRecords());
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
  if (element.id === "faceStatus") {
    const headerFace = document.getElementById("headerFaceState");
    if (headerFace) {
      if (tone === "success") {
        headerFace.textContent = "Facial: activo";
        headerFace.dataset.tone = "active";
      } else if (tone === "pending") {
        headerFace.textContent = "Facial: cargando…";
        headerFace.dataset.tone = "pending";
      } else {
        headerFace.textContent = "Facial: error";
        headerFace.dataset.tone = "inactive";
      }
    }
  }
}

function syncCaptureControls() {
  const canUseFace = state.facialModelsLoaded && !state.facialModelsError;
  const canStartExit = canUseFace && Boolean(state.exitActiveRecord);
  if (els.startEntryCamera) els.startEntryCamera.disabled = !canUseFace;
  if (els.startExitCamera) els.startExitCamera.disabled = !canStartExit;
  if (els.takeEntryPhoto) els.takeEntryPhoto.disabled = !canUseFace || !state.entryStream;
  if (els.takeExitPhoto) els.takeExitPhoto.disabled = !canStartExit || !state.exitStream;
}

async function loadFaceModels() {
  if (!window.faceapi) {
    state.facialModelsError = true;
    console.error("loadFaceModels - faceapi no está cargado en el objeto global window.");
    setFaceStatus(els.faceStatus, "Error al cargar modelos faciales.", "danger");
    setFaceStatus(els.entryFaceStatus, "Error al cargar modelos faciales.", "danger");
    setFaceStatus(els.exitFaceStatus, "Error al cargar modelos faciales.", "danger");
    syncCaptureControls();
    return;
  }

  try {
    setFaceStatus(els.faceStatus, "Cargando modelos de reconocimiento facial...", "pending");
    setFaceStatus(els.entryFaceStatus, "Cargando modelos faciales...", "pending");
    setFaceStatus(els.exitFaceStatus, "Cargando modelos faciales...", "pending");
    syncCaptureControls();
    console.log("loadFaceModels - Cargando modelos face-api desde ruta absoluta:", FACE_MODEL_URL);
    
    console.log("loadFaceModels - Iniciando carga de tinyFaceDetector...");
    await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL);
    console.log("loadFaceModels - tinyFaceDetector cargado con éxito.");

    console.log("loadFaceModels - Iniciando carga de faceLandmark68Net...");
    await faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL);
    console.log("loadFaceModels - faceLandmark68Net cargado con éxito.");

    console.log("loadFaceModels - Iniciando carga de faceRecognitionNet...");
    await faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL);
    console.log("loadFaceModels - faceRecognitionNet cargado con éxito.");

    state.facialModelsLoaded = true;
    setFaceStatus(els.faceStatus, "Modelos cargados correctamente.", "success");
    setFaceStatus(els.entryFaceStatus, "Listo para iniciar cámara.", "success");
    setFaceStatus(els.exitFaceStatus, "Listo para iniciar cámara.", "success");
    console.log("loadFaceModels - Modelos cargados con éxito.");
  } catch (error) {
    state.facialModelsError = true;
    console.error("loadFaceModels - Error crítico al intentar cargar los modelos desde la ruta:", FACE_MODEL_URL);
    console.error("loadFaceModels - Detalle del error de carga:", error);
    setFaceStatus(els.faceStatus, "Error al cargar modelos faciales.", "danger");
    setFaceStatus(els.entryFaceStatus, "Error al cargar modelos faciales.", "danger");
    setFaceStatus(els.exitFaceStatus, "Error al cargar modelos faciales.", "danger");
  } finally {
    syncCaptureControls();
    const activeAttendanceView = document.querySelector('[data-view="entry"]:not(.is-hidden)')
      ? "entry"
      : document.querySelector('[data-view="exit"]:not(.is-hidden)') ? "exit" : "";
    if (activeAttendanceView) ensureAttendanceCamera(activeAttendanceView);
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
  if (!state.permissionPreferences.location) {
    const observacion = "Ubicacion desactivada por el usuario desde Perfil.";
    setAttendanceLocationStatus(kind, "Ubicacion desactivada en Perfil. El registro quedara en revision.", "danger");
    return Promise.resolve({ estado: "ubicacion_desactivada", observacion });
  }
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
        state.permissionStatus.location = "granted";
        state.permissionApprovals.location = true;
        state.permissionSelections.location = true;
        savePermissionPreferences();
        renderPermissionControls();
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
        state.permissionStatus.location = "denied";
        state.permissionApprovals.location = false;
        savePermissionPreferences();
        renderPermissionControls();
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
async function ensureAttendanceCamera(kind) {
  const needsActiveEntry = kind === "exit" && !state.exitActiveRecord;
  if (needsActiveEntry || state[`${kind}Stream`] || !state.facialModelsLoaded || state.facialModelsError) return;
  await startCamera(kind, { silent: true });
}

async function startCamera(kind, { silent = false } = {}) {
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;

  if (!state.permissionPreferences.camera) {
    if (!silent) showToast("Activa la cámara desde Perfil para tomar la foto.");
    return;
  }

  if (!state.facialModelsLoaded) {
    if (!silent) showToast("Espera a que carguen los modelos faciales.");
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
    state.permissionStatus.camera = "granted";
    state.permissionApprovals.camera = true;
    state.permissionSelections.camera = true;
    savePermissionPreferences();
    renderPermissionControls();
    syncCaptureControls();
    setFaceStatus(
      kind === "entry" ? els.entryFaceStatus : els.exitFaceStatus,
      "Camara lista. Mira de frente y toma la foto.",
      "success"
    );
  } catch (error) {
    state.permissionStatus.camera = "denied";
    state.permissionApprovals.camera = false;
    savePermissionPreferences();
    renderPermissionControls();
    if (!silent) showToast("No se pudo acceder a la camara. Revisa permisos o usa HTTPS.");
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

function getAttendanceIdentity() {
  const authUser = state.currentUser || {};
  const metadata = authUser.user_metadata || {};
  return {
    nombre: String(state.currentAppUser?.nombre || metadata.nombre || metadata.full_name || authUser.email || "").trim(),
    matricula: normalizeMatricula(state.currentAppUser?.matricula || metadata.matricula || ""),
  };
}

function syncAttendanceIdentity() {
  const identity = getAttendanceIdentity();
  if (els.entryName) els.entryName.value = identity.nombre;
  if (els.entryMatricula) els.entryMatricula.value = identity.matricula;
  if (els.exitMatricula) els.exitMatricula.value = identity.matricula;

  document.querySelectorAll("[data-attendance-name]").forEach((element) => {
    element.textContent = identity.nombre || "Usuario";
  });
  document.querySelectorAll("[data-attendance-id]").forEach((element) => {
    element.textContent = identity.matricula || "Sin identificador";
  });
  return identity;
}

function updateAttendanceShortcut() {
  if (!els.homeAttendanceHint) return;
  const { matricula } = getAttendanceIdentity();
  const record = matricula ? todayRecordByMatricula(matricula) : null;
  els.homeAttendanceHint.textContent = !record?.horaEntrada
    ? "Tu siguiente registro es la entrada."
    : !record.horaSalida
      ? `Entrada registrada a las ${record.horaEntrada}. Sigue con tu salida.`
      : "Tu jornada de hoy ya esta completa.";
}

async function openAttendanceView() {
  const identity = syncAttendanceIdentity();
  if (!identity.nombre || !identity.matricula) {
    showToast("Completa tu nombre e identificador en Perfil para registrar asistencia.");
    showView("profile");
    return;
  }

  await refreshRecords({ silent: true });
  const record = todayRecordByMatricula(identity.matricula);
  if (!record?.horaEntrada) {
    showView("entry");
    await ensureAttendanceCamera("entry");
    return;
  }
  if (!record.horaSalida) {
    showView("exit");
    await validateExitMatricula();
    await ensureAttendanceCamera("exit");
    return;
  }
  showView("attendance-complete");
}

function setExitLookupInfo(message, tone = "neutral") {
  if (!els.exitLookupInfo) return;
  els.exitLookupInfo.textContent = message;
  els.exitLookupInfo.dataset.tone = tone;
}

function resetExitActiveRecord(message = "Ingresa la identificación para validar entrada activa antes de tomar foto de salida.") {
  state.exitActiveRecord = null;
  if (state.exitStream) stopCamera("exit");
  clearCapturedFace("exit");
  setExitLookupInfo(message, "neutral");
  syncCaptureControls();
}

async function validateExitMatricula({ showErrors = false } = {}) {
  const matricula = normalizeMatricula(els.exitMatricula.value);
  const seq = ++state.exitLookupSeq;

  if (!matricula) {
    resetExitActiveRecord();
    return null;
  }

  state.exitActiveRecord = null;
  syncCaptureControls();
  setExitLookupInfo("Validando entrada activa para este identificador...", "neutral");
  await refreshRecords({ silent: true });
  if (seq !== state.exitLookupSeq) return null;

  const record = todayRecordByMatricula(matricula);

  if (!record || !record.horaEntrada) {
    const message = "No existe una entrada activa para este identificador el dia de hoy.";
    resetExitActiveRecord(message);
    els.exitLookupInfo.dataset.tone = "danger";
    if (showErrors) showToast(message);
    return null;
  }

  if (record.horaSalida) {
    const message = "Este identificador ya registro salida el dia de hoy.";
    resetExitActiveRecord(message);
    els.exitLookupInfo.dataset.tone = "danger";
    if (showErrors) showToast(message);
    return null;
  }

  state.exitActiveRecord = record;
  if (els.exitLookupInfo) {
    els.exitLookupInfo.dataset.tone = "success";
    els.exitLookupInfo.innerHTML = `
      <strong>Salida para: ${escapeHtml(record.nombre || "Sin nombre")}</strong>
      <span>Identificador: ${escapeHtml(record.matricula)}</span>
      <span>Entrada registrada: ${escapeHtml(record.horaEntrada || "Pendiente")}</span>
      <span>Estado: entrada activa</span>
    `;
  }
  syncCaptureControls();
  ensureAttendanceCamera("exit");
  return record;
}

async function handleEntrySubmit(event) {
  event.preventDefault();

  const nombre = els.entryName.value.trim();
  const matricula = normalizeMatricula(els.entryMatricula.value);

  if (!state.entryPhoto || !state.entryFace || !nombre || !matricula) {
    showToast("Falta foto con rostro valido, nombre o identificador para guardar la entrada.");
    return;
  }

  await refreshRecords({ silent: true });

  if (todayRecordByMatricula(matricula)) {
    showToast("Ya existe un registro para ese identificador el dia de hoy.");
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
    showGuidedPanel("entry");
    showToast(record.riesgo === "normal" || record.riesgo === "entrada_registrada" ? "Entrada registrada correctamente." : "Entrada registrada, requiere revision administrativa.");
  } catch (error) {
    showToast("No se pudo guardar la entrada global. Intenta de nuevo.");
  }
}
async function handleExitSubmit(event) {
  event.preventDefault();


  const record = await validateExitMatricula({ showErrors: true });
  if (!record) return;

  if (!state.exitPhoto || !state.exitFace) {
    showToast("Falta foto de salida con rostro valido.");
    return;
  }

  const location = await requestExitLocation();

  try {
    const updated = await updateExitRecord(record, {
      fotoSalida: state.exitPhoto,
      descriptorSalida: state.exitFace.descriptor,
      location,
      lifeChallenge: state.lifeChallenge,
    });
    state.exitPhoto = "";
    state.exitFace = null;
    state.exitActiveRecord = null;
    els.exitForm.reset();
    els.exitPreview.classList.add("is-hidden");
    setExitLookupInfo("Salida registrada correctamente.", "success");
    setFaceStatus(els.exitFaceStatus, "Listo para nueva captura.");
    pickLifeChallenge();
    stopCamera("exit");
    syncCaptureControls();
    await refreshRecords({ silent: true });
    showGuidedPanel("exit");
    showToast(updated.riesgo === "normal" ? "Salida registrada y validada." : "Salida registrada, pero requiere revision administrativa.");
  } catch (error) {
    const message = "No se pudo guardar la salida segura. Intenta de nuevo.";
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
  const record = state.records.find((item) => item.id === id);
  if (!record || !els.evidenceModal || !els.evidenceBody) return;
  const canOpenEvidence = canViewRecord(record) || hasPermission("view_evidence") || isDemoAdminUnlocked();
  if (!canOpenEvidence) {
    showToast("Solo puedes ver evidencia de registros dentro de tu alcance.");
    return;
  }

  if (hasPermission("view_evidence") || isDemoAdminUnlocked()) {
    addAdminLog("evidencia_geolocalizada_visualizada", `${record.matricula} ${displayDate(record.fecha)}`);
  }
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
    evidenceField("Identificador", record.matricula),
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
    evidenceField("QR", "No aplica"),
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
function recordDateKey(record) {
  const value = String(record.fecha || "").trim();
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return "";
}

function parseRecordTimeToMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const lower = String(value).toLowerCase();
  if (lower.includes("p") && hour < 12) hour += 12;
  if (lower.includes("a") && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function attendanceDurationHours(record) {
  if (!record.horaEntrada || !record.horaSalida || record.horaSalida === "Pendiente") return 0;
  const start = parseRecordTimeToMinutes(record.horaEntrada);
  const end = parseRecordTimeToMinutes(record.horaSalida);
  if (start === null || end === null || end <= start) return 0;
  return (end - start) / 60;
}

function renderStreakWidget(records = getVisibleRecords()) {
  if (!els.homeStreakDays || !els.homeStreakHours) return;
  const activeDays = new Set(records.filter((record) => record.horaEntrada).map(recordDateKey).filter(Boolean));
  let streak = 0;
  const cursor = new Date();

  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  const weekHours = records.reduce((total, record) => {
    const key = recordDateKey(record);
    if (!key) return total;
    const date = new Date(`${key}T00:00:00`);
    if (date < weekStart) return total;
    return total + attendanceDurationHours(record);
  }, 0);

  if (els.homeStreakDays) {
    els.homeStreakDays.textContent = `${streak} ${streak === 1 ? "dia activo" : "dias activos"}`;
  }
  if (els.homeStreakHours) {
    els.homeStreakHours.textContent = `${weekHours.toFixed(1).replace(".0", "")} h acumuladas esta semana`;
  }
}
function renderRecentActivity() {
  const container = document.getElementById("recentActivityList");
  if (!container) return;

  container.innerHTML = "";

  const actions = [];
  getVisibleRecords().forEach(record => {
    if (record.horaEntrada) {
      actions.push({
        tipo: "entrada",
        nombre: record.nombre,
        matricula: record.matricula,
        fecha: record.fecha,
        hora: record.horaEntrada,
      });
    }
    if (record.horaSalida && record.horaSalida !== "Pendiente") {
      actions.push({
        tipo: "salida",
        nombre: record.nombre,
        matricula: record.matricula,
        fecha: record.fecha,
        hora: record.horaSalida,
      });
    }
  });

  // Ordenar por fecha y hora descendente
  actions.sort((a, b) => {
    const keyA = `${a.fecha}T${a.hora}`;
    const keyB = `${b.fecha}T${b.hora}`;
    return keyB.localeCompare(keyA);
  });

  const recentActions = actions.slice(0, 3);

  if (recentActions.length === 0) {
    container.innerHTML = `<p class="recent-empty">No hay actividad reciente.</p>`;
    return;
  }

  recentActions.forEach(action => {
    const item = document.createElement("div");
    item.className = "recent-activity-item";

    const isEntrada = action.tipo === "entrada";
    const iconSvg = isEntrada 
      ? `<svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`
      : `<svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>`;

    const titleText = isEntrada ? "Entrada" : "Salida";
    const dateStr = displayDate(action.fecha);

    item.innerHTML = `
      <div class="recent-activity-main">
        <div class="recent-activity-icon ${isEntrada ? "is-entry" : "is-exit"}">
          ${iconSvg}
        </div>
        <div class="recent-activity-text">
          <strong>${escapeHtml(titleText)} - ${escapeHtml(action.nombre)}</strong>
          <span>Identificador: ${escapeHtml(action.matricula)} - ${escapeHtml(dateStr)}</span>
        </div>
      </div>
      <div class="recent-activity-meta">
        <span class="recent-activity-time">${escapeHtml(action.hora)}</span>
        <span class="recent-status">Confirmado</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderRecords() {
  populateDashboardFilterSelects();
  const filteredRecords = getFilteredRecords();
  renderOperationsDashboard(filteredRecords);
  updateSummary(filteredRecords);
  renderStreakWidget();
  renderRecentActivity();

  if (els.recordsBody) els.recordsBody.innerHTML = "";
  if (els.adminRecordsBody) els.adminRecordsBody.innerHTML = "";

  if (els.emptyRecords) els.emptyRecords.classList.toggle("is-hidden", filteredRecords.length > 0);
  if (els.adminEmptyRecords) els.adminEmptyRecords.classList.toggle("is-hidden", filteredRecords.length > 0);

  const canViewEvidence = hasPermission("view_evidence") || isDemoAdminUnlocked();
  const canManageRecords = hasPermission("manage_records") || isDemoAdminUnlocked();

  filteredRecords.forEach((record) => {
    const statusClass = statusBadgeClass(record.estado);
    const identityClass = identityBadgeClass(record.validacionIdentidad);
    const riskClass = riskBadgeClass(record.riesgo);
    const adminClass = record.modificado_por_admin ? "admin" : "default";

    const commonColsHtml = `
      <td>${imageCell(record.fotoEntrada, "Entrada")}</td>
      <td>${imageCell(record.fotoSalida, "Salida")}</td>
      <td>${escapeHtml(record.nombre)}</td>
      <td>${escapeHtml(record.matricula)}</td>
      <td>${escapeHtml(recordSiteName(record))}</td>
      <td>${escapeHtml(formatMeters(record.radioMetros))}</td>
      <td>${escapeHtml(displayDate(record.fecha))}</td>
      <td>${escapeHtml(record.horaEntrada)}</td>
      <td>${escapeHtml(record.horaSalida || "Pendiente")}</td>
      <td><span class="badge ${statusClass}">${escapeHtml(statusLabel(record.estado))}</span></td>
      <td><span class="badge ${identityClass}">${escapeHtml(identityLabel(record.validacionIdentidad))}</span></td>
      <td>${escapeHtml(formatSimilarity(record.similitudFacial))}</td>
      <td><span class="badge default">No aplica</span></td>
      <td>${booleanBadge(record.ubicacionEntradaValidada && (record.horaSalida ? record.ubicacionSalidaValidada : true), "Correcta", "Revision")}</td>
      <td>${escapeHtml(formatMeters(record.precisionSalida || record.precisionEntrada || record.precisionUbicacion))}</td>
      <td>${escapeHtml(formatMeters(record.distanciaSalidaMetros || record.distanciaEntradaMetros || record.distanciaEmpresaMetros))}</td>
      <td>${escapeHtml(record.retoVida || "Pendiente")}</td>
      <td><span class="badge ${riskClass}">${escapeHtml(riskLabel(record.riesgo))}</span></td>
      <td>${evidenceCell(record)}</td>
      <td>${escapeHtml(record.observacion || record.observaciones || "Sin observacion")}</td>
      <td>${escapeHtml(record.observacion_admin || "Sin observacion")}</td>
      <td><span class="badge ${adminClass}">${record.modificado_por_admin ? "Si" : "No"}</span></td>
    `;

    if (els.recordsBody) {
      const row = document.createElement("tr");
      row.innerHTML = commonColsHtml;
      els.recordsBody.appendChild(row);
    }

    if (els.adminRecordsBody) {
      const row = document.createElement("tr");
      const actionButtons = [
        canViewEvidence ? `<button class="secondary mini" data-action="view-evidence" data-id="${record.id}">Ver evidencia</button>` : "",
        canManageRecords ? `<button class="ghost mini" data-action="edit-observation" data-id="${record.id}">Observacion</button>` : "",
        canManageRecords ? `<button class="danger mini" data-action="delete-record" data-id="${record.id}">Eliminar</button>` : "",
      ].filter(Boolean).join("");

      row.innerHTML = `
        ${commonColsHtml}
        <td class="admin-only ${state.isAdmin ? "" : "is-hidden"}">
          <div class="row-actions">
            ${actionButtons}
          </div>
        </td>
      `;
      els.adminRecordsBody.appendChild(row);
    }
  });

  renderMobileRecordCards(filteredRecords);
  updateAdminControls();
}

function isCompleteRecord(record) {
  return ["asistencia_completa", "Asistencia completa"].includes(record.estado) || Boolean(record.horaSalida);
}

function isPendingExitRecord(record) {
  return !record.horaSalida || ["entrada_registrada", "Entrada registrada", "Pendiente de salida"].includes(record.estado);
}

function isReviewRecord(record) {
  return record.estado === "revision_requerida"
    || record.validacionIdentidad === "revision_administrativa"
    || String(record.riesgo || "").startsWith("revision")
    || record.riesgo === "sospechoso";
}

function hasLocationIssue(record) {
  const entryIssue = record.latitudEntrada !== null && !record.ubicacionEntradaValidada;
  const exitIssue = record.horaSalida && record.latitudSalida !== null && !record.ubicacionSalidaValidada;
  return Boolean(entryIssue || exitIssue || String(record.riesgo || "").includes("ubicacion"));
}

function hasIdentityIssue(record) {
  return ["revision_administrativa", "fallida"].includes(record.validacionIdentidad);
}

function statusFilterMatches(record, status) {
  if (status === "all") return true;
  if (status === "entrada_registrada") return isPendingExitRecord(record);
  if (status === "asistencia_completa") return isCompleteRecord(record);
  return record.estado === status;
}

function riskFilterMatches(record, risk) {
  if (risk === "all") return true;
  if (risk === "revision") return String(record.riesgo || "").startsWith("revision") || record.estado === "revision_requerida";
  return (record.riesgo || "normal") === risk;
}

function recordMatchesDashboardFilters(record) {
  const filters = state.recordFilters;
  if (filters.date && record.fecha !== filters.date) return false;
  if (!statusFilterMatches(record, filters.status)) return false;
  if (!riskFilterMatches(record, filters.risk)) return false;

  // Filtro por Sitio
  if (filters.site && filters.site !== "all") {
    const recordSite = recordSiteName(record).toLowerCase();
    const targetSite = String(filters.site).trim().toLowerCase();
    if (recordSite !== targetSite) return false;
  }

  // Filtro por Usuario (Vista por usuario)
  if (filters.user && filters.user !== "all") {
    if (normalizeMatricula(record.matricula) !== normalizeMatricula(filters.user)) return false;
  }

  const query = normalizeMatricula(filters.query || "");
  if (!query) return true;
  return normalizeMatricula(record.nombre || "").includes(query)
    || normalizeMatricula(record.matricula || "").includes(query);
}

function getFilteredRecords() {
  return getVisibleRecords().filter(recordMatchesDashboardFilters);
}

function dashboardScopeText() {
  const role = getRoleDefinition();
  if (state.isAdmin && !hasPermission("view_all_records")) return "Modo administrativo temporal: vista global desbloqueada.";
  if (hasPermission("view_all_records")) return `${role.label}: vista global permitida.`;
  if (hasPermission("view_site_records")) return `${role.label}: registros del sitio asignado.`;
  return `${role.label}: solo registros propios.`;
}

function renderDashboardAlerts(records) {
  if (!els.dashboardAlerts) return;
  const today = todayIso();
  const alerts = [];

  // Detección de Sin GPS
  const noGpsCount = records.filter(r => 
    (r.latitudEntrada === null || r.longitudEntrada === null) || 
    (r.horaSalida && r.horaSalida !== "Pendiente" && (r.latitudSalida === null || r.longitudSalida === null))
  ).length;

  // Detección de Foto fallida
  const failedPhotoCount = records.filter(r => 
    !r.fotoEntrada || 
    (r.horaSalida && r.horaSalida !== "Pendiente" && !r.fotoSalida)
  ).length;

  // Detección de Rostro en revisión
  const faceReviewCount = records.filter(r => 
    r.rostroEntradaDetectado === false || 
    (r.horaSalida && r.horaSalida !== "Pendiente" && r.rostroSalidaDetectado === false) ||
    r.validacionIdentidad === "revision_administrativa" || 
    (r.similitudFacial !== null && r.similitudFacial > FACE_DISTANCE_REVIEW)
  ).length;

  // Detección de Salida duplicada
  const duplicates = new Set();
  const seen = new Set();
  records.forEach(r => {
    const key = `${normalizeMatricula(r.matricula)}_${r.fecha}`;
    if (seen.has(key)) {
      duplicates.add(r.matricula);
    }
    seen.add(key);
  });

  if (noGpsCount) {
    alerts.push(["Sin GPS", `${noGpsCount} asistencia(s) sin coordenadas GPS.`]);
  }
  if (failedPhotoCount) {
    alerts.push(["Foto fallida", `${failedPhotoCount} registro(s) sin evidencia fotográfica válida.`]);
  }
  if (faceReviewCount) {
    alerts.push(["Rostro en revisión", `${faceReviewCount} validacion(es) faciales pendientes o en revisión.`]);
  }
  if (duplicates.size) {
    alerts.push(["Salida duplicada", `${duplicates.size} identificador(es) registran múltiples entradas/salidas hoy.`]);
  }

  const pendingToday = records.filter((record) => record.fecha === today && isPendingExitRecord(record));
  if (pendingToday.length) {
    alerts.push(["Pendientes de salida", `${pendingToday.length} identificador(es) con entrada activa hoy.`]);
  }

  if (!alerts.length) {
    els.dashboardAlerts.innerHTML = "<span>Sin alertas operativas con los filtros actuales.</span>";
    return;
  }

  els.dashboardAlerts.innerHTML = alerts.slice(0, 5).map(([title, detail]) => `
    <article class="ops-alert-card" style="padding: 12px 16px; border-radius: var(--radius-soft); background: var(--card); border-left: 4px solid var(--accent); box-shadow: inset 0 0 0 1px var(--line); display: flex; flex-direction: column; gap: 4px; text-align: left;">
      <strong style="color: var(--ink); font-size: 0.85rem; font-weight: 800;">${escapeHtml(title)}</strong>
      <span style="color: var(--slate); font-size: 0.75rem; font-weight: 500;">${escapeHtml(detail)}</span>
    </article>
  `).join("");
}

function renderOperationsDashboard(records = getFilteredRecords()) {
  const today = todayIso();
  const total = records.length;
  const completed = records.filter(isCompleteRecord).length;
  const pending = records.filter(isPendingExitRecord).length;
  const review = records.filter(isReviewRecord).length;
  const issues = records.filter((record) => hasLocationIssue(record) || hasIdentityIssue(record)).length;
  const todayCount = getVisibleRecords().filter((record) => record.fecha === today).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  // Cálculo de retrasos (Tarde): entradas después de la hora oficial fin del sitio activo
  const lateCount = records.filter(r => {
    if (r.horarioValidado === false && /tarde|retraso/i.test(r.horarioObservacion || "")) {
      return true;
    }
    if (r.horaEntrada && state.activeSite && state.activeSite.hora_entrada_fin) {
      return r.horaEntrada > state.activeSite.hora_entrada_fin;
    }
    return false;
  }).length;

  // Cálculo de Sin salida (Turnos vencidos sin cerrar de días anteriores)
  const noExitCount = records.filter(r => isPendingExitRecord(r) && r.fecha !== today).length;

  if (els.dashboardVisibleTotal) els.dashboardVisibleTotal.textContent = total;
  if (els.dashboardToday) els.dashboardToday.textContent = todayCount;
  if (els.dashboardCompleted) els.dashboardCompleted.textContent = completed;
  if (els.dashboardPending) els.dashboardPending.textContent = pending;
  if (els.dashboardLate) els.dashboardLate.textContent = lateCount;
  if (els.dashboardNoExit) els.dashboardNoExit.textContent = noExitCount;
  if (els.dashboardReview) els.dashboardReview.textContent = review;
  if (els.dashboardIssues) els.dashboardIssues.textContent = issues;
  if (els.dashboardCompletionRate) els.dashboardCompletionRate.textContent = `${completionRate}% completo`;
  if (els.dashboardScopeLabel) els.dashboardScopeLabel.textContent = dashboardScopeText();
  renderDashboardAlerts(records);
  renderSiteUsersOverview(getVisibleRecords());
  renderAdminUsersSection(getVisibleRecords());
}

function recordSiteName(record) {
  return (record.sitioNombre || record.sitioEntradaNombre || "").trim() || "Sin sitio";
}

function renderSiteUsersOverview(records = getVisibleRecords()) {
  if (!els.siteUsersList || !els.siteUsersTotal) return;
  const bySite = new Map();

  records.forEach((record) => {
    const site = recordSiteName(record);
    if (!bySite.has(site)) {
      bySite.set(site, {
        users: new Map(),
        records: 0,
        completed: 0,
        pending: 0,
      });
    }
    const bucket = bySite.get(site);
    bucket.records += 1;
    if (isCompleteRecord(record)) bucket.completed += 1;
    if (isPendingExitRecord(record)) bucket.pending += 1;
    if (record.matricula) {
      bucket.users.set(normalizeMatricula(record.matricula), record.nombre || record.matricula);
    }
  });

  const totalUsers = new Set();
  bySite.forEach((bucket) => {
    bucket.users.forEach((_, matricula) => totalUsers.add(matricula));
  });
  els.siteUsersTotal.textContent = `${totalUsers.size} ${totalUsers.size === 1 ? "usuario" : "usuarios"}`;

  if (!bySite.size) {
    els.siteUsersList.innerHTML = `
      <article class="site-users-card">
        <strong>Sin registros todavía</strong>
        <span>Cuando existan asistencias, aquí aparecerán usuarios agrupados por sitio.</span>
      </article>
    `;
    return;
  }

  const selectedSite = els.adminFilterSite?.value || "all";
  els.siteUsersList.innerHTML = Array.from(bySite.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([site, bucket]) => {
      const isSelected = selectedSite === site;
      const sampleUsers = Array.from(bucket.users.values()).slice(0, 3).join(", ");
      return `
        <article class="site-users-card ${isSelected ? "is-selected" : ""}">
          <div>
            <strong>${escapeHtml(site)}</strong>
            <span>${bucket.users.size} ${bucket.users.size === 1 ? "usuario" : "usuarios"} · ${bucket.records} ${bucket.records === 1 ? "registro" : "registros"}</span>
          </div>
          <div class="site-users-card-meta">
            <span>${bucket.completed} completos</span>
            <span>${bucket.pending} pendientes</span>
          </div>
          <p>${escapeHtml(sampleUsers || "Sin usuarios identificados")}</p>
        </article>
      `;
    }).join("");
}

function keySafeSegment(value, fallback = "SITIO") {
  const normalized = String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  return normalized || fallback;
}

function buildAccessKey(prefix, source) {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${keySafeSegment(source).slice(0, 14)}-${randomPart}`;
}

function usersFromVisibleRecords(records = getVisibleRecords()) {
  const users = new Map();
  records.forEach((record) => {
    const matricula = normalizeMatricula(String(record.matricula || ""));
    if (!matricula) return;
    if (!users.has(matricula)) {
      users.set(matricula, {
        nombre: record.nombre || record.matricula,
        matricula,
        email: record.email || "",
        rol: "usuario",
        sitio_nombre: recordSiteName(record),
        organizacion_nombre: record.organizacionNombre || "Organizacion",
        activo: true,
        registros_total: 0,
      });
    }
    const user = users.get(matricula);
    user.registros_total += 1;
    if (recordSiteName(record) !== "Sin sitio") user.sitio_nombre = recordSiteName(record);
  });
  return Array.from(users.values());
}

function getAdminUserRows() {
  return state.managedUsers.length ? state.managedUsers : usersFromVisibleRecords();
}

function getAdminSiteOptions() {
  const sites = new Map();
  state.managedSites.forEach((site) => {
    const label = site.nombre || site.sitio_nombre || "Sitio sin nombre";
    sites.set(label, {
      label,
      org: site.organizacion_nombre || "Organizacion",
      keyReady: Boolean(site.tiene_clave || site.clave_sitio || site.site_key),
    });
  });
  getVisibleRecords().forEach((record) => {
    const label = recordSiteName(record);
    if (!sites.has(label)) {
      sites.set(label, { label, org: record.organizacionNombre || "Organizacion", keyReady: false });
    }
  });
  return Array.from(sites.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function populateAdminInviteSites() {
  if (!els.adminInviteSite) return;
  const previous = els.adminInviteSite.value;
  const options = getAdminSiteOptions();
  els.adminInviteSite.innerHTML = `<option value="">Selecciona un sitio</option>`;
  options.forEach((site) => {
    const option = document.createElement("option");
    option.value = site.label;
    option.textContent = `${site.label} / ${site.org}`;
    els.adminInviteSite.appendChild(option);
  });
  els.adminInviteSite.value = options.some((site) => site.label === previous) ? previous : "";
}

function renderAdminUsersSection(records = getVisibleRecords()) {
  if (!els.adminUsersBySite) return;
  const rows = getAdminUserRows();
  const bySite = new Map();
  const withoutSite = [];

  rows.forEach((user) => {
    const site = String(user.sitio_nombre || user.sitioNombre || "Sin sitio").trim() || "Sin sitio";
    if (!bySite.has(site)) bySite.set(site, []);
    bySite.get(site).push(user);
    if (site === "Sin sitio") withoutSite.push(user);
  });

  const totalUsers = rows.length;
  if (els.adminUsersCount) {
    els.adminUsersCount.textContent = `${totalUsers} ${totalUsers === 1 ? "usuario visible" : "usuarios visibles"}`;
  }
  if (els.adminUsersNoSiteCount) {
    els.adminUsersNoSiteCount.textContent = `${withoutSite.length} sin sitio`;
  }
  if (els.adminUsersScopeBadge) {
    els.adminUsersScopeBadge.className = `badge ${hasPermission("view_all_records") ? "admin" : "default"}`;
    els.adminUsersScopeBadge.textContent = hasPermission("view_all_records") ? "Alcance global" : "Alcance de sitio";
  }
  if (els.adminUsersSummary) {
    els.adminUsersSummary.textContent = hasPermission("view_all_records")
      ? "Superadmin puede revisar usuarios globales, sitios asignados y pendientes de vinculacion."
      : "Administrador de sitio: solo usuarios vinculados a tu organizacion o sitio.";
  }

  populateAdminInviteSites();

  if (!totalUsers) {
    els.adminUsersBySite.innerHTML = `
      <article class="admin-user-site-card is-empty">
        <strong>Sin usuarios visibles</strong>
        <p>Cuando existan registros o el RPC de usuarios responda, aqui apareceran agrupados por sitio.</p>
      </article>
    `;
    return;
  }

  els.adminUsersBySite.innerHTML = Array.from(bySite.entries())
    .sort((a, b) => (a[0] === "Sin sitio" ? 1 : b[0] === "Sin sitio" ? -1 : a[0].localeCompare(b[0])))
    .map(([site, users]) => {
      const uniqueRecords = records.filter((record) => {
        const recordUser = normalizeMatricula(String(record.matricula || ""));
        return users.some((user) => normalizeMatricula(String(user.matricula || "")) === recordUser);
      }).length;
      const people = users.slice(0, 8).map((user) => {
        const role = getRoleDefinition(user.rol || "usuario");
        const statusClass = user.activo === false ? "danger" : "success";
        return `
          <li>
            <div>
              <strong>${escapeHtml(user.nombre || user.email || user.matricula || "Usuario")}</strong>
              <span>${escapeHtml(user.email || user.matricula || "Sin identificador")}</span>
            </div>
            <span class="badge ${statusClass}">${user.activo === false ? "Inactivo" : escapeHtml(role.label)}</span>
          </li>
        `;
      }).join("");
      const overflow = users.length > 8 ? `<p class="muted-note">+${users.length - 8} usuarios adicionales en este sitio.</p>` : "";
      return `
        <article class="admin-user-site-card ${site === "Sin sitio" ? "needs-attention" : ""}">
          <header>
            <div>
              <strong>${escapeHtml(site)}</strong>
              <span>${users.length} ${users.length === 1 ? "usuario" : "usuarios"} / ${uniqueRecords} registros</span>
            </div>
            <span class="badge ${site === "Sin sitio" ? "warning" : "success"}">${site === "Sin sitio" ? "Requiere sitio" : "Vinculado"}</span>
          </header>
          <ul>${people}</ul>
          ${overflow}
        </article>
      `;
    }).join("");
}

function prepareAdminInviteKey() {
  if (!hasPermission("manage_organization")) {
    showToast("Solo superadmin puede preparar keys de administracion.");
    return;
  }
  const email = els.adminInviteEmail?.value.trim() || "";
  const site = els.adminInviteSite?.value || els.siteName?.value || "sitio";
  if (!email || !site) {
    if (els.adminInviteStatus) {
      els.adminInviteStatus.textContent = "Captura correo y sitio antes de preparar la key.";
      els.adminInviteStatus.dataset.tone = "danger";
    }
    return;
  }
  const key = buildAccessKey("ADMIN", site);
  if (els.adminInviteKey) els.adminInviteKey.value = key;
  if (els.adminInviteStatus) {
    els.adminInviteStatus.textContent = `Key preparada para ${email}. Pendiente de RPC segura en Supabase.`;
    els.adminInviteStatus.dataset.tone = "warning";
  }
  addAdminLog("admin_invite_key_preparada", `${email} / ${site}`);
}

async function copyAdminInviteKey() {
  const key = els.adminInviteKey?.value.trim();
  if (!key) {
    showToast("Primero prepara una key de admin.");
    return;
  }
  try {
    await navigator.clipboard.writeText(key);
    showToast("Key copiada al portapapeles.");
  } catch {
    showToast("No se pudo copiar la key desde este navegador.");
  }
}

function generateSiteKey() {
  if (!hasPermission("manage_organization") && !hasPermission("manage_site")) {
    showToast("No tienes permisos para generar keys de sitio.");
    return;
  }
  const source = els.siteName?.value.trim() || els.adminInviteSite?.value || state.activeSite?.nombre || "sitio";
  const key = buildAccessKey("SITE", source);
  if (els.siteKey) els.siteKey.value = key;
  setSiteMessage("Key MVP generada. Guardarla requiere RPC/RLS segura en Supabase.", "warning");
  addAdminLog("site_key_generada_mvp", source);
}

async function copySiteKey() {
  const key = els.siteKey?.value.trim();
  if (!key) {
    showToast("Primero genera o captura una site_key.");
    return;
  }
  try {
    await navigator.clipboard.writeText(key);
    setSiteMessage("Key copiada. Persistirla en Supabase sigue pendiente de RPC segura.", "success");
    showToast("Site key copiada al portapapeles.");
  } catch {
    showToast("No se pudo copiar la key desde este navegador.");
  }
}

function syncDashboardFiltersFromUi() {
  state.recordFilters.date = els.filterDate?.value || "";
  state.recordFilters.status = els.filterStatus?.value || "all";
  state.recordFilters.risk = els.filterRisk?.value || "all";
  state.recordFilters.site = els.filterSite?.value || "all";
  state.recordFilters.user = els.filterUser?.value || "all";
  state.recordFilters.query = els.filterSearch?.value || "";
}

function populateDashboardFilterSelects() {
  const allVisible = getVisibleRecords();
  const uniqueSites = new Set();
  
  allVisible.forEach(record => {
    uniqueSites.add(recordSiteName(record));
  });

  const updateSiteSelect = (selectEl, prevValue) => {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="all">Todos los sitios</option>';
    Array.from(uniqueSites).sort().forEach(site => {
      const option = document.createElement("option");
      option.value = site;
      option.textContent = site;
      selectEl.appendChild(option);
    });
    if (Array.from(uniqueSites).includes(prevValue)) {
      selectEl.value = prevValue;
    } else {
      selectEl.value = "all";
    }
  };

  const updateUserSelect = (selectEl, prevValue, selectedSite) => {
    if (!selectEl) return;
    const uniqueUsers = new Map();
    allVisible.forEach(record => {
      const siteName = recordSiteName(record);
      const siteMatches = selectedSite === "all" || siteName === selectedSite;
      if (siteMatches && record.matricula && record.nombre) {
        uniqueUsers.set(normalizeMatricula(record.matricula), record.nombre.trim());
      }
    });
    selectEl.innerHTML = `<option value="all">${selectedSite === "all" ? "Todos los usuarios" : "Usuarios del sitio"}</option>`;
    Array.from(uniqueUsers.entries()).sort((a,b) => a[1].localeCompare(b[1])).forEach(([matricula, nombre]) => {
      const option = document.createElement("option");
      option.value = matricula;
      option.textContent = `${nombre} (${matricula})`;
      selectEl.appendChild(option);
    });
    selectEl.value = uniqueUsers.has(prevValue) ? prevValue : "all";
  };

  if (els.filterSite) {
    const prevSite = els.filterSite.value;
    updateSiteSelect(els.filterSite, prevSite);
  }
  if (els.adminFilterSite) {
    const prevSite = els.adminFilterSite.value;
    updateSiteSelect(els.adminFilterSite, prevSite);
  }
  
  if (els.filterUser) {
    const prevUser = els.filterUser.value;
    updateUserSelect(els.filterUser, prevUser, els.filterSite?.value || "all");
  }
  if (els.adminFilterUser) {
    const prevUser = els.adminFilterUser.value;
    updateUserSelect(els.adminFilterUser, prevUser, els.adminFilterSite?.value || "all");
  }

  syncDashboardFiltersFromUi();
}

function resetDashboardFilters() {
  state.recordFilters = { date: "", status: "all", risk: "all", site: "all", user: "all", query: "" };
  if (els.filterDate) els.filterDate.value = "";
  if (els.filterStatus) els.filterStatus.value = "all";
  if (els.filterRisk) els.filterRisk.value = "all";
  if (els.filterSite) els.filterSite.value = "all";
  if (els.filterUser) els.filterUser.value = "all";
  if (els.filterSearch) els.filterSearch.value = "";

  if (els.adminFilterDate) els.adminFilterDate.value = "";
  if (els.adminFilterStatus) els.adminFilterStatus.value = "all";
  if (els.adminFilterRisk) els.adminFilterRisk.value = "all";
  if (els.adminFilterSite) els.adminFilterSite.value = "all";
  if (els.adminFilterUser) els.adminFilterUser.value = "all";
  if (els.adminFilterSearch) els.adminFilterSearch.value = "";

  renderRecords();
}

function attendanceDurationText(record) {
  const start = parseRecordTimeToMinutes(record.horaEntrada);
  const end = parseRecordTimeToMinutes(record.horaSalida);
  if (start === null || end === null || end <= start) return "Duracion pendiente";
  const minutes = end - start;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours} h` : ""}${hours && remainder ? " " : ""}${remainder ? `${remainder} min` : ""}`;
}

function mobileRecordValidation(label, value, tone = "neutral") {
  return `
    <div class="mobile-record-validation" data-tone="${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "Pendiente")}</strong>
    </div>
  `;
}

function renderMobileRecordCards(records = []) {
  if (!els.recordsMobileCards) return;

  if (els.mobileRecordsCount) {
    els.mobileRecordsCount.textContent = `${records.length} ${records.length === 1 ? "jornada" : "jornadas"}`;
  }

  const completeCount = records.filter(isCompleteRecord).length;
  const pendingCount = records.length - completeCount;
  if (els.recordsSummaryTotal) els.recordsSummaryTotal.textContent = records.length;
  if (els.recordsSummaryComplete) els.recordsSummaryComplete.textContent = completeCount;
  if (els.recordsSummaryPending) els.recordsSummaryPending.textContent = pendingCount;

  if (!records.length) {
    els.recordsMobileCards.innerHTML = `
      <div class="mobile-record-empty">
        <span class="mobile-record-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/><path d="m8 15 2 2 5-5"/></svg>
        </span>
        <strong>Aun no hay jornadas</strong>
        <span>Tu primera entrada aparecera aqui con sus horarios y estado.</span>
        <button class="primary" data-target="attendance" type="button">Registrar asistencia</button>
      </div>
    `;
    return;
  }

  const canManageRecords = hasPermission("manage_records") || isDemoAdminUnlocked();

  els.recordsMobileCards.innerHTML = records.map((record) => {
    const statusClass = statusBadgeClass(record.estado);
    const canViewEvidence = canViewRecord(record) || hasPermission("view_evidence") || isDemoAdminUnlocked();
    const isComplete = isCompleteRecord(record);
    const statusText = statusLabel(record.estado);
    const locationText = record.ubicacionEntradaValidada && (record.horaSalida ? record.ubicacionSalidaValidada : true) ? "Ubicación validada" : "Revisar ubicación";
    const evidenceText = hasCompleteEvidence(record) ? "Fotos completas" : "Evidencia parcial";
    const actionButtons = [
      canViewEvidence ? `<button class="secondary" data-action="view-evidence" data-id="${record.id}">Ver evidencia</button>` : "",
      canManageRecords ? `<button class="ghost mini" data-action="edit-observation" data-id="${record.id}">Observación</button>` : "",
      canManageRecords ? `<button class="danger mini" data-action="delete-record" data-id="${record.id}">Eliminar</button>` : "",
    ].filter(Boolean).join("");

    return `
      <article class="mobile-record-card">
        <div class="mobile-record-card-head">
          <div class="mobile-record-card-title">
            <span>Jornada del ${escapeHtml(displayDate(record.fecha))}</span>
            <strong>${escapeHtml(isComplete ? "Jornada completa" : "Salida pendiente")}</strong>
            <small>${escapeHtml(recordSiteName(record))}</small>
          </div>
          <span class="badge ${statusClass}">${escapeHtml(statusText)}</span>
        </div>

        <div class="mobile-record-timeline" aria-label="Horario de asistencia">
          <div class="mobile-record-time">
            <span>Entrada</span>
            <strong>${escapeHtml(record.horaEntrada || "Pendiente")}</strong>
          </div>
          <div class="mobile-record-line ${isComplete ? "is-complete" : ""}" aria-hidden="true"><span></span></div>
          <div class="mobile-record-time">
            <span>Salida</span>
            <strong>${escapeHtml(record.horaSalida || "Pendiente")}</strong>
          </div>
        </div>

        <div class="mobile-record-result" data-tone="${isComplete ? "complete" : "pending"}">
          <strong>${escapeHtml(isComplete ? attendanceDurationText(record) : "Falta registrar tu salida")}</strong>
          <span>${escapeHtml(isComplete ? "Jornada cerrada correctamente" : "Completa tu jornada cuando termines")}</span>
        </div>

        ${!isComplete ? `<button class="primary mobile-record-next" data-target="attendance" type="button">Registrar salida</button>` : ""}

        <details class="mobile-record-details">
          <summary>Ver validaciones</summary>
          <div class="mobile-record-validation-grid">
            ${mobileRecordValidation("Identificador", record.matricula)}
            ${mobileRecordValidation("Identidad", identityLabel(record.validacionIdentidad), record.validacionIdentidad === "identidad_validada" ? "success" : "neutral")}
            ${mobileRecordValidation("Evidencia", evidenceText, hasCompleteEvidence(record) ? "success" : "neutral")}
            ${mobileRecordValidation("Ubicacion", locationText, locationText.startsWith("Ubicaci") ? "success" : "warning")}
          </div>
          ${record.riesgo && record.riesgo !== "normal" ? `<p class="mobile-record-risk">Revision: ${escapeHtml(riskLabel(record.riesgo))}</p>` : ""}
        </details>

        <div class="mobile-record-card-foot">
          <div class="mobile-record-actions">${actionButtons}</div>
        </div>
      </article>
    `;
  }).join("");
}

function setProgressBar(element, value) {
  if (!element) return;
  const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  element.style.width = safeValue + "%";
}

function updateSummary(records = getVisibleRecords()) {
  const total = records.length;
  const completed = records.filter((record) => ["asistencia_completa", "Asistencia completa"].includes(record.estado)).length;
  const pending = total - completed;
  els.totalRecords.textContent = total;
  els.completedRecords.textContent = completed;
  els.pendingRecords.textContent = pending;
  setProgressBar(els.totalProgress, total > 0 ? 100 : 0);
  setProgressBar(els.completedProgress, total > 0 ? (completed / total) * 100 : 0);
  setProgressBar(els.pendingProgress, total > 0 ? (pending / total) * 100 : 0);
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

function recordFailedAdminAttempt(detail = "Acceso administrativo denegado") {
  const entry = { ...nowParts(), action: "Intento admin fallido", detail };
  state.adminLog.unshift(entry);
  state.adminLog = state.adminLog.slice(0, 8);
  saveAdminLog();
  renderAdminAudit();
  if (CLOUD_ENABLED) {
    callAdminRpc("log_security_event", {
      p_accion: "Intento admin fallido",
      p_detalle: detail,
      p_resultado: "denied",
    }).catch(() => undefined);
  }
}

function requestAdminAccess() {
  if (isRoleAdminSession()) {
    state.isAdmin = true;
    updateAdminControls();
    return true;
  }

  if (isDemoAdminUnlocked()) return true;

  if (canUseDemoAdminKey()) {
    const value = prompt("Ingresa la clave administrativa para soporte operativo temporal:");
    if (value === ADMIN_KEY) {
      state.manualAdminUnlocked = true;
      state.isAdmin = true;
      updateAdminControls();
      renderRecords();
      loadActiveSite({ silent: true });
      loadOrganizationContext({ silent: true });
      loadOrganizations({ silent: true });
      loadAdminDirectories({ silent: true });
      addAdminLog("Desbloqueo admin demo", "Modo administrativo local/demo activado");
      showToast("Modo administrativo demo desbloqueado.");
      return true;
    }
    if (value !== null) {
      recordFailedAdminAttempt("Clave demo incorrecta");
      showToast("Clave administrativa incorrecta.");
    }
    return false;
  }

  recordFailedAdminAttempt(`Usuario ${state.currentUser?.email || "sin sesi\u00f3n"} sin rol admin intent\u00f3 acceso administrativo`);
  showToast("Para acciones administrativas inicia sesi\u00f3n con una cuenta admin.");
  return false;
}

function lockAdmin() {
  if (isRoleAdminSession()) {
    state.isAdmin = true;
    updateAdminControls();
    showToast("Tu acceso administrativo esta activo por rol de Supabase.");
    return;
  }
  state.manualAdminUnlocked = false;
  state.isAdmin = false;
  updateAdminControls();
  renderRecords();
  showToast("Modo administrativo temporal bloqueado.");
}

function updateAdminControls() {
  const roleAdmin = isRoleAdminSession();
  const demoAdmin = isDemoAdminUnlocked();
  if (roleAdmin) state.isAdmin = true;
  if (!roleAdmin && !demoAdmin) state.isAdmin = false;

  const canManageOrg = hasPermission("manage_organization") || demoAdmin;
  const canManageSite = hasPermission("manage_site") || demoAdmin;
  const canManageRecords = hasPermission("manage_records") || demoAdmin;
  const canExport = hasPermission("export_records") || demoAdmin;
  const canViewAudit = hasPermission("view_audit") || demoAdmin;
  const hasAdminSurface = roleAdmin || demoAdmin;

  document.querySelectorAll(".admin-nav").forEach((element) => {
    element.classList.toggle("is-hidden", !hasAdminSurface);
  });
  document.querySelectorAll(".admin-control, .admin-only").forEach((element) => {
    element.classList.toggle("is-hidden", !state.isAdmin);
  });

  // Control de botones de bloqueo y administración
  const roleDef = getRoleDefinition();
  const isAuthorizedToUnlock = ["admin", "superadmin"].includes(state.currentRole);
  
  if (els.unlockAdmin) {
    els.unlockAdmin.classList.toggle("is-hidden", state.isAdmin || !isAuthorizedToUnlock);
  }
  if (els.lockAdmin) {
    els.lockAdmin.classList.toggle("is-hidden", !state.isAdmin || !isAuthorizedToUnlock);
  }

  // Elementos de administración y roles adicionales
  document.querySelectorAll(".superadmin-only").forEach((element) => {
    element.classList.toggle("is-hidden", !canManageOrg);
  });
  document.querySelectorAll(".site-admin-panel").forEach((element) => {
    element.classList.toggle("is-hidden", !canManageSite);
  });
  document.querySelectorAll(".org-admin-panel").forEach((element) => {
    element.classList.toggle("is-hidden", !(canManageOrg || canManageSite));
  });
  document.querySelectorAll(".audit-box").forEach((element) => {
    element.classList.toggle("is-hidden", !canViewAudit);
  });

  els.unlockAdmin?.classList.add("is-hidden");
  els.lockAdmin?.classList.toggle("is-hidden", roleAdmin || !demoAdmin);
  els.exportCsv?.classList.toggle("is-hidden", !canExport);
  els.clearRecords?.classList.toggle("is-hidden", !canManageOrg);

  document.querySelectorAll("th.admin-only").forEach((element) => {
    element.classList.toggle("is-hidden", !canManageRecords && !hasPermission("view_evidence") && !demoAdmin);
  });

  if (els.adminRoleBadge) {
    const role = getRoleDefinition();
    els.adminRoleBadge.textContent = role.label;
    els.adminRoleBadge.dataset.tone = hasPermission("manage_organization")
      ? "superadmin"
      : roleAdmin
        ? "admin"
        : "demo";
  }

  const adminView = document.querySelector('[data-view="admin"]');
  if (adminView && !adminView.classList.contains("is-hidden")) {
    showAdminSection(state.activeAdminSection || "summary");
  }

  // Controlar la visibilidad de las pestañas en la barra lateral
  const navRecordsBtn = document.querySelector('button.nav-button[data-target="records"]');
  if (navRecordsBtn) {
    const canViewRecordsTab = hasAnyPermission(["view_own_records", "view_site_records", "view_all_records"]);
    navRecordsBtn.classList.toggle("is-hidden", !canViewRecordsTab);
  }
  
  const tabRecordsBtn = document.querySelector('.tab-strip button[data-target="records"]');
  if (tabRecordsBtn) {
    const canViewRecordsTab = hasAnyPermission(["view_site_records", "view_all_records"]);
    tabRecordsBtn.classList.toggle("is-hidden", !canViewRecordsTab);
  }

  const isAuthorizedToAdmin = ["admin", "superadmin"].includes(state.currentRole);
  const navAdminBtn = document.querySelector('button.nav-button[data-target="admin"]');
  if (navAdminBtn) {
    navAdminBtn.classList.toggle("is-hidden", !isAuthorizedToAdmin);
  }
  const tabAdminBtn = document.querySelector('.tab-strip button[data-target="admin"]');
  if (tabAdminBtn) {
    tabAdminBtn.classList.toggle("is-hidden", !isAuthorizedToAdmin);
  }

  renderRolePanelCopy();
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
  const records = getVisibleRecords();
  if (!records.length) {
    showToast("No hay registros para exportar.");
    return;
  }

  const headers = [
    "Nombre",
    "Identificador",
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

  const rows = records.map((record) => [
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
    "No aplica",
    "no_aplica",
    record.qrObservacion || "No aplica",
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
  if (!hasPermission("manage_organization") && !isDemoAdminUnlocked()) {
    showToast("Solo superadmin puede limpiar datos globales.");
    return;
  }
  if (!requestAdminAccess()) return;
  if (!state.records.length) {
    showToast("No hay datos para limpiar.");
    return;
  }

  if (!confirm("Deseas eliminar todos los registros globales?")) return;

  try {
    if (CLOUD_ENABLED) {
      const deleted = await callAdminRpc("admin_clear_asistencias", { p_admin_key: getAdminRpcKey() });
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
        p_admin_key: getAdminRpcKey(),
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
      await callAdminRpc("admin_delete_asistencia", { p_id: id, p_admin_key: getAdminRpcKey() });
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
  // Al hacer clic en un nombre o matrícula en la tabla (columna 2 o 3), filtrar la vista por ese usuario
  const cell = event.target.closest("td");
  if (cell) {
    const row = cell.closest("tr");
    const matriculaCell = row?.querySelector("td:nth-child(4)"); // la matrícula está en la columna 4 (1-indexed)
    if (matriculaCell && (cell.cellIndex === 2 || cell.cellIndex === 3)) { // Columna de nombre (2) o matrícula (3) (0-indexed)
      const matricula = matriculaCell.textContent.trim();
      const normalized = normalizeMatricula(matricula);
      if (els.filterUser) {
        els.filterUser.value = normalized;
      }
      if (els.adminFilterUser) {
        els.adminFilterUser.value = normalized;
      }
      syncDashboardFiltersFromUi();
      renderRecords();
      showToast(`Filtrando historial de usuario: ${matricula}`);
      return;
    }
  }

  const navButton = event.target.closest("button[data-target]");
  if (navButton) {
    if (navButton.dataset.target === "attendance") {
      openAttendanceView();
    } else {
      showView(navButton.dataset.target);
    }
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) return;

  if (button.dataset.action === "view-evidence") {
    const record = state.records.find((item) => item.id === button.dataset.id);
    if (!record || (!canViewRecord(record) && !hasPermission("view_evidence") && !isDemoAdminUnlocked())) {
      showToast("Tu rol no puede ver evidencia protegida.");
      return;
    }
    showEvidenceDetail(button.dataset.id);
  }

  if (button.dataset.action === "edit-observation") {
    if (!hasPermission("manage_records") && !isDemoAdminUnlocked()) {
      showToast("Tu rol no puede modificar registros.");
      return;
    }
    editAdminObservation(button.dataset.id);
  }

  if (button.dataset.action === "delete-record") {
    if (!hasPermission("manage_records") && !isDemoAdminUnlocked()) {
      showToast("Tu rol no puede eliminar registros.");
      return;
    }
    deleteRecord(button.dataset.id);
  }
}


// Variables del estado de autenticación de la UI
let authMode = "login"; // "login" o "register"

// Función global requerida por auth.js para el redireccionamiento al cerrar sesión
window.onLogoutSuccess = function () {
  state.currentUser = null;
  state.currentAppUser = null;
  state.currentRole = "usuario";
  state.currentPermissions = { ...ROLE_DEFINITIONS.usuario.permissions };
  state.isAdmin = false;
  state.manualAdminUnlocked = false;
  if (els.loginView) els.loginView.classList.remove("is-hidden");
  if (els.appShell) els.appShell.classList.add("is-hidden");
};

function showLoginView() {
  authMode = "login";
  if (els.loginView) els.loginView.classList.remove("is-hidden");
  if (els.appShell) els.appShell.classList.add("is-hidden");
  updateAuthUI();
}

function showAppShell(user) {
  state.currentUser = user;
  // Solo aplicar sesión si aún no se ha configurado (evita sobreescribir modo guest)
  if (!state.currentAppUser) {
    applyAppUserSession(null);
  } else {
    renderCurrentUserProfile();
  }

  if (els.loginView) els.loginView.classList.add("is-hidden");
  if (els.appShell) els.appShell.classList.remove("is-hidden");
}


async function continueAsOperationalGuest() {
  const guestUser = {
    id: "operational-guest",
    email: "operativo@local.mvp",
    user_metadata: {
      nombre: "Usuario operativo",
      matricula: "OPERATIVO",
      rol: "usuario",
    },
    isGuest: true,
  };
  localStorage.removeItem("registro_asistencia_token");
  state.currentUser = guestUser;
  // Establecer el usuario guest ANTES de showAppShell para que no se sobreescriba
  applyAppUserSession({
    nombre: "Usuario operativo",
    matricula: "OPERATIVO",
    email: "operativo@local.mvp",
    rol: "usuario",
    permisos: { ...ROLE_DEFINITIONS.usuario.permissions },
    activo: true,
    isGuest: true,
  });
  showAppShell(guestUser);
  await finishInitialization({ requestPermissions: true });
  showToast("Modo operativo activo. Puedes registrar entrada y salida sin cuenta confirmada.");
}
async function loadOrganizationOptions() {
  if (!els.authOrgSelect) return;
  const selected = localStorage.getItem("registro_asistencia_org_slug") || "";

  const showFallback = () => {
    els.authOrgSelect.innerHTML = `<option value="">Sin sitios registrados</option>`;
    if (els.authOrgSelectFallbackWrap) {
      els.authOrgSelectFallbackWrap.classList.remove("is-hidden");
    }
  };

  if (!CLOUD_ENABLED) {
    showFallback();
    return;
  }

  els.authOrgSelect.innerHTML = `<option value="">Cargando sitios\u2026</option>`;

  try {
    const rows = await supabaseRequest("/rest/v1/rpc/get_public_organization_options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const orgs = Array.isArray(rows) ? rows.filter(Boolean) : [];

    if (!orgs.length) {
      showFallback();
      return;
    }

    const options = orgs.map((org) => {
      const slug = String(org.slug || "").trim();
      const label = `${org.nombre || "Organizacion"} (${org.tipo || "sitio"})`;
      return `<option value="${escapeHtml(slug)}" ${slug === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    });

    els.authOrgSelect.innerHTML = `<option value="">Selecciona tu sitio afiliado</option>${options.join("")}`;
    if (els.authOrgSelectFallbackWrap) {
      els.authOrgSelectFallbackWrap.classList.add("is-hidden");
    }
  } catch (error) {
    console.warn("No se pudo cargar la lista publica de sitios.", error);
    showFallback();
  }
}


function selectedOrganizationSlug() {
  const fallback = els.authOrgSelectFallback?.value.trim() || "";
  return els.authOrgSelect?.value.trim() || fallback || localStorage.getItem("registro_asistencia_org_slug") || "";
}

/** Detecta si el valor ingresado parece un número de teléfono */
function isPhoneInput(value) {
  const cleaned = value.replace(/[\s\-().+]/g, "");
  return /^\d{8,15}$/.test(cleaned);
}

/** Convierte número de teléfono a email sintético temporal para Supabase Auth */
function buildEmailFromPhone(phone) {
  const cleaned = phone.replace(/[^\d]/g, "");
  return `tel.${cleaned}@registro.local`;
}

/** Muestra/oculta el panel de nudge para agregar correo */
function showEmailNudgePanel(show = true) {
  if (!els.emailNudgePanel) return;
  if (show) {
    els.emailNudgePanel.classList.remove("is-hidden");
  } else {
    els.emailNudgePanel.classList.add("is-hidden");
  }
}
function updateAuthUI() {
  if (!els.labelName || !els.labelMatricula || !els.loginTitle || !els.loginSubtitle || !els.authSubmitBtn) return;

  if (authMode === "login") {
    // LOGIN: solo correo/teléfono + contraseña
    els.labelName.classList.add("is-hidden");
    els.labelMatricula.classList.add("is-hidden");
    els.labelPhone?.classList.add("is-hidden");
    els.labelOrgSelect?.classList.add("is-hidden");
    els.labelOrgKey?.classList.add("is-hidden");
    els.authOrgKeyWrap?.classList.add("is-hidden");
    els.authName.required = false;
    els.authMatricula.required = false;
    if (els.authOrgKey) els.authOrgKey.required = false;
    if (els.authPhone) els.authPhone.required = false;
    els.loginTitle.textContent = "Iniciar Sesión";
    els.loginSubtitle.textContent = "Ingresa rápido con tu correo o número de teléfono.";
    els.authSubmitBtn.textContent = "Ingresar";
    els.toggleLoginBtn.classList.add("active");
    els.toggleRegisterBtn.classList.remove("active");
    if (els.labelEmailText) els.labelEmailText.textContent = "Correo o teléfono";
    if (els.labelEmailHint) els.labelEmailHint.textContent = "Escribe tu correo electrónico o número de teléfono.";
  } else {
    // REGISTRO: todos los campos
    els.labelName.classList.remove("is-hidden");
    els.labelMatricula.classList.remove("is-hidden");
    els.labelPhone?.classList.remove("is-hidden");
    els.labelOrgSelect?.classList.remove("is-hidden");
    els.authOrgKeyWrap?.classList.remove("is-hidden");
    els.labelOrgKey?.classList.add("is-hidden"); // empieza colapsado
    els.authName.required = true;
    els.authMatricula.required = true;
    if (els.authOrgKey) els.authOrgKey.required = false;
    if (els.authPhone) els.authPhone.required = false;
    els.loginTitle.textContent = "Registrarse";
    els.loginSubtitle.textContent = "Crea tu cuenta para registrar asistencia.";
    els.authSubmitBtn.textContent = "Crear Cuenta";
    els.toggleLoginBtn.classList.remove("active");
    els.toggleRegisterBtn.classList.add("active");
    if (els.labelEmailText) els.labelEmailText.textContent = "Correo electrónico";
    if (els.labelEmailHint) els.labelEmailHint.textContent = "Necesario para confirmar tu cuenta y recibir notificaciones.";
    loadOrganizationOptions();
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const rawInput = els.authEmail.value.trim();
  const password = els.authPassword.value.trim();
  const orgSlug = selectedOrganizationSlug();
  if (orgSlug) localStorage.setItem("registro_asistencia_org_slug", orgSlug);

  if (!rawInput || !password) {
    showToast("Por favor completa los campos obligatorios.");
    return;
  }

  // Detectar si el input es teléfono o email
  const isPhone = isPhoneInput(rawInput);
  const email = isPhone ? buildEmailFromPhone(rawInput) : rawInput.toLowerCase();

  els.authSubmitBtn.disabled = true;
  const originalText = els.authSubmitBtn.textContent;
  els.authSubmitBtn.textContent = authMode === "login" ? "Ingresando..." : "Registrando...";

  try {
    if (authMode === "login") {
      const data = await iniciarSesion(email, password);
      showToast("¡Sesión iniciada!");

      const user = await verificarSesion();
      if (user) {
        // Si entró con teléfono (email sintético), mostrar nudge de correo real
        if (isPhone) {
          const hasRealEmail = user.email && !user.email.includes("@registro.local");
          if (!hasRealEmail) {
            showEmailNudgePanel(true);
          }
        }
        showAppShell(user);
        await finishInitialization({ requestPermissions: true });
      } else {
        throw new Error("No se pudo obtener el usuario después del inicio de sesión.");
      }
    } else {
      const nombre = els.authName.value.trim();
      const matricula = els.authMatricula.value.trim();
      const phone = els.authPhone?.value.trim() || "";

      if (!nombre || !matricula) {
        showToast("Nombre e identificador son requeridos para el registro.");
        els.authSubmitBtn.disabled = false;
        els.authSubmitBtn.textContent = originalText;
        return;
      }

      const orgKey = els.authOrgKey?.value.trim() || "";
      if (orgKey) localStorage.setItem("registro_asistencia_org_key", orgKey);
      const data = await crearCuenta(email, password, nombre, matricula, orgKey, orgSlug, phone);

      if (localStorage.getItem("registro_asistencia_token")) {
        showToast("¡Cuenta creada! Bienvenido.");
        const user = await verificarSesion();
        if (user) {
          if (isPhone) showEmailNudgePanel(true);
          showAppShell(user);
          await finishInitialization({ requestPermissions: true });
        }
      } else {
        showToast("Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión, o usa modo operativo.");
        authMode = "login";
        updateAuthUI();
        els.authPassword.value = "";
      }
    }
  } catch (error) {
    showToast(error.message || "Ocurrió un error inesperado.");
  } finally {
    els.authSubmitBtn.disabled = false;
    els.authSubmitBtn.textContent = originalText;
  }
}

function handleUpdateProfile(event) {
  event.preventDefault();

  const nombre = els.profileName.value.trim();
  const matricula = els.profileMatricula.value.trim();
  const email = els.profileEmail.value.trim();

  if (!nombre || !matricula || !email) {
    showToast("Todos los campos del perfil son obligatorios.");
    return;
  }

  els.profileSubmitBtn.disabled = true;
  const originalText = els.profileSubmitBtn.textContent;
  els.profileSubmitBtn.textContent = "Guardando...";

  // Construimos el objeto de datos con las columnas que existen en la tabla public.usuarios.
  // La tabla public.usuarios contiene únicamente las columnas: id, matricula, nombre, activo, created_at.
  // El correo electrónico se gestiona exclusivamente en la cuenta de autenticación de Supabase (auth.users).
  const data = {
    nombre: nombre,
    matricula: matricula
  };

  const userId = state.currentUser?.id;
  
  console.log("handleUpdateProfile - ID de usuario (userId):", userId);
  console.log("handleUpdateProfile - Objeto de datos a enviar (data):", data);

  if (!userId) {
    showToast("Error: No se pudo obtener el ID del usuario autenticado.");
    els.profileSubmitBtn.disabled = false;
    els.profileSubmitBtn.textContent = originalText;
    return;
  }

  // 1. Actualizar en Supabase Auth
  actualizarPerfil(email, nombre, matricula)
    .then((authResult) => {
      console.log("handleUpdateProfile - Auth actualizado correctamente:", authResult);
      
      const updatePromises = [];

      // 2a. Actualizar en la tabla 'public.usuarios' (esquema antiguo)
      updatePromises.push(
        supabaseRequest(`/rest/v1/usuarios?id=eq.${userId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify(data)
        }).catch((err) => {
          console.warn("No se pudo actualizar en la tabla 'usuarios' (esquema antiguo):", err);
          return null;
        })
      );

      // 2b. Actualizar en la tabla 'public.usuarios_app' (esquema nuevo)
      updatePromises.push(
        supabaseRequest(`/rest/v1/usuarios_app?auth_user_id=eq.${userId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Prefer": "return=representation"
          },
          body: JSON.stringify({
            nombre: nombre,
            matricula: matricula,
            email: email
          })
        }).catch((err) => {
          console.warn("No se pudo actualizar en la tabla 'usuarios_app' (esquema nuevo):", err);
          return null;
        })
      );

      return Promise.all(updatePromises);
    })
    .then((results) => {
      console.log("handleUpdateProfile - Resultado de actualizaciones en BD:", results);
      
      // Actualizar el estado local con los nuevos metadatos
      state.currentUser.user_metadata = {
        ...state.currentUser.user_metadata,
        nombre: nombre,
        matricula: matricula
      };
      state.currentUser.email = email;
      if (state.currentAppUser) {
        state.currentAppUser = { ...state.currentAppUser, nombre, matricula, email };
      }

      showToast("Perfil actualizado correctamente");
      renderCurrentUserProfile();

      // Recargar las iniciales en el avatar
      if (els.userInitials) {
        const nombreUsuario = state.currentUser.user_metadata?.nombre || state.currentUser.user_metadata?.full_name || state.currentUser.email || "US";
        const iniciales = nombreUsuario.split(" ").filter(Boolean).map(n => n[0].toUpperCase()).slice(0, 2).join("");
        els.userInitials.textContent = iniciales || "US";
        if (els.profileAvatarFallback) els.profileAvatarFallback.textContent = iniciales || "US";
      }
      
      els.profileSubmitBtn.disabled = false;
      els.profileSubmitBtn.textContent = originalText;
    })
    .catch((error) => {
      console.error("handleUpdateProfile - Error capturado en actualización:", error);
      showToast(error.message || "Error de red o de permisos al actualizar el perfil.");
      els.profileSubmitBtn.disabled = false;
      els.profileSubmitBtn.textContent = originalText;
    });
}

async function finishInitialization({ requestPermissions = false } = {}) {
  if (els.demoMode) els.demoMode.checked = state.demoMode;
  setFaceStatus(els.entryFaceStatus, "Espera a que carguen los modelos faciales.", "pending");
  setFaceStatus(els.exitFaceStatus, "Espera a que carguen los modelos faciales.", "pending");
  syncCaptureControls();
  loadFaceModels();
  updateHeaderStatus({ force: true });
  // Solo cargar usuario desde Supabase si no estamos en modo operativo guest
  const isGuestMode = state.currentAppUser?.isGuest || state.currentUser?.isGuest;
  if (!isGuestMode) {
    await loadCurrentAppUser({ silent: true });
  }
  await loadPersistentAvatar();
  await syncPermissionState();
  loadAttendanceStreak({ silent: true });
  loadActiveSite({ silent: true });
  loadOrganizationContext({ silent: true });
  loadOrganizations({ silent: true });
  loadAdminDirectories({ silent: true });
  renderRecords();
  renderAdminAudit();
  updateAdminControls();
  showView(isRoleAdminSession() ? "admin" : "home");

  if (requestPermissions) {
    await requestInitialAttendancePermissions();
  }

  if (CLOUD_ENABLED && !isGuestMode) {
    await refreshRecords({ silent: true });
    showToast("Lista global conectada a Supabase.");
  } else if (isGuestMode) {
    showToast("Modo operativo activo. Registros guardados localmente.");
  } else {
    showToast("Modo local: falta configurar Supabase.");
  }
}

async function init() {
  console.log("Inicializando manejadores y eventos de la aplicación...");

  setupPwaInstall();

  // 1. Registro de manejadores de navegación (usando querySelectorAll para obtener una lista real)
  document.querySelectorAll('[data-target]').forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.target === "attendance") {
        openAttendanceView();
        return;
      }
      // Evitar que el perfil se marque en la navegación principal si es un botón especial
      if (button.dataset.target === "profile") {
        showView("profile");
        return;
      }
      showView(button.dataset.target);
    });
  });

  if (els.profileAvatarInput) {
    els.profileAvatarInput.addEventListener("change", handleLocalAvatarSelection);
  }
  els.profileAvatarChangeLabel?.addEventListener("click", () => {
    els.profileAvatarInput?.click();
  });
  if (els.removeProfileAvatar) {
    els.removeProfileAvatar.addEventListener("click", () => removeLocalAvatar());
  }
  [els.headerAvatarImage, els.profileAvatarImage].forEach((image) => {
    image?.addEventListener("error", () => removeLocalAvatar({ notify: false }));
  });
  window.addEventListener("beforeunload", releaseLocalAvatarUrl, { once: true });

  els.requestAttendancePermissions?.addEventListener("click", openPermissionSettings);
  window.addEventListener("focus", () => syncPermissionState());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncPermissionState();
  });
  els.profileCameraEnabled?.addEventListener("change", async () => {
    state.permissionPreferences.camera = els.profileCameraEnabled.checked;
    state.permissionSelections.camera = els.profileCameraEnabled.checked;
    savePermissionPreferences();
    if (state.permissionPreferences.camera) {
      await requestCameraAccess();
    } else {
      stopCamera("entry");
      stopCamera("exit");
      state.permissionStatus.camera = "disabled";
      state.permissionApprovals.camera = false;
      state.permissionSelections.camera = false;
      savePermissionPreferences();
      renderPermissionControls();
    }
  });
  els.profileLocationEnabled?.addEventListener("change", async () => {
    state.permissionPreferences.location = els.profileLocationEnabled.checked;
    state.permissionSelections.location = els.profileLocationEnabled.checked;
    savePermissionPreferences();
    if (state.permissionPreferences.location) {
      await requestLocationAccess();
    } else {
      state.permissionStatus.location = "disabled";
      state.permissionApprovals.location = false;
      state.permissionSelections.location = false;
      savePermissionPreferences();
      renderPermissionControls();
    }
  });

  // 2. Manejadores de autenticación
  if (els.toggleLoginBtn) {
    els.toggleLoginBtn.addEventListener("click", () => {
      console.log("Cambiando modo de autenticación a: login");
      authMode = "login";
      updateAuthUI();
    });
  }
  if (els.toggleRegisterBtn) {
    els.toggleRegisterBtn.addEventListener("click", () => {
      console.log("Cambiando modo de autenticación a: register");
      authMode = "register";
      updateAuthUI();
    });
  }
  if (els.authForm) {
    console.log("Vinculando event listener para el submit de #authForm");
    els.authForm.addEventListener("submit", (event) => {
      console.log("¡Formulario de autenticación enviado (submit)!");
      handleAuthSubmit(event);
    });
  }
  if (els.profileForm) {
    console.log("Vinculando event listener para el submit de #profileForm");
    els.profileForm.addEventListener("submit", handleUpdateProfile);
  }
  if (els.profileSubmitBtn) {
    console.log("Vinculando event listener para el click de save-profile-btn");
    els.profileSubmitBtn.addEventListener("click", (event) => {
      event.preventDefault(); // Evitar cualquier recarga o comportamiento de submit por defecto
      console.log("Botón guardar presionado");
      handleUpdateProfile(event);
    });
    console.log("Event listener vinculado exitosamente");
  }
  if (els.guestAccessBtn) {
    els.guestAccessBtn.addEventListener("click", continueAsOperationalGuest);
  }
  if (els.btnLogout) {
    els.btnLogout.addEventListener("click", async () => {
      await cerrarSesion();
      showToast("Sesión cerrada.");
    });
  }
  if (els.btnLogoutProfile) {
    els.btnLogoutProfile.addEventListener("click", async () => {
      await cerrarSesion();
      showToast("Sesión cerrada.");
    });
  }

  // Badge dinámico email / teléfono en el campo unificado
  if (els.authEmail && els.authInputBadge) {
    els.authEmail.addEventListener("input", () => {
      const v = els.authEmail.value.trim();
      if (!v) {
        els.authInputBadge.textContent = "";
        els.authInputBadge.dataset.tone = "";
      } else if (isPhoneInput(v)) {
        els.authInputBadge.textContent = "📱 Teléfono";
        els.authInputBadge.dataset.tone = "phone";
      } else {
        els.authInputBadge.textContent = "✉️ Correo";
        els.authInputBadge.dataset.tone = "email";
      }
    });
  }

  // Accordion: ¿Tienes clave de organización?
  if (els.authOrgKeyToggle && els.labelOrgKey) {
    els.authOrgKeyToggle.addEventListener("click", () => {
      const open = els.labelOrgKey.classList.toggle("is-hidden");
      els.authOrgKeyToggle.setAttribute("aria-expanded", String(!open));
      els.authOrgKeyToggle.classList.toggle("is-open", !open);
    });
  }

  // Nudge panel: guardar correo real
  if (els.nudgeEmailSubmit) {
    els.nudgeEmailSubmit.addEventListener("click", async () => {
      const email = els.nudgeEmail?.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast("Escribe un correo electrónico válido.");
        return;
      }
      try {
        const token = localStorage.getItem("registro_asistencia_token");
        if (!token) throw new Error("Sin sesión activa.");
        await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/user`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "apikey": window.SUPABASE_CONFIG.publishableKey, "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ email }),
        });
        showToast("Correo guardado. Revisa tu bandeja para confirmarlo.");
        showEmailNudgePanel(false);
        localStorage.setItem("registro_asistencia_nudge_dismissed", "1");
      } catch (err) {
        showToast(err.message || "No se pudo guardar el correo.");
      }
    });
  }

  if (els.nudgeEmailDismiss) {
    els.nudgeEmailDismiss.addEventListener("click", () => {
      showEmailNudgePanel(false);
      localStorage.setItem("registro_asistencia_nudge_dismissed", "1");
    });
  }

  // touchSession en cada clic de navegación para mantener activa la sesión
  document.querySelectorAll(".nav-button[data-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (typeof touchSession === "function") touchSession();
    });
  });

  // 3. Manejadores estándar de la app
  if (els.startEntryCamera) els.startEntryCamera.addEventListener("click", () => startCamera("entry"));
  if (els.takeEntryPhoto) els.takeEntryPhoto.addEventListener("click", () => takePhoto("entry"));
  if (els.entryForm) els.entryForm.addEventListener("submit", handleEntrySubmit);

  if (els.exitMatricula) {
    els.exitMatricula.addEventListener("input", () => {
      window.clearTimeout(validateExitMatricula.timer);
      state.exitActiveRecord = null;
      if (state.exitStream) stopCamera("exit");
      clearCapturedFace("exit");
      syncCaptureControls();
      setExitLookupInfo("Validando entrada activa para este identificador...", "neutral");
      validateExitMatricula.timer = window.setTimeout(() => validateExitMatricula(), 450);
    });
    els.exitMatricula.addEventListener("blur", () => validateExitMatricula());
  }

  if (els.startExitCamera) {
    els.startExitCamera.addEventListener("click", async () => {
      const record = state.exitActiveRecord || await validateExitMatricula({ showErrors: true });
      if (!record) return;
      startCamera("exit");
    });
  }
  if (els.takeExitPhoto) els.takeExitPhoto.addEventListener("click", () => takePhoto("exit"));
  if (els.exitForm) els.exitForm.addEventListener("submit", handleExitSubmit);

  if (els.unlockAdmin) els.unlockAdmin.addEventListener("click", requestAdminAccess);
  if (els.lockAdmin) els.lockAdmin.addEventListener("click", lockAdmin);
  if (els.exportCsv) els.exportCsv.addEventListener("click", exportCsv);
  if (els.clearRecords) els.clearRecords.addEventListener("click", clearRecords);
  if (els.recordsBody) els.recordsBody.addEventListener("click", handleRecordAction);
  if (els.adminRecordsBody) els.adminRecordsBody.addEventListener("click", handleRecordAction);
  if (els.recordsMobileCards) els.recordsMobileCards.addEventListener("click", handleRecordAction);
  if (els.closeEvidence) els.closeEvidence.addEventListener("click", closeEvidenceDetail);
  if (els.evidenceModal) {
    els.evidenceModal.addEventListener("click", (event) => {
      if (event.target === els.evidenceModal) closeEvidenceDetail();
    });
  }
  if (els.siteForm) els.siteForm.addEventListener("submit", handleSiteSubmit);
  if (els.organizationForm) els.organizationForm.addEventListener("submit", handleOrganizationSubmit);
  if (els.siteDirectory) els.siteDirectory.addEventListener("click", handleSiteDirectoryAction);
  if (els.organizationList) els.organizationList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-organization-id]");
    if (button) selectOrganization(button.dataset.organizationId);
  });
  if (els.organizationSearch) els.organizationSearch.addEventListener("input", renderOrganizations);
  if (els.newOrganizationButton) els.newOrganizationButton.addEventListener("click", () => openOrganizationEditor());
  if (els.editOrganizationButton) els.editOrganizationButton.addEventListener("click", () => openOrganizationEditor(getSelectedOrganization()));
  if (els.deleteOrganizationButton) els.deleteOrganizationButton.addEventListener("click", deleteSelectedOrganization);
  if (els.cancelOrganizationEdit) els.cancelOrganizationEdit.addEventListener("click", closeOrganizationEditor);
  if (els.newSiteButton) els.newSiteButton.addEventListener("click", () => openSiteEditor());
  if (els.cancelSiteEdit) els.cancelSiteEdit.addEventListener("click", closeSiteEditor);
  if (els.useAdminLocation) els.useAdminLocation.addEventListener("click", useAdminLocation);
  if (els.testAdminLocation) els.testAdminLocation.addEventListener("click", testAdminLocation);
  if (els.generateSiteKey) els.generateSiteKey.addEventListener("click", generateSiteKey);
  if (els.copySiteKey) els.copySiteKey.addEventListener("click", copySiteKey);
  if (els.prepareAdminInvite) els.prepareAdminInvite.addEventListener("click", prepareAdminInviteKey);
  if (els.copyAdminInviteKey) els.copyAdminInviteKey.addEventListener("click", copyAdminInviteKey);
  document.querySelectorAll("[data-admin-section-target]").forEach((button) => {
    button.addEventListener("click", () => showAdminSection(button.dataset.adminSectionTarget));
  });

  document.querySelectorAll(".ops-filters").forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
  });

  const syncFilterControls = (sourceEl) => {
    if (!sourceEl) return;
    const map = {
      "filterDate": "adminFilterDate",
      "filterStatus": "adminFilterStatus",
      "filterRisk": "adminFilterRisk",
      "filterSite": "adminFilterSite",
      "filterUser": "adminFilterUser",
      "filterSearch": "adminFilterSearch",
      "adminFilterDate": "filterDate",
      "adminFilterStatus": "filterStatus",
      "adminFilterRisk": "filterRisk",
      "adminFilterSite": "filterSite",
      "adminFilterUser": "filterUser",
      "adminFilterSearch": "filterSearch"
    };
    const targetId = map[sourceEl.id];
    if (targetId) {
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.value = sourceEl.value;
    }
  };

  const filterControls = [
    { normal: els.filterDate, admin: els.adminFilterDate },
    { normal: els.filterStatus, admin: els.adminFilterStatus },
    { normal: els.filterRisk, admin: els.adminFilterRisk },
    { normal: els.filterSite, admin: els.adminFilterSite },
    { normal: els.filterUser, admin: els.adminFilterUser },
    { normal: els.filterSearch, admin: els.adminFilterSearch }
  ];

  filterControls.forEach((group) => {
    const handleFilterEvent = (event) => {
      syncFilterControls(event.target);
      syncDashboardFiltersFromUi();
      renderRecords();
    };
    if (group.normal) {
      group.normal.addEventListener("change", handleFilterEvent);
      group.normal.addEventListener("input", handleFilterEvent);
    }
    if (group.admin) {
      group.admin.addEventListener("change", handleFilterEvent);
      group.admin.addEventListener("input", handleFilterEvent);
    }
  });

  if (els.clearDashboardFilters) els.clearDashboardFilters.addEventListener("click", resetDashboardFilters);
  if (els.adminClearDashboardFilters) els.adminClearDashboardFilters.addEventListener("click", resetDashboardFilters);

  if (window.location.hash.startsWith("#salida")) {
    openAttendanceView();
  }

  // 4. Intervalos de actualización si está logueado
  setInterval(() => {
    if (state.currentUser) updateHeaderStatus();
  }, 1000);

  setInterval(() => {
    if (state.currentUser) refreshRecords({ silent: true });
  }, 30000);

  setupPwaInstall();
  setupConnectionStatus();
  loadOrganizationOptions();
  updatePwaInstallUi();

  // 5. Verificar sesion activa
  console.log("Verificando sesión activa de Supabase...");
  verificarSesion().then((user) => {
    if (user) {
      console.log("Sesión activa recuperada para:", user.email);
      showAppShell(user);
      finishInitialization();
    } else {
      console.log("Sin sesión activa, redirigiendo a vista de login.");
      showLoginView();
    }
  }).catch((error) => {
    console.error("Error al verificar la sesión:", error);
    showLoginView();
  });
}

// Inicializar la aplicación al cargar el DOM de manera segura
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded disparado. Inicializando elementos...");
  populateElements();
  init();
});
