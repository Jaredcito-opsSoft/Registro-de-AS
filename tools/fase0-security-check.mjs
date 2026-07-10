import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");

const checks = [
  {
    id: "no-service-role-in-client",
    severity: "blocker",
    files: ["app.js", "auth.js", "supabase-config.js", "index.html"],
    pattern: /\b(service_role|SUPABASE_SERVICE|sb_secret_|JWT_SECRET)\b/i,
    message: "No debe existir service_role o secretos de servidor en archivos cliente.",
  },
  {
    id: "admin-key-production-guard",
    severity: "major",
    files: ["app.js"],
    pattern: /const\s+ADMIN_KEY\s*=\s*["']ADMIN123["']/,
    message: "ADMIN123 debe permanecer solo para local/demo y nunca otorgar permisos reales en produccion.",
  },
  {
    id: "no-public-evidence-url",
    severity: "blocker",
    files: ["app.js", "auth.js", "supabase-config.js"],
    pattern: /\/storage\/v1\/object\/public\//,
    message: "Las evidencias no deben guardarse como URL publica; usar bucket privado y URL firmada temporal.",
  },
  {
    id: "avoid-sensitive-local-cache",
    severity: "major",
    files: ["app.js", "auth.js", "service-worker.js"],
    pattern: /localStorage\.(setItem|getItem)\((?:[^)]*token|[^)]*registro_asistencia_qr_v1)/i,
    message: "Revisar persistencia local de token o asistencia; PWA no debe cachear datos sensibles sin control.",
  },
  {
    id: "rls-no-auth-role",
    severity: "major",
    files: listSqlFiles(),
    pattern: /auth\.role\s*\(/i,
    message: "En politicas RLS usar TO authenticated/anon y predicados de autorizacion, no auth.role().",
  },
  {
    id: "security-definer-reviewed",
    severity: "info",
    files: listSqlFiles(),
    pattern: /security\s+definer/i,
    message: "Toda funcion SECURITY DEFINER debe tener search_path fijo, auth.uid() y EXECUTE revocado a PUBLIC.",
  },
];

function listSqlFiles() {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .concat(walkSql(path.join(root, "docs")));
}

function walkSql(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkSql(full);
    if (entry.isFile() && entry.name.endsWith(".sql")) return [path.relative(root, full)];
    return [];
  });
}

function readFileSafe(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return "";
  return fs.readFileSync(full, "utf8");
}

const results = checks.map((check) => {
  const hits = check.files
    .filter(Boolean)
    .map((file) => ({ file, text: readFileSafe(file) }))
    .filter(({ text }) => check.pattern.test(text))
    .map(({ file }) => file);

  return { ...check, hits };
});

console.log("Fase 0 security/backend check");
console.log("==============================");

for (const result of results) {
  const status = result.hits.length ? "FOUND" : "OK";
  const files = result.hits.length ? ` (${result.hits.join(", ")})` : "";
  console.log(`[${result.severity}] ${status} ${result.id}${files}`);
  if (result.hits.length) console.log(`  ${result.message}`);
}

const blockers = results.filter((result) => result.hits.length && result.severity === "blocker");
const majors = results.filter((result) => result.hits.length && result.severity === "major");

console.log("");
console.log(`Resumen: ${blockers.length} bloqueantes, ${majors.length} mayores.`);

if (strict && (blockers.length || majors.length)) {
  process.exitCode = 1;
}
