const STORAGE_KEY = "registro_asistencia_qr_v1";
const DEMO_KEY = "registro_asistencia_demo_mode";
const ADMIN_LOG_KEY = "registro_asistencia_admin_log_v1";
const ADMIN_KEY = String(window.SUPABASE_CONFIG?.demoAdminKey || "").trim();
const QR_START = { hour: 16, minute: 30 };
const QR_END = { hour: 17, minute: 10 };
const QR_VALID_MINUTES = 5;
const FACE_MODEL_URL = window.location.origin + "/models";
const DEFAULT_TIMEZONE = "America/Mexico_City";
const FACE_DISTANCE_STRONG = 0.46;
const FACE_DISTANCE_REVIEW = 0.62;
const SUPABASE = window.SUPABASE_CONFIG || {};
const CLOUD_ENABLED = Boolean(SUPABASE.url && SUPABASE.publishableKey && SUPABASE.bucket);
const PHOTO_BUCKET = SUPABASE.bucket || "attendance-photos";
const PROFILE_AVATAR_BUCKET = "profile-avatars";
const GEO_PRECISION_MAX_METERS = 200;
const LOCAL_ASSET_VERSION = "2.63-simple-capture";
const ATTENDANCE_STREAK_RPC_ENABLED = SUPABASE.enableAttendanceStreakRpc === true;
const NOTIFICATION_PREFERENCE_PREFIX = "registro_asistencia_notifications_v1";
const NOTIFICATION_SENT_PREFIX = "registro_asistencia_notification_sent_v1";
const NOTIFICATION_MAX_ATTEMPTS = 2;
const NOTIFICATION_REPEAT_MINUTES = 30;
const APP_SESSION_STORAGE_KEY = "registro_asistencia_app_session_id";
const APP_SESSION_HEARTBEAT_MS = 45000;
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
      delete_records: false,
      manage_site: false,
      create_organization: false,
      manage_organization: false,
      manage_roles: false,
      view_audit: false,
    },
  },
  supervisor: {
    label: "Supervisor",
    scope: "Supervisa su sitio: revisa y corrige asistencias, evidencia, horarios y ubicacion.",
    rank: 20,
    permissions: {
      register_attendance: true,
      view_own_records: true,
      view_site_records: true,
      view_all_records: false,
      view_evidence: true,
      export_records: false,
      manage_records: true,
      delete_records: false,
      manage_site: true,
      create_organization: false,
      manage_organization: false,
      manage_roles: false,
      view_audit: false,
    },
  },
  admin: {
    label: "Administrador",
    scope: "Administra una organizacion: usuarios, sitios, asistencias, evidencia y auditoria local.",
    rank: 30,
    permissions: {
      register_attendance: true,
      view_own_records: true,
      view_site_records: true,
      view_all_records: false,
      view_evidence: true,
      export_records: true,
      manage_records: true,
      delete_records: true,
      manage_site: true,
      create_organization: true,
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
      delete_records: true,
      manage_site: true,
      create_organization: true,
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
  cameraStartPromises: { entry: null, exit: null },
  cameraRetryTimers: { entry: null, exit: null },
  cameraNeedsGesture: { entry: false, exit: false },
  cameraFacingMode: { entry: "user", exit: "user" },
  availableVideoInputs: 0,
  photoCaptureRunning: { entry: false, exit: false },
  attendanceSubmitting: { entry: false, exit: false },
  loadingRecords: false,
  facialModelsLoaded: false,
  facialModelsError: false,
  entryFace: null,
  exitFace: null,
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
  adminUserDirectoryView: "unassigned",
  attendanceStreak: null,
  organizationContext: null,
  organizationHubs: [],
  registrationAffiliations: [],
  selectedOrganizationId: null,
  managedSites: [],
  managedUsers: [],
  attendanceControlFilters: { date: "", organization: "all", site: "all", status: "all", query: "" },
  managedUserSiteScopes: [],
  currentSiteScopes: [],
  recordFilters: {
    date: "",
    status: "all",
    risk: "all",
    organization: "all",
    site: "all",
    user: "all",
    query: "",
  },
  permissionPreferences: { camera: true, location: true },
  permissionStatus: { camera: "unknown", location: "unknown" },
  permissionApprovals: { camera: false, location: false },
  permissionSelections: { camera: false, location: false },
  deferredInstallPrompt: null,
  notificationsEnabled: false,
  activeAttendanceReminder: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {};
let localAvatarObjectUrl = "";
let pwaSetupComplete = false;
const AVATAR_DB_NAME = "asistencia-profile-media";
const AVATAR_STORE_NAME = "avatars";
const avatarCropState = {
  objectUrl: "",
  baseWidth: 0,
  baseHeight: 0,
  zoom: 1,
  x: 0,
  y: 0,
  pointerId: null,
  pointerX: 0,
  pointerY: 0,
};

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
  els.avatarCropModal = $("#avatarCropModal");
  els.avatarCropFrame = $("#avatarCropFrame");
  els.avatarCropImage = $("#avatarCropImage");
  els.avatarCropZoom = $("#avatarCropZoom");
  els.avatarCropReset = $("#avatarCropReset");
  els.avatarCropCancel = $("#avatarCropCancel");
  els.avatarCropCancelIcon = $("#avatarCropCancelIcon");
  els.avatarCropSave = $("#avatarCropSave");
  els.profileCameraEnabled = $("#profileCameraEnabled");
  els.profileLocationEnabled = $("#profileLocationEnabled");
  els.profileCameraPermissionStatus = $("#profileCameraPermissionStatus");
  els.profileLocationPermissionStatus = $("#profileLocationPermissionStatus");
  els.attendanceReminder = $("#attendanceReminder");
  els.attendanceReminderTitle = $("#attendanceReminderTitle");
  els.attendanceReminderMessage = $("#attendanceReminderMessage");
  els.attendanceReminderAction = $("#attendanceReminderAction");
  els.profileNotificationsEnabled = $("#profileNotificationsEnabled");
  els.profileNotificationStatus = $("#profileNotificationStatus");
  els.notificationOrganization = $("#notificationOrganization");
  els.notificationSite = $("#notificationSite");
  els.notificationEntrySchedule = $("#notificationEntrySchedule");
  els.notificationExitSchedule = $("#notificationExitSchedule");
  els.notificationScheduleNote = $("#notificationScheduleNote");
  els.demoMode = $("#demoMode");
  els.toast = $("#toast");
  els.faceStatus = $("#faceStatus");
  els.entryFaceStatus = $("#entryFaceStatus");
  els.exitFaceStatus = $("#exitFaceStatus");
  els.entryLocationStatus = $("#entryLocationStatus");
  els.locationStatus = $("#locationStatus");
  els.entryVideo = $("#entryVideo");
  els.entryCanvas = $("#entryCanvas");
  els.entryPreview = $("#entryPreview");
  els.startEntryCamera = $("#startEntryCamera");
  els.switchEntryCamera = $("#switchEntryCamera");
  els.takeEntryPhoto = $("#takeEntryPhoto");
  els.retakeEntryPhoto = $("#retakeEntryPhoto");
  els.entryForm = $("#entryForm");
  els.entryName = $("#entryName");
  els.entryMatricula = $("#entryMatricula");
  els.entrySiteField = $("#entrySiteField");
  els.entrySiteSelect = $("#entrySiteSelect");
  els.exitGuard = $("#exitGuard");
  els.exitVideo = $("#exitVideo");
  els.exitCanvas = $("#exitCanvas");
  els.exitPreview = $("#exitPreview");
  els.startExitCamera = $("#startExitCamera");
  els.switchExitCamera = $("#switchExitCamera");
  els.takeExitPhoto = $("#takeExitPhoto");
  els.retakeExitPhoto = $("#retakeExitPhoto");
  els.exitForm = $("#exitForm");
  els.exitMatricula = $("#exitMatricula");
  els.exitLookupInfo = $("#exitLookupInfo");
  els.recordsBody = $("#recordsBody");
  els.recordsMobileCards = $("#recordsMobileCards");
  els.mobileRecordsCount = $("#mobileRecordsCount");
  els.recordsSummaryTotal = $("#recordsSummaryTotal");
  els.recordsSummaryComplete = $("#recordsSummaryComplete");
  els.recordsSummaryPending = $("#recordsSummaryPending");
  els.recordsPanel = $("#recordsPanel");
  els.emptyRecords = $("#emptyRecords");
  els.emptyRecordsTitle = $("#emptyRecordsTitle");
  els.emptyRecordsSubtitle = $("#emptyRecordsSubtitle");
  els.emptyRecordsAction = $("#emptyRecordsAction");
  els.unlockAdmin = $("#unlockAdmin");
  els.lockAdmin = $("#lockAdmin");
  els.exportCsv = $("#exportCsv");
  els.clearRecords = $("#clearRecords");
  els.adminSectionHint = $("#adminSectionHint");
  els.adminRoleBadge = $("#adminRoleBadge");
  els.adminNavLabel = $("#adminNavLabel");
  els.adminOrganizationsNavLabel = $("#adminOrganizationsNavLabel");
  els.adminOrganizationsNavDescription = $("#adminOrganizationsNavDescription");
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
  els.attendanceControlTitle = $("#attendanceControlTitle");
  els.attendanceControlScope = $("#attendanceControlScope");
  els.attendanceControlDateLabel = $("#attendanceControlDateLabel");
  els.attendanceExpectedCount = $("#attendanceExpectedCount");
  els.attendanceMissingCount = $("#attendanceMissingCount");
  els.attendanceEntryCount = $("#attendanceEntryCount");
  els.attendancePendingCount = $("#attendancePendingCount");
  els.attendanceCompleteCount = $("#attendanceCompleteCount");
  els.attendanceReviewCount = $("#attendanceReviewCount");
  els.attendanceControlTabs = $("#attendanceControlTabs");
  els.attendanceControlDate = $("#attendanceControlDate");
  els.attendanceControlOrganization = $("#attendanceControlOrganization");
  els.attendanceControlSite = $("#attendanceControlSite");
  els.attendanceControlStatus = $("#attendanceControlStatus");
  els.attendanceControlSearch = $("#attendanceControlSearch");
  els.attendanceControlReset = $("#attendanceControlReset");
  els.attendanceControlEmpty = $("#attendanceControlEmpty");
  els.attendanceControlCards = $("#attendanceControlCards");
  els.attendanceControlTableBody = $("#attendanceControlTableBody");
  els.filterDate = $("#filterDate");
  els.filterStatus = $("#filterStatus");
  els.filterOrganization = $("#filterOrganization");
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
  els.adminAttendanceOrganizationFilter = $("#adminAttendanceOrganizationFilter");
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
  els.adminUsersUnassignedTabCount = $("#adminUsersUnassignedTabCount");
  els.adminUsersAssignedTabCount = $("#adminUsersAssignedTabCount");
  els.adminUsersOrganizationFilter = $("#adminUsersOrganizationFilter");
  els.adminUsersBySite = $("#adminUsersBySite");
  els.userScopeAssignmentCard = $("#userScopeAssignmentCard");
  els.userScopeKicker = $("#userScopeKicker");
  els.userScopeTitle = $("#userScopeTitle");
  els.userScopeHelp = $("#userScopeHelp");
  els.userScopeOrganization = $("#userScopeOrganization");
  els.userScopeAction = $("#userScopeAction");
  els.userScopeActionWrap = $("#userScopeActionWrap");
  els.userScopeUser = $("#userScopeUser");
  els.userScopeSite = $("#userScopeSite");
  els.userScopeSiteLabel = $("#userScopeSiteLabel");
  els.userScopeSiteHelp = $("#userScopeSiteHelp");
  els.userScopeRoleWrap = $("#userScopeRoleWrap");
  els.userScopeRole = $("#userScopeRole");
  els.assignUserScopeButton = $("#assignUserScopeButton");
  els.userScopeStatus = $("#userScopeStatus");
  els.adminInviteEmail = $("#adminInviteEmail");
  els.adminInviteSite = $("#adminInviteSite");
  els.adminInviteKey = $("#adminInviteKey");
  els.prepareAdminInvite = $("#prepareAdminInvite");
  els.copyAdminInviteKey = $("#copyAdminInviteKey");
  els.adminInviteStatus = $("#adminInviteStatus");
  els.organizationAdminInviteCard = $("#organizationAdminInviteCard");
  els.organizationAdminInviteEmail = $("#organizationAdminInviteEmail");
  els.organizationAdminInviteKey = $("#organizationAdminInviteKey");
  els.createOrganizationAdminInvite = $("#createOrganizationAdminInvite");
  els.copyOrganizationAdminInvite = $("#copyOrganizationAdminInvite");
  els.organizationAdminInviteStatus = $("#organizationAdminInviteStatus");
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
  els.repeatAttendanceButton = $("#repeatAttendanceButton");
  els.loginView = $("#login-view");
  els.appShell = $(".app-shell");
  els.authForm = $("#authForm");
  els.authEmail = $("#authEmail");
  els.authPassword = $("#authPassword");
  els.authName = $("#authName");
  els.authMatricula = $("#authMatricula");
  els.authOrgKey = $("#authOrgKey");
  els.authOrgSelect = $("#authOrgSelect");
  els.authSiteSelect = $("#authSiteSelect");
  els.authOrgSelectFallback = $("#authOrgSelectFallback");
  els.authOrgSelectFallbackWrap = $("#authOrgSelectFallbackWrap");
  els.authPhone = $("#authPhone");
  els.authOrgKeyWrap = $("#label-org-key-wrap");
  els.authOrgKeyToggle = $("#authOrgKeyToggle");
  els.authInputBadge = $("#authInputBadge");
  els.authSubmitBtn = $("#authSubmitBtn");
  els.authToggleBar = $("#authToggleBar");
  els.forgotPasswordBtn = $("#forgotPasswordBtn");
  els.passwordRecoveryPanel = $("#passwordRecoveryPanel");
  els.passwordRecoveryRequestForm = $("#passwordRecoveryRequestForm");
  els.passwordRecoveryResetForm = $("#passwordRecoveryResetForm");
  els.passwordRecoveryEmail = $("#passwordRecoveryEmail");
  els.passwordRecoveryNewPassword = $("#passwordRecoveryNewPassword");
  els.passwordRecoveryConfirmPassword = $("#passwordRecoveryConfirmPassword");
  els.passwordRecoveryRequestSubmit = $("#passwordRecoveryRequestSubmit");
  els.passwordRecoveryResetSubmit = $("#passwordRecoveryResetSubmit");
  els.passwordRecoveryStatus = $("#passwordRecoveryStatus");
  els.passwordRecoveryBack = $("#passwordRecoveryBack");
  els.guestAccessBtn = $("#guestAccessBtn");
  els.toggleLoginBtn = $("#toggle-login-btn");
  els.toggleRegisterBtn = $("#toggle-register-btn");
  els.labelName = $("#label-name");
  els.labelMatricula = $("#label-matricula");
  els.labelPhone = $("#label-phone");
  els.labelOrgSelect = $("#label-org-select");
  els.labelSiteSelect = $("#label-site-select");
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
  if (pwaSetupComplete) return;
  pwaSetupComplete = true;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      const reloadKey = "asistencia_sw_reload_version";
      if (sessionStorage.getItem(reloadKey) === LOCAL_ASSET_VERSION) return;
      sessionStorage.setItem(reloadKey, LOCAL_ASSET_VERSION);
      window.location.reload();
    });
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
    showToast("CheckIn App se instalo correctamente.");
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

function notificationUserId() {
  return String(state.currentAppUser?.id || state.currentUser?.id || "guest");
}

function notificationPreferenceKey() {
  return `${NOTIFICATION_PREFERENCE_PREFIX}:${notificationUserId()}`;
}

function loadNotificationPreference() {
  try {
    state.notificationsEnabled = JSON.parse(localStorage.getItem(notificationPreferenceKey()) || "false") === true;
  } catch {
    state.notificationsEnabled = false;
  }
  return state.notificationsEnabled;
}

function saveNotificationPreference() {
  localStorage.setItem(notificationPreferenceKey(), JSON.stringify(state.notificationsEnabled));
}

function getNotificationPermissionLabel() {
  if (!("Notification" in window)) return state.notificationsEnabled ? "Avisos dentro de la app" : "No disponible en este navegador";
  if (!state.notificationsEnabled) return "Desactivados";
  if (Notification.permission === "granted") return "Activos en app y sistema";
  if (Notification.permission === "denied") return "Activos solo dentro de la app";
  return "Activos; permiso del sistema pendiente";
}

function getEffectiveNotificationSchedule() {
  const rules = window.AttendanceNotificationRules;
  if (!rules) return { configured: false, reason: "rules-unavailable" };
  return rules.resolveSchedule({
    user: state.currentAppUser,
    site: state.activeSite,
    organization: state.organizationContext,
    systemTimezone: DEFAULT_TIMEZONE,
    deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

function renderNotificationSettings(schedule = getEffectiveNotificationSchedule()) {
  if (els.profileNotificationsEnabled) els.profileNotificationsEnabled.checked = state.notificationsEnabled;
  if (els.profileNotificationStatus) els.profileNotificationStatus.textContent = getNotificationPermissionLabel();
  if (els.notificationOrganization) {
    els.notificationOrganization.textContent = state.organizationContext?.organizacion_nombre
      || state.organizationContext?.nombre
      || "Sin asignar";
  }
  if (els.notificationSite) els.notificationSite.textContent = state.activeSite?.nombre || "Sin asignar";
  if (els.notificationEntrySchedule) {
    els.notificationEntrySchedule.textContent = schedule.configured ? `${schedule.entryStart} - ${schedule.entryEnd}` : "--:--";
  }
  if (els.notificationExitSchedule) {
    els.notificationExitSchedule.textContent = schedule.configured ? `${schedule.exitStart} - ${schedule.exitEnd}` : "--:--";
  }
  if (els.notificationScheduleNote) {
    els.notificationScheduleNote.textContent = !schedule.configured
      ? "No hay un horario verificable para tu cuenta."
      : !schedule.calendarConfigured
        ? "Avisos pausados: el calendario laboral aun no esta configurado."
        : `Horario del ${schedule.source === "individual" ? "turno individual" : schedule.source === "site" ? "sitio" : "organizacion"} en ${schedule.timezone}.`;
  }
}

function hideAttendanceReminder() {
  state.activeAttendanceReminder = null;
  els.attendanceReminder?.classList.add("is-hidden");
}

function showAttendanceReminder(type, schedule) {
  const isEntry = type === "entry";
  state.activeAttendanceReminder = type;
  if (els.attendanceReminderTitle) els.attendanceReminderTitle.textContent = isEntry ? "Entrada pendiente" : "Salida pendiente";
  if (els.attendanceReminderMessage) {
    els.attendanceReminderMessage.textContent = isEntry
      ? `Tu ventana de entrada termino a las ${schedule.entryEnd}.`
      : `Tu ventana de salida termino a las ${schedule.exitEnd}.`;
  }
  if (els.attendanceReminderAction) els.attendanceReminderAction.textContent = isEntry ? "Registrar entrada" : "Registrar salida";
  els.attendanceReminder?.classList.remove("is-hidden");
}

function recordForOperationalDate(matricula, date) {
  const normalized = normalizeMatricula(String(matricula || ""));
  const currentAppUserId = String(state.currentAppUser?.id || "");
  return state.records.find((record) => {
    if (record.fecha !== date || normalizeMatricula(String(record.matricula || "")) !== normalized) return false;
    return !currentAppUserId || !record.usuarioId || String(record.usuarioId) === currentAppUserId;
  }) || null;
}

function notificationSentStorageKey(key) {
  return `${NOTIFICATION_SENT_PREFIX}:${key}`;
}

function countSentNotificationAttempts(type, date) {
  const rules = window.AttendanceNotificationRules;
  if (!rules) return 0;
  const organizationId = state.currentAppUser?.organizacion_id || state.organizationContext?.organizacion_id || "none";
  let sent = 0;
  for (let attempt = 1; attempt <= NOTIFICATION_MAX_ATTEMPTS; attempt += 1) {
    const key = rules.dedupeKey({ userId: notificationUserId(), organizationId, date, type, attempt });
    if (localStorage.getItem(notificationSentStorageKey(key))) sent += 1;
  }
  return sent;
}

function markNotificationSent(type, date, attempt) {
  const rules = window.AttendanceNotificationRules;
  if (!rules) return false;
  const organizationId = state.currentAppUser?.organizacion_id || state.organizationContext?.organizacion_id || "none";
  const key = rules.dedupeKey({ userId: notificationUserId(), organizationId, date, type, attempt });
  const storageKey = notificationSentStorageKey(key);
  if (localStorage.getItem(storageKey)) return false;
  localStorage.setItem(storageKey, new Date().toISOString());
  return true;
}

async function showSystemAttendanceNotification(type, schedule) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const isEntry = type === "entry";
  const title = isEntry ? "Registra tu entrada" : "Registra tu salida";
  const body = isEntry
    ? `La ventana de entrada de ${state.activeSite?.nombre || "tu sitio"} ya termino.`
    : `Tu entrada esta registrada; falta cerrar la jornada.`;
  const options = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `attendance-${type}-${notificationUserId()}`,
    renotify: true,
    data: { url: `/?attendance=${type}` },
  };
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch (error) {
    console.warn("No se pudo mostrar la notificacion del sistema:", error);
  }
}

async function evaluateAttendanceReminders(now = new Date()) {
  const rules = window.AttendanceNotificationRules;
  const schedule = getEffectiveNotificationSchedule();
  renderNotificationSettings(schedule);
  if (!rules || !state.currentUser || !state.notificationsEnabled || !schedule.configured || !schedule.calendarConfigured) {
    hideAttendanceReminder();
    return null;
  }

  const moment = rules.getShiftMoment(now, schedule);
  const identity = getAttendanceIdentity();
  const attendance = recordForOperationalDate(identity.matricula, moment.shiftDate);
  const baseDecision = rules.decideReminder({ now, schedule, attendance, sentAttempts: {}, maxAttempts: NOTIFICATION_MAX_ATTEMPTS, repeatMinutes: NOTIFICATION_REPEAT_MINUTES });
  if (!baseDecision.type) {
    hideAttendanceReminder();
    return baseDecision;
  }

  showAttendanceReminder(baseDecision.type, schedule);
  const sentAttempts = {
    entry: countSentNotificationAttempts("entry", moment.shiftDate),
    exit: countSentNotificationAttempts("exit", moment.shiftDate),
  };
  const decision = rules.decideReminder({ now, schedule, attendance, sentAttempts, maxAttempts: NOTIFICATION_MAX_ATTEMPTS, repeatMinutes: NOTIFICATION_REPEAT_MINUTES });
  if (decision.type && markNotificationSent(decision.type, decision.shiftDate, decision.attempt)) {
    await showSystemAttendanceNotification(decision.type, schedule);
  }
  return decision;
}

async function setAttendanceNotificationsEnabled(enabled) {
  state.notificationsEnabled = Boolean(enabled);
  if (state.notificationsEnabled && "Notification" in window && Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn("El navegador no permitio solicitar notificaciones:", error);
    }
  }
  saveNotificationPreference();
  await evaluateAttendanceReminders();
}

function openPendingAttendanceRoute() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("attendance")) return;
  params.delete("attendance");
  const cleanQuery = params.toString();
  history.replaceState({}, "", `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${window.location.hash}`);
  openAttendanceView();
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
  const remoteAvatarUrl = await getRemoteAvatarUrl();
  if (remoteAvatarUrl) {
    showLocalAvatar(remoteAvatarUrl);
    return;
  }
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

function profileAvatarPath() {
  const authUserId = String(state.currentUser?.id || "").trim();
  return authUserId ? `${authUserId}/avatar.jpg` : "";
}

function resolveStorageSignedUrl(value) {
  const signedUrl = String(value || "").trim();
  if (!signedUrl) return "";
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
  const path = signedUrl.startsWith("/storage/v1/")
    ? signedUrl
    : `/storage/v1/${signedUrl.replace(/^\/+/, "")}`;
  return `${SUPABASE.url}${path}`;
}

async function getRemoteAvatarUrl() {
  if (!CLOUD_ENABLED || !state.currentUser?.id || !localStorage.getItem("registro_asistencia_token")) return "";
  try {
    const avatar = getRpcFirstRow(await callAdminRpc("get_my_avatar", {}));
    const path = String(avatar?.avatar_path || "").trim();
    if (!path) return "";
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`${SUPABASE.url}/storage/v1/object/sign/${PROFILE_AVATAR_BUCKET}/${encodedPath}`, {
      method: "POST",
      headers: cloudHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: 300 }),
    });
    if (!response.ok) return "";
    const data = await response.json();
    const signedUrl = data.signedURL || data.signedUrl || data.url || "";
    return resolveStorageSignedUrl(signedUrl);
  } catch {
    return "";
  }
}

async function syncProfileAvatar(blob) {
  const path = profileAvatarPath();
  if (!CLOUD_ENABLED || !path || !localStorage.getItem("registro_asistencia_token")) return false;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE.url}/storage/v1/object/${PROFILE_AVATAR_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: cloudHeaders({ "Content-Type": "image/jpeg", "x-upsert": "true" }),
    body: blob,
  });
  if (!response.ok) throw new Error("No se pudo subir la foto de perfil.");
  await callAdminRpc("set_my_avatar_path", { p_avatar_path: path });
  return true;
}

async function removeRemoteAvatar() {
  const path = profileAvatarPath();
  if (!CLOUD_ENABLED || !path || !localStorage.getItem("registro_asistencia_token")) return false;
  await callAdminRpc("set_my_avatar_path", { p_avatar_path: null });
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${SUPABASE.url}/storage/v1/object/${PROFILE_AVATAR_BUCKET}/${encodedPath}`, {
    method: "DELETE",
    headers: cloudHeaders(),
  });
  if (!response.ok && response.status !== 404) throw new Error("No se pudo eliminar la foto de perfil.");
  return true;
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
  if (notify) {
    try {
      const removedRemotely = await removeRemoteAvatar();
      showToast(removedRemotely ? "Foto eliminada de tu perfil." : "Foto eliminada de este dispositivo.");
    } catch {
      showToast("La foto se eliminara de este dispositivo; no se pudo sincronizar el cambio.");
    }
  }
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

function clampAvatarCrop() {
  const frameSize = els.avatarCropFrame?.clientWidth || 1;
  const maxX = Math.max(0, (avatarCropState.baseWidth * avatarCropState.zoom - frameSize) / 2);
  const maxY = Math.max(0, (avatarCropState.baseHeight * avatarCropState.zoom - frameSize) / 2);
  avatarCropState.x = Math.max(-maxX, Math.min(maxX, avatarCropState.x));
  avatarCropState.y = Math.max(-maxY, Math.min(maxY, avatarCropState.y));
}

function renderAvatarCrop() {
  if (!els.avatarCropImage) return;
  clampAvatarCrop();
  els.avatarCropImage.style.width = `${avatarCropState.baseWidth}px`;
  els.avatarCropImage.style.height = `${avatarCropState.baseHeight}px`;
  els.avatarCropImage.style.transform = `translate(-50%, -50%) translate(${avatarCropState.x}px, ${avatarCropState.y}px) scale(${avatarCropState.zoom})`;
}

function resetAvatarCrop() {
  if (!els.avatarCropImage?.naturalWidth || !els.avatarCropFrame) return;
  const frameSize = els.avatarCropFrame.clientWidth;
  const coverScale = Math.max(frameSize / els.avatarCropImage.naturalWidth, frameSize / els.avatarCropImage.naturalHeight);
  avatarCropState.baseWidth = els.avatarCropImage.naturalWidth * coverScale;
  avatarCropState.baseHeight = els.avatarCropImage.naturalHeight * coverScale;
  avatarCropState.zoom = 1;
  avatarCropState.x = 0;
  avatarCropState.y = 0;
  if (els.avatarCropZoom) els.avatarCropZoom.value = "1";
  renderAvatarCrop();
}

function closeAvatarCropEditor() {
  els.avatarCropModal?.classList.add("is-hidden");
  els.avatarCropFrame?.classList.remove("is-dragging");
  if (avatarCropState.objectUrl) URL.revokeObjectURL(avatarCropState.objectUrl);
  avatarCropState.objectUrl = "";
  avatarCropState.pointerId = null;
  if (els.avatarCropImage) {
    els.avatarCropImage.removeAttribute("src");
    els.avatarCropImage.removeAttribute("style");
  }
  if (els.profileAvatarInput) els.profileAvatarInput.value = "";
}

function openAvatarCropEditor(file) {
  if (avatarCropState.objectUrl) URL.revokeObjectURL(avatarCropState.objectUrl);
  avatarCropState.objectUrl = URL.createObjectURL(file);
  els.avatarCropModal?.classList.remove("is-hidden");
  els.avatarCropImage.onload = resetAvatarCrop;
  els.avatarCropImage.onerror = () => {
    closeAvatarCropEditor();
    showToast("No se pudo leer la imagen seleccionada.");
  };
  els.avatarCropImage.src = avatarCropState.objectUrl;
  els.avatarCropCancelIcon?.focus();
}

async function saveAdjustedAvatar() {
  if (!els.avatarCropImage?.naturalWidth || !els.avatarCropFrame) return;
  const originalLabel = els.avatarCropSave.textContent;
  els.avatarCropSave.disabled = true;
  els.avatarCropSave.textContent = "Guardando...";
  try {
    const frameSize = els.avatarCropFrame.clientWidth;
    const outputSize = 512;
    const outputScale = outputSize / frameSize;
    const drawWidth = avatarCropState.baseWidth * avatarCropState.zoom * outputScale;
    const drawHeight = avatarCropState.baseHeight * avatarCropState.zoom * outputScale;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    canvas.getContext("2d").drawImage(
      els.avatarCropImage,
      (frameSize / 2 + avatarCropState.x) * outputScale - drawWidth / 2,
      (frameSize / 2 + avatarCropState.y) * outputScale - drawHeight / 2,
      drawWidth,
      drawHeight
    );
    const avatarBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!(avatarBlob instanceof Blob)) throw new Error("No se pudo preparar la imagen");
    releaseLocalAvatarUrl();
    localAvatarObjectUrl = URL.createObjectURL(avatarBlob);
    showLocalAvatar(localAvatarObjectUrl);
    const saved = await savePersistentAvatar(avatarBlob);
    let synced = false;
    try {
      synced = await syncProfileAvatar(avatarBlob);
    } catch {
      synced = false;
    }
    closeAvatarCropEditor();
    showToast(synced
      ? "Foto ajustada y sincronizada."
      : (saved ? "Foto ajustada y guardada en este dispositivo." : "Foto aplicada; no se pudo guardar de forma permanente."));
  } catch {
    showToast("No se pudo guardar la foto ajustada. Prueba con JPG o PNG.");
  } finally {
    els.avatarCropSave.disabled = false;
    els.avatarCropSave.textContent = originalLabel;
  }
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
  openAvatarCropEditor(file);
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
  const appSessionId = localStorage.getItem(APP_SESSION_STORAGE_KEY);
  return {
    apikey: SUPABASE.publishableKey,
    Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE.publishableKey}`,
    ...(appSessionId ? { "x-app-session-id": appSessionId } : {}),
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
    usuarioId: row.usuario_id || "",
    organizacionId: row.organizacion_id || "",
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
  return Boolean(ADMIN_KEY) && !isProductionEnvironment() && state.demoMode;
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

function isSuperadminSession() {
  return Boolean(state.currentUser && !state.currentUser.isGuest && state.currentAppUser && normalizeAppRole(state.currentRole) === "superadmin");
}

function canCreateFirstOrganization() {
  return normalizeAppRole(state.currentRole) === "admin"
    && hasPermission("create_organization")
    && !state.currentAppUser?.organizacion_id;
}

function canCreateOrganization() {
  return isSuperadminSession() || canCreateFirstOrganization();
}

function isSupervisorSession() {
  return Boolean(
    state.currentUser
    && !state.currentUser.isGuest
    && state.currentAppUser
    && state.currentRole === "supervisor"
    && hasPermission("view_site_records")
  );
}

function canUseOperationsPanel() {
  return isRoleAdminSession() || isSupervisorSession() || isDemoAdminUnlocked();
}

function canManageAssignedSite(siteId = "") {
  if (!hasPermission("manage_site")) return false;
  if (!isSupervisorSession()) return true;
  return Boolean(siteId) && String(siteId) === String(state.currentAppUser?.sitio_id || "");
}

function getCurrentSiteScopeIds() {
  const ids = state.currentSiteScopes
    .map((scope) => String(scope.sitio_id || scope.id || ""))
    .filter(Boolean);
  const primarySiteId = String(state.currentAppUser?.sitio_id || "");
  if (primarySiteId && !ids.includes(primarySiteId)) ids.unshift(primarySiteId);
  return ids;
}

function getOperationalSites() {
  const sites = new Map();
  [...state.managedSites, ...state.currentSiteScopes].forEach((site) => {
    const id = String(site.id || site.sitio_id || "");
    if (!id || sites.has(id)) return;
    sites.set(id, {
      ...site,
      id,
      nombre: site.nombre || site.sitio_nombre || "Sitio",
      organizacion_id: site.organizacion_id || state.currentAppUser?.organizacion_id || "",
      organizacion_nombre: site.organizacion_nombre || state.currentAppUser?.organizacion_nombre || "Organizacion",
      activo: site.activo !== false,
    });
  });
  return Array.from(sites.values());
}

function getCurrentUserMatricula() {
  return normalizeMatricula(state.currentAppUser?.matricula || state.currentUser?.user_metadata?.matricula || "");
}

function canViewRecord(record) {
  if (!state.currentUser) return false;
  if (isDemoAdminUnlocked() || hasPermission("view_all_records")) return true;

  if (hasPermission("view_site_records")) {
    const assignedSites = getCurrentSiteScopeIds();
    if (assignedSites.length) {
      return [record.sitioId, record.sitioEntradaId, record.sitioSalidaId]
        .filter(Boolean)
        .some((siteId) => assignedSites.includes(String(siteId)));
    }

    const assignedOrg = state.currentAppUser?.organizacion_id;
    if (assignedOrg && record.organizacionId) return record.organizacionId === assignedOrg;
    return false;
  }

  if (!hasPermission("view_own_records")) return false;
  const currentAppUserId = String(state.currentAppUser?.id || "");
  if (currentAppUserId && record.usuarioId) return String(record.usuarioId) === currentAppUserId;
  return normalizeMatricula(record.matricula) === getCurrentUserMatricula();
}

function getVisibleRecords() {
  return state.records.filter(canViewRecord);
}

async function loadCurrentSiteScopes({ silent = false } = {}) {
  const primarySiteId = state.currentAppUser?.sitio_id || "";
  const fallback = primarySiteId
    ? [{
      sitio_id: primarySiteId,
      sitio_nombre: state.currentAppUser?.sitio_nombre || "Sitio principal",
      organizacion_id: state.currentAppUser?.organizacion_id || "",
      organizacion_nombre: state.currentAppUser?.organizacion_nombre || "Organizacion",
      es_principal: true,
    }]
    : [];

  if (!CLOUD_ENABLED || !state.currentUser || !localStorage.getItem("registro_asistencia_token")) {
    state.currentSiteScopes = fallback;
    return fallback;
  }

  try {
    const rows = await callAdminRpc("get_my_site_scopes", {});
    state.currentSiteScopes = Array.isArray(rows) && rows.length ? rows : fallback;
  } catch (error) {
    state.currentSiteScopes = fallback;
    if (!silent) showToast("No se pudieron cargar todos tus sitios asignados.");
  }
  return state.currentSiteScopes;
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
  populateAttendanceSiteSelector();
  syncPrivilegedAttendanceActions();
  loadNotificationPreference();
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
  renderNotificationSettings();
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

// Solo controla la visibilidad del panel. Las RPC validan owner en servidor.
function isKnownOwnerSession() {
  return isKnownSuperadminEmail(state.currentUser?.email);
}

function isKnownOwnerEmail(email) {
  return KNOWN_SUPERADMIN_EMAILS.has(String(email || "").trim().toLowerCase());
}

async function loadCurrentAppUser({ silent = false, throwOnError = false, loadSiteScopes = true } = {}) {
  if (!CLOUD_ENABLED || !state.currentUser) {
    applyAppUserSession(null);
    return null;
  }

  const metadata = state.currentUser.user_metadata || {};
  const authEmail = String(state.currentUser.email || "").trim().toLowerCase();
  const matricula = isKnownSuperadminEmail(authEmail)
    ? getKnownSuperadminMatricula(authEmail)
    : (metadata.matricula || "");
  const affiliationKey = metadata.invitation_key || metadata.organization_key || metadata.org_key || localStorage.getItem("registro_asistencia_org_key") || "";
  try {
    const normalizedAffiliationKey = String(affiliationKey).trim().toUpperCase();
    if (normalizedAffiliationKey.startsWith("ORG-ADMIN-")) {
      await callAdminRpc("redeem_organization_admin_onboarding_invite", { p_invite_key: affiliationKey });
    } else if (normalizedAffiliationKey.startsWith("AS-INV-")) {
      try {
        await callAdminRpc("accept_site_admin_invitation", { p_clave: affiliationKey });
      } catch (error) {
        // Una invitacion ya canjeada debe permitir que el usuario vuelva a iniciar sesion.
        if (!parseSupabaseError(error).includes("invitacion_no_disponible")) throw error;
      }
    } else if (normalizedAffiliationKey.startsWith("SITE-INV-")) {
      await callAdminRpc("redeem_site_invite", { p_invite_key: affiliationKey });
    }
    const result = await callAdminRpc("get_current_app_user", {
      p_nombre: metadata.nombre || metadata.full_name || state.currentUser.email || "Usuario",
      p_matricula: matricula,
      p_org_key: affiliationKey,
    });
    const appUser = getRpcFirstRow(result);
    applyAppUserSession(appUser);
    if (loadSiteScopes) {
      await loadCurrentSiteScopes({ silent: true });
    }
    if (isKnownSuperadminEmail(authEmail) && appUser?.rol !== "superadmin" && !silent) {
      showToast("Tu cuenta necesita rol superadmin en Supabase para crear organizaciones. Aplica supabase-hito13.");
    }
    return appUser;
  } catch (error) {
    applyAppUserSession(null);
    state.currentSiteScopes = [];
    if (throwOnError) throw error;
    if (!silent) showToast("No se pudo cargar el rol del usuario. Se aplicaran permisos basicos.");
    return null;
  }
}


async function loadOrganizations({ silent = false } = {}) {
  if (!CLOUD_ENABLED || !state.currentUser || !localStorage.getItem("registro_asistencia_token") || !els.organizationList) return;

  if (isSupervisorSession()) {
    const site = state.activeSite || await loadActiveSite({ silent: true });
    if (site?.id) {
      state.organizationHubs = [{
        id: state.currentAppUser?.organizacion_id,
        nombre: state.currentAppUser?.organizacion_nombre || "Mi organizacion",
        slug: "",
        tipo: "",
        activo: true,
        sitios: [site],
      }];
      state.selectedOrganizationId = state.currentAppUser?.organizacion_id || null;
      renderOrganizations();
      setOrganizationHubNotice("Solo puedes administrar el sitio que tienes asignado.", "warning");
      return;
    }
  }

  try {
    const rows = await callAdminRpc("admin_list_organization_hubs", {});
    state.organizationHubs = Array.isArray(rows) ? rows : [];
    if (!state.organizationHubs.some((org) => org.id === state.selectedOrganizationId)) {
      state.selectedOrganizationId = state.organizationHubs[0]?.id || null;
    }
    renderOrganizations();
  } catch (error) {
    if (isSupervisorSession()) {
      const site = state.activeSite || await loadActiveSite({ silent: true });
      if (site?.id) {
        state.organizationHubs = [{
          id: state.currentAppUser?.organizacion_id,
          nombre: state.currentAppUser?.organizacion_nombre || "Mi organizacion",
          slug: "",
          tipo: "",
          activo: true,
          sitios: [site],
          sitios_total: 1,
        }];
        state.selectedOrganizationId = state.currentAppUser?.organizacion_id || null;
        renderOrganizations();
        setOrganizationHubNotice("Solo puedes administrar el sitio que tienes asignado.", "warning");
        return;
      }
    }
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
  document.querySelectorAll(".organization-create-only").forEach((element) => {
    element.classList.toggle("is-hidden", !canCreateOrganization());
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
  if (els.newSiteButton) els.newSiteButton.disabled = !org || org.activo === false || isSupervisorSession();
  renderManagedSites(org?.sitios || []);
}

function renderManagedSites(rows = []) {
  state.managedSites = state.organizationHubs.flatMap((org) => org.sitios || []);
  populateAttendanceSiteSelector();
  populateAdminInviteSites();
  populateUserScopeAssignment();
  populateDashboardFilterSelects();
  renderSiteUsersOverview();
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
          ${canManageAssignedSite(site.id) ? `<button class="ghost mini" type="button" data-site-action="edit" data-site-id="${escapeHtml(site.id)}">Editar</button>` : ""}
          ${!isSupervisorSession() && hasPermission("manage_site") ? `<button class="danger mini" type="button" data-site-action="delete" data-site-id="${escapeHtml(site.id)}">Eliminar</button>` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function renderManagedUsers(rows = []) {
  state.managedUsers = Array.isArray(rows) ? rows : [];
  populateUserScopeAssignment();
  populateDashboardFilterSelects();
  renderSiteUsersOverview();
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
  if (!CLOUD_ENABLED || !state.currentUser || !localStorage.getItem("registro_asistencia_token") || !canUseOperationsPanel()) {
    state.managedUserSiteScopes = [];
    renderManagedUsers([]);
    return;
  }
  try {
    const [users, scopes] = await Promise.all([
      callAdminRpc("get_manageable_users", {}),
      isRoleAdminSession()
        ? callAdminRpc("get_manageable_user_site_scopes", {}).catch(() => [])
        : Promise.resolve([]),
    ]);
    state.managedUserSiteScopes = Array.isArray(scopes) ? scopes : [];
    renderManagedUsers(users || []);
  } catch (error) {
    if (!silent) showToast("No se pudieron cargar usuarios administrables.");
    state.managedUserSiteScopes = [];
    renderManagedUsers([]);
  }
}

async function deleteManagedSite(siteId) {
  if (!siteId || !canManageAssignedSite(siteId) || isSupervisorSession()) {
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
  const canEdit = Boolean(org) && hasPermission("manage_organization");
  if ((!org && !canCreateOrganization()) || (org && !canEdit) || !els.organizationForm) return;
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
  const nombre = els.orgCreateName?.value.trim() || "";
  const clave = els.orgCreateKey?.value.trim() || "";
  const id = els.orgEditId?.value || null;
  if ((id && !hasPermission("manage_organization")) || (!id && !canCreateOrganization())) {
    showToast(id ? "Solo superadmin puede modificar organizaciones." : "Tu cuenta no puede crear otra organizacion.");
    return;
  }
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
    if (!id) await loadCurrentAppUser({ silent: true });
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
        await loadCurrentAppUser({ silent: true });
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
  state.organizationContext = context || null;
  renderNotificationSettings();
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
    state.organizationContext = null;
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
  if (els.siteEvidencePolicy) {
    const evidencePolicy = configured && ["foto_simple", "documento"].includes(site.evidence_policy)
      ? site.evidence_policy
      : "foto_simple";
    els.siteEvidencePolicy.value = evidencePolicy;
  }
  if (els.siteIdentifierLabel) els.siteIdentifierLabel.value = configured ? site.identificador_label || "Identificador" : "Identificador";
  if (els.siteKey) els.siteKey.value = "";
  els.siteActive.checked = configured ? Boolean(site.activo) : true;
}

function openSiteEditor(siteId = null) {
  const org = getSelectedOrganization();
  if (!org || !hasPermission("manage_site") || !els.siteForm) return;
  const site = (org.sitios || []).find((item) => item.id === siteId) || null;
  if (isSupervisorSession() && (!site || !canManageAssignedSite(site.id))) {
    showToast("Solo puedes administrar el sitio que tienes asignado.");
    return;
  }
  fillSiteForm(site);
  els.siteFormTitle.textContent = isSupervisorSession() ? "Administrar mi sitio" : (site ? "Editar sitio" : `Nuevo sitio en ${org.nombre}`);
  const restrictedSiteFields = [els.siteKey?.closest("label"), els.siteActive?.closest("label"), els.generateSiteKey, els.copySiteKey];
  restrictedSiteFields.forEach((element) => element?.classList.toggle("is-hidden", isSupervisorSession()));
  const supervisorLockedFields = [
    els.siteLat,
    els.siteLng,
    els.siteRadius,
    els.siteGpsPolicy,
    els.siteEvidencePolicy,
    els.useAdminLocation,
    els.testAdminLocation,
  ];
  supervisorLockedFields.forEach((element) => {
    if (!element) return;
    element.disabled = isSupervisorSession();
    element.setAttribute("aria-describedby", isSupervisorSession() ? "siteStatusSummary" : "");
  });
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
  renderNotificationSettings();
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
  if (!canManageAssignedSite(els.siteEditId?.value || state.currentAppUser?.sitio_id || "")) return;
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
  if (!canManageAssignedSite(els.siteEditId?.value || state.currentAppUser?.sitio_id || "")) return;
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
  if (!canManageAssignedSite(els.siteEditId?.value || "")) {
    setSiteMessage("No tienes permisos para administrar este sitio.", "danger");
    return;
  }
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
    evidencePolicy: els.siteEvidencePolicy?.value || "foto_simple",
    identifierLabel: els.siteIdentifierLabel?.value.trim() || "Identificador",
  };
  const error = validateSiteForm(data);
  if (error) {
    setSiteMessage(error, "danger");
    return;
  }

  setSiteMessage("Guardando configuracion del sitio...", "warning");
  try {
    const payload = {
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
    };
    if (isSupervisorSession()) {
      await callAdminRpc("supervisor_update_assigned_site", {
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
      });
    } else {
      await callAdminRpc("admin_upsert_site", payload);
    }
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
    evaluateAttendanceReminders();
    return;
  }

  try {
    state.loadingRecords = true;
    const rows = await callAdminRpc("get_visible_asistencias", {});
    state.records = (rows || []).map(rowToRecord);
    persistLocalSnapshot();
    renderRecords();
    loadAttendanceStreak({ silent: true });
    evaluateAttendanceReminders();
  } catch (error) {
    if (!silent) showToast("No se pudo cargar tu lista de registros permitidos. Revisa la conexion.");
    renderRecords();
    evaluateAttendanceReminders();
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
    camera_facing_mode: state.cameraFacingMode[kind] || "user",
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

  // La base conserva una referencia opaca; la foto solo se abre con URL firmada.
  evidence.url = `storage://${PHOTO_BUCKET}/${evidence.path}`;
  evidence.metadata.uploaded_at_server = new Date().toISOString();
  evidence.metadata.storage_path = evidence.path;
  return evidence;
}
async function insertEntryRecord({ nombre, matricula, fotoEntrada, location, siteId = null }) {
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
      validacionIdentidad: "foto_registrada",
      descriptorEntrada: null,
      rostroEntradaDetectado: false,
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
      sitioId: siteId || state.activeSite?.id || state.currentAppUser?.sitio_id || null,
      sitioEntradaId: siteId || state.activeSite?.id || state.currentAppUser?.sitio_id || null,
    });
    state.records.unshift(localRecord);
    persistLocalSnapshot();
    return localRecord;
  }

  const payload = {
    p_nombre: nombre,
    p_matricula: matricula,
    p_foto_entrada_url: evidence.url,
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
    p_sitio_id: siteId || null,
  };

  console.log("callAdminRpc - Enviando payload a registrar_entrada_foto_segura:", payload);

  const row = await callAdminRpc("registrar_entrada_foto_segura", payload);
  return rowToRecord(row);
}
async function updateExitRecord(record, { fotoSalida, location }) {
  const evidence = await uploadEvidence(fotoSalida, record.matricula, "exit", location);

  if (!CLOUD_ENABLED) {
    record.horaSalida = nowParts().time;
    record.fotoSalida = evidence.url;
    record.qrSalida = "no_aplica";
    record.tokenQrUsado = "no_aplica";
    record.descriptorSalida = null;
    record.rostroSalidaDetectado = false;
    record.similitudFacial = null;
    record.validacionIdentidad = "foto_registrada";
    record.estado = "asistencia_completa";
    record.observacion = "Salida registrada con foto y ubicación.";
    record.observaciones = record.observacion;
    record.metodoSalida = "matricula_foto_gps";
    record.qrValidado = false;
    record.qrObservacion = "No aplica: salida validada por identificador, foto y GPS.";
    record.latitudSalida = location.latitud ?? null;
    record.longitudSalida = location.longitud ?? null;
    record.precisionSalida = location.precision ?? null;
    record.ubicacionSalidaValidada = location.estado === "ubicacion_correcta";
    record.ubicacionSalidaObservacion = location.observacion || "Ubicacion de salida capturada localmente.";
    record.ubicacionValidada = record.ubicacionSalidaValidada;
    record.precisionUbicacion = record.precisionSalida;
    record.retoVida = "";
    record.retoVidaCumplido = false;
    record.retoVidaObservacion = "Validacion de reto retirada del flujo MVP.";
    record.riesgo = record.ubicacionValidada ? "normal" : "revision_ubicacion_salida";
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

  const row = await callAdminRpc("registrar_salida_foto_segura", {
    p_matricula: record.matricula,
    p_foto_salida_url: evidence.url,
    p_token_qr: null,
    p_latitud: location.latitud ?? null,
    p_longitud: location.longitud ?? null,
    p_precision: location.precision ?? null,
    p_ubicacion_estado: location.estado || "ubicacion_denegada",
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
  try {
    return await supabaseRequest(`/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (isOperationalSessionError(error) && functionName !== "activate_app_session" && functionName !== "deactivate_app_session") {
      handleOperationalSessionInvalidation(error);
    }
    throw error;
  }
}

function createAppSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : ((random & 0x3) | 0x8)).toString(16);
  });
}

function prepareOperationalSession({ rotate = false } = {}) {
  let sessionId = localStorage.getItem(APP_SESSION_STORAGE_KEY);
  if (rotate || !sessionId) {
    sessionId = createAppSessionId();
    localStorage.setItem(APP_SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

function isOperationalSessionError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("sesion_reemplazada_en_otro_dispositivo") || message.includes("sesion_operativa_requerida");
}

function handleOperationalSessionInvalidation(error) {
  if (!localStorage.getItem("registro_asistencia_token")) return;
  const message = String(error?.message || error || "").toLowerCase();
  const wasReplaced = message.includes("sesion_reemplazada_en_otro_dispositivo");
  clearSession();
  localStorage.removeItem(APP_SESSION_STORAGE_KEY);
  state.currentUser = null;
  state.currentAppUser = null;
  stopCamera("entry");
  stopCamera("exit");
  showLoginView();
  showToast(wasReplaced
    ? "Tu sesión se cerró porque la cuenta se abrió en otro dispositivo. Inicia sesión nuevamente."
    : "Tu sesión operativa expiró. Inicia sesión nuevamente.");
}

async function activateOperationalSession() {
  if (!CLOUD_ENABLED || !localStorage.getItem("registro_asistencia_token")) return false;
  const sessionId = prepareOperationalSession();
  await callAdminRpc("activate_app_session", {
    p_session_id: sessionId,
    p_device_label: navigator.userAgent.slice(0, 160),
  });
  return true;
}

async function releaseOperationalSession() {
  if (!CLOUD_ENABLED || !localStorage.getItem("registro_asistencia_token")) return false;
  const sessionId = localStorage.getItem(APP_SESSION_STORAGE_KEY);
  if (!sessionId) return false;
  try {
    await callAdminRpc("deactivate_app_session", { p_session_id: sessionId });
  } catch {
    // Local logout must proceed even if the network is unavailable.
  }
  localStorage.removeItem(APP_SESSION_STORAGE_KEY);
  return true;
}

window.releaseOperationalSession = releaseOperationalSession;

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
    const canOpenOperations = ["supervisor", "admin", "superadmin"].includes(state.currentRole);
    if (!canOpenOperations) {
      console.warn("Navegación rechazada: permiso insuficiente para la vista de administración.");
      showView("home");
      return;
    }
  }

  hideGuidedPanels();
  let targetName = name;

  if (targetName === "admin" && !canUseOperationsPanel()) {
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
    if (isRoleAdminSession()) loadAdminDirectories({ silent: true });
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
  const isSupervisor = isSupervisorSession();
  const isGlobalRecords = activeTarget === "records" && normalizeAppRole(state.currentRole) === "superadmin";
  const isOperationsTarget = activeTarget === "admin" || canUseOperationsPanel();
  els.recordsPanel?.classList.toggle("is-global-records", isGlobalRecords);
  if (els.recordsKicker) els.recordsKicker.textContent = isGlobalRecords ? "Vista global" : (isOperationsTarget ? (isSupervisor ? "Supervision operativa" : "Panel operativo") : "Tu asistencia");
  if (els.recordsTitle) {
    els.recordsTitle.textContent = isGlobalRecords
      ? "Registros globales"
      : isOperationsTarget
      ? (isSupervisor ? "Supervisar" : (hasPermission("manage_organization") ? "Administracion central" : "Administracion del sitio"))
      : "Mis registros";
  }
  if (els.recordsSubtitle) {
    els.recordsSubtitle.textContent = isGlobalRecords
      ? "Consulta las jornadas de todas las organizaciones y filtra por organización, sitio o persona."
      : isOperationsTarget
      ? (isSupervisor ? "Revisa asistencias y evidencia del sitio que supervisas." : role.scope)
      : "Revisa tus jornadas y comprueba si falta una salida.";
  }
  const mobileTitle = $("#mobileRecordsTitle");
  if (mobileTitle) mobileTitle.textContent = isGlobalRecords ? "Jornadas globales" : "Tus dias registrados";
  if (els.emptyRecordsTitle) els.emptyRecordsTitle.textContent = isGlobalRecords ? "No hay jornadas con estos filtros" : "Aun no hay jornadas";
  if (els.emptyRecordsSubtitle) els.emptyRecordsSubtitle.textContent = isGlobalRecords ? "Cambia los filtros para consultar otra organización, sitio o persona." : "Tu primera entrada aparecera aqui con sus horarios y estado.";
  els.emptyRecordsAction?.classList.toggle("is-hidden", isGlobalRecords);
  if (els.dashboardScopeLabel) {
    els.dashboardScopeLabel.textContent = hasPermission("view_all_records")
      ? "Resumen global: las cifras agregan todas las organizaciones. El directorio de Usuarios muestra solo la organizacion elegida."
      : hasPermission("view_site_records")
        ? "Mostrando registros del sitio u organizacion asignada."
        : "Mostrando solo tus registros personales.";
  }
}

const ADMIN_SECTION_COPY = {
  summary: "Prioriza pendientes de hoy y abre el seguimiento solo cuando haya alertas.",
  organizations: "Administra organizaciones, ubicaciones, horarios y politicas.",
  users: "Elige una organizacion para consultar personas por sitio y ajustar su alcance.",
  attendances: "Consulta primero fecha, sitio y estado; usa filtros adicionales solo cuando los necesites.",
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
  if (target === "attendances") renderAttendanceControl();
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
        headerFace.textContent = "Foto: activa";
        headerFace.dataset.tone = "active";
      } else if (tone === "pending") {
        headerFace.textContent = "Foto: preparando…";
        headerFace.dataset.tone = "pending";
      } else {
        headerFace.textContent = "Foto: error";
        headerFace.dataset.tone = "inactive";
      }
    }
  }
}

function syncCaptureControls() {
  const entryBusy = state.photoCaptureRunning.entry || state.attendanceSubmitting.entry;
  const exitBusy = state.photoCaptureRunning.exit || state.attendanceSubmitting.exit;
  if (els.startEntryCamera) {
    els.startEntryCamera.disabled = !state.permissionPreferences.camera;
    els.startEntryCamera.classList.toggle("is-hidden", !state.cameraNeedsGesture.entry || Boolean(state.entryStream));
  }
  if (els.startExitCamera) {
    els.startExitCamera.disabled = !state.permissionPreferences.camera || !state.exitActiveRecord;
    els.startExitCamera.classList.toggle("is-hidden", !state.cameraNeedsGesture.exit || Boolean(state.exitStream) || !state.exitActiveRecord);
  }
  [["entry", els.switchEntryCamera], ["exit", els.switchExitCamera]].forEach(([kind, button]) => {
    if (!button) return;
    const hasStream = Boolean(state[`${kind}Stream`]);
    const usingFrontCamera = state.cameraFacingMode[kind] !== "environment";
    button.textContent = usingFrontCamera ? "Usar cámara trasera" : "Usar cámara frontal";
    button.setAttribute("aria-label", button.textContent);
    button.disabled = state.photoCaptureRunning[kind] || state.attendanceSubmitting[kind] || !hasStream;
    button.classList.toggle("is-hidden", !hasStream || state.availableVideoInputs < 2);
  });
  if (els.takeEntryPhoto) {
    els.takeEntryPhoto.disabled = !state.entryStream || entryBusy;
    els.takeEntryPhoto.textContent = entryBusy ? "Guardando entrada..." : "Tomar foto y guardar entrada";
  }
  if (els.takeExitPhoto) {
    els.takeExitPhoto.disabled = !state.exitActiveRecord || !state.exitStream || exitBusy;
    els.takeExitPhoto.textContent = exitBusy ? "Guardando salida..." : "Tomar foto y guardar salida";
  }
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
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;
  preview.removeAttribute("src");
  preview.classList.add("is-hidden");
  video.classList.remove("is-hidden");
  syncCaptureControls();
}

function retakeAttendancePhoto(kind) {
  clearCapturedFace(kind);
  const status = kind === "entry" ? els.entryFaceStatus : els.exitFaceStatus;
  setFaceStatus(status, "Camara lista. Toma una nueva foto.", "success");
  if (!state[`${kind}Stream`]) ensureAttendanceCamera(kind);
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
  if (needsActiveEntry || state[`${kind}Stream`]) return;
  await startCamera(kind, { silent: true });
}

function isAttendanceCameraViewActive(kind) {
  return Boolean(document.querySelector(`[data-view="${kind}"]:not(.is-hidden)`));
}

async function refreshVideoInputCount() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.availableVideoInputs = devices.filter((device) => device.kind === "videoinput").length;
  } catch {
    state.availableVideoInputs = 0;
  }
}

async function requestAttendanceCameraStream(kind) {
  const facingMode = state.cameraFacingMode[kind] || "user";
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { exact: facingMode },
        width: { ideal: 720 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch (error) {
    if (!["OverconstrainedError", "NotFoundError"].includes(error?.name)) throw error;
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (fallbackError) {
      if (!["OverconstrainedError", "NotFoundError"].includes(fallbackError?.name)) throw fallbackError;
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
  }
}

async function startCamera(kind, { silent = false, retry = 0 } = {}) {
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;

  if (!state.permissionPreferences.camera) {
    if (!silent) showToast("Activa la cámara desde Perfil para tomar la foto.");
    return;
  }

  if (state.cameraStartPromises[kind]) return state.cameraStartPromises[kind];

  const startPromise = (async () => {
    stopCamera(kind);
    setFaceStatus(kind === "entry" ? els.entryFaceStatus : els.exitFaceStatus, "Iniciando camara...", "pending");
    try {
      const stream = await requestAttendanceCameraStream(kind);
      if (!isAttendanceCameraViewActive(kind)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      state[`${kind}Stream`] = stream;
      const activeFacingMode = stream.getVideoTracks?.()[0]?.getSettings?.().facingMode;
      if (["user", "environment"].includes(activeFacingMode)) {
        state.cameraFacingMode[kind] = activeFacingMode;
      }
      video.dataset.facingMode = state.cameraFacingMode[kind];
      try {
        await video.play();
      } catch (playError) {
        stream.getTracks().forEach((track) => track.stop());
        state[`${kind}Stream`] = null;
        video.srcObject = null;
        throw playError;
      }
      state.permissionStatus.camera = "granted";
      state.permissionApprovals.camera = true;
      state.permissionSelections.camera = true;
      state.cameraNeedsGesture[kind] = false;
      await refreshVideoInputCount();
      savePermissionPreferences();
      renderPermissionControls();
      syncCaptureControls();
      setFaceStatus(
        kind === "entry" ? els.entryFaceStatus : els.exitFaceStatus,
        "Cámara lista. Toma la foto para guardar el registro.",
        "success"
      );
    } catch (error) {
      const permissionDenied = ["NotAllowedError", "SecurityError"].includes(error?.name);
      if (permissionDenied) {
        state.permissionStatus.camera = "denied";
        state.permissionApprovals.camera = false;
        savePermissionPreferences();
        renderPermissionControls();
      }
      const canRetry = !permissionDenied && retry < 2 && isAttendanceCameraViewActive(kind);
      if (canRetry) {
        setFaceStatus(kind === "entry" ? els.entryFaceStatus : els.exitFaceStatus, "Preparando camara...", "pending");
        state.cameraRetryTimers[kind] = window.setTimeout(() => {
          state.cameraRetryTimers[kind] = null;
          startCamera(kind, { silent: true, retry: retry + 1 });
        }, 500);
      } else {
        state.cameraNeedsGesture[kind] = true;
        syncCaptureControls();
        setFaceStatus(
          kind === "entry" ? els.entryFaceStatus : els.exitFaceStatus,
          permissionDenied ? "Activa el permiso de camara en el navegador." : "No se pudo iniciar la camara. Intenta volver a entrar.",
          "danger"
        );
        if (!silent) showToast("No se pudo acceder a la camara. Revisa permisos o usa HTTPS.");
      }
    }
  })();

  state.cameraStartPromises[kind] = startPromise;
  try {
    await startPromise;
  } finally {
    if (state.cameraStartPromises[kind] === startPromise) state.cameraStartPromises[kind] = null;
  }
}

async function switchAttendanceCamera(kind) {
  if (!state[`${kind}Stream`] || state.photoCaptureRunning[kind]) return;
  const currentMode = state.cameraFacingMode[kind] || "user";
  const targetMode = currentMode === "user" ? "environment" : "user";
  state.cameraFacingMode[kind] = targetMode;
  stopCamera(kind);
  setFaceStatus(
    kind === "entry" ? els.entryFaceStatus : els.exitFaceStatus,
    targetMode === "environment" ? "Activando cámara trasera..." : "Activando cámara frontal...",
    "pending",
  );
  await startCamera(kind);
}

function stopCamera(kind) {
  if (state.cameraRetryTimers[kind]) {
    window.clearTimeout(state.cameraRetryTimers[kind]);
    state.cameraRetryTimers[kind] = null;
  }
  const stream = state[`${kind}Stream`];
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  state[`${kind}Stream`] = null;
  video.srcObject = null;
  delete video.dataset.facingMode;
  syncCaptureControls();
}

async function takePhoto(kind) {
  const video = kind === "entry" ? els.entryVideo : els.exitVideo;
  const canvas = kind === "entry" ? els.entryCanvas : els.exitCanvas;
  const preview = kind === "entry" ? els.entryPreview : els.exitPreview;

  if (!video.videoWidth) {
    showToast("Primero activa la camara.");
    return false;
  }

  if (state.photoCaptureRunning[kind]) return false;
  state.photoCaptureRunning[kind] = true;
  syncCaptureControls();
  try {
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.72);
    state[`${kind}Photo`] = image;
    state[`${kind}Face`] = null;
    preview.src = image;
    preview.classList.remove("is-hidden");
    video.classList.add("is-hidden");
    setFaceStatus(
      kind === "entry" ? els.entryFaceStatus : els.exitFaceStatus,
      "Foto tomada. Guardando registro...",
      "success",
    );
    return true;
  } catch (error) {
    clearCapturedFace(kind);
    showToast("No se pudo tomar la foto. Inténtalo de nuevo.");
    return false;
  } finally {
    state.photoCaptureRunning[kind] = false;
    syncCaptureControls();
  }
}

async function captureAndSaveAttendance(kind) {
  if (state.photoCaptureRunning[kind] || state.attendanceSubmitting[kind]) return;

  if (kind === "entry" && canSelectAttendanceSite() && !getSelectedAttendanceSiteId()) {
    showToast("Selecciona primero el sitio donde registrarás la asistencia.");
    els.entrySiteSelect?.focus();
    return;
  }

  if (kind === "exit") {
    const activeRecord = state.exitActiveRecord || await validateExitMatricula({ showErrors: true });
    if (!activeRecord) return;
  }

  const captured = await takePhoto(kind);
  if (!captured) return;
  const form = kind === "entry" ? els.entryForm : els.exitForm;
  form?.requestSubmit();
}

function normalizeMatricula(value) {
  return value.trim().toUpperCase();
}

function sanitizePersonName(value) {
  return String(value || "")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s{2,}/g, " ");
}

function isValidPersonName(value) {
  const normalized = String(value || "").trim();
  return normalized.length >= 2 && normalized.length <= 80 && /^\p{L}+(?:\s+\p{L}+)*$/u.test(normalized);
}

function todayRecordByMatricula(matricula) {
  const today = todayIso();
  const normalizedMatricula = normalizeMatricula(String(matricula || ""));
  if (!normalizedMatricula) return null;
  const currentAppUserId = String(state.currentAppUser?.id || "");
  const matches = state.records.filter(
    (record) => {
      if (record.fecha !== today || normalizeMatricula(String(record.matricula || "")) !== normalizedMatricula) return false;
      if (!currentAppUserId || !record.usuarioId) return true;
      return String(record.usuarioId) === currentAppUserId;
    }
  );
  return matches.find((record) => record.horaEntrada && !record.horaSalida) || matches[0] || null;
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

function canSelectAttendanceSite() {
  return ["admin", "superadmin"].includes(state.currentRole);
}

function syncPrivilegedAttendanceActions() {
  els.repeatAttendanceButton?.classList.toggle("is-hidden", !canSelectAttendanceSite());
}

function getAttendanceSiteOptions() {
  if (!canSelectAttendanceSite()) return [];
  const organizationId = String(state.currentAppUser?.organizacion_id || "");
  return state.managedSites
    .filter((site) => site?.id && site.activo !== false)
    .filter((site) => state.currentRole === "superadmin" || String(site.organizacion_id || "") === organizationId)
    .sort((a, b) => {
      const organizationA = getManagedSiteOrganizationName(a);
      const organizationB = getManagedSiteOrganizationName(b);
      return organizationA.localeCompare(organizationB) || String(a.nombre || "").localeCompare(String(b.nombre || ""));
    });
}

function populateAttendanceSiteSelector() {
  if (!els.entrySiteField || !els.entrySiteSelect) return;
  const visible = canSelectAttendanceSite();
  els.entrySiteField.classList.toggle("is-hidden", !visible);
  els.entrySiteSelect.required = visible;
  els.entrySiteSelect.disabled = !visible;
  if (!visible) {
    els.entrySiteSelect.value = "";
    return;
  }

  const previousValue = els.entrySiteSelect.value;
  const sites = getAttendanceSiteOptions();
  els.entrySiteSelect.innerHTML = '<option value="">Selecciona un sitio</option>';
  sites.forEach((site) => {
    const organizationName = getManagedSiteOrganizationName(site);
    const label = state.currentRole === "superadmin"
      ? `${organizationName} - ${site.nombre || "Sitio"}`
      : site.nombre || "Sitio";
    els.entrySiteSelect.appendChild(new Option(label, site.id));
  });

  const preferredValue = [previousValue, state.currentAppUser?.sitio_id]
    .find((value) => sites.some((site) => String(site.id) === String(value || "")));
  els.entrySiteSelect.value = preferredValue || (sites.length === 1 ? sites[0].id : "");
}

function getSelectedAttendanceSiteId() {
  if (!canSelectAttendanceSite()) return null;
  return String(els.entrySiteSelect?.value || "").trim() || null;
}

function updateAttendanceShortcut() {
  if (!els.homeAttendanceHint) return;
  const { matricula } = getAttendanceIdentity();
  const record = matricula ? todayRecordByMatricula(matricula) : null;
  els.homeAttendanceHint.textContent = !record?.horaEntrada
    ? "Tu siguiente registro es la entrada."
    : !record.horaSalida
      ? `Entrada registrada a las ${record.horaEntrada}. Sigue con tu salida.`
      : canSelectAttendanceSite()
        ? "Jornada completa. Puedes iniciar otro registro."
        : "Tu jornada de hoy ya esta completa.";
}

async function startPrivilegedAttendanceCycle() {
  if (!canSelectAttendanceSite()) {
    showToast("Esta accion requiere rol administrador.");
    return;
  }

  const identity = syncAttendanceIdentity();
  if (!identity.nombre || !identity.matricula) {
    showToast("Completa tu nombre e identificador en Perfil para registrar asistencia.");
    showView("profile");
    return;
  }

  await refreshRecords({ silent: true });
  const activeRecord = todayRecordByMatricula(identity.matricula);
  if (activeRecord?.horaEntrada && !activeRecord.horaSalida) {
    showToast("Primero registra la salida de la entrada activa.");
    await openAttendanceView();
    return;
  }

  if (!state.managedSites.length) await loadOrganizations({ silent: true });
  populateAttendanceSiteSelector();
  if (!getAttendanceSiteOptions().length) {
    showToast("No hay sitios activos disponibles para registrar asistencia.");
    return;
  }

  clearCapturedFace("entry");
  showView("entry");
  await ensureAttendanceCamera("entry");
}

async function openAttendanceView() {
  const identity = syncAttendanceIdentity();
  if (!identity.nombre || !identity.matricula) {
    showToast("Completa tu nombre e identificador en Perfil para registrar asistencia.");
    showView("profile");
    return;
  }

  if (canSelectAttendanceSite()) {
    if (!state.managedSites.length) await loadOrganizations({ silent: true });
    populateAttendanceSiteSelector();
    if (!getAttendanceSiteOptions().length) {
      showToast("No hay sitios activos disponibles para registrar asistencia.");
      return;
    }
  }

  // En una PWA móvil, getUserMedia debe comenzar dentro del toque que abrió Registro.
  const cachedRecord = todayRecordByMatricula(identity.matricula);
  const gestureCameraKind = !cachedRecord?.horaEntrada ? "entry" : !cachedRecord.horaSalida ? "exit" : "";
  if (gestureCameraKind) {
    showView(gestureCameraKind);
    startCamera(gestureCameraKind, { silent: true });
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
  const siteId = getSelectedAttendanceSiteId();

  if (!state.entryPhoto || !nombre || !matricula) {
    showToast("Toma la foto para guardar la entrada.");
    return;
  }
  if (canSelectAttendanceSite() && !siteId) {
    showToast("Selecciona el sitio donde registraras la asistencia.");
    els.entrySiteSelect?.focus();
    return;
  }
  if (state.attendanceSubmitting.entry) return;

  state.attendanceSubmitting.entry = true;
  const submitButton = event.submitter || els.takeEntryPhoto;
  if (submitButton) submitButton.disabled = true;
  syncCaptureControls();
  try {
    await refreshRecords({ silent: true });
    const existingRecord = todayRecordByMatricula(matricula);
    if (existingRecord && (!canSelectAttendanceSite() || !existingRecord.horaSalida)) {
      showToast("Hoy ya registraste tu entrada. Solo corresponde registrar la salida.");
      await openAttendanceView();
      return;
    }

    const location = await requestAttendanceLocation("entry");
    try {
      const record = await insertEntryRecord({
        nombre,
        matricula,
        fotoEntrada: state.entryPhoto,
        location,
        siteId,
      });
      state.records.unshift(record);
      persistLocalSnapshot();
      clearCapturedFace("entry");
      els.entryForm.reset();
      populateAttendanceSiteSelector();
      setFaceStatus(els.entryFaceStatus, "Entrada guardada.", "success");
      stopCamera("entry");
      await refreshRecords({ silent: true });
      showGuidedPanel("entry");
      showToast(record.riesgo === "normal" || record.riesgo === "entrada_registrada" ? "Entrada registrada correctamente." : "Entrada registrada, requiere revision administrativa.");
    } catch (error) {
      clearCapturedFace("entry");
      showToast(getAttendanceSaveErrorMessage(error, "entry"));
    }
  } finally {
    state.attendanceSubmitting.entry = false;
    if (submitButton) submitButton.disabled = false;
    syncCaptureControls();
  }
}
async function handleExitSubmit(event) {
  event.preventDefault();
  if (state.attendanceSubmitting.exit) return;
  if (!state.exitPhoto) {
    showToast("Toma la foto para guardar la salida.");
    return;
  }

  state.attendanceSubmitting.exit = true;
  const submitButton = event.submitter || els.takeExitPhoto;
  if (submitButton) submitButton.disabled = true;
  syncCaptureControls();
  try {
    const record = await validateExitMatricula({ showErrors: true });
    if (!record) return;
    if (record.horaSalida) {
      showToast("La salida de hoy ya fue registrada.");
      await openAttendanceView();
      return;
    }

    const location = await requestExitLocation();
    try {
      const updated = await updateExitRecord(record, {
        fotoSalida: state.exitPhoto,
        location,
      });
      clearCapturedFace("exit");
      state.exitActiveRecord = null;
      els.exitForm.reset();
      setExitLookupInfo("Salida registrada correctamente.", "success");
      setFaceStatus(els.exitFaceStatus, "Salida guardada.", "success");
      stopCamera("exit");
      syncCaptureControls();
      await refreshRecords({ silent: true });
      showGuidedPanel("exit");
      showToast(updated.riesgo === "normal" ? "Salida registrada y validada." : "Salida registrada, pero requiere revision administrativa.");
    } catch (error) {
      clearCapturedFace("exit");
      showToast(getAttendanceSaveErrorMessage(error, "exit"));
    }
  } finally {
    state.attendanceSubmitting.exit = false;
    if (submitButton) submitButton.disabled = false;
    syncCaptureControls();
  }
}

function getAttendanceSaveErrorMessage(error, flow) {
  const message = String(error?.message || error || "").toLowerCase();
  if (/entrada_activa_existente|entrada_diaria_existente|duplicate|unique|ya existe/.test(message)) {
    return "Hoy ya existe una entrada activa para esta cuenta.";
  }
  if (/salida_ya_registrada|salida.*ya fue registrada/.test(message)) {
    return "La salida de hoy ya fue registrada.";
  }
  if (/entrada_fuera_de_horario/.test(message)) {
    return "La entrada solo puede registrarse dentro del horario configurado para tu sitio.";
  }
  if (/salida_fuera_de_horario/.test(message)) {
    return "La salida solo puede registrarse dentro del horario configurado para tu sitio.";
  }
  if (/horario_entrada_no_configurado|horario_salida_no_configurado/.test(message)) {
    return "Tu sitio no tiene un horario configurado. Contacta al administrador.";
  }
  if (/sitio_requerido_para_admin/.test(message)) {
    return "Selecciona el sitio donde registraras la asistencia.";
  }
  if (/sitio_fuera_de_alcance/.test(message)) {
    return "No tienes permisos para registrar asistencia en ese sitio.";
  }
  if (/usuario_sin_sitio_asignado|sitio_activo_no_encontrado|sitio_de_entrada_no_encontrado/.test(message)) {
    return "Tu cuenta no tiene un sitio operativo asignado. Contacta al administrador.";
  }
  if (/entrada_activa_no_encontrada/.test(message)) {
    return "No existe una entrada activa para registrar la salida.";
  }
  return flow === "entry"
    ? "No se pudo guardar la entrada global. Intenta de nuevo."
    : "No se pudo guardar la salida segura. Intenta de nuevo.";
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
  const rawFallback = kind === "entrada" ? record.fotoEntrada : record.fotoSalida;
  const fallback = /^(?:data:|blob:)/i.test(String(rawFallback || "")) ? rawFallback : "";
  record.evidenceLoadStatus = record.evidenceLoadStatus || {};

  if (!path && !fallback) {
    record.evidenceLoadStatus[kind] = "missing";
    return "";
  }
  if (!CLOUD_ENABLED || path === "local_data_url") {
    record.evidenceLoadStatus[kind] = fallback ? "available" : "missing";
    return fallback;
  }

  try {
    const authorization = getRpcFirstRow(await callAdminRpc("authorize_attendance_evidence_view", {
      p_asistencia_id: record.id,
      p_tipo: kind,
    }));
    if (!authorization?.authorized || !authorization?.object_path) {
      record.evidenceLoadStatus[kind] = authorization?.reason === "evidence_not_found" ? "missing" : "denied";
      return "";
    }

    const bucket = authorization.bucket_name || PHOTO_BUCKET;
    const encodedPath = authorization.object_path.split("/").map(encodeURIComponent).join("/");
    const expiresIn = Math.min(900, Math.max(300, Number(authorization.expires_in) || 600));
    const response = await fetch(`${SUPABASE.url}/storage/v1/object/sign/${bucket}/${encodedPath}`, {
      method: "POST",
      headers: cloudHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn }),
    });
    if (!response.ok) throw new Error(await response.text() || "signed_url_error");
    const data = await response.json();
    const signedUrl = data.signedURL || data.signedUrl || data.url || "";
    if (signedUrl) {
      record.evidenceLoadStatus[kind] = "available";
      return resolveStorageSignedUrl(signedUrl);
    }
  } catch (error) {
    record.evidenceLoadStatus[kind] = "error";
  }
  return fallback;
}

function evidencePlaceholder(record, kind) {
  const status = record.evidenceLoadStatus?.[kind] || "missing";
  const messages = {
    denied: "No tienes permiso para ver esta evidencia",
    error: "Error al cargar foto. Vuelve a intentar",
    missing: "Sin foto registrada",
  };
  return `<div class="photo-placeholder" data-evidence-state="${escapeHtml(status)}">${escapeHtml(messages[status] || messages.missing)}</div>`;
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
        ${entradaUrl ? `<img src="${entradaUrl}" alt="Evidencia de entrada" />` : evidencePlaceholder(record, "entrada")}
        <figcaption>Entrada</figcaption>
      </figure>
      <figure>
        ${salidaUrl ? `<img src="${salidaUrl}" alt="Evidencia de salida" />` : evidencePlaceholder(record, "salida")}
        <figcaption>Salida</figcaption>
      </figure>
    </div>
    ${metadataBlock("Identificacion", [
    evidenceField("Nombre", record.nombre),
    evidenceField("Identificador", record.matricula),
    evidenceField("Organizacion", record.organizacionNombre || state.organizationHubs.find((item) => String(item.id || "") === String(record.organizacionId || ""))?.nombre),
    evidenceField("Sitio", recordSiteName(record)),
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
    evidenceField("Validacion adicional", record.retoVida || "No aplica"),
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
  const canDeleteRecords = hasPermission("delete_records") || isDemoAdminUnlocked();

  filteredRecords.forEach((record) => {
    const statusClass = statusBadgeClass(record.estado);
    const identityClass = identityBadgeClass(record.validacionIdentidad);
    const riskClass = riskBadgeClass(record.riesgo);
    const adminClass = record.modificado_por_admin ? "admin" : "default";

    const commonColsHtml = `
      <td>${imageCell(record, "entrada")}</td>
      <td>${imageCell(record, "salida")}</td>
      <td>${escapeHtml(record.nombre)}</td>
      <td>${escapeHtml(record.matricula)}</td>
      <td>${escapeHtml(recordOrganizationName(record))}</td>
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
      <td>${escapeHtml(record.retoVida || "No aplica")}</td>
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
        canDeleteRecords ? `<button class="danger mini" data-action="delete-record" data-id="${record.id}">Eliminar</button>` : "",
      ].filter(Boolean).join("");

      row.innerHTML = `
        ${commonColsHtml}
        <td class="admin-only supervisor-visible ${state.isAdmin ? "" : "is-hidden"}">
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
  if (filters.organization && filters.organization !== "all" && record.organizacionId !== filters.organization) return false;

  // Los sitios se filtran por UUID para no confundirlos con organizaciones heredadas.
  if (!recordMatchesSiteFilter(record, filters.site)) return false;

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
  if (hasPermission("view_site_records")) return `${role.label}: registros de los sitios asignados.`;
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
  renderSiteUsersOverview();
  renderAdminUsersSection(getVisibleRecords());
  renderAttendanceControl();
}

function attendanceControlScope() {
  if (normalizeAppRole(state.currentRole) === "superadmin") {
    return { title: "Control global de asistencia", text: "Consulta organizaciones, sitios y personas dentro de tu alcance global.", organizationId: "", siteIds: [], canChooseOrganization: true };
  }
  if (isSupervisorSession()) {
    const siteIds = getCurrentSiteScopeIds();
    return {
      title: siteIds.length > 1 ? "Control de tus sitios" : "Control de tu sitio",
      text: siteIds.length > 1 ? "Revisa las asistencias de los sitios que tienes asignados." : "Revisa las asistencias del sitio que supervisas.",
      organizationId: String(state.currentAppUser?.organizacion_id || ""),
      siteIds,
      canChooseOrganization: false,
    };
  }
  return { title: "Control de asistencia", text: "Revisa las asistencias de tu organizacion y filtra por sitio cuando lo necesites.", organizationId: String(state.currentAppUser?.organizacion_id || ""), siteIds: [], canChooseOrganization: false };
}

function normalizeAttendanceControlFilters() {
  const scope = attendanceControlScope();
  const filters = state.attendanceControlFilters;
  if (!filters.date) filters.date = todayIso();
  if (!scope.canChooseOrganization) filters.organization = scope.organizationId || "all";
  if (scope.siteIds.length === 1) filters.site = scope.siteIds[0];
  if (scope.siteIds.length > 1 && filters.site !== "all" && !scope.siteIds.includes(String(filters.site))) filters.site = "all";
  return filters;
}

function populateAttendanceControlFilters() {
  if (!els.attendanceControlOrganization || !els.attendanceControlSite) return;
  const scope = attendanceControlScope();
  const filters = normalizeAttendanceControlFilters();
  const organizations = state.organizationHubs
    .filter((organization) => organization?.id && (scope.canChooseOrganization || String(organization.id) === scope.organizationId));
  const organizationIds = new Set(organizations.map((organization) => String(organization.id)));

  els.attendanceControlOrganization.innerHTML = "";
  if (scope.canChooseOrganization) els.attendanceControlOrganization.appendChild(new Option("Todas las organizaciones", "all"));
  organizations.forEach((organization) => els.attendanceControlOrganization.appendChild(new Option(organization.nombre || "Organizacion", String(organization.id))));
  const organizationValue = scope.canChooseOrganization && (filters.organization === "all" || organizationIds.has(filters.organization))
    ? filters.organization
    : (scope.organizationId || organizations[0]?.id || "all");
  filters.organization = String(organizationValue);
  els.attendanceControlOrganization.value = filters.organization;
  els.attendanceControlOrganization.disabled = !scope.canChooseOrganization;

  const sites = getOperationalSites().filter((site) => {
    if (!site?.id || site.activo === false) return false;
    if (scope.siteIds.length && !scope.siteIds.includes(String(site.id))) return false;
    return filters.organization === "all" || String(site.organizacion_id || "") === String(filters.organization);
  });
  const siteIds = new Set(sites.map((site) => String(site.id)));
  els.attendanceControlSite.innerHTML = "";
  if (scope.siteIds.length !== 1) els.attendanceControlSite.appendChild(new Option(scope.siteIds.length ? "Todos mis sitios" : "Todos los sitios", "all"));
  sites.forEach((site) => els.attendanceControlSite.appendChild(new Option(site.nombre || "Sitio", String(site.id))));
  filters.site = scope.siteIds.length === 1 ? scope.siteIds[0] : (siteIds.has(filters.site) ? filters.site : "all");
  els.attendanceControlSite.value = filters.site;
  els.attendanceControlSite.disabled = scope.siteIds.length === 1;
}

function getAttendanceControlUsers() {
  const scope = attendanceControlScope();
  const source = state.managedUsers.length ? state.managedUsers : usersFromVisibleRecords();
  const users = new Map();
  source.forEach((user) => {
    if (!user || user.activo === false) return;
    const organizationId = String(user.organizacion_id || user.organizacionId || "");
    const userSiteIds = getManagedUserSiteScopeIds(user);
    if (scope.organizationId && organizationId && organizationId !== scope.organizationId) return;
    if (scope.siteIds.length && !userSiteIds.some((siteId) => scope.siteIds.includes(siteId))) return;
    const key = String(user.id || normalizeMatricula(user.matricula || user.email || ""));
    if (key) users.set(key, user);
  });
  return Array.from(users.values());
}

function findAttendanceControlRecord(user, records, date, siteIds = []) {
  const userId = String(user.id || "");
  const matricula = normalizeMatricula(user.matricula || "");
  return records.find((record) => record.fecha === date && (
    (userId && String(record.usuarioId || "") === userId)
    || (matricula && normalizeMatricula(record.matricula || "") === matricula)
  ) && (!siteIds.length || recordSiteIds(record).some((siteId) => siteIds.includes(siteId)))) || null;
}

function attendanceControlStatus(record) {
  if (!record) return "missing";
  if (isReviewRecord(record) || hasLocationIssue(record) || hasIdentityIssue(record)) return "review";
  if (isCompleteRecord(record)) return "complete";
  if (isPendingExitRecord(record)) return "entry";
  return "review";
}

function attendanceControlStatusMeta(status) {
  return {
    missing: ["Sin registro", "missing"],
    entry: ["Pendiente de salida", "entry"],
    complete: ["Jornada completa", "complete"],
    review: ["Requiere revision", "review"],
  }[status] || ["Requiere revision", "review"];
}

function recordHasEntry(record) {
  return Boolean(record?.horaEntrada && record.horaEntrada !== "Pendiente");
}

function recordHasExit(record) {
  return Boolean(record?.horaSalida && record.horaSalida !== "Pendiente");
}

function attendanceControlMatchesStatus(row, status) {
  if (status === "all") return true;
  if (status === "with_entry") return recordHasEntry(row.record);
  if (status === "entry") return recordHasEntry(row.record) && !recordHasExit(row.record);
  if (status === "complete") return recordHasEntry(row.record) && recordHasExit(row.record);
  return row.status === status;
}

function recordHasEvidence(record, kind = "any") {
  if (!record) return false;
  const hasEntry = Boolean(record.fotoEntradaStoragePath || record.fotoEntrada);
  const hasExit = Boolean(record.fotoSalidaStoragePath || record.fotoSalida);
  if (kind === "entrada") return hasEntry;
  if (kind === "salida") return hasExit;
  return hasEntry || hasExit;
}

function attendanceEvidenceLabel(record) {
  if (!recordHasEvidence(record)) return "Sin foto";
  if (recordHasEvidence(record, "entrada") && recordHasEvidence(record, "salida")) return "Entrada y salida";
  return recordHasEvidence(record, "entrada") ? "Entrada disponible" : "Salida disponible";
}

function attendanceControlActions(row) {
  if (!row.record) return "";
  const recordId = escapeHtml(row.record.id);
  const canOpen = canViewRecord(row.record) || hasPermission("view_evidence") || isDemoAdminUnlocked();
  return `
    <div class="attendance-control-actions">
      <button class="ghost mini" type="button" data-action="view-evidence" data-id="${recordId}">Ver detalle</button>
      ${recordHasEvidence(row.record) && canOpen ? `<button class="secondary mini" type="button" data-action="view-evidence" data-id="${recordId}">Ver foto</button>` : ""}
    </div>
  `;
}

function renderAttendanceControl() {
  if (!els.attendanceControlCards || !els.attendanceControlTableBody) return;
  const scope = attendanceControlScope();
  const filters = normalizeAttendanceControlFilters();
  populateAttendanceControlFilters();
  if (els.attendanceControlDate) els.attendanceControlDate.value = filters.date;
  if (els.attendanceControlStatus) els.attendanceControlStatus.value = filters.status;
  if (els.attendanceControlSearch) els.attendanceControlSearch.value = filters.query;
  if (els.attendanceControlTitle) els.attendanceControlTitle.textContent = scope.title;
  if (els.attendanceControlScope) els.attendanceControlScope.textContent = scope.text;
  if (els.attendanceControlDateLabel) els.attendanceControlDateLabel.textContent = filters.date === todayIso() ? "Hoy" : displayDate(filters.date);

  const records = getVisibleRecords();
  const query = normalizeMatricula(filters.query || "");
  const baseRows = getAttendanceControlUsers().map((user) => {
    const userSiteIds = getManagedUserSiteScopeIds(user);
    const filteredSiteIds = filters.site === "all" ? userSiteIds : [String(filters.site)];
    const record = findAttendanceControlRecord(user, records, filters.date, filteredSiteIds);
    const status = attendanceControlStatus(record);
    const siteId = String(filters.site !== "all" ? filters.site : (recordSiteIds(record || {})[0] || user.sitio_id || user.sitioId || userSiteIds[0] || ""));
    const organizationId = String(user.organizacion_id || user.organizacionId || record?.organizacionId || "");
    const site = getOperationalSites().find((item) => String(item.id || "") === siteId)?.nombre || user.sitio_nombre || recordSiteName(record || {});
    const organization = user.organizacion_nombre || state.organizationHubs.find((item) => String(item.id || "") === organizationId)?.nombre || record?.organizacionNombre || "Organizacion";
    return {
      user,
      record,
      status,
      name: user.nombre || user.email || user.matricula || "Usuario",
      identifier: user.matricula || "Sin identificador",
      organizationId,
      organization,
      siteId,
      site: site || "Sin sitio",
    };
  }).filter((row) => {
    if (filters.organization !== "all" && row.organizationId !== String(filters.organization)) return false;
    if (filters.site !== "all" && row.siteId !== String(filters.site)) return false;
    return true;
  });

  const counts = baseRows.reduce((summary, row) => {
    if (row.status === "missing") summary.missing += 1;
    if (row.status === "review") summary.review += 1;
    if (recordHasEntry(row.record)) summary.withEntry += 1;
    if (recordHasEntry(row.record) && !recordHasExit(row.record)) summary.pending += 1;
    if (recordHasEntry(row.record) && recordHasExit(row.record)) summary.complete += 1;
    return summary;
  }, { missing: 0, complete: 0, review: 0, withEntry: 0, pending: 0 });
  if (els.attendanceExpectedCount) els.attendanceExpectedCount.textContent = baseRows.length;
  if (els.attendanceMissingCount) els.attendanceMissingCount.textContent = counts.missing;
  if (els.attendanceEntryCount) els.attendanceEntryCount.textContent = counts.withEntry;
  if (els.attendancePendingCount) els.attendancePendingCount.textContent = counts.pending;
  if (els.attendanceCompleteCount) els.attendanceCompleteCount.textContent = counts.complete;
  if (els.attendanceReviewCount) els.attendanceReviewCount.textContent = counts.review;

  const tabCounts = {
    all: baseRows.length,
    missing: counts.missing,
    with_entry: counts.withEntry,
    entry: counts.pending,
    complete: counts.complete,
    review: counts.review,
  };
  const tabCountElements = {
    all: $("#attendanceAllTabCount"),
    missing: $("#attendanceMissingTabCount"),
    with_entry: $("#attendanceEntryTabCount"),
    entry: $("#attendancePendingTabCount"),
    complete: $("#attendanceCompleteTabCount"),
    review: $("#attendanceReviewTabCount"),
  };
  Object.entries(tabCountElements).forEach(([status, element]) => {
    if (element) element.textContent = tabCounts[status];
  });
  els.attendanceControlTabs?.querySelectorAll("button[data-attendance-status]").forEach((button) => {
    const selected = button.dataset.attendanceStatus === filters.status;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });

  const rows = baseRows.filter((row) => {
    if (!attendanceControlMatchesStatus(row, filters.status)) return false;
    if (!query) return true;
    return normalizeMatricula(row.name).includes(query)
      || normalizeMatricula(row.identifier).includes(query)
      || normalizeMatricula(row.site).includes(query)
      || normalizeMatricula(row.organization).includes(query);
  }).sort((a, b) => a.name.localeCompare(b.name, "es"));

  const emptyMessage = state.managedUsers.length || baseRows.length
    ? "No hay personas que coincidan con los filtros actuales."
    : "No hay directorio autorizado disponible para este alcance todavia.";
  els.attendanceControlEmpty.textContent = emptyMessage;
  els.attendanceControlEmpty.classList.toggle("is-hidden", rows.length > 0);
  els.attendanceControlCards.innerHTML = rows.map((row) => {
    const [label, tone] = attendanceControlStatusMeta(row.status);
    return `
      <article class="attendance-control-card">
        <div class="attendance-control-person"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.identifier)}</span></div>
        <span class="attendance-control-status is-${tone}">${escapeHtml(label)}</span>
        <div class="attendance-control-location"><span>${escapeHtml(row.organization)}</span><strong>${escapeHtml(row.site)}</strong></div>
        <dl>
          <div><dt>Entrada</dt><dd>${escapeHtml(row.record?.horaEntrada || "--:--")}</dd></div>
          <div><dt>Salida</dt><dd>${escapeHtml(row.record?.horaSalida || "--:--")}</dd></div>
          <div><dt>Evidencia</dt><dd>${escapeHtml(attendanceEvidenceLabel(row.record))}</dd></div>
        </dl>
        ${attendanceControlActions(row)}
      </article>
    `;
  }).join("");
  els.attendanceControlTableBody.innerHTML = rows.map((row) => {
    const [label, tone] = attendanceControlStatusMeta(row.status);
    return `<tr><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.identifier)}</small></td><td>${escapeHtml(row.organization)}</td><td>${escapeHtml(row.site)}</td><td>${escapeHtml(row.record?.horaEntrada || "--:--")}</td><td>${escapeHtml(row.record?.horaSalida || "--:--")}</td><td>${escapeHtml(attendanceEvidenceLabel(row.record))}</td><td><span class="attendance-control-status is-${tone}">${escapeHtml(label)}</span></td><td>${attendanceControlActions(row)}</td></tr>`;
  }).join("");
}

function recordSiteIds(record) {
  return [record.sitioId, record.sitioEntradaId, record.sitioSalidaId]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function recordSiteName(record) {
  const managedSite = state.managedSites.find((site) => recordSiteIds(record).includes(String(site.id || "")));
  if (managedSite?.nombre) return managedSite.nombre;

  const storedName = String(record.sitioNombre || record.sitioEntradaNombre || "").trim();
  const isOrganizationName = state.organizationHubs.some((organization) => (
    String(organization.nombre || "").trim().toLowerCase() === storedName.toLowerCase()
  ));
  if (isOrganizationName) return "Sitio no identificado";
  return storedName || "Sin sitio";
}

function recordOrganizationName(record) {
  const organizationId = String(record.organizacionId || "");
  return state.organizationHubs.find((organization) => String(organization.id || "") === organizationId)?.nombre
    || state.currentSiteScopes.find((scope) => String(scope.organizacion_id || "") === organizationId)?.organizacion_nombre
    || "Organización no identificada";
}

function recordMatchesSiteFilter(record, selectedSite) {
  if (!selectedSite || selectedSite === "all") return true;
  const knownSiteIds = new Set(state.managedSites.map((site) => String(site.id || "")).filter(Boolean));
  const ids = recordSiteIds(record);
  if (selectedSite === "unassigned") return !ids.some((id) => knownSiteIds.has(id));
  return ids.includes(String(selectedSite));
}

function renderSiteUsersOverview() {
  if (!els.siteUsersList || !els.siteUsersTotal) return;
  const organizations = state.organizationHubs
    .map((organization) => {
      const users = state.managedUsers.filter((user) => (
        user.activo !== false
        && String(user.organizacion_id || "") === String(organization.id || "")
      ));
      const sites = (organization.sitios || []).filter((site) => site.activo !== false);
      return {
        ...organization,
        users,
        sites,
        userCount: state.managedUsers.length ? users.length : Number(organization.usuarios_total || 0),
      };
    })
    .filter((organization) => organization.userCount > 0)
    .sort((a, b) => b.userCount - a.userCount || String(a.nombre || "").localeCompare(String(b.nombre || "")));

  const totalUsers = organizations.reduce((total, organization) => total + organization.userCount, 0);
  els.siteUsersTotal.textContent = `${totalUsers} ${totalUsers === 1 ? "usuario activo" : "usuarios activos"}`;

  if (!organizations.length) {
    els.siteUsersList.innerHTML = `
      <article class="site-users-card">
        <strong>Sin usuarios activos</strong>
        <span>El directorio no reporta usuarios vinculados a una organizacion.</span>
      </article>
    `;
    return;
  }

  els.siteUsersList.innerHTML = organizations
    .map((organization) => {
      const assignedUsers = organization.users.filter((user) => user.sitio_id).length;
      const unassignedUsers = Math.max(0, organization.userCount - assignedUsers);
      const siteSummary = organization.sites.map((site) => {
        const count = organization.users.filter((user) => String(user.sitio_id || "") === String(site.id || "")).length;
        return `${site.nombre || "Sitio"}: ${count}`;
      }).join(" / ");
      const isSelected = String(state.selectedOrganizationId || "") === String(organization.id || "");
      return `
        <article class="site-users-card ${isSelected ? "is-selected" : ""}">
          <div>
            <strong>${escapeHtml(organization.nombre || "Organizacion")}</strong>
            <span>${organization.userCount} ${organization.userCount === 1 ? "usuario" : "usuarios"} en la organizacion</span>
          </div>
          <div class="site-users-card-meta">
            <span>${organization.sites.length} ${organization.sites.length === 1 ? "sitio" : "sitios"}</span>
            <span>${unassignedUsers} sin sitio</span>
          </div>
          <p>${escapeHtml(siteSummary || "Sin sitios activos configurados")}</p>
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
      id: site.id || "",
      label,
      org: site.organizacion_nombre || "Organizacion",
      keyReady: Boolean(site.tiene_clave || site.clave_sitio || site.site_key),
    });
  });
  getVisibleRecords().forEach((record) => {
    const label = recordSiteName(record);
    if (!sites.has(label)) {
      sites.set(label, { id: "", label, org: record.organizacionNombre || "Organizacion", keyReady: false });
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
    if (!site.id) return;
    const option = document.createElement("option");
    option.value = site.id;
    option.textContent = `${site.label} / ${site.org}`;
    els.adminInviteSite.appendChild(option);
  });
  els.adminInviteSite.value = options.some((site) => site.id === previous) ? previous : "";
}

function canManageUserAssignments() {
  return isRoleAdminSession() && hasAnyPermission(["manage_site", "manage_organization"]);
}

function getAssignableUsers(action = getUserScopeAction()) {
  const actorRole = normalizeAppRole(state.currentRole);
  const actorId = String(state.currentAppUser?.id || "");
  const actorOrganizationId = String(state.currentAppUser?.organizacion_id || "");

  return state.managedUsers.filter((user) => {
    if (!user?.id || user.activo === false) return false;
    const role = normalizeAppRole(user.rol);
    if (role === "superadmin") return false;

    if (actorRole === "admin") {
      if (String(user.organizacion_id || "") !== actorOrganizationId) return false;
      if (role === "admin") return String(user.id) === actorId && action !== "make_supervisor";
      if (action === "change_role") return false;
      return role === "usuario" || role === "supervisor";
    }

    if (actorRole !== "superadmin") return false;
    if (action === "make_supervisor") return role === "usuario" || role === "supervisor";
    return ["usuario", "supervisor", "admin"].includes(role);
  });
}

function getManagedUserSiteScopeIds(user) {
  const ids = state.managedUserSiteScopes
    .filter((scope) => String(scope.usuario_id || "") === String(user?.id || ""))
    .map((scope) => String(scope.sitio_id || ""))
    .filter(Boolean);
  const primarySiteId = String(user?.sitio_id || "");
  if (primarySiteId && !ids.includes(primarySiteId)) ids.unshift(primarySiteId);
  return ids;
}

function getAssignableOrganizations() {
  const actor = state.currentAppUser || {};
  const canManageOrg = hasPermission("manage_organization");
  const organizations = state.organizationHubs.filter((organization) => {
    if (!organization?.id || organization.activo === false) return false;
    return canManageOrg || String(organization.id) === String(actor.organizacion_id || "");
  });
  return organizations.sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));
}

function getSelectedUserScopeOrganizationId() {
  return els.adminUsersOrganizationFilter?.value || els.userScopeOrganization?.value || "";
}

function populateOrganizationSelect(select, organizations, selectedOrganizationId, { disabled = false } = {}) {
  if (!select) return;
  select.innerHTML = `<option value="">Selecciona una organizacion</option>`;
  organizations.forEach((organization) => {
    const option = document.createElement("option");
    option.value = organization.id;
    option.textContent = organization.nombre || "Organizacion sin nombre";
    select.appendChild(option);
  });
  select.value = organizations.some((organization) => String(organization.id) === String(selectedOrganizationId))
    ? String(selectedOrganizationId)
    : "";
  select.disabled = disabled;
}

function setSelectedUserScopeOrganization(organizationId) {
  const id = String(organizationId || "");
  if (els.adminUsersOrganizationFilter) els.adminUsersOrganizationFilter.value = id;
  if (els.userScopeOrganization) els.userScopeOrganization.value = id;
}

function getUserScopeOrganizationName(organizationId) {
  return getAssignableOrganizations().find((organization) => String(organization.id) === String(organizationId))?.nombre
    || "la organizacion seleccionada";
}

function getAssignableSitesForUser(user) {
  if (!user?.organizacion_id) return [];
  const actor = state.currentAppUser || {};
  const canManageOrg = hasPermission("manage_organization");
  return state.managedSites.filter((site) => {
    if (site.activo === false || String(site.organizacion_id || "") !== String(user.organizacion_id)) return false;
    if (canManageOrg) return true;
    return String(site.organizacion_id || "") === String(actor.organizacion_id || "");
  });
}

function getManagedSiteOrganizationName(site) {
  return state.organizationHubs.find((organization) => organization.id === site?.organizacion_id)?.nombre
    || site?.organizacion_nombre
    || "Organizacion";
}

function setUserScopeStatus(message, tone = "warning") {
  if (!els.userScopeStatus) return;
  els.userScopeStatus.textContent = message;
  els.userScopeStatus.dataset.tone = tone;
}

function getUserScopeAction() {
  const requested = els.userScopeAction?.value || "assign_site";
  if (requested === "make_supervisor" && !isRoleAdminSession()) return "assign_site";
  if (requested === "change_role" && normalizeAppRole(state.currentRole) !== "superadmin") return "assign_site";
  return ["assign_site", "change_site", "make_supervisor", "change_role"].includes(requested) ? requested : "assign_site";
}

function getUserScopeActionCopy(action) {
  const copy = {
    assign_site: {
      help: "Asigna a una persona sin sitio a una sede de su organizacion.",
      button: "Asignar a sitio",
      status: "Elige una persona sin sitio y su sede de destino.",
    },
    change_site: {
      help: "Cambia a una persona que ya tiene sitio a otra sede de su organizacion.",
      button: "Cambiar de sitio",
      status: "Elige una persona con sitio y selecciona su nueva sede.",
    },
    make_supervisor: {
      help: "Asigna o conserva el rol supervisor y elige uno o varios sitios de su organizacion.",
      button: "Guardar supervisor y sitios",
      status: "Elige una persona y todos los sitios que supervisara.",
    },
    change_role: {
      help: "Solo superadmin puede cambiar el rol de un administrador. El sitio se conserva salvo que elijas otro.",
      button: "Cambiar rol",
      status: "Elige una persona, el nuevo rol y confirma su sitio operativo.",
    },
  };
  return copy[action] || copy.assign_site;
}

function populateUserScopeAssignment() {
  const card = els.userScopeAssignmentCard;
  if (!card) return;

  const allowed = canManageUserAssignments();
  card.classList.toggle("is-hidden", !allowed);
  if (!allowed) return;

  const organizations = getAssignableOrganizations();
  const previousOrganizationId = getSelectedUserScopeOrganizationId();
  const actorOrganizationId = String(state.currentAppUser?.organizacion_id || "");
  const selectedOrganizationId = organizations.some((organization) => String(organization.id) === previousOrganizationId)
    ? previousOrganizationId
    : (organizations.some((organization) => String(organization.id) === actorOrganizationId)
      ? actorOrganizationId
      : String(organizations[0]?.id || ""));
  const action = getUserScopeAction();
  const copy = getUserScopeActionCopy(action);
  const users = getAssignableUsers(action).filter((user) => {
    if (String(user.organizacion_id || "") !== selectedOrganizationId) return false;
    if (action === "assign_site") return !user.sitio_id;
    if (action === "change_site") return Boolean(user.sitio_id);
    if (action === "make_supervisor") return ["usuario", "supervisor"].includes(normalizeAppRole(user.rol));
    return action === "change_role";
  });
  const previousUserId = els.userScopeUser?.value || "";
  const previousSiteIds = Array.from(els.userScopeSite?.selectedOptions || []).map((option) => option.value).filter(Boolean);
  const previousSiteUserId = els.userScopeSite?.dataset.userId || "";
  const selectedUser = users.find((user) => String(user.id) === String(previousUserId)) || null;
  const canManageRoles = isRoleAdminSession() && hasPermission("manage_site");
  const canChangeRoles = normalizeAppRole(state.currentRole) === "superadmin";

  populateOrganizationSelect(
    els.adminUsersOrganizationFilter,
    organizations,
    selectedOrganizationId,
    { disabled: !hasPermission("manage_organization") || organizations.length <= 1 },
  );
  populateOrganizationSelect(
    els.userScopeOrganization,
    organizations,
    selectedOrganizationId,
    { disabled: !hasPermission("manage_organization") || organizations.length <= 1 },
  );

  if (els.userScopeActionWrap) els.userScopeActionWrap.classList.toggle("is-hidden", false);
  if (els.userScopeAction) {
    const supervisorOption = els.userScopeAction.querySelector('option[value="make_supervisor"]');
    if (supervisorOption) {
      supervisorOption.hidden = !canManageRoles;
      supervisorOption.disabled = !canManageRoles;
    }
    const changeRoleOption = els.userScopeAction.querySelector('option[value="change_role"]');
    if (changeRoleOption) {
      changeRoleOption.hidden = !canChangeRoles;
      changeRoleOption.disabled = !canChangeRoles;
    }
    if (!canManageRoles && els.userScopeAction.value === "make_supervisor") els.userScopeAction.value = "assign_site";
    if (!canChangeRoles && els.userScopeAction.value === "change_role") els.userScopeAction.value = "assign_site";
  }
  if (els.userScopeHelp) els.userScopeHelp.textContent = copy.help;
  if (els.userScopeKicker) els.userScopeKicker.textContent = canManageRoles ? "Gestion operativa" : "Alcance operativo";
  if (els.userScopeTitle) els.userScopeTitle.textContent = "Asignacion de usuario";
  if (els.assignUserScopeButton) {
    els.assignUserScopeButton.textContent = copy.button;
  }

  if (els.userScopeUser) {
    els.userScopeUser.innerHTML = `<option value="">${selectedOrganizationId ? "Selecciona un usuario" : "Selecciona primero una organizacion"}</option>`;
    users.forEach((user) => {
      const option = document.createElement("option");
      option.value = user.id;
      option.textContent = `${user.nombre || user.email || user.matricula || "Usuario"}${user.sitio_nombre ? ` - ${user.sitio_nombre}` : " - Sin sitio"}`;
      els.userScopeUser.appendChild(option);
    });
    els.userScopeUser.value = selectedUser?.id || "";
  }

  if (els.userScopeRoleWrap) els.userScopeRoleWrap.classList.toggle("is-hidden", action !== "change_role");
  if (els.userScopeRole) {
    const selectedUserChanged = els.userScopeRole.dataset.userId !== String(selectedUser?.id || "");
    if (selectedUserChanged && selectedUser) els.userScopeRole.value = normalizeAppRole(selectedUser.rol);
    els.userScopeRole.dataset.userId = String(selectedUser?.id || "");
    els.userScopeRole.disabled = !selectedUser || action !== "change_role";
  }

  const sites = getAssignableSitesForUser(selectedUser);
  const targetRole = action === "make_supervisor"
    ? "supervisor"
    : action === "change_role"
      ? normalizeAppRole(els.userScopeRole?.value || selectedUser?.rol)
      : normalizeAppRole(selectedUser?.rol);
  const allowsMultipleSites = action === "make_supervisor" || (action === "change_role" && targetRole === "supervisor");
  if (els.userScopeSite) {
    els.userScopeSite.multiple = allowsMultipleSites;
    els.userScopeSite.size = allowsMultipleSites ? Math.min(Math.max(sites.length, 2), 5) : 1;
    els.userScopeSite.innerHTML = allowsMultipleSites
      ? ""
      : `<option value="">${selectedUser ? "Selecciona un sitio" : "Selecciona primero un usuario"}</option>`;
    sites.forEach((site) => {
      const option = document.createElement("option");
      option.value = site.id;
      option.textContent = `${site.nombre || "Sitio sin nombre"} - ${getManagedSiteOrganizationName(site)}`;
      els.userScopeSite.appendChild(option);
    });
    els.userScopeSite.disabled = !selectedOrganizationId || !selectedUser || !sites.length;
    const currentScopeIds = getManagedUserSiteScopeIds(selectedUser);
    const keepPreviousSelection = selectedUser && String(selectedUser.id) === String(previousSiteUserId) && previousSiteIds.length > 0;
    const selectedSiteIds = keepPreviousSelection
      ? previousSiteIds
      : (["make_supervisor", "change_role"].includes(action) ? currentScopeIds : []);
    Array.from(els.userScopeSite.options).forEach((option) => {
      option.selected = selectedSiteIds.includes(String(option.value));
    });
    els.userScopeSite.dataset.userId = String(selectedUser?.id || "");
  }

  if (els.userScopeSiteLabel) els.userScopeSiteLabel.textContent = allowsMultipleSites ? "Sitios supervisados" : "Sitio operativo";
  if (els.userScopeSiteHelp) {
    els.userScopeSiteHelp.textContent = allowsMultipleSites
      ? "Selecciona uno o varios. El primero sera el sitio principal para su asistencia."
      : action === "change_role" && targetRole === "admin"
        ? "Opcional para admin: conservara acceso a toda su organizacion."
        : "El sitio se usa para registrar asistencia y aplicar horario.";
  }

  if (els.assignUserScopeButton) {
    const destinationSiteIds = Array.from(els.userScopeSite?.selectedOptions || []).map((option) => option.value).filter(Boolean);
    const siteRequired = action !== "change_role" || targetRole !== "admin";
    const changingToSameSite = action === "change_site"
      && destinationSiteIds.length === 1
      && destinationSiteIds[0] === String(selectedUser?.sitio_id || "");
    els.assignUserScopeButton.disabled = !selectedUser || (siteRequired && !destinationSiteIds.length) || changingToSameSite;
  }

  if (!selectedOrganizationId) {
    setUserScopeStatus("Selecciona una organizacion para consultar y vincular usuarios.", "warning");
  } else if (!users.length) {
    setUserScopeStatus("No hay usuarios elegibles en esta organizacion para vincular.", "warning");
  } else if (selectedUser && !sites.length) {
    setUserScopeStatus("No hay sitios activos compatibles con la organizacion de este usuario.", "danger");
  } else if (els.userScopeStatus?.dataset.tone !== "success") {
    setUserScopeStatus(copy.status, "warning");
  }
}

async function assignUserScope() {
  if (!canManageUserAssignments()) {
    showToast("No tienes permisos para asignar usuarios.");
    return;
  }

  const userId = els.userScopeUser?.value || "";
  const action = getUserScopeAction();
  const selectedUser = getAssignableUsers(action).find((user) => String(user.id) === String(userId));
  const siteIds = Array.from(els.userScopeSite?.selectedOptions || []).map((option) => option.value).filter(Boolean);
  const role = action === "make_supervisor"
    ? "supervisor"
    : action === "change_role"
      ? normalizeAppRole(els.userScopeRole?.value || selectedUser?.rol)
      : null;
  const siteRequired = action !== "change_role" || role !== "admin";
  if (!selectedUser || (siteRequired && !siteIds.length)) {
    setUserScopeStatus("Selecciona una persona y al menos un sitio activo.", "danger");
    return;
  }
  if (action === "assign_site" && selectedUser?.sitio_id) {
    setUserScopeStatus("Esta persona ya tiene sitio. Usa Cambiar usuario de sitio.", "danger");
    return;
  }
  if (action === "change_site" && !selectedUser?.sitio_id) {
    setUserScopeStatus("Esta persona aun no tiene sitio. Usa Asignar usuario sin sitio.", "danger");
    return;
  }
  if (action === "change_site" && siteIds.length === 1 && String(selectedUser.sitio_id) === String(siteIds[0])) {
    setUserScopeStatus("Selecciona un sitio distinto al actual.", "danger");
    return;
  }

  let successMessage = "";
  if (els.assignUserScopeButton) els.assignUserScopeButton.disabled = true;
  setUserScopeStatus("Guardando asignacion...", "warning");
  try {
    const result = getRpcFirstRow(await callAdminRpc("admin_update_user_scope", {
      p_usuario_id: userId,
      p_sitio_ids: siteIds.length ? siteIds : null,
      p_sitio_principal_id: siteIds[0] || null,
      p_rol: role,
    }));
    const resultingRole = result?.rol || role || selectedUser.rol;
    const assignedRole = getRoleDefinition(resultingRole).label;
    successMessage = action === "change_role"
      ? `Rol actualizado a ${assignedRole} sin perder su sitio operativo.`
      : action === "make_supervisor"
        ? `Supervisor asignado a ${Number(result?.sitios_asignados || siteIds.length)} sitio(s).`
        : `${assignedRole} actualizado sin modificar su rol.`;
    addAdminLog("user.scope_updated", `${userId} / ${siteIds.join(",")} / ${resultingRole}`);
    showToast(successMessage);
    await loadOrganizations({ silent: true });
    await loadAdminDirectories({ silent: true });
  } catch (error) {
    setUserScopeStatus(`No se pudo guardar: ${parseSupabaseError(error).slice(0, 140)}`, "danger");
  } finally {
    populateUserScopeAssignment();
    if (successMessage) setUserScopeStatus(successMessage, "success");
  }
}

function setOrganizationAdminInviteStatus(message, tone = "warning") {
  if (!els.organizationAdminInviteStatus) return;
  els.organizationAdminInviteStatus.textContent = message;
  els.organizationAdminInviteStatus.dataset.tone = tone;
}

async function createOrganizationAdminInvite() {
  if (!isSuperadminSession()) {
    showToast("Solo un superadmin autenticado puede invitar administradores.");
    return;
  }
  const email = String(els.organizationAdminInviteEmail?.value || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    setOrganizationAdminInviteStatus("Captura un correo valido para generar la invitacion.", "danger");
    els.organizationAdminInviteEmail?.focus();
    return;
  }

  if (els.createOrganizationAdminInvite) els.createOrganizationAdminInvite.disabled = true;
  setOrganizationAdminInviteStatus("Generando invitacion segura...", "warning");
  try {
    const invite = getRpcFirstRow(await callAdminRpc("superadmin_create_organization_admin_invite", {
      p_email: email,
      p_expires_hours: 72,
    }));
    if (!invite?.invite_key) throw new Error("No se recibio una clave de invitacion.");
    if (els.organizationAdminInviteKey) els.organizationAdminInviteKey.value = invite.invite_key;
    setOrganizationAdminInviteStatus("Invitacion creada. Expira en 72 horas y solo puede usarse una vez.", "success");
    addAdminLog("organization_admin_invite_created", email);
  } catch (error) {
    setOrganizationAdminInviteStatus(`No se pudo crear: ${parseSupabaseError(error).slice(0, 140)}`, "danger");
  } finally {
    if (els.createOrganizationAdminInvite) els.createOrganizationAdminInvite.disabled = false;
  }
}

async function copyOrganizationAdminInvite() {
  const key = String(els.organizationAdminInviteKey?.value || "").trim();
  if (!key) {
    showToast("Primero genera una invitacion de administrador.");
    return;
  }
  try {
    await navigator.clipboard.writeText(key);
    showToast("Clave de administrador copiada.");
  } catch {
    showToast("No se pudo copiar la clave desde este navegador.");
  }
}

function adminUserHasSite(user) {
  return Boolean(user?.sitio_id || String(user?.sitio_nombre || user?.sitioNombre || "").trim());
}

function adminUserListItem(user) {
  const role = getRoleDefinition(user.rol || "usuario");
  const statusClass = user.activo === false ? "danger" : "success";
  const normalizedRole = normalizeAppRole(user.rol);
  const actorRole = normalizeAppRole(state.currentAppUser?.rol || state.currentRole);
  const canEditScope = canManageUserAssignments()
    && normalizedRole !== "superadmin"
    && (
      actorRole === "superadmin"
      || ["usuario", "supervisor"].includes(normalizedRole)
      || String(user.id || "") === String(state.currentAppUser?.id || "")
    );
  const targetIsSuperadmin = normalizedRole === "superadmin";
  const targetIsProtectedOwner = isKnownOwnerEmail(user.email);
  const canManageLifecycle = ["admin", "superadmin"].includes(actorRole)
    && (!targetIsSuperadmin || isKnownOwnerSession())
    && !targetIsProtectedOwner
    && String(user.id || "") !== String(state.currentAppUser?.id || "")
    && (actorRole === "superadmin" || (
      ["usuario", "supervisor"].includes(normalizedRole)
      && String(user.organizacion_id || "") === String(state.currentAppUser?.organizacion_id || "")
    ));
  const canDeactivate = canManageLifecycle && user.activo !== false;
  const canReactivate = canManageLifecycle && user.activo === false;
  const canPurge = canManageLifecycle
    && (actorRole === "superadmin" || ["usuario", "supervisor"].includes(normalizedRole));
  const scopeLabel = actorRole === "superadmin" && normalizedRole === "admin"
    ? "Rol y sitio"
    : normalizedRole === "supervisor"
      ? "Gestionar sitios"
      : adminUserHasSite(user) ? "Cambiar sitio" : "Asignar sitio";
  return `
    <li class="admin-user-row">
      <div class="admin-user-identity">
        <strong>${escapeHtml(user.nombre || user.email || user.matricula || "Usuario")}</strong>
        <span>${escapeHtml(user.email || user.matricula || "Sin identificador")}</span>
      </div>
      <div class="admin-user-row-actions">
        <span class="badge ${statusClass}">${user.activo === false ? "Inactivo" : escapeHtml(role.label)}</span>
        ${canEditScope ? `<button class="ghost compact" type="button" data-edit-user-scope="${escapeHtml(user.id || "")}">${scopeLabel}</button>` : ""}
        ${canDeactivate ? `<button class="ghost compact" type="button" data-deactivate-user="${escapeHtml(user.id || "")}">Volver inactivo</button>` : ""}
        ${canReactivate ? `<button class="secondary compact" type="button" data-reactivate-user="${escapeHtml(user.id || "")}">Reactivar</button>` : ""}
        ${canPurge ? `<button class="danger compact" type="button" data-purge-user="${escapeHtml(user.id || "")}">Borrar definitivo</button>` : ""}
      </div>
    </li>
  `;
}

async function deactivateManagedUser(userId) {
  if (!canManageUserAssignments()) {
    showToast("Solo administradores autorizados pueden inactivar usuarios.");
    return;
  }
  const user = state.managedUsers.find((item) => String(item.id || "") === String(userId || ""));
  if (!user) return;
  const label = user.nombre || user.email || user.matricula || "este usuario";
  if (!confirm(`Volver inactivo a ${label}? Se conservara su historial y podra reactivarse desde administracion.`)) return;

  try {
    await callAdminRpc("superadmin_deactivate_user", { p_usuario_id: user.id });
    addAdminLog("user.deactivated", user.id);
    showToast("Usuario marcado como inactivo.");
    await loadAdminDirectories({ silent: true });
    renderAdminUsersSection(getVisibleRecords());
  } catch (error) {
    showToast(`No se pudo eliminar: ${parseSupabaseError(error).slice(0, 140)}`);
  }
}

async function purgeManagedUser(userId) {
  if (!canManageUserAssignments()) {
    showToast("Solo administradores autorizados pueden borrar usuarios.");
    return;
  }
  const user = state.managedUsers.find((item) => String(item.id || "") === String(userId || ""));
  if (!user) return;
  const label = user.nombre || user.email || user.matricula || "este usuario";
  if (!confirm(`Borrar definitivamente a ${label}? Se eliminara su cuenta, asistencias, evidencia y actividad asociada. Esta accion no se puede deshacer.`)) return;
  const confirmation = prompt('Escribe ELIMINAR para confirmar la purga definitiva.');
  if (String(confirmation || "").trim().toUpperCase() !== "ELIMINAR") {
    showToast("Purga cancelada: no se confirmo la palabra requerida.");
    return;
  }

  try {
    const result = getRpcFirstRow(await callAdminRpc("superadmin_purge_user", {
      p_usuario_id: user.id,
      p_confirmacion: "ELIMINAR",
    }));
    addAdminLog("user.purged", user.id);
    showToast(`Usuario borrado definitivamente. Asistencias eliminadas: ${Number(result?.asistencias_eliminadas || 0)}.`);
    await loadAdminDirectories({ silent: true });
    renderAdminUsersSection(getVisibleRecords());
  } catch (error) {
    showToast(`No se pudo borrar definitivamente: ${parseSupabaseError(error).slice(0, 140)}`);
  }
}

async function reactivateManagedUser(userId) {
  if (!canManageUserAssignments()) {
    showToast("Solo administradores autorizados pueden reactivar usuarios.");
    return;
  }
  const user = state.managedUsers.find((item) => String(item.id || "") === String(userId || ""));
  if (!user) return;
  const label = user.nombre || user.email || user.matricula || "este usuario";
  if (!confirm(`Reactivar a ${label}? Podra volver a iniciar sesion y registrar asistencia.`)) return;
  try {
    await callAdminRpc("admin_reactivate_user", { p_usuario_id: user.id });
    addAdminLog("user.reactivated", user.id);
    showToast("Usuario reactivado.");
    await loadAdminDirectories({ silent: true });
    renderAdminUsersSection(getVisibleRecords());
  } catch (error) {
    showToast(`No se pudo reactivar: ${parseSupabaseError(error).slice(0, 140)}`);
  }
}

function renderAdminUsersSection(records = getVisibleRecords()) {
  if (!els.adminUsersBySite) return;
  populateUserScopeAssignment();
  populateAdminInviteSites();

  const selectedOrganizationId = getSelectedUserScopeOrganizationId();
  const selectedOrganizationName = getUserScopeOrganizationName(selectedOrganizationId);
  const rows = getAdminUserRows().filter((user) => String(user.organizacion_id || "") === selectedOrganizationId);
  const canManageAdminRoles = normalizeAppRole(state.currentRole) === "superadmin";
  const withoutSite = rows.filter((user) => (
    !adminUserHasSite(user)
    && (
      ["usuario", "supervisor"].includes(normalizeAppRole(user.rol))
      || (
        normalizeAppRole(user.rol) === "admin"
        && (canManageAdminRoles || String(user.id || "") === String(state.currentAppUser?.id || ""))
      )
    )
  ));
  const assigned = rows.filter(adminUserHasSite);
  const activeView = state.adminUserDirectoryView === "assigned" ? "assigned" : "unassigned";
  const visibleRows = activeView === "assigned" ? assigned : withoutSite;
  const bySite = new Map();

  visibleRows.forEach((user) => {
    const site = activeView === "assigned"
      ? String(user.sitio_nombre || user.sitioNombre || "Sitio asignado").trim()
      : "Sin sitio";
    if (!bySite.has(site)) bySite.set(site, []);
    bySite.get(site).push(user);
  });

  if (els.adminUsersCount) {
    els.adminUsersCount.textContent = `${rows.length} ${rows.length === 1 ? "usuario" : "usuarios"} en ${selectedOrganizationName}`;
  }
  if (els.adminUsersNoSiteCount) els.adminUsersNoSiteCount.textContent = `${withoutSite.length} sin sitio`;
  if (els.adminUsersUnassignedTabCount) els.adminUsersUnassignedTabCount.textContent = String(withoutSite.length);
  if (els.adminUsersAssignedTabCount) els.adminUsersAssignedTabCount.textContent = String(assigned.length);
  document.querySelectorAll("[data-admin-user-view]").forEach((button) => {
    const selected = button.dataset.adminUserView === activeView;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  if (els.adminUsersScopeBadge) {
    els.adminUsersScopeBadge.className = `badge ${hasPermission("view_all_records") ? "admin" : "default"}`;
    els.adminUsersScopeBadge.textContent = hasPermission("view_all_records") ? "Por organizacion" : "Alcance de sitio";
  }
  if (els.adminUsersSummary) {
    els.adminUsersSummary.textContent = activeView === "assigned"
      ? `Supervisores y usuarios con sitio en ${selectedOrganizationName}. Usa Cambiar sitio cuando sea necesario.`
      : `Personas de ${selectedOrganizationName} que aun necesitan un sitio operativo.`;
  }

  if (!visibleRows.length) {
    els.adminUsersBySite.innerHTML = `
      <article class="admin-user-site-card is-empty">
        <strong>${activeView === "assigned" ? "Aun no hay personas asignadas" : "Todos tienen sitio"}</strong>
        <p>${activeView === "assigned" ? "Las asignaciones apareceran aqui por sitio." : "No hay usuarios pendientes de asignacion en esta organizacion."}</p>
      </article>
    `;
    return;
  }

  els.adminUsersBySite.innerHTML = Array.from(bySite.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([site, users]) => {
      const uniqueRecords = records.filter((record) => {
        const recordUser = normalizeMatricula(String(record.matricula || ""));
        return users.some((user) => normalizeMatricula(String(user.matricula || "")) === recordUser);
      }).length;
      return `
        <article class="admin-user-site-card ${activeView === "unassigned" ? "needs-attention unassigned-users-card" : ""}">
          <header>
            <div>
              <strong>${escapeHtml(site)}</strong>
              <span>${users.length} ${users.length === 1 ? "persona" : "personas"} / ${uniqueRecords} registros</span>
            </div>
            <span class="badge ${activeView === "unassigned" ? "warning" : "success"}">${activeView === "unassigned" ? "Pendiente" : "Asignado"}</span>
          </header>
          <ul>${users.map(adminUserListItem).join("")}</ul>
        </article>
      `;
    }).join("");
}

async function prepareAdminInviteKey() {
  if (!canManageUserAssignments()) {
    showToast("No tienes permisos para preparar invitaciones de supervisor.");
    return;
  }
  const email = els.adminInviteEmail?.value.trim() || "";
  const siteId = els.adminInviteSite?.value || "";
  if (!email || !siteId) {
    if (els.adminInviteStatus) {
      els.adminInviteStatus.textContent = "Captura correo y sitio antes de preparar la key.";
      els.adminInviteStatus.dataset.tone = "danger";
    }
    return;
  }
  if (els.prepareAdminInvite) els.prepareAdminInvite.disabled = true;
  try {
    const invite = getRpcFirstRow(await callAdminRpc("admin_create_site_invite", {
      p_sitio_id: siteId,
      p_email: email,
      p_rol: "supervisor",
      p_expires_hours: 72,
    }));
    if (!invite?.invite_key) throw new Error("No se recibio una key de invitacion.");
    if (els.adminInviteKey) els.adminInviteKey.value = invite.invite_key;
    if (els.adminInviteStatus) {
      els.adminInviteStatus.textContent = "Invitacion de supervisor creada. Expira en 72 horas.";
      els.adminInviteStatus.dataset.tone = "success";
    }
    addAdminLog("site_invite_created", `${email} / ${siteId}`);
  } catch (error) {
    if (els.adminInviteStatus) {
      els.adminInviteStatus.textContent = `No se pudo crear: ${parseSupabaseError(error).slice(0, 140)}`;
      els.adminInviteStatus.dataset.tone = "danger";
    }
  } finally {
    if (els.prepareAdminInvite) els.prepareAdminInvite.disabled = false;
  }
}

async function copyAdminInviteKey() {
  const key = els.adminInviteKey?.value.trim();
  if (!key) {
    showToast("Primero prepara una clave de supervisor.");
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
  const attendanceAdminVisible = state.activeAdminSection === "attendances"
    && Boolean(document.querySelector('[data-view="admin"]:not(.is-hidden)'));
  if (attendanceAdminVisible) {
    const status = state.attendanceControlFilters.status || "all";
    const statusMap = {
      all: "all",
      missing: "missing",
      with_entry: "all",
      entry: "entrada_registrada",
      complete: "asistencia_completa",
      review: "all",
    };
    state.recordFilters = {
      date: state.attendanceControlFilters.date || todayIso(),
      status: statusMap[status] || "all",
      risk: status === "review" ? "revision" : "all",
      organization: state.attendanceControlFilters.organization || "all",
      site: state.attendanceControlFilters.site || "all",
      user: "all",
      query: state.attendanceControlFilters.query || "",
    };
    return;
  }
  state.recordFilters.date = els.filterDate?.value || "";
  state.recordFilters.status = els.filterStatus?.value || "all";
  state.recordFilters.risk = els.filterRisk?.value || "all";
  state.recordFilters.organization = els.filterOrganization?.value || els.adminAttendanceOrganizationFilter?.value || "all";
  state.recordFilters.site = els.filterSite?.value || "all";
  state.recordFilters.user = els.filterUser?.value || "all";
  state.recordFilters.query = els.filterSearch?.value || "";
}

function populateDashboardFilterSelects() {
  const allVisible = getVisibleRecords();
  const organizationMap = new Map();
  state.organizationHubs.forEach((organization) => {
    if (organization.id) organizationMap.set(String(organization.id), organization);
  });
  state.currentSiteScopes.forEach((scope) => {
    if (!scope.organizacion_id || organizationMap.has(String(scope.organizacion_id))) return;
    organizationMap.set(String(scope.organizacion_id), {
      id: scope.organizacion_id,
      nombre: scope.organizacion_nombre || "Organizacion",
    });
  });
  if (state.currentAppUser?.organizacion_id && !organizationMap.has(String(state.currentAppUser.organizacion_id))) {
    organizationMap.set(String(state.currentAppUser.organizacion_id), {
      id: state.currentAppUser.organizacion_id,
      nombre: state.currentAppUser.organizacion_nombre || "Mi organizacion",
    });
  }
  const organizationOptions = Array.from(organizationMap.values())
    .filter((organization) => organization.id)
    .map((organization) => ({ value: String(organization.id), label: organization.nombre || "Organización" }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const canChooseOrganization = normalizeAppRole(state.currentRole) === "superadmin";
  const defaultOrganizationId = state.currentAppUser?.organizacion_id || state.currentAppUser?.organizacionId || "";
  let selectedOrganizationId = els.filterOrganization?.value || els.adminAttendanceOrganizationFilter?.value || state.recordFilters.organization || "all";
  if (!canChooseOrganization) selectedOrganizationId = defaultOrganizationId || organizationOptions[0]?.value || "all";

  const organizationFilters = [els.filterOrganization, els.adminAttendanceOrganizationFilter].filter(Boolean);
  organizationFilters.forEach((select) => {
    select.innerHTML = "";
    if (canChooseOrganization) {
      select.appendChild(new Option("Todas las organizaciones", "all"));
    }
    organizationOptions.forEach((organization) => {
      select.appendChild(new Option(organization.label, organization.value));
    });
    const allowedOrganizationIds = new Set(organizationOptions.map((organization) => organization.value));
    select.value = allowedOrganizationIds.has(selectedOrganizationId) || (canChooseOrganization && selectedOrganizationId === "all")
      ? selectedOrganizationId
      : (canChooseOrganization ? "all" : defaultOrganizationId || organizationOptions[0]?.value || "all");
    select.disabled = !canChooseOrganization;
    selectedOrganizationId = select.value;
  });

  const siteOptions = getOperationalSites()
    .filter((site) => site.id && site.activo !== false)
    .filter((site) => selectedOrganizationId === "all" || site.organizacion_id === selectedOrganizationId)
    .map((site) => ({
      value: String(site.id),
      label: `${site.nombre || "Sitio"} - ${getManagedSiteOrganizationName(site)}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const knownSiteIds = new Set(siteOptions.map((site) => site.value));
  const hasUnassignedRecords = allVisible.some((record) => !recordSiteIds(record).some((id) => knownSiteIds.has(id)));

  const updateSiteSelect = (selectEl, prevValue) => {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="all">Todos los sitios</option>';
    siteOptions.forEach((site) => {
      const option = document.createElement("option");
      option.value = site.value;
      option.textContent = site.label;
      selectEl.appendChild(option);
    });
    if (hasUnassignedRecords) {
      const option = document.createElement("option");
      option.value = "unassigned";
      option.textContent = "Sin sitio identificado (historico)";
      selectEl.appendChild(option);
    }
    if (siteOptions.some((site) => site.value === prevValue) || (hasUnassignedRecords && prevValue === "unassigned")) {
      selectEl.value = prevValue;
    } else {
      selectEl.value = "all";
    }
  };

  const updateUserSelect = (selectEl, prevValue, selectedSite) => {
    if (!selectEl) return;
    const uniqueUsers = new Map();
    allVisible.forEach(record => {
      const organizationMatches = selectedOrganizationId === "all" || record.organizacionId === selectedOrganizationId;
      const siteMatches = recordMatchesSiteFilter(record, selectedSite);
      if (organizationMatches && siteMatches && record.matricula && record.nombre) {
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
  const defaultOrganizationId = normalizeAppRole(state.currentRole) === "superadmin"
    ? "all"
    : (state.currentAppUser?.organizacion_id || state.currentAppUser?.organizacionId || "all");
  const defaultDate = canUseOperationsPanel() ? todayIso() : "";
  state.recordFilters = { date: defaultDate, status: "all", risk: "all", organization: defaultOrganizationId, site: "all", user: "all", query: "" };
  if (els.filterDate) els.filterDate.value = defaultDate;
  if (els.filterStatus) els.filterStatus.value = "all";
  if (els.filterOrganization) els.filterOrganization.value = defaultOrganizationId;
  if (els.filterRisk) els.filterRisk.value = "all";
  if (els.filterSite) els.filterSite.value = "all";
  if (els.filterUser) els.filterUser.value = "all";
  if (els.filterSearch) els.filterSearch.value = "";

  if (els.adminFilterDate) els.adminFilterDate.value = defaultDate;
  if (els.adminFilterStatus) els.adminFilterStatus.value = "all";
  if (els.adminFilterRisk) els.adminFilterRisk.value = "all";
  if (els.adminAttendanceOrganizationFilter) els.adminAttendanceOrganizationFilter.value = defaultOrganizationId;
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
    const isGlobalRecords = normalizeAppRole(state.currentRole) === "superadmin";
    els.recordsMobileCards.innerHTML = `
      <div class="mobile-record-empty">
        <span class="mobile-record-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/><path d="m8 15 2 2 5-5"/></svg>
        </span>
        <strong>${isGlobalRecords ? "No hay jornadas con estos filtros" : "Aun no hay jornadas"}</strong>
        <span>${isGlobalRecords ? "Cambia los filtros para consultar otra organización, sitio o persona." : "Tu primera entrada aparecera aqui con sus horarios y estado."}</span>
        ${isGlobalRecords ? "" : '<button class="primary" data-target="attendance" type="button">Registrar asistencia</button>'}
      </div>
    `;
    return;
  }

  const canManageRecords = hasPermission("manage_records") || isDemoAdminUnlocked();
  const canDeleteRecords = hasPermission("delete_records") || isDemoAdminUnlocked();

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
      canDeleteRecords ? `<button class="danger mini" data-action="delete-record" data-id="${record.id}">Eliminar</button>` : "",
    ].filter(Boolean).join("");

    return `
      <article class="mobile-record-card">
        <div class="mobile-record-card-head">
          <div class="mobile-record-card-title">
            <span>Jornada del ${escapeHtml(displayDate(record.fecha))}</span>
            <strong>${escapeHtml(isComplete ? "Jornada completa" : "Salida pendiente")}</strong>
            <small>${escapeHtml(recordOrganizationName(record))} · ${escapeHtml(recordSiteName(record))}</small>
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
function imageCell(record, kind) {
  if (!recordHasEvidence(record, kind)) return `<span class="muted">Sin foto</span>`;
  const canOpen = canViewRecord(record) || hasPermission("view_evidence") || isDemoAdminUnlocked();
  if (!canOpen) return `<span class="badge default">Foto protegida</span>`;
  return `<button class="secondary mini evidence-inline-action" type="button" data-action="view-evidence" data-id="${escapeHtml(record.id)}">Ver foto</button>`;
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
  const supervisorSession = isSupervisorSession();
  const demoAdmin = isDemoAdminUnlocked();
  if (roleAdmin) state.isAdmin = true;
  if (!roleAdmin && !demoAdmin) state.isAdmin = false;

  const canManageOrg = hasPermission("manage_organization") || demoAdmin;
  const canManageSite = hasPermission("manage_site") || demoAdmin;
  const canManageRecords = hasPermission("manage_records") || demoAdmin;
  const canExport = hasPermission("export_records") || demoAdmin;
  const canViewAudit = hasPermission("view_audit") || demoAdmin;
  const hasOperationsSurface = roleAdmin || supervisorSession || demoAdmin;

  document.querySelectorAll(".admin-nav").forEach((element) => {
    element.classList.toggle("is-hidden", !hasOperationsSurface);
  });
  document.querySelectorAll(".admin-control, .admin-only").forEach((element) => {
    element.classList.toggle("is-hidden", !state.isAdmin);
  });
  document.querySelectorAll(".supervisor-visible").forEach((element) => {
    element.classList.toggle("is-hidden", !hasOperationsSurface);
  });
  document.querySelectorAll(".supervisor-hidden").forEach((element) => {
    element.classList.toggle("is-hidden", supervisorSession);
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
  document.querySelectorAll(".real-superadmin-only").forEach((element) => {
    element.classList.toggle("is-hidden", !isSuperadminSession());
  });
  document.querySelectorAll(".organization-create-only").forEach((element) => {
    element.classList.toggle("is-hidden", !canCreateOrganization());
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
    els.adminRoleBadge.textContent = supervisorSession ? "Supervisar" : role.label;
    els.adminRoleBadge.dataset.tone = hasPermission("manage_organization")
      ? "superadmin"
      : roleAdmin
        ? "admin"
        : supervisorSession
          ? "supervisor"
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

  const isAuthorizedToAdmin = ["supervisor", "admin", "superadmin"].includes(state.currentRole);
  const navAdminBtn = document.querySelector('button.nav-button[data-target="admin"]');
  if (navAdminBtn) {
    navAdminBtn.classList.toggle("is-hidden", !isAuthorizedToAdmin);
    navAdminBtn.setAttribute("aria-label", supervisorSession ? "Supervisar" : "Administracion");
  }
  const tabAdminBtn = document.querySelector('.tab-strip button[data-target="admin"]');
  if (tabAdminBtn) {
    tabAdminBtn.classList.toggle("is-hidden", !isAuthorizedToAdmin);
  }
  if (els.adminNavLabel) els.adminNavLabel.textContent = supervisorSession ? "Supervisar" : "Admin";
  if (els.adminOrganizationsNavLabel) els.adminOrganizationsNavLabel.textContent = supervisorSession ? "Mi sitio" : "Organizaciones";
  if (els.adminOrganizationsNavDescription) els.adminOrganizationsNavDescription.textContent = supervisorSession ? "Configuracion" : "Empresas y sitios";

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
    "Validacion adicional (legado)",
    "Validacion adicional completada (legado)",
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
  if (!hasPermission("manage_records") && !isDemoAdminUnlocked()) {
    showToast("Tu rol no puede modificar registros.");
    return;
  }
  const record = state.records.find((item) => item.id === id);
  if (!record) return;

  const value = prompt(
    `Observacion administrativa para ${record.matricula}:`,
    record.observacion_admin || ""
  );
  if (value === null) return;

  try {
    if (CLOUD_ENABLED) {
      await callAdminRpc(isSupervisorSession() ? "supervisor_update_asistencia_observacion" : "admin_update_observacion_asistencia", isSupervisorSession()
        ? { p_id: id, p_observacion: value.trim() }
        : { p_id: id, p_admin_key: getAdminRpcKey(), p_observacion: value.trim() });
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
  const isHistoricalRecordTable = cell && [els.recordsBody, els.adminRecordsBody].includes(cell.closest("tbody"));
  if (isHistoricalRecordTable) {
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
    if (!hasPermission("delete_records") && !isDemoAdminUnlocked()) {
      showToast("Tu rol no puede eliminar registros.");
      return;
    }
    deleteRecord(button.dataset.id);
  }
}


// Variables del estado de autenticación de la UI
let authMode = "login"; // "login" o "register"
let passwordRecoveryToken = "";

// Función global requerida por auth.js para el redireccionamiento al cerrar sesión
window.onLogoutSuccess = function () {
  state.currentUser = null;
  state.currentAppUser = null;
  state.currentRole = "usuario";
  state.currentPermissions = { ...ROLE_DEFINITIONS.usuario.permissions };
  state.isAdmin = false;
  state.manualAdminUnlocked = false;
  state.attendanceControlFilters = { date: todayIso(), organization: "all", site: "all", status: "all", query: "" };
  if (els.loginView) els.loginView.classList.remove("is-hidden");
  if (els.appShell) els.appShell.classList.add("is-hidden");
};

function showLoginView() {
  authMode = "login";
  if (els.loginView) els.loginView.classList.remove("is-hidden");
  if (els.appShell) els.appShell.classList.add("is-hidden");
  hidePasswordRecoveryView({ clearToken: true });
  updateAuthUI();
}

function showAppShell(user) {
  const keepsPreparedGuest = Boolean(user?.isGuest && state.currentAppUser?.isGuest);
  state.currentUser = user;
  // Cada cuenta inicia con su propia identidad; finishInitialization carga después su rol remoto.
  if (!keepsPreparedGuest) {
    applyAppUserSession(null);
    state.attendanceControlFilters = { date: todayIso(), organization: "all", site: "all", status: "all", query: "" };
  } else {
    renderCurrentUserProfile();
  }

  if (els.loginView) els.loginView.classList.add("is-hidden");
  if (els.appShell) els.appShell.classList.remove("is-hidden");
}

async function initializeAuthenticatedApp(user, { requestPermissions = false } = {}) {
  showAppShell(user);

  // Una cuenta nueva necesita primero su fila en usuarios_app. La RPC de
  // sesion operativa requiere esa fila y por eso se activa despues.
  const appUser = await loadCurrentAppUser({
    silent: true,
    throwOnError: true,
    loadSiteScopes: false,
  });
  if (!appUser && !isKnownSuperadminEmail(user?.email)) {
    throw new Error("No se pudo completar la afiliacion de tu cuenta con el sitio seleccionado.");
  }

  prepareOperationalSession({ rotate: true });
  await activateOperationalSession();
  await finishInitialization({ requestPermissions });
  return appUser;
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
  await finishInitialization({ requestPermissions: false });
  showToast("Modo operativo activo. Puedes registrar entrada y salida sin cuenta confirmada.");
}
async function loadOrganizationOptions() {
  if (!els.authOrgSelect) return;
  const selected = "";
  state.registrationAffiliations = [];

  const showFallback = () => {
    els.authOrgSelect.innerHTML = `<option value="">Directorio no disponible</option>`;
    if (els.authOrgSelectFallbackWrap) {
      els.authOrgSelectFallbackWrap.classList.remove("is-hidden");
    }
    updateRegistrationSiteOptions();
  };

  if (!CLOUD_ENABLED) {
    showFallback();
    return;
  }

  els.authOrgSelect.innerHTML = `<option value="">Cargando organizaciones\u2026</option>`;
  if (els.authSiteSelect) {
    els.authSiteSelect.innerHTML = `<option value="">Primero selecciona una organización</option>`;
    els.authSiteSelect.disabled = true;
  }

  try {
    let rows;
    try {
      rows = await supabaseRequest("/rest/v1/rpc/get_public_affiliation_options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch (error) {
      const legacyRows = await supabaseRequest("/rest/v1/rpc/get_public_organization_options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      rows = (Array.isArray(legacyRows) ? legacyRows : []).map((org) => ({
        organization_id: "",
        organization_slug: org.slug,
        organization_name: org.nombre,
        organization_type: org.tipo,
        site_id: `legacy-${org.slug}`,
        site_name: "Sitio principal",
      }));
    }

    const affiliations = Array.isArray(rows) ? rows.filter((row) => row?.organization_slug) : [];

    if (authMode !== "register") return;

    if (!affiliations.length) {
      showFallback();
      return;
    }

    state.registrationAffiliations = affiliations;
    const organizations = Array.from(new Map(affiliations.map((row) => [row.organization_slug, row])).values());
    const options = organizations.map((org) => {
      const slug = String(org.organization_slug || "").trim();
      return `<option value="${escapeHtml(slug)}" ${slug === selected ? "selected" : ""}>${escapeHtml(org.organization_name || "Organización")}</option>`;
    });

    els.authOrgSelect.innerHTML = `<option value="">Selecciona una organización</option>${options.join("")}`;
    if (els.authOrgSelectFallbackWrap) {
      els.authOrgSelectFallbackWrap.classList.add("is-hidden");
    }
    updateRegistrationSiteOptions({ preserveSelection: true });
  } catch (error) {
    if (authMode !== "register") return;
    console.warn("No se pudo cargar el directorio público de afiliación.", error);
    showFallback();
  }
}

function updateRegistrationSiteOptions({ preserveSelection = false } = {}) {
  if (!els.authSiteSelect) return;

  if (authMode !== "register") {
    els.labelSiteSelect?.classList.add("is-hidden");
    els.authSiteSelect.disabled = true;
    return;
  }

  const organizationSlug = els.authOrgSelect?.value.trim() || "";
  const previousSite = preserveSelection ? localStorage.getItem("registro_asistencia_site_id") || "" : "";
  const sites = state.registrationAffiliations.filter((row) => (
    row.organization_slug === organizationSlug && row.site_id && row.site_name
  ));

  if (!organizationSlug) {
    els.authSiteSelect.innerHTML = `<option value="">Primero selecciona una organización</option>`;
    els.authSiteSelect.disabled = true;
    els.labelSiteSelect?.classList.add("is-hidden");
    return;
  }

  els.labelSiteSelect?.classList.remove("is-hidden");

  if (!sites.length) {
    els.authSiteSelect.innerHTML = `<option value="">Esta organización aún no tiene sitios activos</option>`;
    els.authSiteSelect.disabled = true;
    return;
  }

  const options = sites.map((site) => {
    const siteId = String(site.site_id || "");
    const selectedSite = siteId === previousSite ? "selected" : "";
    const metadataId = siteId.startsWith("legacy-") ? "" : siteId;
    return `<option value="${escapeHtml(siteId)}" data-site-id="${escapeHtml(metadataId)}" data-site-name="${escapeHtml(site.site_name)}" ${selectedSite}>${escapeHtml(site.site_name)}</option>`;
  });
  els.authSiteSelect.innerHTML = `<option value="">Selecciona un sitio</option>${options.join("")}`;
  els.authSiteSelect.disabled = false;
}

function selectedRegistrationSite() {
  const option = els.authSiteSelect?.selectedOptions?.[0];
  return {
    value: els.authSiteSelect?.value || "",
    id: option?.dataset.siteId || "",
    name: option?.dataset.siteName || "",
  };
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
function setPasswordRecoveryStatus(message = "", tone = "info") {
  if (!els.passwordRecoveryStatus) return;
  els.passwordRecoveryStatus.textContent = message;
  els.passwordRecoveryStatus.dataset.tone = tone;
  els.passwordRecoveryStatus.classList.toggle("is-hidden", !message);
}

function showPasswordRecoveryView(mode = "request", message = "") {
  const isReset = mode === "reset";
  if (els.loginView) els.loginView.classList.remove("is-hidden");
  if (els.appShell) els.appShell.classList.add("is-hidden");
  els.authToggleBar?.classList.add("is-hidden");
  els.authForm?.classList.add("is-hidden");
  els.passwordRecoveryPanel?.classList.remove("is-hidden");
  els.passwordRecoveryRequestForm?.classList.toggle("is-hidden", isReset);
  els.passwordRecoveryResetForm?.classList.toggle("is-hidden", !isReset);

  if (els.loginTitle) els.loginTitle.textContent = isReset ? "Crea una contraseña nueva" : "Recupera tu cuenta";
  if (els.loginSubtitle) {
    els.loginSubtitle.textContent = isReset
      ? "Elige una contraseña segura para volver a ingresar."
      : "Recibirás un enlace de recuperación en tu correo.";
  }

  const prefilledEmail = els.authEmail?.value.trim() || "";
  if (!isReset && els.passwordRecoveryEmail && prefilledEmail.includes("@")) {
    els.passwordRecoveryEmail.value = prefilledEmail;
  }
  setPasswordRecoveryStatus(message, message ? "error" : "info");
  window.setTimeout(() => {
    (isReset ? els.passwordRecoveryNewPassword : els.passwordRecoveryEmail)?.focus();
  }, 0);
}

function hidePasswordRecoveryView({ clearToken = true } = {}) {
  if (clearToken) passwordRecoveryToken = "";
  els.passwordRecoveryPanel?.classList.add("is-hidden");
  els.authToggleBar?.classList.remove("is-hidden");
  els.authForm?.classList.remove("is-hidden");
  els.passwordRecoveryRequestForm?.reset();
  els.passwordRecoveryResetForm?.reset();
  setPasswordRecoveryStatus();
}

function consumePasswordRecoveryContext() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  const type = hashParams.get("type") || queryParams.get("type") || "";
  const token = hashParams.get("access_token") || "";
  const error = hashParams.get("error_description") || queryParams.get("error_description") || "";
  const errorCode = hashParams.get("error_code") || queryParams.get("error_code") || "";
  const isRecovery = type === "recovery" || Boolean(token && window.location.hash.includes("recovery")) || Boolean(errorCode);
  if (!isRecovery) return null;

  // El token de recuperación no debe permanecer visible ni guardarse en storage.
  const cleanQuery = new URLSearchParams(window.location.search);
  ["type", "error", "error_code", "error_description", "code"].forEach((key) => cleanQuery.delete(key));
  const query = cleanQuery.toString();
  history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);

  return {
    token,
    error: error
      ? "El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo."
      : "",
  };
}

async function handlePasswordRecoveryRequest(event) {
  event.preventDefault();
  const email = els.passwordRecoveryEmail?.value.trim().toLowerCase() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setPasswordRecoveryStatus("Escribe un correo electrónico válido.", "error");
    els.passwordRecoveryEmail?.focus();
    return;
  }

  const button = els.passwordRecoveryRequestSubmit;
  const originalText = button?.textContent || "Enviar enlace";
  if (button) {
    button.disabled = true;
    button.textContent = "Enviando...";
  }
  setPasswordRecoveryStatus();

  try {
    const redirectUrl = new URL(window.location.href);
    redirectUrl.search = "";
    redirectUrl.hash = "";
    await solicitarRecuperacion(email, redirectUrl.toString());
    setPasswordRecoveryStatus(
      "Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.",
      "success"
    );
  } catch (error) {
    setPasswordRecoveryStatus(error.message || "No se pudo enviar el enlace. Intenta de nuevo.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function handlePasswordRecoveryReset(event) {
  event.preventDefault();
  const password = els.passwordRecoveryNewPassword?.value || "";
  const confirmation = els.passwordRecoveryConfirmPassword?.value || "";

  if (password.length < 8) {
    setPasswordRecoveryStatus("La nueva contraseña debe tener al menos 8 caracteres.", "error");
    els.passwordRecoveryNewPassword?.focus();
    return;
  }
  if (password !== confirmation) {
    setPasswordRecoveryStatus("Las contraseñas no coinciden.", "error");
    els.passwordRecoveryConfirmPassword?.focus();
    return;
  }

  const button = els.passwordRecoveryResetSubmit;
  const originalText = button?.textContent || "Guardar contraseña";
  if (button) {
    button.disabled = true;
    button.textContent = "Guardando...";
  }
  setPasswordRecoveryStatus();

  try {
    await actualizarPasswordRecuperacion(passwordRecoveryToken, password);
    passwordRecoveryToken = "";
    authMode = "login";
    hidePasswordRecoveryView();
    updateAuthUI();
    if (els.authPassword) els.authPassword.value = "";
    showToast("Contraseña actualizada. Ya puedes iniciar sesión.");
    els.authEmail?.focus();
  } catch (error) {
    setPasswordRecoveryStatus(error.message || "No se pudo actualizar la contraseña.", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function updateAuthUI() {
  if (!els.labelName || !els.labelMatricula || !els.loginTitle || !els.loginSubtitle || !els.authSubmitBtn) return;
  els.forgotPasswordBtn?.classList.toggle("is-hidden", authMode !== "login");

  if (authMode === "login") {
    // LOGIN: solo correo/teléfono + contraseña
    els.labelName.classList.add("is-hidden");
    els.labelMatricula.classList.add("is-hidden");
    els.labelPhone?.classList.add("is-hidden");
    els.labelOrgSelect?.classList.add("is-hidden");
    els.labelSiteSelect?.classList.add("is-hidden");
    els.labelOrgKey?.classList.add("is-hidden");
    els.authOrgKeyWrap?.classList.add("is-hidden");
    els.authName.required = false;
    els.authMatricula.required = false;
    if (els.authOrgKey) els.authOrgKey.required = false;
    if (els.authPhone) els.authPhone.required = false;
    if (els.authOrgSelect) {
      els.authOrgSelect.required = false;
      els.authOrgSelect.value = "";
    }
    if (els.authSiteSelect) {
      els.authSiteSelect.required = false;
      els.authSiteSelect.disabled = true;
      els.authSiteSelect.innerHTML = `<option value="">Primero selecciona una organización</option>`;
    }
    els.loginTitle.textContent = "Iniciar Sesión";
    els.loginSubtitle.textContent = "Ingresa rápido con tu correo o número de teléfono.";
    els.authSubmitBtn.textContent = "Ingresar";
    if (els.authPassword) els.authPassword.autocomplete = "current-password";
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
    els.labelSiteSelect?.classList.add("is-hidden");
    els.authOrgKeyWrap?.classList.remove("is-hidden");
    els.labelOrgKey?.classList.add("is-hidden"); // empieza colapsado
    els.authName.required = true;
    els.authMatricula.required = true;
    if (els.authOrgKey) els.authOrgKey.required = false;
    if (els.authPhone) els.authPhone.required = false;
    // La validacion se resuelve al enviar: una invitacion ORG-ADMIN no tiene
    // organizacion ni sitio hasta que el nuevo admin cree su espacio.
    if (els.authOrgSelect) els.authOrgSelect.required = false;
    if (els.authSiteSelect) els.authSiteSelect.required = false;
    els.loginTitle.textContent = "Registrarse";
    els.loginSubtitle.textContent = "Crea tu cuenta para registrar asistencia.";
    els.authSubmitBtn.textContent = "Crear Cuenta";
    if (els.authPassword) els.authPassword.autocomplete = "new-password";
    els.toggleLoginBtn.classList.remove("active");
    els.toggleRegisterBtn.classList.add("active");
    if (els.labelEmailText) els.labelEmailText.textContent = "Correo electrónico";
    if (els.labelEmailHint) els.labelEmailHint.textContent = "Necesario para confirmar tu cuenta y recibir notificaciones.";
    loadOrganizationOptions();
  }
}

function bindSensitiveFieldVisibilityToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    const input = document.getElementById(button.dataset.passwordToggle);
    if (!input || button.dataset.visibilityBound === "true") return;

    button.dataset.visibilityBound = "true";
    button.setAttribute("aria-controls", input.id);
    button.addEventListener("click", () => {
      const revealed = input.type === "password";
      const subject = (button.getAttribute("aria-label") || "valor").replace(/^(Mostrar|Ocultar)\s+/i, "");

      input.type = revealed ? "text" : "password";
      button.classList.toggle("is-revealed", revealed);
      button.setAttribute("aria-pressed", String(revealed));
      button.setAttribute("aria-label", `${revealed ? "Ocultar" : "Mostrar"} ${subject}`);
      button.setAttribute("title", `${revealed ? "Ocultar" : "Mostrar"} ${subject}`);
    });
  });
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const rawInput = els.authEmail.value.trim();
  const password = els.authPassword.value;
  const orgSlug = selectedOrganizationSlug();
  if (orgSlug) localStorage.setItem("registro_asistencia_org_slug", orgSlug);

  if (!rawInput || password.length === 0) {
    showToast("Por favor completa los campos obligatorios.");
    return;
  }

  // Detectar si el input es teléfono o email
  const isPhone = isPhoneInput(rawInput);
  const email = isPhone ? buildEmailFromPhone(rawInput) : rawInput.toLowerCase();

  els.authSubmitBtn.disabled = true;
  const originalText = els.authSubmitBtn.textContent;
  els.authSubmitBtn.textContent = authMode === "login" ? "Ingresando..." : "Registrando...";
  let accountCreated = false;

  try {
    if (authMode === "login") {
      await iniciarSesion(email, password);
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
        // Un login no vuelve a abrir los permisos que ya concedio el usuario.
        await initializeAuthenticatedApp(user, { requestPermissions: false });
      } else {
        throw new Error("No se pudo obtener el usuario después del inicio de sesión.");
      }
    } else {
      const nombre = els.authName.value.trim();
      const matricula = els.authMatricula.value.trim();
      const phone = els.authPhone?.value.trim() || "";
      const registrationSite = selectedRegistrationSite();
      const orgKey = els.authOrgKey?.value.trim() || "";
      const isOrganizationAdminInvite = orgKey.toUpperCase().startsWith("ORG-ADMIN-");

      if (!nombre || !matricula) {
        showToast("Nombre e identificador son requeridos para el registro.");
        els.authSubmitBtn.disabled = false;
        els.authSubmitBtn.textContent = originalText;
        return;
      }
      if (!isValidPersonName(nombre)) {
        showToast("El nombre es obligatorio y solo puede contener letras y espacios.");
        els.authName.focus();
        els.authSubmitBtn.disabled = false;
        els.authSubmitBtn.textContent = originalText;
        return;
      }
      if (!isOrganizationAdminInvite && (!orgSlug || !registrationSite.value)) {
        showToast("Selecciona primero tu organización y después tu sitio.");
        (!orgSlug ? els.authOrgSelect : els.authSiteSelect)?.focus();
        els.authSubmitBtn.disabled = false;
        els.authSubmitBtn.textContent = originalText;
        return;
      }

      if (orgKey) localStorage.setItem("registro_asistencia_org_key", orgKey);
      if (registrationSite.value) localStorage.setItem("registro_asistencia_site_id", registrationSite.value);
      const data = await crearCuenta(email, password, nombre, matricula, orgKey, orgSlug, phone, registrationSite.id, registrationSite.name);
      accountCreated = Boolean(data?.user || data?.session || data?.access_token);
      const signupToken = data?.access_token || data?.session?.access_token;

      if (signupToken) {
        const user = await verificarSesion();
        if (user) {
          if (isPhone) showEmailNudgePanel(true);
          await initializeAuthenticatedApp(user, { requestPermissions: true });
          showToast("¡Cuenta creada! Bienvenido.");
        } else {
          throw new Error("La cuenta se creo, pero no se pudo recuperar la sesion inicial.");
        }
      } else {
        showToast("Cuenta creada. Revisa tu correo para confirmar antes de iniciar sesión, o usa modo operativo.");
        authMode = "login";
        updateAuthUI();
        els.authPassword.value = "";
      }
    }
  } catch (error) {
    if (authMode === "register" && accountCreated) {
      clearSession();
      showLoginView();
      showToast("Tu cuenta fue creada, pero no se pudo completar su vinculacion. Intenta iniciar sesion; si continua, contacta al administrador del sitio.");
    } else {
      showToast(error.message || "Ocurrió un error inesperado.");
    }
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
  if (!isValidPersonName(nombre)) {
    showToast("El nombre es obligatorio y solo puede contener letras y espacios.");
    els.profileName.focus();
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
  setFaceStatus(els.entryFaceStatus, "Preparando la cámara.", "pending");
  setFaceStatus(els.exitFaceStatus, "Preparando la cámara.", "pending");
  syncCaptureControls();
  updateHeaderStatus({ force: true });
  // Solo cargar usuario desde Supabase si no estamos en modo operativo guest
  const isGuestMode = state.currentAppUser?.isGuest || state.currentUser?.isGuest;
  if (!isGuestMode) {
    await loadCurrentAppUser({ silent: true });
  }
  await loadPersistentAvatar();
  await syncPermissionState();
  loadAttendanceStreak({ silent: true });
  await loadActiveSite({ silent: true });
  await loadOrganizationContext({ silent: true });
  if (canUseOperationsPanel() && !state.recordFilters.date) {
    const today = todayIso();
    state.recordFilters.date = today;
    if (els.filterDate) els.filterDate.value = today;
    if (els.adminFilterDate) els.adminFilterDate.value = today;
  }
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
  await evaluateAttendanceReminders();
  openPendingAttendanceRoute();
}

function bindAdminPanelControls() {
  if (document.documentElement.dataset.adminPanelControlsBound === "true") return;
  document.documentElement.dataset.adminPanelControlsBound = "true";

  document.addEventListener("click", (event) => {
    const sectionButton = event.target.closest("[data-admin-section-target]");
    if (sectionButton) {
      event.preventDefault();
      showAdminSection(sectionButton.dataset.adminSectionTarget);
      return;
    }
    const userViewButton = event.target.closest("[data-admin-user-view]");
    if (userViewButton) {
      state.adminUserDirectoryView = userViewButton.dataset.adminUserView === "assigned" ? "assigned" : "unassigned";
      renderAdminUsersSection(getVisibleRecords());
      return;
    }
    const editUserScopeButton = event.target.closest("[data-edit-user-scope]");
    if (editUserScopeButton) {
      const userId = editUserScopeButton.dataset.editUserScope || "";
      const user = state.managedUsers.find((candidate) => String(candidate.id) === String(userId));
      if (els.userScopeAction) {
        const role = normalizeAppRole(user?.rol);
        els.userScopeAction.value = role === "admin" && normalizeAppRole(state.currentRole) === "superadmin"
          ? "change_role"
          : role === "supervisor"
            ? "make_supervisor"
            : user?.sitio_id ? "change_site" : "assign_site";
      }
      populateUserScopeAssignment();
      if (els.userScopeUser) els.userScopeUser.value = userId;
      populateUserScopeAssignment();
      els.userScopeAssignmentCard?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const deactivateUserButton = event.target.closest("[data-deactivate-user]");
    if (deactivateUserButton) {
      deactivateManagedUser(deactivateUserButton.dataset.deactivateUser || "");
      return;
    }
    const reactivateUserButton = event.target.closest("[data-reactivate-user]");
    if (reactivateUserButton) {
      reactivateManagedUser(reactivateUserButton.dataset.reactivateUser || "");
      return;
    }
    const purgeUserButton = event.target.closest("[data-purge-user]");
    if (purgeUserButton) {
      purgeManagedUser(purgeUserButton.dataset.purgeUser || "");
      return;
    }
    const sitePeopleToggle = event.target.closest("[data-site-people-toggle]");
    if (sitePeopleToggle) {
      const overflow = document.getElementById(sitePeopleToggle.getAttribute("aria-controls") || "");
      const expanded = sitePeopleToggle.getAttribute("aria-expanded") === "true";
      overflow?.classList.toggle("is-hidden", expanded);
      sitePeopleToggle.setAttribute("aria-expanded", String(!expanded));
      sitePeopleToggle.textContent = expanded ? `Ver ${overflow?.children.length || 0} mas` : "Ocultar usuarios";
      return;
    }
    if (event.target.closest("[data-assign-unassigned-users]")) {
      if (els.userScopeAction) els.userScopeAction.value = "assign_site";
      populateUserScopeAssignment();
      els.userScopeAssignmentCard?.scrollIntoView({ behavior: "smooth", block: "start" });
      els.userScopeUser?.focus({ preventScroll: true });
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target === els.adminUsersOrganizationFilter || target === els.userScopeOrganization) {
      setSelectedUserScopeOrganization(target.value);
      setUserScopeStatus("Selecciona un usuario y su sitio de destino.", "warning");
      populateUserScopeAssignment();
      renderAdminUsersSection(getVisibleRecords());
      return;
    }
    if (target === els.userScopeAction || target === els.userScopeUser || target === els.userScopeSite || target === els.userScopeRole) {
      setUserScopeStatus(getUserScopeActionCopy(getUserScopeAction()).status, "warning");
      populateUserScopeAssignment();
      return;
    }
  });
}

function bindUserScopeAssignmentControls() {
  if (document.documentElement.dataset.userScopeControlsBound === "true") return;
  document.documentElement.dataset.userScopeControlsBound = "true";
  els.assignUserScopeButton?.addEventListener("click", assignUserScope);
}

async function init() {
  console.log("Inicializando manejadores y eventos de la aplicación...");

  setupPwaInstall();

  [els.authName, els.profileName].filter(Boolean).forEach((input) => {
    input.addEventListener("input", () => {
      const sanitized = sanitizePersonName(input.value);
      if (input.value !== sanitized) input.value = sanitized;
    });
    input.addEventListener("blur", () => {
      input.value = input.value.trim().replace(/\s+/g, " ");
    });
  });

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
  if (els.removeProfileAvatar) {
    els.removeProfileAvatar.addEventListener("click", () => removeLocalAvatar());
  }
  els.avatarCropZoom?.addEventListener("input", () => {
    avatarCropState.zoom = Number(els.avatarCropZoom.value);
    renderAvatarCrop();
  });
  els.avatarCropReset?.addEventListener("click", resetAvatarCrop);
  els.avatarCropCancel?.addEventListener("click", closeAvatarCropEditor);
  els.avatarCropCancelIcon?.addEventListener("click", closeAvatarCropEditor);
  els.avatarCropSave?.addEventListener("click", saveAdjustedAvatar);
  els.avatarCropModal?.addEventListener("click", (event) => {
    if (event.target === els.avatarCropModal) closeAvatarCropEditor();
  });
  els.avatarCropFrame?.addEventListener("pointerdown", (event) => {
    avatarCropState.pointerId = event.pointerId;
    avatarCropState.pointerX = event.clientX;
    avatarCropState.pointerY = event.clientY;
    els.avatarCropFrame.setPointerCapture(event.pointerId);
    els.avatarCropFrame.classList.add("is-dragging");
  });
  els.avatarCropFrame?.addEventListener("pointermove", (event) => {
    if (avatarCropState.pointerId !== event.pointerId) return;
    avatarCropState.x += event.clientX - avatarCropState.pointerX;
    avatarCropState.y += event.clientY - avatarCropState.pointerY;
    avatarCropState.pointerX = event.clientX;
    avatarCropState.pointerY = event.clientY;
    renderAvatarCrop();
  });
  const finishAvatarDrag = (event) => {
    if (avatarCropState.pointerId !== event.pointerId) return;
    avatarCropState.pointerId = null;
    els.avatarCropFrame?.classList.remove("is-dragging");
  };
  els.avatarCropFrame?.addEventListener("pointerup", finishAvatarDrag);
  els.avatarCropFrame?.addEventListener("pointercancel", finishAvatarDrag);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.avatarCropModal?.classList.contains("is-hidden")) closeAvatarCropEditor();
  });
  [els.headerAvatarImage, els.profileAvatarImage].forEach((image) => {
    image?.addEventListener("error", () => showAvatarFallback());
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
  els.profileNotificationsEnabled?.addEventListener("change", async () => {
    await setAttendanceNotificationsEnabled(els.profileNotificationsEnabled.checked);
  });
  els.attendanceReminderAction?.addEventListener("click", () => openAttendanceView());
  els.repeatAttendanceButton?.addEventListener("click", startPrivilegedAttendanceCycle);
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(NOTIFICATION_SENT_PREFIX) || event.key === notificationPreferenceKey()) {
      loadNotificationPreference();
      evaluateAttendanceReminders();
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
  els.forgotPasswordBtn?.addEventListener("click", () => {
    showPasswordRecoveryView("request");
  });
  els.passwordRecoveryBack?.addEventListener("click", () => {
    authMode = "login";
    hidePasswordRecoveryView();
    updateAuthUI();
    els.authEmail?.focus();
  });
  els.passwordRecoveryRequestForm?.addEventListener("submit", handlePasswordRecoveryRequest);
  els.passwordRecoveryResetForm?.addEventListener("submit", handlePasswordRecoveryReset);
  if (els.authForm) {
    console.log("Vinculando event listener para el submit de #authForm");
    els.authForm.addEventListener("submit", (event) => {
      console.log("¡Formulario de autenticación enviado (submit)!");
      handleAuthSubmit(event);
    });
  }
  els.authOrgSelect?.addEventListener("change", () => {
    localStorage.removeItem("registro_asistencia_site_id");
    updateRegistrationSiteOptions();
  });
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

  bindSensitiveFieldVisibilityToggles();

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
  if (els.switchEntryCamera) els.switchEntryCamera.addEventListener("click", () => switchAttendanceCamera("entry"));
  if (els.takeEntryPhoto) els.takeEntryPhoto.addEventListener("click", () => captureAndSaveAttendance("entry"));
  if (els.retakeEntryPhoto) els.retakeEntryPhoto.addEventListener("click", () => retakeAttendancePhoto("entry"));
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
  if (els.switchExitCamera) els.switchExitCamera.addEventListener("click", () => switchAttendanceCamera("exit"));
  if (els.takeExitPhoto) els.takeExitPhoto.addEventListener("click", () => captureAndSaveAttendance("exit"));
  if (els.retakeExitPhoto) els.retakeExitPhoto.addEventListener("click", () => retakeAttendancePhoto("exit"));
  if (els.exitForm) els.exitForm.addEventListener("submit", handleExitSubmit);

  if (els.unlockAdmin) els.unlockAdmin.addEventListener("click", requestAdminAccess);
  if (els.lockAdmin) els.lockAdmin.addEventListener("click", lockAdmin);
  if (els.exportCsv) els.exportCsv.addEventListener("click", exportCsv);
  if (els.clearRecords) els.clearRecords.addEventListener("click", clearRecords);
  if (els.recordsBody) els.recordsBody.addEventListener("click", handleRecordAction);
  if (els.adminRecordsBody) els.adminRecordsBody.addEventListener("click", handleRecordAction);
  if (els.recordsMobileCards) els.recordsMobileCards.addEventListener("click", handleRecordAction);
  if (els.attendanceControlCards) els.attendanceControlCards.addEventListener("click", handleRecordAction);
  if (els.attendanceControlTableBody) els.attendanceControlTableBody.addEventListener("click", handleRecordAction);
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
  if (els.createOrganizationAdminInvite) els.createOrganizationAdminInvite.addEventListener("click", createOrganizationAdminInvite);
  if (els.copyOrganizationAdminInvite) els.copyOrganizationAdminInvite.addEventListener("click", copyOrganizationAdminInvite);
  bindAdminPanelControls();

  document.querySelectorAll(".ops-filters").forEach((form) => {
    form.addEventListener("submit", (event) => event.preventDefault());
  });

  const syncFilterControls = (sourceEl) => {
    if (!sourceEl) return;
    const map = {
      "filterDate": "adminFilterDate",
      "filterStatus": "adminFilterStatus",
      "filterOrganization": "adminAttendanceOrganizationFilter",
      "filterRisk": "adminFilterRisk",
      "filterSite": "adminFilterSite",
      "filterUser": "adminFilterUser",
      "filterSearch": "adminFilterSearch",
      "adminFilterDate": "filterDate",
      "adminFilterStatus": "filterStatus",
      "adminAttendanceOrganizationFilter": "filterOrganization",
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

  [els.filterOrganization, els.adminAttendanceOrganizationFilter].filter(Boolean).forEach((organizationFilter) => {
    organizationFilter.addEventListener("change", () => {
      const organizationId = organizationFilter.value || "all";
      [els.filterOrganization, els.adminAttendanceOrganizationFilter].filter(Boolean).forEach((select) => {
        if (select !== organizationFilter) select.value = organizationId;
      });
      state.recordFilters.organization = organizationId;
      if (els.filterSite) els.filterSite.value = "all";
      if (els.adminFilterSite) els.adminFilterSite.value = "all";
      if (els.filterUser) els.filterUser.value = "all";
      if (els.adminFilterUser) els.adminFilterUser.value = "all";
      populateDashboardFilterSelects();
      renderRecords();
    });
  });

  if (els.clearDashboardFilters) els.clearDashboardFilters.addEventListener("click", resetDashboardFilters);
  if (els.adminClearDashboardFilters) els.adminClearDashboardFilters.addEventListener("click", resetDashboardFilters);

  const attendanceControlInputs = [
    els.attendanceControlDate,
    els.attendanceControlOrganization,
    els.attendanceControlSite,
    els.attendanceControlStatus,
    els.attendanceControlSearch,
  ].filter(Boolean);
  attendanceControlInputs.forEach((input) => {
    input.addEventListener(input.tagName === "INPUT" ? "input" : "change", () => {
      state.attendanceControlFilters.date = els.attendanceControlDate?.value || todayIso();
      state.attendanceControlFilters.organization = els.attendanceControlOrganization?.value || "all";
      state.attendanceControlFilters.site = els.attendanceControlSite?.value || "all";
      state.attendanceControlFilters.status = els.attendanceControlStatus?.value || "all";
      state.attendanceControlFilters.query = els.attendanceControlSearch?.value || "";
      if (input === els.attendanceControlOrganization) state.attendanceControlFilters.site = "all";
      renderAttendanceControl();
      syncDashboardFiltersFromUi();
      renderRecords();
    });
  });
  els.attendanceControlTabs?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-attendance-status]");
    if (!button) return;
    state.attendanceControlFilters.status = button.dataset.attendanceStatus || "all";
    if (els.attendanceControlStatus) els.attendanceControlStatus.value = state.attendanceControlFilters.status;
    renderAttendanceControl();
    syncDashboardFiltersFromUi();
    renderRecords();
  });
  document.querySelector(".attendance-control-filters")?.addEventListener("submit", (event) => event.preventDefault());
  if (els.attendanceControlReset) els.attendanceControlReset.addEventListener("click", () => {
    const scope = attendanceControlScope();
    state.attendanceControlFilters = { date: todayIso(), organization: scope.canChooseOrganization ? "all" : (scope.organizationId || "all"), site: scope.siteIds.length === 1 ? scope.siteIds[0] : "all", status: "all", query: "" };
    renderAttendanceControl();
    syncDashboardFiltersFromUi();
    renderRecords();
  });

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

  setInterval(() => {
    if (!state.currentUser?.isGuest && state.currentUser && CLOUD_ENABLED) {
      callAdminRpc("verify_active_app_session", {}).catch(() => {});
    }
  }, APP_SESSION_HEARTBEAT_MS);

  setInterval(() => {
    if (state.currentUser) evaluateAttendanceReminders();
  }, 60000);

  setupPwaInstall();
  setupConnectionStatus();
  loadOrganizationOptions();
  updatePwaInstallUi();

  // 5. Verificar sesion activa
  console.log("Verificando sesión activa de Supabase...");
  const recoveryContext = consumePasswordRecoveryContext();
  if (recoveryContext) {
    clearSession();
    passwordRecoveryToken = recoveryContext.token;
    showPasswordRecoveryView(
      recoveryContext.token ? "reset" : "request",
      recoveryContext.error || (recoveryContext.token ? "" : "El enlace de recuperación no es válido. Solicita uno nuevo.")
    );
    return;
  }

  verificarSesion().then(async (user) => {
    if (user) {
      console.log("Sesión activa recuperada para:", user.email);
      prepareOperationalSession();
      await activateOperationalSession();
      showAppShell(user);
      await finishInitialization();
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
  bindAdminPanelControls();
  bindUserScopeAssignmentControls();
  init();
});
