/**
 * auth.js
 * 
 * Lógica de autenticación para el sistema de control de asistencia.
 * Realiza peticiones directas HTTP a la API de Supabase sin depender de su SDK.
 * Utiliza la configuración global window.SUPABASE_CONFIG.
 */

/**
 * Registra a un nuevo usuario en Supabase con metadata adicional.
 * Realiza un POST a /auth/v1/signup.
 * 
 * @param {string} email - Correo electrónico del usuario.
 * @param {string} password - Contraseña del usuario.
 * @param {string} nombre - Nombre completo del usuario.
 * @param {string} matricula - Matrícula única del usuario.
 * @returns {Promise<object>} - Datos del registro devueltos por Supabase.
 * @throws {Error} - Error si la petición falla o las credenciales no son válidas.
 */
async function crearCuenta(email, password, nombre, matricula) {
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.publishableKey) {
    throw new Error("La configuración de Supabase no está definida en window.SUPABASE_CONFIG.");
  }

  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/signup`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": window.SUPABASE_CONFIG.publishableKey
      },
      body: JSON.stringify({
        email: email,
        password: password,
        data: {
          nombre: nombre,
          matricula: matricula
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || data.error || data.message || "Error al crear la cuenta.");
    }

    // Si el auto-confirm de emails de Supabase está activo, puede retornar una sesión
    if (data.access_token) {
      localStorage.setItem("registro_asistencia_token", data.access_token);
    } else if (data.session && data.session.access_token) {
      localStorage.setItem("registro_asistencia_token", data.session.access_token);
    }

    return data;
  } catch (error) {
    console.error("Error en crearCuenta:", error);
    throw error;
  }
}

/**
 * Inicia sesión con correo y contraseña en Supabase.
 * Realiza un POST a /auth/v1/token?grant_type=password.
 * Si tiene éxito, guarda el access_token en localStorage.
 * 
 * @param {string} email - Correo electrónico del usuario.
 * @param {string} password - Contraseña del usuario.
 * @returns {Promise<object>} - Datos de sesión devueltos por Supabase.
 * @throws {Error} - Error si faltan las credenciales, si la configuración es incorrecta o si falla la petición.
 */
async function iniciarSesion(email, password) {
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.publishableKey) {
    throw new Error("La configuración de Supabase no está definida en window.SUPABASE_CONFIG.");
  }

  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": window.SUPABASE_CONFIG.publishableKey
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 400) {
        throw new Error("Credenciales inválidas. Por favor, verifica tu correo y contraseña.");
      }
      throw new Error(data.error_description || data.error || data.message || "Error al iniciar sesión.");
    }

    if (data.access_token) {
      localStorage.setItem("registro_asistencia_token", data.access_token);
    }

    return data;
  } catch (error) {
    console.error("Error en iniciarSesion:", error);
    throw error;
  }
}

/**
 * Cierra la sesión activa del usuario.
 * Invalida el token en el servidor de Supabase, limpia el localStorage y redirige al login.
 * 
 * @returns {Promise<void>}
 */
async function cerrarSesion() {
  const token = localStorage.getItem("registro_asistencia_token");
  localStorage.removeItem("registro_asistencia_token");

  if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && token) {
    const url = `${window.SUPABASE_CONFIG.url}/auth/v1/logout`;
    try {
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": window.SUPABASE_CONFIG.publishableKey,
          "Authorization": `Bearer ${token}`
        }
      });
    } catch (error) {
      console.warn("No se pudo invalidar la sesión en el servidor:", error);
    }
  }

  // Notificar al controlador de la UI
  if (typeof onLogoutSuccess === "function") {
    onLogoutSuccess();
  } else {
    // Redirección directa fallback si no está definida la función global de retorno
    document.querySelector(".app-shell")?.classList.add("is-hidden");
    document.getElementById("login-view")?.classList.remove("is-hidden");
  }
}

/**
 * Verifica si hay una sesión activa y válida en el localStorage.
 * Si existe un token, realiza un GET a /auth/v1/user para validar si sigue vivo.
 * Si el servidor responde con un error de autenticación, elimina el token del localStorage.
 * 
 * @returns {Promise<object|null>} - Datos del usuario si la sesión es válida, o null si no lo es o no existe.
 */
async function verificarSesion() {
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.publishableKey) {
    throw new Error("La configuración de Supabase no está definida en window.SUPABASE_CONFIG.");
  }

  const token = localStorage.getItem("registro_asistencia_token");
  if (!token) {
    return null;
  }

  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/user`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": window.SUPABASE_CONFIG.publishableKey,
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      localStorage.removeItem("registro_asistencia_token");
      return null;
    }

    const userData = await response.json();
    return userData;
  } catch (error) {
    console.error("Error en verificarSesion:", error);
    return null;
  }
}
