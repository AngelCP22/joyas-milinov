/**
 * Pruebas del módulo compartido de reglas (js/inventory-rules.js): imágenes
 * (magic bytes y rutas de Storage), regla stock↔estado, edición
 * rápida y validación de importación CSV todo-o-nada (handoff §§9-10).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  detectImageType, storageImagePath,
  stockStatusRule, validateCellEdit, validateCsvImport,
  STORAGE_PATH_PATTERN, MAX_IMAGE_BYTES
} = require("../../js/inventory-rules.js");

const UUID = "0a1b2c3d-0000-4000-8000-abcdefabcdef";

/* ============================================================
   Imágenes
   ============================================================ */

test("detectImageType reconoce PNG, JPEG y WebP por contenido real", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = Uint8Array.from([..."RIFF".split("").map(c => c.charCodeAt(0)), 0, 0, 0, 0, ..."WEBP".split("").map(c => c.charCodeAt(0))]);
  const svgDisfrazado = Uint8Array.from(Buffer.from("<svg onload=alert(1)>"));
  assert.equal(detectImageType(png), "image/png");
  assert.equal(detectImageType(jpeg), "image/jpeg");
  assert.equal(detectImageType(webp), "image/webp");
  assert.equal(detectImageType(svgDisfrazado), null, "un SVG con extensión falsa no pasa");
  assert.equal(detectImageType(Uint8Array.from([1, 2, 3])), null, "archivos truncados no pasan");
});

test("storageImagePath genera rutas bajo el prefijo cerrado y rechaza tipos no permitidos", () => {
  const path = storageImagePath("image/webp", UUID);
  assert.equal(path, `products/${UUID}.webp`);
  assert.match(path, STORAGE_PATH_PATTERN);
  assert.throws(() => storageImagePath("image/svg+xml", UUID), /no permitido/);
  assert.throws(() => storageImagePath("image/webp", "../../../etc/passwd"), /inválido/);
});

test("el límite de subida coincide con el del bucket (5 MB)", () => {
  assert.equal(MAX_IMAGE_BYTES, 5242880);
});

/* ============================================================
   Regla stock ↔ estado (D2)
   ============================================================ */

test("stockStatusRule: stock 0 nunca queda activo; reponer reactiva un agotado", () => {
  assert.equal(stockStatusRule("active", 0), "sold_out");
  assert.equal(stockStatusRule("sold_out", 3), "active");
  assert.equal(stockStatusRule("draft", 0), "draft");
  assert.equal(stockStatusRule("draft", 5), "draft");
  assert.equal(stockStatusRule("active", 5), "active");
});

test("validateCellEdit protege la edición rápida de precio y stock", () => {
  assert.equal(validateCellEdit("price", "150"), null);
  assert.equal(validateCellEdit("stock", "0"), null);
  assert.match(validateCellEdit("price", "0"), /mayor que 0/);
  assert.match(validateCellEdit("price", ""), /inválido/i);
  assert.match(validateCellEdit("stock", "1.5"), /entero/);
  assert.match(validateCellEdit("stock", "-1"), /inválido/i);
  assert.match(validateCellEdit("stock", "abc"), /inválido/i);
});

/* ============================================================
   Importación CSV todo-o-nada
   ============================================================ */

const CSV_OK = [
  "gender,sku,name,category,collection,model,material,price,stock,status,image,description",
  'Mujer,MIL-CSV-001,Collar Uno,Collares,Silver,Uno,Plata 950,129,5,active,assets/products/collar-luna.jpg,"Collar, delicado"',
  "hombre,MIL-CSV-002,Pulsera Dos,Pulseras,Silver,Dos,Plata 950,99,0,active,assets/products/p.jpg,Pulsera"
].join("\n");

test("validateCsvImport acepta un CSV válido, normaliza género y aplica la regla de stock", () => {
  const { products, errors } = validateCsvImport(CSV_OK, []);
  assert.deepEqual(errors, []);
  assert.equal(products.length, 2);
  assert.equal(products[1].gender, "Hombre", "género en minúsculas se normaliza");
  assert.equal(products[1].status, "sold_out", "stock 0 no puede quedar activo");
  assert.equal(products[0].description, "Collar, delicado", "respeta comillas con comas");
});

test("validateCsvImport detecta el delimitador ';' de Excel en español", () => {
  const csv = [
    "gender;sku;name;category;collection;model;material;price;stock;status;image;description",
    "Mujer;MIL-CSV-010;Collar;Collares;Silver;X;Plata 950;100;2;active;assets/p.jpg;desc"
  ].join("\n");
  const { products, errors } = validateCsvImport(csv, []);
  assert.deepEqual(errors, []);
  assert.equal(products.length, 1);
});

test("validateCsvImport reporta TODAS las filas malas con su número y motivo", () => {
  const csv = [
    "gender,sku,name,category,collection,model,material,price,stock,status,image,description",
    "Mujer,MIL-A,Ok,Collares,S,M,Plata 950,100,2,active,assets/p.jpg,d",
    "Mujer,,SinSku,Collares,S,M,Plata 950,100,2,active,assets/p.jpg,d",
    "Mujer,MIL-A,Duplicado,Collares,S,M,Plata 950,100,2,active,assets/p.jpg,d",
    "Marciano,MIL-B,GeneroMal,Collares,S,M,Plata 950,100,2,active,assets/p.jpg,d",
    "Mujer,MIL-C,PrecioMal,Collares,S,M,Plata 950,-5,2,active,assets/p.jpg,d",
    "Mujer,MIL-D,demasiadas,columnas,extra,aqui,si,1,2,active,img,desc,EXTRA"
  ].join("\n");
  const { errors } = validateCsvImport(csv, []);
  assert.equal(errors.length, 5);
  assert.match(errors[0], /fila 3/);
  assert.match(errors[1], /fila 4.*repetido/i);
  assert.match(errors[2], /fila 5.*género/i);
  assert.match(errors[3], /fila 6/);
  assert.match(errors[4], /fila 7.*columnas/);
});

test("validateCsvImport rechaza SKU que ya existe en el inventario actual", () => {
  const existentes = [{ id: 9, sku: "mil-csv-001" }];
  const { errors } = validateCsvImport(CSV_OK, existentes);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ya existe/i);
});

test("validateCsvImport con CSV vacío o solo cabecera no importa nada", () => {
  assert.match(validateCsvImport("", []).errors[0], /vacío/i);
  assert.match(validateCsvImport("gender,sku,name\n", []).errors[0], /vacío/i);
});
