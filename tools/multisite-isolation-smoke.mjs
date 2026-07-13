/*
 * Smoke negativo multiempresa. No crea ni altera datos.
 * Ejecutar solo con tokens efimeros de cuentas demo en dev o staging.
 */

const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "MULTISITE_ADMIN_A_TOKEN",
  "MULTISITE_ADMIN_B_TOKEN",
  "MULTISITE_USER_A_TOKEN",
  "MULTISITE_ORG_A_ID",
  "MULTISITE_ORG_B_ID",
  "MULTISITE_USER_B_ID",
  "MULTISITE_SITE_B_ID",
  "MULTISITE_USER_A_APP_ID",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Faltan variables de entorno: ${missing.join(", ")}`);
  console.error("Usa cuentas demo y tokens efimeros; no guardes secretos en el repositorio.");
  process.exitCode = 2;
} else {
  const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const results = [];

  async function request(path, token, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const body = await response.json().catch(() => null);
    return { response, body };
  }

  function expect(condition, label, detail = "") {
    results.push({ label, passed: Boolean(condition), detail });
  }

  const adminAUsers = await request("/rest/v1/rpc/get_manageable_users", process.env.MULTISITE_ADMIN_A_TOKEN, {
    method: "POST",
    body: "{}",
  });
  const adminARows = Array.isArray(adminAUsers.body) ? adminAUsers.body : [];
  expect(
    adminAUsers.response.ok && adminARows.every((row) => row.organizacion_id === process.env.MULTISITE_ORG_A_ID),
    "Admin A no puede listar usuarios de Organizacion B",
    `HTTP ${adminAUsers.response.status}; filas ${adminARows.length}`,
  );

  const adminBUsers = await request("/rest/v1/rpc/get_manageable_users", process.env.MULTISITE_ADMIN_B_TOKEN, {
    method: "POST",
    body: "{}",
  });
  const adminBRows = Array.isArray(adminBUsers.body) ? adminBUsers.body : [];
  expect(
    adminBUsers.response.ok && adminBRows.every((row) => row.organizacion_id === process.env.MULTISITE_ORG_B_ID),
    "Admin B no puede listar usuarios de Organizacion A",
    `HTTP ${adminBUsers.response.status}; filas ${adminBRows.length}`,
  );

  const forbiddenAssignment = await request("/rest/v1/rpc/admin_assign_user_scope", process.env.MULTISITE_ADMIN_A_TOKEN, {
    method: "POST",
    body: JSON.stringify({
      p_usuario_id: process.env.MULTISITE_USER_B_ID,
      p_sitio_id: process.env.MULTISITE_SITE_B_ID,
      p_rol: "usuario",
    }),
  });
  expect(
    !forbiddenAssignment.response.ok,
    "Admin A no puede asignar usuarios de Organizacion B",
    `HTTP ${forbiddenAssignment.response.status}`,
  );

  const forbiddenDirectory = await request("/rest/v1/rpc/get_manageable_users", process.env.MULTISITE_USER_A_TOKEN, {
    method: "POST",
    body: "{}",
  });
  expect(
    !forbiddenDirectory.response.ok,
    "Usuario regular no puede consultar el directorio administrativo",
    `HTTP ${forbiddenDirectory.response.status}`,
  );

  const ownProfile = await request(
    `/rest/v1/usuarios_app?select=id,organizacion_id,sitio_id,rol&id=eq.${encodeURIComponent(process.env.MULTISITE_USER_A_APP_ID)}`,
    process.env.MULTISITE_USER_A_TOKEN,
  );
  const ownRows = Array.isArray(ownProfile.body) ? ownProfile.body : [];
  expect(
    ownProfile.response.ok && ownRows.length === 1 && ownRows[0].id === process.env.MULTISITE_USER_A_APP_ID,
    "Usuario regular solo puede leer su propio perfil de aplicacion",
    `HTTP ${ownProfile.response.status}; filas ${ownRows.length}`,
  );

  results.forEach((result) => {
    console.log(`${result.passed ? "PASS" : "FAIL"} - ${result.label} (${result.detail})`);
  });
  const failed = results.filter((result) => !result.passed);
  if (failed.length) process.exitCode = 1;
}
