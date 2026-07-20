import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
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

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  if (/51999999999|www\.milinovjoyeria\.com/.test(html)) failures.push(`${htmlFile}: contiene datos provisionales`);

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const value = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|#)/.test(value)) continue;
    const local = decodeURIComponent(value.split(/[?#]/)[0]);
    if (!local) continue;
    const target = path.resolve(path.dirname(htmlFile), local);
    try { await access(target); }
    catch { failures.push(`${path.relative(output, htmlFile)}: falta ${value}`); }
  }

  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); }
    catch { failures.push(`${path.relative(output, htmlFile)}: JSON-LD inválido`); }
  }
}

for (const forbidden of ["backend", "docs", path.join("assets", "source-joyas"), path.join("assets", "contact-sheet.jpg")]) {
  try {
    await access(path.join(output, forbidden));
    failures.push(`Se publicó un recurso interno: ${forbidden}`);
  } catch {}
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${htmlFiles.length} páginas verificadas; enlaces y artefactos públicos correctos.`);
}
