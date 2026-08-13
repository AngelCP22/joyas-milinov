/**
 * generate-seed.mjs — Genera supabase/seed.sql desde el inventario real.
 *
 * Fuentes (se combinan por id):
 *   1. backend/data/products.json  → datos operativos completos (sku, model,
 *      stock, status) mantenidos por el backend local.
 *   2. js/products.js              → campos de presentación que el JSON aún no
 *      tiene (badge, sizeMm, care, warranty, oldPrice, featured, galería).
 *
 * Reglas de coherencia con las constraints de la base:
 *   - images siempre es un arreglo con la portada en la posición 0.
 *   - image se fuerza a images[0].
 *   - un producto 'active' con stock 0 se emite como 'sold_out'.
 *
 * Uso:  node scripts/generate-seed.mjs
 * La salida es determinista: regenerar sin cambios de datos no altera el archivo.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const json = JSON.parse(
  (await readFile(path.join(root, "backend", "data", "products.json"), "utf8")).replace(/^﻿/, "")
);

const productsJs = await readFile(path.join(root, "js", "products.js"), "utf8");
const staticCatalog = new Function(`${productsJs}; return PRODUCTS;`)();
const staticById = new Map(staticCatalog.map(p => [p.id, p]));

function sqlText(value) {
  if (value === undefined || value === null || value === "") return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (value === undefined || value === null || value === "") return "null";
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Número inválido en el catálogo: ${value}`);
  return String(n);
}

const rows = json.map(base => {
  const extra = staticById.get(base.id) || {};
  const merged = { ...extra, ...base };
  // Los campos de presentación solo existen en products.js: recupéralos si el JSON no los trae.
  for (const key of ["badge", "sizeMm", "weightG", "care", "warranty", "oldPrice", "featured"]) {
    if (merged[key] === undefined && extra[key] !== undefined) merged[key] = extra[key];
  }
  const gallery = Array.isArray(merged.images) && merged.images.length
    ? merged.images.slice()
    : [merged.image];
  const extraGallery = Array.isArray(extra.images) ? extra.images : [];
  for (const src of extraGallery) if (!gallery.includes(src)) gallery.push(src);
  const image = gallery[0];
  let status = merged.status || "active";
  const stock = Number(merged.stock ?? 0);
  if (status === "active" && stock <= 0) status = "sold_out";

  return `  (${[
    sqlNumber(merged.id),
    sqlText(merged.sku),
    sqlText(merged.gender),
    sqlText(merged.name),
    sqlText(merged.category),
    sqlText(merged.collection),
    sqlText(merged.model),
    sqlText(merged.material),
    sqlNumber(merged.price),
    sqlNumber(merged.oldPrice),
    sqlNumber(stock),
    sqlText(status),
    sqlText(merged.badge),
    sqlText(merged.sizeMm),
    sqlNumber(merged.weightG),
    sqlText(merged.care),
    sqlText(merged.warranty),
    merged.featured ? "true" : "false",
    sqlText(image),
    `${sqlText(JSON.stringify(gallery))}::jsonb`
  ].join(", ")}, ${sqlText(merged.description)})`;
});

const seed = `-- ============================================================
-- Milinov Jewelry — seed del catálogo real (${rows.length} productos).
-- GENERADO por scripts/generate-seed.mjs. No editar a mano:
--   node scripts/generate-seed.mjs
-- Se ejecuta con: supabase db push --include-seed  (o db reset local).
-- Idempotente: on conflict (id) do nothing (no pisa cambios hechos en el panel).
-- ============================================================

insert into public.products
  (id, sku, gender, name, category, collection, model, material, price,
   old_price, stock, status, badge, size_mm, weight_g, care, warranty,
   featured, image, images, description)
values
${rows.join(",\n")}
on conflict (id) do nothing;

-- Ajusta el contador para que los próximos productos no choquen con los sembrados.
select setval(pg_get_serial_sequence('public.products', 'id'), (select max(id) from public.products));
`;

await mkdir(path.join(root, "supabase"), { recursive: true });
await writeFile(path.join(root, "supabase", "seed.sql"), seed, "utf8");
console.log(`supabase/seed.sql generado con ${rows.length} productos.`);
