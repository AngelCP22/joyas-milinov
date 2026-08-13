/**
 * audit-static.mjs — Auditor del sitio generado (dist/). Falla el build si:
 *
 *   SIEMPRE (ambos modos):
 *     - aparece cualquier secreto (sb_secret_, service_role, cadenas postgres://),
 *     - alguna página pública, sitemap, robots o llms enlaza/menciona el panel,
 *     - se publican recursos internos (backend/, docs/, supabase/, fuentes),
 *     - hay enlaces locales rotos o JSON-LD inválido.
 *
 *   MODO DESACTIVADO (por defecto): el panel NO debe existir en dist y
 *     supabase debe quedar deshabilitado en js/config.js.
 *
 *   MODO GATE (MILINOV_ADMIN_GATE=on): el panel DEBE existir completo y la
 *     configuración debe tener url + clave publishable con la forma correcta.
 *
 * MILINOV_BUILD_OUT permite auditar una carpeta de prueba (mismo contrato
 * que scripts/build-static.mjs).
 */
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outName = process.env.MILINOV_BUILD_OUT || "dist";
if (!/^dist[A-Za-z0-9._-]*$/.test(outName)) {
  throw new Error(`MILINOV_BUILD_OUT inválido (debe empezar por "dist"): ${outName}`);
}
const output = path.join(root, outName);
const gateOn = ["on", "1", "true"].includes(String(process.env.MILINOV_ADMIN_GATE || "").toLowerCase());
const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const files = await walk(output);
const htmlFiles = files.filter(file => file.endsWith(".html"));
const publicConfig = await readFile(path.join(output, "js", "config.js"), "utf8");

/* ============================================================
   Secretos: prohibidos en cualquier archivo de texto, en ambos modos.
   ============================================================ */
// Denylist binaria en vez de allowlist de texto: con una allowlist por
// extensión, archivos sin extensión que SÍ se publican (`_headers`) o
// dotfiles nunca se escaneaban.
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".avif",
  ".mp4", ".webm", ".mov", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".pdf", ".zip"
]);
// Detecta claves REALES, no menciones: sb_secret_ con payload (el vendor de
// supabase-js solo compara el prefijo y no dispara), cualquier JWT largo (las
// claves legadas son JWT y aquí no debe haber ninguno), cadenas de conexión
// Postgres y la palabra service_role literal.
const SECRET_PATTERN = /sb_secret_[A-Za-z0-9_-]{10,}|service_role|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{10,}/i;
// En modo desactivado no debe existir NINGUNA credencial ni conexión a
// Supabase en el sitio publicado, esté donde esté (no solo en config.js).
const PUBLISHABLE_PATTERN = /sb_publishable_[A-Za-z0-9_-]{6,}/;
const SUPABASE_ENABLE_PATTERN = /supabase[\s\S]{0,80}?enabled\s*(?::|=)\s*(?:true|!0|1\b)/i;

const textFiles = files.filter(file => !BINARY_EXT.has(path.extname(file).toLowerCase()));
for (const file of textFiles) {
  const content = await readFile(file, "utf8");
  if (SECRET_PATTERN.test(content)) {
    failures.push(`SECRETO DETECTADO en ${path.relative(output, file)}: clave secreta/JWT/cadena de conexión`);
  }
  if (!gateOn) {
    if (PUBLISHABLE_PATTERN.test(content)) {
      failures.push(`${path.relative(output, file)}: contiene una clave publishable sin el gate de activación`);
    }
    if (SUPABASE_ENABLE_PATTERN.test(content)) {
      failures.push(`${path.relative(output, file)}: activa Supabase sin el gate de activación`);
    }
  }
}

// Todo JS publicado debe ser sintácticamente válido: una sustitución de build
// mal hecha en config.js tumbaría el sitio entero sin que nada más lo note.
for (const file of files.filter(f => f.endsWith(".js"))) {
  try {
    new Function(await readFile(file, "utf8"));
  } catch (error) {
    failures.push(`${path.relative(output, file)}: JavaScript inválido (${error.message})`);
  }
}

/* ============================================================
   Configuración de Supabase según el modo.
   ============================================================ */
const supabaseEnabled = /supabase\s*:\s*\{[\s\S]*?enabled\s*:\s*true/.test(publicConfig);
if (!gateOn && supabaseEnabled) {
  failures.push("La integración Supabase no debe activarse sin el gate de activación (MILINOV_ADMIN_GATE)");
}
if (!gateOn && /createClient\s*\(/.test(publicConfig)) {
  failures.push("js/config.js no debe crear un cliente de Supabase sin el gate de activación");
}
if (gateOn) {
  if (!supabaseEnabled) failures.push("Gate activo pero js/config.js quedó con supabase deshabilitado");
  if (!/url:\s*"https:\/\/[a-z0-9-]+\.supabase\.co"/.test(publicConfig)) {
    failures.push("Gate activo pero la URL de Supabase falta o es inválida en js/config.js");
  }
  if (!/publishableKey:\s*"sb_publishable_[A-Za-z0-9_-]+"/.test(publicConfig)) {
    failures.push("Gate activo pero la clave publishable falta o es inválida en js/config.js");
  }
}

/* ============================================================
   Nada público debe enlazar ni mencionar el panel (en ambos modos:
   la ruta privada no se promociona; ocultarla es defensa secundaria).
   ============================================================ */
for (const htmlFile of htmlFiles) {
  if (path.basename(htmlFile) === "admin.html") continue;
  const html = await readFile(htmlFile, "utf8");
  if (/(?:href|src)="[^"]*admin(?:\.html)?[^"]*"/i.test(html)) {
    failures.push(`${path.relative(output, htmlFile)}: enlaza al panel privado`);
  }
}
for (const metaFile of ["sitemap.xml", "robots.txt", "llms.txt"]) {
  try {
    const content = await readFile(path.join(output, metaFile), "utf8");
    if (/admin/i.test(content)) failures.push(`${metaFile}: menciona el panel privado`);
  } catch {}
}

/* ============================================================
   Enlaces locales, datos provisionales y JSON-LD.
   ============================================================ */
for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  if (/51999999999/.test(html)) failures.push(`${htmlFile}: contiene datos provisionales`);

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|#)/.test(value)) continue;
    const local = decodeURIComponent(value.split(/[?#]/)[0]);
    if (!local) continue;
    const fromRoot = local.startsWith("/");
    const cleanPath = fromRoot ? local.replace(/^\/+/, "") : local;
    const base = fromRoot ? output : path.dirname(htmlFile);
    const target = path.resolve(base, cleanPath);
    const candidates = [target];
    if (!path.extname(target)) {
      candidates.push(`${target}.html`, path.join(target, "index.html"));
    }
    let found = false;
    for (const candidate of candidates) {
      try { await access(candidate); found = true; break; }
      catch {}
    }
    if (!found) failures.push(`${path.relative(output, htmlFile)}: falta ${value}`);
  }

  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); }
    catch { failures.push(`${path.relative(output, htmlFile)}: JSON-LD inválido`); }
  }
}

/* ============================================================
   Recursos internos: jamás publicados. Artefactos del panel: según el modo.
   ============================================================ */
const ALWAYS_FORBIDDEN = [
  "backend",
  "docs",
  "supabase",
  "node_modules",
  path.join("assets", "source-joyas"),
  path.join("assets", "contact-sheet.jpg")
];
const ADMIN_ARTIFACTS = [
  "admin.html",
  path.join("js", "admin.js"),
  path.join("js", "inventory-rules.js"),
  path.join("js", "vendor", "supabase.min.js")
];

for (const forbidden of ALWAYS_FORBIDDEN) {
  try {
    await access(path.join(output, forbidden));
    failures.push(`Se publicó un recurso interno: ${forbidden}`);
  } catch {}
}

for (const artifact of ADMIN_ARTIFACTS) {
  let exists = true;
  try { await access(path.join(output, artifact)); }
  catch { exists = false; }
  if (gateOn && !exists) failures.push(`Gate activo pero falta el artefacto del panel: ${artifact}`);
  if (!gateOn && exists) failures.push(`Se publicó un recurso interno: ${artifact}`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${htmlFiles.length} páginas verificadas (modo ${gateOn ? "GATE" : "desactivado"}); enlaces, secretos y artefactos correctos.`);
}
