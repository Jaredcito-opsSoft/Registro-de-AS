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
  const key = window.SUPABASE_CONFIG.publishableKey;
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${token || key}`,
  };
}

async function parseAuthResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function authErrorMessage(data, fallback) {
  return data.error_description || data.error || data.msg || data.message || fallback;
}

async function crearCuenta(email, password, nombre, matricula) {
  assertSupabaseAuthConfig();
  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/signup`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email,
        password,
        data: {
          nombre,
          matricula,
          rol: "usuario",
        },
      }),
    });

    const data = await parseAuthResponse(response);

    if (!response.ok) {
      const message = authErrorMessage(data, "Error al crear la cuenta.");
      if (data.error_code === "email_address_invalid") {
        throw new Error("El correo no fue aceptado por Supabase. Usa un correo real para crear la cuenta o entra en modo operativo.");
      }
      throw new Error(message);
    }

    const token = data.access_token || data.session?.access_token;
    if (token) localStorage.setItem("registro_asistencia_token", token);
    return data;
  } catch (error) {
    console.error("Error en crearCuenta:", error);
    throw error;
  }
}

async function iniciarSesion(email, password) {
  assertSupabaseAuthConfig();
  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });

    const data = await parseAuthResponse(response);

    if (!response.ok) {
      const message = authErrorMessage(data, "Error al iniciar sesion.");
      if (data.error_code === "email_not_confirmed" || /not confirmed/i.test(message)) {
        throw new Error("Tu cuenta fue creada, pero falta confirmar el correo antes de iniciar sesion.");
      }
      if (response.status === 400) {
        throw new Error("Credenciales invalidas o correo sin confirmar. Verifica tus datos o usa modo operativo temporal.");
      }
      throw new Error(message);
    }

    if (data.access_token) localStorage.setItem("registro_asistencia_token", data.access_token);
    return data;
  } catch (error) {
    console.error("Error en iniciarSesion:", error);
    throw error;
  }
}

async function cerrarSesion() {
  const token = localStorage.getItem("registro_asistencia_token");
  localStorage.removeItem("registro_asistencia_token");

  if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && token) {
    const url = `${window.SUPABASE_CONFIG.url}/auth/v1/logout`;
    try {
      await fetch(url, {
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

  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/user`;

  try {
    const response = await fetch(url, {
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