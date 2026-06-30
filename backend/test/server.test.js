/**
 * Pruebas del backend con el runner nativo de Node (sin dependencias).
 * Ejecutar:  cd backend && npm test     (requiere Node 18+)
 *
 * Cubren la lógica más delicada: validación, normalización, rutas de imagen,
 * detección de tipo real de imagen y nombres de archivo seguros.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateProduct, normalizeProduct, isValidImagePath, detectImageType, safeFilename
} = require("../server.js");

/** Producto activo válido de base para los tests. */
function baseInput(extra = {}) {
  return normalizeProduct({
    sku: "MIL-TST-001", gender: "Mujer", name: "Anillo Test", category: "Anillos", collection: "Silver",
    model: "Test", material: "Plata 950", price: 100, stock: 5, status: "active",
    images: ["assets/products/anillo-brillo-eterno.jpg"], description: "ok",
    ...extra
  });
}

test("validateProduct acepta un producto válido", () => {
  assert.equal(validateProduct(baseInput(), []), null);
});

test("validateProduct exige sku, name y category (no model)", () => {
  assert.match(validateProduct(baseInput({ sku: "" }), []), /Campos requeridos/);
  assert.match(validateProduct(baseInput({ name: " " }), []), /Campos requeridos/);
  // model vacío NO debe bloquear (no se publica en la tienda)
  assert.equal(validateProduct(baseInput({ model: "" }), []), null);
});

test("validateProduct rechaza precio <= 0", () => {
  assert.match(validateProduct(baseInput({ price: 0 }), []), /precio/i);
  assert.match(validateProduct(baseInput({ price: -10 }), []), /precio/i);
});

test("validateProduct exige stock entero >= 0", () => {
  assert.match(validateProduct(baseInput({ stock: 1.5 }), []), /stock/i);
  assert.match(validateProduct(baseInput({ stock: -1 }), []), /stock/i);
});

test("validateProduct rechaza SKU duplicado", () => {
  const existentes = [{ id: 1, sku: "MIL-DUP-001" }];
  const nuevo = baseInput({ sku: "mil-dup-001" }); // distinta capitalización
  nuevo.id = 2;
  assert.match(validateProduct(nuevo, existentes), /ya existe/i);
});

test("validateProduct exige oldPrice mayor que el precio", () => {
  assert.match(validateProduct(baseInput({ oldPrice: 80 }), []), /precio anterior/i);
  assert.equal(validateProduct(baseInput({ oldPrice: 150 }), []), null);
});

test("validateProduct exige al menos una imagen si está activo", () => {
  assert.match(validateProduct(baseInput({ images: [] }), []), /imagen/i);
  // En borrador no se exige imagen
  assert.equal(validateProduct(baseInput({ images: [], status: "draft" }), []), null);
});

test("isValidImagePath acepta rutas de assets y URLs, rechaza el resto", () => {
  assert.equal(isValidImagePath("assets/products/x.jpg"), true);
  assert.equal(isValidImagePath("https://cdn.com/x.webp"), true);
  assert.equal(isValidImagePath("../../backend/data/products.json"), false);
  assert.equal(isValidImagePath("assets/products/x.txt"), false);
  assert.equal(isValidImagePath(""), false);
});

test("normalizeProduct filtra rutas de imagen inválidas", () => {
  const p = normalizeProduct({ images: ["assets/products/x.jpg", "javascript:alert(1)", "../secreto.txt"] });
  assert.deepEqual(p.images, ["assets/products/x.jpg"]);
  assert.equal(p.image, "assets/products/x.jpg");
});

test("detectImageType reconoce los magic bytes reales", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const fake = Buffer.from("<svg>esto no es imagen</svg>");
  assert.equal(detectImageType(png), "image/png");
  assert.equal(detectImageType(jpeg), "image/jpeg");
  assert.equal(detectImageType(fake), null);
});

test("safeFilename usa la extensión dada y agrega entropía", () => {
  const name = safeFilename("Foto Bonita!!.HEIC", ".webp");
  assert.match(name, /^foto-bonita-\d+-[a-z0-9]+\.webp$/);
});
