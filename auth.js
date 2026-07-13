/**
 * auth.js
 * Autenticacion directa contra Supabase Auth sin SDK.
 * Soporta sesiones persistentes con refresh_token y TTL de 15 minutos de inactividad.
 */

const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutos de inactividad

function assertSupabaseAuthConfig() {
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.publishableKey) {
    throw new Error("La configuracion de Supabase no esta definida.");
  }
}

function authHeaders(token = "") {
  assertSupabaseAuthConfig();
  const key = window.SUPABASE_CONFIG.publishableKey;
  return {
    "Content-Type": "application/json",
    "apikey": key,
    "Authorization": `Bearer ${token || key}`,
  };
}

async function parseAuthResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function authErrorMessage(data, fallback) {
  const raw = data?.error_description || data?.error || data?.message || "";
  const normalized = String(raw).toLowerCase();

  if (normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed") || normalized.includes("confirm your email")) {
    return "Revisa tu correo para confirmar tu cuenta antes de iniciar sesion, o usa modo operativo temporal.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "Credenciales invalidas. Verifica tus datos e intenta de nuevo.";
  }
  if (normalized.includes("email_address_invalid") || normalized.includes("invalid email")) {
    return "El correo no es valido para Supabase Auth. Usa un correo real o un dominio permitido.";
  }
  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "Ese correo ya esta registrado. Intenta iniciar sesion.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "Demasiados intentos. Espera un momento antes de intentarlo de nuevo.";
  }
  return raw || fallback;
}

/** Guarda access_token, refresh_token y timestamp de actividad */
function saveSession(accessToken, refreshToken) {
  if (accessToken) localStorage.setItem("registro_asistencia_token", accessToken);
  if (refreshToken) localStorage.setItem("registro_asistencia_refresh_token", refreshToken);
  localStorage.setItem("registro_asistencia_session_ts", String(Date.now()));
}

/** Elimina todos los datos de sesion local */
function clearSession() {
  localStorage.removeItem("registro_asistencia_token");
  localStorage.removeItem("registro_asistencia_refresh_token");
  localStorage.removeItem("registro_asistencia_session_ts");
}

/** Verifica si pasaron mas de SESSION_TTL_MS desde la ultima actividad */
function isSessionExpiredByTTL() {
  const ts = parseInt(localStorage.getItem("registro_asistencia_session_ts") || "0", 10);
  if (!ts) return true;
  return Date.now() - ts > SESSION_TTL_MS;
}

/** Actualiza el timestamp de actividad — llamar en cada accion importante del usuario */
function touchSession() {
  if (localStorage.getItem("registro_asistencia_token")) {
    localStorage.setItem("registro_asistencia_session_ts", String(Date.now()));
  }
}

/**
 * Renueva el access_token usando el refresh_token guardado.
 * Retorna los nuevos datos de sesion o null si falla.
 */
async function refrescarSesion() {
  assertSupabaseAuthConfig();
  const refreshToken = localStorage.getItem("registro_asistencia_refresh_token");
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      clearSession();
      return null;
    }

    const data = await parseAuthResponse(response);
    saveSession(data.access_token, data.refresh_token);
    return data;
  } catch (error) {
    console.warn("No se pudo refrescar la sesion:", error);
    clearSession();
    return null;
  }
}

async function crearCuenta(email, password, nombre, matricula, organizationKey = "", organizationSlug = "", phone = "") {
  assertSupabaseAuthConfig();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanNombre = String(nombre || "").trim();
  const cleanMatricula = String(matricula || "").trim();
  const cleanOrganizationKey = String(organizationKey || organizationSlug || "").trim();
  const cleanPhone = String(phone || "").trim();
  if (!/^\p{L}+(?:\s+\p{L}+)*$/u.test(cleanNombre) || cleanNombre.length < 2 || cleanNombre.length > 80) {
    throw new Error("El nombre es obligatorio y solo puede contener letras y espacios.");
  }

  try {
    const response = await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/signup`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email: cleanEmail,
        password,
        data: {
          nombre: cleanNombre,
          matricula: cleanMatricula,
          rol: "usuario",
          organization_key: cleanOrganizationKey,
          ...(cleanPhone ? { telefono: cleanPhone } : {}),
        },
      }),
    });

    const data = await parseAuthResponse(response);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("La clave de Supabase es inválida o no tiene permisos. Revisa supabase-config.js y asegúrate de usar la 'anon key' correcta.");
      }
      const message = authErrorMessage(data, "Error al crear la cuenta.");
      throw new Error(message);
    }

    const token = data.access_token || data.session?.access_token;
    const refresh = data.refresh_token || data.session?.refresh_token;
    saveSession(token, refresh);
    return data;
  } catch (error) {
    console.error("Error en crearCuenta:", error);
    throw error;
  }
}

async function iniciarSesion(email, password) {
  assertSupabaseAuthConfig();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email: cleanEmail, password }),
    });

    const data = await parseAuthResponse(response);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("La clave de Supabase es inválida. Verifica supabase-config.js y usa la 'anon key'.");
      }
      const message = authErrorMessage(data, "Error al iniciar sesion.");
      if (response.status === 400) {
        throw new Error("Credenciales invalidas o correo sin confirmar. Verifica tus datos o usa modo operativo temporal.");
      }
      throw new Error(message);
    }

    saveSession(data.access_token, data.refresh_token);
    return data;
  } catch (error) {
    console.error("Error en iniciarSesion:", error);
    throw error;
  }
}

async function cerrarSesion() {
  const token = localStorage.getItem("registro_asistencia_token");
  clearSession();

  if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && token) {
    try {
      await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/logout`, {
        method: "POST",
        headers: authHeaders(token),
      });
    } catch (error) {
      console.warn("No se pudo invalidar la sesion en el servidor:", error);
    }
  }

  if (typeof onLogoutSuccess === "function") {
    onLogoutSuccess();
  } else {
    document.querySelector(".app-shell")?.classList.add("is-hidden");
    document.getElementById("login-view")?.classList.remove("is-hidden");
  }
}

async function verificarSesion() {
  assertSupabaseAuthConfig();

  // Si paso el TTL de inactividad, intentar refresco con refresh_token
  if (isSessionExpiredByTTL()) {
    const refreshed = await refrescarSesion();
    if (!refreshed) return null;
  }

  const token = localStorage.getItem("registro_asistencia_token");
  if (!token) return null;

  try {
    const response = await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/user`, {
      method: "GET",
      headers: authHeaders(token),
    });

    if (!response.ok) {
      // Token expirado — intentar refresco automatico
      if (response.status === 401) {
        const refreshed = await refrescarSesion();
        if (!refreshed) return null;
        const token2 = localStorage.getItem("registro_asistencia_token");
        if (!token2) return null;
        const response2 = await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/user`, {
          method: "GET",
          headers: authHeaders(token2),
        });
        if (!response2.ok) {
          clearSession();
          return null;
        }
        touchSession();
        return await parseAuthResponse(response2);
      }
      clearSession();
      return null;
    }

    touchSession();
    return await parseAuthResponse(response);
  } catch (error) {
    console.error("Error en verificarSesion:", error);
    return null;
  }
}

async function actualizarPerfil(email, nombre, matricula) {
  assertSupabaseAuthConfig();
  const token = localStorage.getItem("registro_asistencia_token");
  if (!token) throw new Error("No hay una sesion activa para actualizar el perfil.");

  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/user`;
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanNombre = String(nombre || "").trim();
  if (!/^\p{L}+(?:\s+\p{L}+)*$/u.test(cleanNombre) || cleanNombre.length < 2 || cleanNombre.length > 80) {
    throw new Error("El nombre es obligatorio y solo puede contener letras y espacios.");
  }

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({
        email: cleanEmail,
        data: {
          nombre: cleanNombre,
          matricula: String(matricula || "").trim(),
        },
      }),
    });

    const data = await parseAuthResponse(response);

    if (!response.ok) {
      throw new Error(authErrorMessage(data, "Error al actualizar el perfil."));
    }

    touchSession();
    return data;
  } catch (error) {
    console.error("Error en actualizarPerfil:", error);
    throw error;
  }
}

window.crearCuenta = crearCuenta;
window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;
window.verificarSesion = verificarSesion;
window.refrescarSesion = refrescarSesion;
window.actualizarPerfil = actualizarPerfil;
window.touchSession = touchSession;
window.isSessionExpiredByTTL = isSessionExpiredByTTL;
