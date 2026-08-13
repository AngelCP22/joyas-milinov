/**
 * build-static.mjs — Genera el sitio público en dist/.
 *
 * Modos (docs/agent/DESIGN-ADMIN-INVENTARIO.md, D9):
 *
 *   DESACTIVADO (por defecto, sin variables): build idéntico al histórico.
 *     El panel (admin.html, js/admin.js, js/inventory-rules.js, js/vendor/)
 *     NO se publica y js/config.js queda con supabase.enabled: false.
 *
 *   GATE APROBADO (MILINOV_ADMIN_GATE=on): incluye el panel y escribe en
 *     dist/js/config.js la URL del proyecto y la clave publishable desde
 *     SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY (variables de entorno de
 *     Cloudflare Pages). El build FALLA si faltan o tienen forma inválida.
 *     La clave publishable es pública por diseño; jamás se acepta una
 *     sb_secret_ aquí.
 *
 * MILINOV_BUILD_OUT (solo pruebas): nombre de carpeta de salida alternativa
 * bajo la raíz del repo, para que los tests construyan sin pisar dist/.
 */
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// El nombre DEBE empezar por "dist": la primera operación del build es un
// borrado recursivo, y un typo como MILINOV_BUILD_OUT=js destruiría código
// fuente sin commitear.
const outName = process.env.MILINOV_BUILD_OUT || "dist";
if (!/^dist[A-Za-z0-9._-]*$/.test(outName)) {
  throw new Error(`MILINOV_BUILD_OUT inválido (debe empezar por "dist"): ${outName}`);
}
const output = path.join(root, outName);
if (path.dirname(output) !== root) {
  throw new Error("Directorio de salida inesperado");
}

const gateOn = ["on", "1", "true"].includes(String(process.env.MILINOV_ADMIN_GATE || "").toLowerCase());

/** Artefactos del panel: solo existen en dist con el gate aprobado. */
const ADMIN_JS_FILES = ["admin.js", "inventory-rules.js"];

let supabaseConfig = null;
if (gateOn) {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error("Gate activo pero SUPABASE_URL falta o no tiene la forma https://<proyecto>.supabase.co");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error("Gate activo pero SUPABASE_PUBLISHABLE_KEY falta o no es una clave sb_publishable_…");
  }
  if (/sb_secret_|service_role/i.test(key) || /sb_secret_|service_role/i.test(url)) {
    throw new Error("Se detectó una clave secreta en las variables del build: PROHIBIDO");
  }
  supabaseConfig = { url, key };
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const rootFiles = [
  "404.html", "catalogo.html", "contacto.html", "enlaces.html",
  "index.html", "nosotros.html", "privacidad.html", "producto.html",
  "proximamente.html", "reclamaciones.html", "seccion.html", "terminos.html",
  "robots.txt", "sitemap.xml", "llms.txt", "_headers",
  ...(gateOn ? ["admin.html"] : [])
];

for (const file of rootFiles) {
  await cp(path.join(root, file), path.join(output, file));
}

await cp(path.join(root, "css"), path.join(output, "css"), { recursive: true });
await cp(path.join(root, "js"), path.join(output, "js"), {
  recursive: true,
  filter(source) {
    const base = path.basename(source);
    if (!gateOn && ADMIN_JS_FILES.includes(base)) return false;
    const relative = path.relative(path.join(root, "js"), source);
    if (!gateOn && (relative === "vendor" || relative.startsWith(`vendor${path.sep}`))) return false;
    return true;
  }
});
await cp(path.join(root, "assets"), path.join(output, "assets"), {
  recursive: true,
  filter(source) {
    const relative = path.relative(path.join(root, "assets"), source);
    return relative !== "source-joyas" && !relative.startsWith(`source-joyas${path.sep}`) && relative !== "contact-sheet.jpg";
  }
});

// Con el gate aprobado, la configuración pública se escribe SOLO en dist/
// (el archivo del repo queda siempre desactivado).
if (gateOn) {
  const configPath = path.join(output, "js", "config.js");
  const original = await readFile(configPath, "utf8");

  // Recorte por conteo de llaves (no por regex): una '}' dentro de un
  // comentario o de una clave anidada rompería un `[^}]*` y dejaría un
  // config.js sintácticamente inválido, es decir, el sitio entero caído.
  const start = original.search(/supabase:\s*\{/);
  if (start === -1) throw new Error("No se encontró el bloque supabase en js/config.js");
  const open = original.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < original.length; i++) {
    if (original[i] === "{") depth++;
    else if (original[i] === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error("El bloque supabase de js/config.js no está balanceado");

  const replacement =
    "supabase: {\n" +
    "    enabled: true,\n" +
    `    url: ${JSON.stringify(supabaseConfig.url)},\n` +
    `    publishableKey: ${JSON.stringify(supabaseConfig.key)},\n` +
    '    anonKey: ""\n' +
    "  }";
  const updated = original.slice(0, start) + replacement + original.slice(end);

  // Falla visible antes de publicar: si la sustitución rompió la sintaxis, el
  // sitio completo dejaría de funcionar (config.js define esc/money/isSoldOut).
  try {
    new Function(updated);
  } catch (error) {
    throw new Error(`La inyección dejó js/config.js inválido: ${error.message}`);
  }
  await writeFile(configPath, updated, "utf8");
}

const wellKnown = path.join(root, ".well-known");
try {
  await readdir(wellKnown);
  await cp(wellKnown, path.join(output, ".well-known"), { recursive: true });
} catch {}

await writeFile(path.join(output, ".nojekyll"), "", "utf8");
console.log(`Sitio público generado en ${output} (panel ${gateOn ? "INCLUIDO — gate aprobado" : "excluido"})`);
