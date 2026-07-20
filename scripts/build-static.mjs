import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

if (path.dirname(output) !== root || path.basename(output) !== "dist") {
  throw new Error("Directorio de salida inesperado");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const rootFiles = [
  "404.html", "admin.html", "catalogo.html", "contacto.html", "enlaces.html",
  "index.html", "nosotros.html", "privacidad.html", "producto.html",
  "proximamente.html", "reclamaciones.html", "seccion.html", "terminos.html",
  "robots.txt", "sitemap.xml", "llms.txt", "_headers"
];

for (const file of rootFiles) {
  await cp(path.join(root, file), path.join(output, file));
}

await cp(path.join(root, "css"), path.join(output, "css"), { recursive: true });
await cp(path.join(root, "js"), path.join(output, "js"), { recursive: true });
await cp(path.join(root, "assets"), path.join(output, "assets"), {
  recursive: true,
  filter(source) {
    const relative = path.relative(path.join(root, "assets"), source);
    return relative !== "source-joyas" && !relative.startsWith(`source-joyas${path.sep}`) && relative !== "contact-sheet.jpg";
  }
});

const wellKnown = path.join(root, ".well-known");
try {
  await readdir(wellKnown);
  await cp(wellKnown, path.join(output, ".well-known"), { recursive: true });
} catch {}

await writeFile(path.join(output, ".nojekyll"), "", "utf8");
console.log(`Sitio público generado en ${output}`);
