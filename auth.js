/**
 * auth.js
 * Autenticacion directa contra Supabase Auth sin SDK.
 */

function assertSupabaseAuthConfig() {
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.publishableKey) {
    throw new Error("La configuracion de Supabase no esta definida.");
  }
}

  const cleanEmail = email.trim().toLowerCase();
  
  console.log("--- REGISTRO DE CUENTA (crearCuenta) ---");
  console.log("crearCuenta - Correo recibido del formulario (crudo):", email);
  console.log("crearCuenta - Correo a registrar (normalizado):", cleanEmail);

  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/signup`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email: cleanEmail,
        password: password,
        data: {
          nombre,
          matricula,
          rol: "usuario",
        },
      }),
    });

    const data = await response.json();
    console.log("crearCuenta - Código de estado HTTP de respuesta:", response.status);
    console.log("crearCuenta - Objeto retornado por Supabase:", data);

    if (!response.ok) {
      console.error("crearCuenta - Error al crear cuenta:", data.error_description || data.error || data.message);
      throw new Error(data.error_description || data.error || data.message || "Error al crear la cuenta.");
    }

    // Si el auto-confirm de emails de Supabase está activo, puede retornar una sesión
    if (data.access_token) {
      localStorage.setItem("registro_asistencia_token", data.access_token);
    } else if (data.session && data.session.access_token) {
      localStorage.setItem("registro_asistencia_token", data.session.access_token);
    }

    console.log("crearCuenta - Cuenta creada exitosamente. Usuario:", data.user);
    return data;
  } catch (error) {
    console.error("Error en crearCuenta:", error);
    throw error;
  }
}

async function iniciarSesion(email, password) {
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.publishableKey) {
    throw new Error("La configuración de Supabase no está definida en window.SUPABASE_CONFIG.");
  }

  const cleanEmail = email.trim().toLowerCase();
  
  console.log("--- INICIO DE SESIÓN (iniciarSesion) ---");
  console.log("iniciarSesion - Correo recibido del formulario (crudo):", email);
  console.log("iniciarSesion - Correo a buscar/validar (normalizado):", cleanEmail);
  console.log("iniciarSesion - Validación de contraseña: Se envía en texto plano (canal seguro HTTPS) para validación y hash en el servidor de Supabase.");

  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": window.SUPABASE_CONFIG.publishableKey
      },
      body: JSON.stringify({ email: cleanEmail, password })
    });

    const data = await response.json();
    console.log("iniciarSesion - Código de estado HTTP de respuesta:", response.status);
    console.log("iniciarSesion - Objeto de sesión/usuario retornado por Supabase:", data);

    if (!response.ok) {
      console.error("iniciarSesion - Error al iniciar sesión:", data.error_description || data.error || data.message);
      
      if (response.status === 400) {
        const errorDesc = data.error_description || data.error || data.message || "";
        const errorCode = data.error || "";
        if (
          errorDesc.includes("Email not confirmed") || 
          errorDesc.includes("confirm your email") || 
          errorDesc.includes("email_not_confirmed") ||
          errorCode === "email_not_confirmed"
        ) {
          throw new Error("Revisa tu correo para confirmar tu cuenta antes de iniciar sesión");
        }
        throw new Error("Credenciales inválidas. Por favor, verifica tu correo y contraseña.");
      }
      throw new Error(data.error_description || data.error || data.message || "Error al iniciar sesión.");
    }

    if (data.access_token) {
      localStorage.setItem("registro_asistencia_token", data.access_token);
      console.log("iniciarSesion - Sesión iniciada correctamente. Token guardado en localStorage. Usuario:", data.user?.email);
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

/**
 * Actualiza el perfil del usuario autenticado en Supabase.
 * Realiza un PUT a /auth/v1/user.
 * 
 * @param {string} email - Nuevo correo electrónico.
 * @param {string} nombre - Nuevo nombre completo.
 * @param {string} matricula - Nueva matrícula.
 * @returns {Promise<object>} - Datos del usuario actualizados devueltos por Supabase.
 * @throws {Error} - Error si la petición falla.
 */
async function actualizarPerfil(email, nombre, matricula) {
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.publishableKey) {
    throw new Error("La configuración de Supabase no está definida en window.SUPABASE_CONFIG.");
  }

  const token = localStorage.getItem("registro_asistencia_token");
  if (!token) {
    throw new Error("No hay una sesión activa para actualizar el perfil.");
  }

  const url = `${window.SUPABASE_CONFIG.url}/auth/v1/user`;
  const cleanEmail = email.trim().toLowerCase();

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "apikey": window.SUPABASE_CONFIG.publishableKey,
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        email: cleanEmail,
        data: {
          nombre: nombre.trim(),
          matricula: matricula.trim()
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || data.error || data.message || "Error al actualizar el perfil.");
    }

    return data;
  } catch (error) {
    console.error("Error en actualizarPerfil:", error);
    throw error;
  }
}
