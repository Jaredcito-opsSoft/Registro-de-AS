/**
 * auth.js
 * Autenticacion directa contra Supabase Auth sin SDK.
 */

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
    return "Credenciales invalidas. Verifica tu correo y contrasena.";
  }

  if (normalized.includes("email_address_invalid") || normalized.includes("invalid email")) {
    return "El correo no es valido para Supabase Auth. Usa un correo real o un dominio permitido.";
  }

  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "Ese correo ya esta registrado. Intenta iniciar sesion.";
  }

  return raw || fallback;
}

async function crearCuenta(email, password, nombre, matricula, organizationKey = "") {
  assertSupabaseAuthConfig();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanNombre = String(nombre || "").trim();
  const cleanMatricula = String(matricula || "").trim();
  const cleanOrganizationKey = String(organizationKey || "").trim();

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
      },
    }),
  });

  const data = await parseAuthResponse(response);

  if (!response.ok) {
    throw new Error(authErrorMessage(data, "Error al crear la cuenta."));
  }

  const token = data.access_token || data.session?.access_token;
  if (token) localStorage.setItem("registro_asistencia_token", token);
  return data;
}

async function iniciarSesion(email, password) {
  assertSupabaseAuthConfig();
  const cleanEmail = String(email || "").trim().toLowerCase();

  const response = await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: cleanEmail, password }),
  });

  const data = await parseAuthResponse(response);

  if (!response.ok) {
    throw new Error(authErrorMessage(data, "Error al iniciar sesion."));
  }

  if (data.access_token) localStorage.setItem("registro_asistencia_token", data.access_token);
  return data;
}

async function cerrarSesion() {
  const token = localStorage.getItem("registro_asistencia_token");
  localStorage.removeItem("registro_asistencia_token");

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
  const token = localStorage.getItem("registro_asistencia_token");
  if (!token) return null;

  try {
    const response = await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/user`, {
      method: "GET",
      headers: authHeaders(token),
    });

    if (!response.ok) {
      localStorage.removeItem("registro_asistencia_token");
      return null;
    }

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

  const response = await fetch(`${window.SUPABASE_CONFIG.url}/auth/v1/user`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({
      email: String(email || "").trim().toLowerCase(),
      data: {
        nombre: String(nombre || "").trim(),
        matricula: String(matricula || "").trim(),
      },
    }),
  });

  const data = await parseAuthResponse(response);

  if (!response.ok) {
    throw new Error(authErrorMessage(data, "Error al actualizar el perfil."));
  }

  return data;
}

window.crearCuenta = crearCuenta;
window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;
window.verificarSesion = verificarSesion;
window.actualizarPerfil = actualizarPerfil;
