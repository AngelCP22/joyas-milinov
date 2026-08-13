/**
 * Regresión del gate de publicación (handoff §12): mientras no haya
 * activación, el panel queda fuera de dist y Supabase desactivado; con el
 * gate aprobado, los artefactos aparecen y la configuración se inyecta desde
 * variables de entorno. El auditor detecta secretos plantados.
 *
 * Construye en carpetas de prueba (MILINOV_BUILD_OUT) para no pisar dist/.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { access, readFile, rm, writeFile } = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const URL_PRUEBA = "https://abcdefghijklmnop.supabase.co";
const KEY_PRUEBA = "sb_publishable_x1y2z3prueba_no_real";

function run(script, env) {
  return execFileSync(process.execPath, [path.join(ROOT, "scripts", script)], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
}

function runExpectFail(script, env) {
  try {
    run(script, env);
  } catch (error) {
    return `${error.stdout || ""}${error.stderr || ""}${error.message}`;
  }
  throw new Error(`${script} debía fallar y terminó bien`);
}

async function exists(...parts) {
  try { await access(path.join(...parts)); return true; }
  catch { return false; }
}

test("modo desactivado: el panel no se publica y Supabase queda apagado", async () => {
  const OUT = "dist-test-off";
  const env = { MILINOV_BUILD_OUT: OUT, MILINOV_ADMIN_GATE: "" };
  try {
    run("build-static.mjs", env);
    const out = path.join(ROOT, OUT);
    assert.equal(await exists(out, "index.html"), true);
    assert.equal(await exists(out, "admin.html"), false, "admin.html no debe publicarse");
    assert.equal(await exists(out, "js", "admin.js"), false);
    assert.equal(await exists(out, "js", "inventory-rules.js"), false);
    assert.equal(await exists(out, "js", "vendor"), false);
    assert.equal(await exists(out, "backend"), false);
    assert.equal(await exists(out, "supabase"), false);
    const config = await readFile(path.join(out, "js", "config.js"), "utf8");
    assert.match(config, /supabase:\s*\{\s*\n\s*enabled:\s*false/);
    // Sin clave inyectada (el comentario del archivo sí menciona el prefijo).
    assert.doesNotMatch(config, /publishableKey:\s*"sb_publishable_/);
    // El auditor aprueba este build.
    const audit = run("audit-static.mjs", env);
    assert.match(audit, /modo desactivado/);
  } finally {
    await rm(path.join(ROOT, OUT), { recursive: true, force: true });
  }
});

test("modo gate: exige credenciales válidas y publica el panel completo", async () => {
  const OUT = "dist-test-gate";
  const envBase = { MILINOV_BUILD_OUT: OUT, MILINOV_ADMIN_GATE: "on" };
  try {
    // Sin variables: el build DEBE fallar (fail visibly).
    assert.match(
      runExpectFail("build-static.mjs", { ...envBase, SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "" }),
      /SUPABASE_URL/
    );
    // URL con forma incorrecta: falla.
    assert.match(
      runExpectFail("build-static.mjs", { ...envBase, SUPABASE_URL: "http://inseguro.supabase.co", SUPABASE_PUBLISHABLE_KEY: KEY_PRUEBA }),
      /SUPABASE_URL/
    );
    // Clave con forma de secreta: falla.
    assert.match(
      runExpectFail("build-static.mjs", { ...envBase, SUPABASE_URL: URL_PRUEBA, SUPABASE_PUBLISHABLE_KEY: "sb_secret_no_debe_pasar_123" }),
      /SUPABASE_PUBLISHABLE_KEY|PROHIBIDO/
    );

    // Con variables correctas: aparece el panel y la config inyectada.
    const env = { ...envBase, SUPABASE_URL: URL_PRUEBA, SUPABASE_PUBLISHABLE_KEY: KEY_PRUEBA };
    run("build-static.mjs", env);
    const out = path.join(ROOT, OUT);
    assert.equal(await exists(out, "admin.html"), true);
    assert.equal(await exists(out, "js", "admin.js"), true);
    assert.equal(await exists(out, "js", "inventory-rules.js"), true);
    assert.equal(await exists(out, "js", "vendor", "supabase.min.js"), true);
    assert.equal(await exists(out, "backend"), false);
    assert.equal(await exists(out, "supabase"), false);
    const config = await readFile(path.join(out, "js", "config.js"), "utf8");
    assert.match(config, /enabled:\s*true/);
    assert.ok(config.includes(`url: "${URL_PRUEBA}"`));
    assert.ok(config.includes(`publishableKey: "${KEY_PRUEBA}"`));
    // El repo (fuente) sigue desactivado: la inyección es solo en la salida.
    const sourceConfig = await readFile(path.join(ROOT, "js", "config.js"), "utf8");
    assert.match(sourceConfig, /enabled:\s*false/);

    const audit = run("audit-static.mjs", env);
    assert.match(audit, /modo GATE/);
  } finally {
    await rm(path.join(ROOT, OUT), { recursive: true, force: true });
  }
});

test("el build rechaza una carpeta de salida que no empiece por 'dist'", () => {
  // La primera operación del build es un borrado recursivo: un typo como
  // MILINOV_BUILD_OUT=js destruiría código fuente sin commitear.
  for (const nombre of ["js", "assets", "backend", "supabase", ".git", "node_modules"]) {
    assert.match(
      runExpectFail("build-static.mjs", { MILINOV_BUILD_OUT: nombre, MILINOV_ADMIN_GATE: "" }),
      /MILINOV_BUILD_OUT inválido/
    );
    assert.equal(fsSync.existsSync(path.join(ROOT, nombre)) || nombre === ".git", true, `${nombre} sigue intacto`);
  }
});

test("modo gate: un '}' dentro del bloque supabase no rompe la inyección", async () => {
  const OUT = "dist-test-braces";
  const configPath = path.join(ROOT, "js", "config.js");
  const original = await readFile(configPath, "utf8");
  try {
    // Un comentario con llaves dentro del bloque: antes truncaba el reemplazo
    // y dejaba un config.js inválido (sitio entero caído) con el build en verde.
    const conLlaves = original.replace(
      "  supabase: {\n    enabled: false,",
      "  supabase: {\n    // ejemplo de objeto: { url } del proyecto\n    enabled: false,"
    );
    assert.notEqual(conLlaves, original, "el parche de prueba debe aplicarse");
    await writeFile(configPath, conLlaves, "utf8");

    const env = {
      MILINOV_BUILD_OUT: OUT, MILINOV_ADMIN_GATE: "on",
      SUPABASE_URL: URL_PRUEBA, SUPABASE_PUBLISHABLE_KEY: KEY_PRUEBA
    };
    run("build-static.mjs", env);
    const generado = await readFile(path.join(ROOT, OUT, "js", "config.js"), "utf8");
    // Debe ser JavaScript válido y quedar con la configuración correcta.
    new Function(generado);
    assert.ok(generado.includes(`publishableKey: "${KEY_PRUEBA}"`));
    assert.doesNotMatch(generado, /del proyecto\s*$/m, "no quedan residuos del bloque original");
    run("audit-static.mjs", env);
  } finally {
    await writeFile(configPath, original, "utf8");
    await rm(path.join(ROOT, OUT), { recursive: true, force: true });
  }
});

test("el auditor detecta un secreto plantado y una activación sin gate", async () => {
  const OUT = "dist-test-tamper";
  const env = { MILINOV_BUILD_OUT: OUT, MILINOV_ADMIN_GATE: "" };
  try {
    run("build-static.mjs", env);
    const out = path.join(ROOT, OUT);

    // Secreto plantado en un JS publicado → el auditor falla.
    const configPath = path.join(out, "js", "config.js");
    const original = await readFile(configPath, "utf8");
    await writeFile(configPath, `${original}\n// leak\nconst k = "sb_secret_1234567890abcdef";\n`, "utf8");
    assert.match(runExpectFail("audit-static.mjs", env), /SECRETO DETECTADO/);

    // Supabase activado sin gate → el auditor falla. (Reemplazo dirigido al
    // bloque supabase: config.js tiene otro "enabled: false" en payments.)
    const activado = original.replace("supabase: {\n    enabled: false", "supabase: {\n    enabled: true");
    assert.notEqual(activado, original, "el reemplazo debe encontrar el bloque supabase");
    await writeFile(configPath, activado, "utf8");
    assert.match(runExpectFail("audit-static.mjs", env), /no debe activarse/);
    await writeFile(configPath, original, "utf8");

    // Activación por asignación en OTRO archivo (evadía el check del bloque).
    const appPath = path.join(out, "js", "app.js");
    const appOriginal = await readFile(appPath, "utf8");
    await writeFile(appPath, `${appOriginal}\nwindow.MILINOV.supabase.enabled = true;\n`, "utf8");
    assert.match(runExpectFail("audit-static.mjs", env), /activa Supabase sin el gate/);

    // Credencial publishable hardcodeada fuera de config.js.
    await writeFile(appPath, `${appOriginal}\nconst k = "${KEY_PRUEBA}";\n`, "utf8");
    assert.match(runExpectFail("audit-static.mjs", env), /clave publishable sin el gate/);

    // JavaScript roto en dist (p. ej. una sustitución de build mal hecha).
    await writeFile(appPath, `${appOriginal}\nfunction ( {\n`, "utf8");
    assert.match(runExpectFail("audit-static.mjs", env), /JavaScript inválido/);
    await writeFile(appPath, appOriginal, "utf8");

    // Archivo publicado SIN extensión: antes no se escaneaba nunca.
    const headersPath = path.join(out, "_headers");
    const headersOriginal = await readFile(headersPath, "utf8");
    await writeFile(headersPath, `${headersOriginal}\n  X-Debug: sb_secret_abcdef1234567890\n`, "utf8");
    assert.match(runExpectFail("audit-static.mjs", env), /SECRETO DETECTADO/);
  } finally {
    await rm(path.join(ROOT, OUT), { recursive: true, force: true });
  }
});
