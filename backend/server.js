/**
 * server.js — Backend local de Milinov Jewelry.
 *
 * Servidor HTTP sin dependencias externas (solo Node.js >= 18) que cumple
 * dos funciones:
 *
 *   1. API REST de inventario en /api/* (productos, categorías, subida de
 *      imágenes). Los datos viven en backend/data/products.json y las
 *      imágenes subidas en assets/uploads/.
 *   2. Servidor estático del sitio completo: con `npm start` el sitio queda
 *      disponible en http://localhost:3001 (tienda, catálogo, admin, etc.).
 *
 * Uso:   cd backend && npm start        (o npm run dev para auto-reinicio)
 *
 * SEGURIDAD: este servidor NO tiene autenticación. Está pensado para uso
 * local (administrar el inventario desde admin.html en tu propia máquina).
 * No exponerlo a internet tal cual.
 */

const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3001);
const DATA_FILE = path.join(__dirname, "data", "products.json");
const UPLOAD_DIR = path.join(__dirname, "..", "assets", "uploads");
// Raíz del sitio estático (la carpeta del proyecto, un nivel arriba de backend/)
const SITE_ROOT = path.join(__dirname, "..");

/* ============================================================
   Persistencia de productos
   ============================================================ */

async function readProducts() {
  let raw;
  try {
    // Tolera BOM (byte order mark) si el JSON fue editado con Bloc de notas.
    raw = (await fs.readFile(DATA_FILE, "utf8")).replace(/^\uFEFF/, "");
  } catch (error) {
    // Primer arranque sin archivo: inventario vac\u00EDo (no es un error).
    if (error.code === "ENOENT") return [];
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // El archivo existe pero est\u00E1 corrupto: error claro en vez de "no se pudo conectar".
    throw new Error("products.json est\u00E1 corrupto (JSON inv\u00E1lido). Restaura una copia de seguridad.");
  }
}

/**
 * Escritura atómica: se escribe a un archivo temporal y luego se renombra.
 * Así, si el proceso se interrumpe a mitad de escritura, products.json
 * nunca queda corrupto. Tras guardar, regenera el respaldo estático js/products.js.
 */
async function writeProducts(products) {
  const tmpFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  await fs.rename(tmpFile, DATA_FILE);
  await syncStaticCatalog(products);
}

const STATIC_CATALOG_FILE = path.join(SITE_ROOT, "js", "products.js");

/** Serializa el catálogo al formato de js/products.js (respaldo de la tienda sin backend). */
function buildStaticCatalog(products) {
  const items = products.map(product => {
    const fields = {
      id: product.id, gender: product.gender, name: product.name, category: product.category,
      collection: product.collection, material: product.material, price: product.price, oldPrice: product.oldPrice,
      image: product.image, images: product.images, description: product.description,
      stock: product.stock, status: product.status, badge: product.badge,
      sizeMm: product.sizeMm, weightG: product.weightG, care: product.care,
      warranty: product.warranty, featured: product.featured
    };
    const body = Object.entries(fields)
      .filter(([, v]) => v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && v !== false)
      .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
      .join(",\n");
    return `  {\n${body}\n  }`;
  }).join(",\n");
  const header =
    "/**\n" +
    " * products.js — Catálogo estático de respaldo (GENERADO AUTOMÁTICAMENTE por el backend\n" +
    " * al guardar en el admin). No editar a mano: se sobrescribe en cada cambio.\n" +
    " * Es lo que ve la tienda publicada sin backend; súbelo junto con assets/uploads/.\n" +
    " */\n";
  // Neutraliza "</script>" por si el catálogo se incrustara inline algún día.
  return `${header}const PRODUCTS = [\n${items}\n];\n`.replace(/<\/(script)/gi, "<\\/$1");
}

/** Regenera js/products.js para que la tienda estática quede sincronizada con el inventario. */
async function syncStaticCatalog(products) {
  try {
    await fs.writeFile(STATIC_CATALOG_FILE, buildStaticCatalog(products), "utf8");
  } catch (error) {
    console.error("[milinov] no se pudo sincronizar js/products.js:", error.message);
  }
}

/* ============================================================
   Helpers HTTP
   ============================================================ */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function send(res, status, payload) {
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      // Límite ~8 MB: suficiente para imágenes de 5 MB codificadas en base64.
      if (body.length > 8_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

/* ============================================================
   Subida de imágenes
   ============================================================ */

// Extensión REAL derivada del tipo MIME validado (no del nombre del cliente),
// para que nadie pueda guardar un .svg/.html disfrazado de imagen.
const MIME_TO_EXT = { "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/webp": ".webp" };

/** Verifica los magic bytes del archivo y devuelve su tipo real, o null. */
function detectImageType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Convierte el nombre original en un slug seguro y único. La extensión se pasa
 * ya validada (derivada del MIME). Se añade entropía para que dos subidas en el
 * mismo milisegundo no se sobrescriban.
 */
function safeFilename(name, ext) {
  const base = path.basename(name, path.extname(name)).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "joya";
  const rand = Math.random().toString(36).slice(2, 7);
  return `${base}-${Date.now()}-${rand}${ext}`;
}

async function saveUpload(input) {
  if (!input?.dataUrl || !input?.filename) {
    throw new Error("Imagen requerida");
  }

  const match = input.dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) {
    throw new Error("Formato de imagen no permitido. Usa JPG, PNG o WEBP.");
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 5 * 1024 * 1024) {
    throw new Error("La imagen no debe superar 5 MB");
  }

  // El contenido real (magic bytes) debe coincidir con una imagen permitida.
  const realType = detectImageType(bytes);
  if (!realType) {
    throw new Error("El archivo no es una imagen válida (JPG, PNG o WEBP).");
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = safeFilename(input.filename, MIME_TO_EXT[realType]);
  await fs.writeFile(path.join(UPLOAD_DIR, filename), bytes);
  return `assets/uploads/${filename}`;
}

/* ============================================================
   Validación de productos
   ============================================================ */

/** Convierte a número o devuelve null si no es un número válido (campo opcional). */
function numOrNull(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Acepta solo rutas de imagen razonables: relativas a assets/ o URLs http(s) con extensión de imagen. */
function isValidImagePath(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v || !/\.(jpe?g|png|webp|svg)$/i.test(v)) return false;
  return v.startsWith("assets/") || /^https?:\/\//i.test(v);
}

function normalizeProduct(input, fallback = {}) {
  const rawImages = Array.isArray(input.images)
    ? input.images
    : (Array.isArray(fallback.images) ? fallback.images : []);
  // Solo se conservan rutas de imagen válidas (evita datos sucios o rutas fuera de assets/).
  const images = rawImages.filter(isValidImagePath);
  // La portada (image) es la primera válida de la galería.
  const image = isValidImagePath(input.image) ? input.image.trim()
    : (images[0] ?? (isValidImagePath(fallback.image) ? fallback.image : ""));
  const gallery = image && !images.length ? [image] : images;

  return {
    ...fallback,
    sku: input.sku ?? fallback.sku ?? "",
    gender: input.gender ?? fallback.gender ?? "",
    name: input.name ?? fallback.name ?? "",
    category: input.category ?? fallback.category ?? "",
    collection: input.collection ?? fallback.collection ?? "",
    model: input.model ?? fallback.model ?? "",
    material: input.material ?? fallback.material ?? "",
    price: Number(input.price ?? fallback.price ?? 0),
    oldPrice: numOrNull(input.oldPrice, fallback.oldPrice ?? null),
    stock: Number(input.stock ?? fallback.stock ?? 0),
    status: input.status ?? fallback.status ?? "active",
    badge: input.badge ?? fallback.badge ?? "",
    sizeMm: input.sizeMm ?? fallback.sizeMm ?? "",
    weightG: numOrNull(input.weightG, fallback.weightG ?? null),
    care: input.care ?? fallback.care ?? "",
    warranty: input.warranty ?? fallback.warranty ?? "",
    featured: input.featured !== undefined ? Boolean(input.featured) : Boolean(fallback.featured),
    image,
    images: gallery,
    description: input.description ?? fallback.description ?? ""
  };
}

/**
 * Valida un producto ya normalizado. Recibe la lista actual para comprobar que
 * el SKU sea único. 'model' NO es obligatorio (no se publica en la tienda;
 * exigirlo rompía la edición en línea de productos que no lo tienen).
 */
function validateProduct(product, products = []) {
  const missing = ["sku", "name", "category"].filter(field => !String(product[field] ?? "").trim());
  if (missing.length) return `Campos requeridos: ${missing.join(", ")}`;
  if (!["Hombre", "Mujer"].includes(product.gender)) return "Selecciona el género (Hombre o Mujer)";
  if (String(product.name).length > 120) return "El nombre es demasiado largo (máximo 120 caracteres)";
  if (String(product.description).length > 1000) return "La descripción es demasiado larga (máximo 1000 caracteres)";
  if (!Number.isFinite(product.price) || product.price <= 0) return "El precio debe ser un número mayor que 0";
  if (!Number.isInteger(product.stock) || product.stock < 0) return "El stock debe ser un entero mayor o igual a 0";
  if (!["active", "draft", "sold_out"].includes(product.status)) return "Estado inválido";
  if (product.oldPrice != null && (!Number.isFinite(product.oldPrice) || product.oldPrice <= product.price)) {
    return "El precio anterior (oferta) debe ser mayor que el precio actual";
  }
  if (product.weightG != null && (!Number.isFinite(product.weightG) || product.weightG < 0)) {
    return "El peso debe ser un número mayor o igual a 0";
  }
  if (product.status === "active" && (!Array.isArray(product.images) || !product.images.length)) {
    return "Agrega al menos una imagen para publicar el producto (estado activo)";
  }
  const sku = String(product.sku).trim().toLowerCase();
  if (products.some(p => p.id !== product.id && String(p.sku).trim().toLowerCase() === sku)) {
    return `El SKU '${product.sku}' ya existe en otro producto`;
  }
  return null;
}

function getIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/products\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

/* ============================================================
   API REST
   ============================================================ */

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    send(res, 200, { ok: true, service: "milinov-backend" });
    return;
  }

  // GET /api/products?category=&status=&q=  → lista con filtros opcionales
  if (req.method === "GET" && url.pathname === "/api/products") {
    let products = await readProducts();
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const q = url.searchParams.get("q")?.toLowerCase();

    if (category) products = products.filter(product => product.category === category);
    if (status) products = products.filter(product => product.status === status);
    if (q) {
      products = products.filter(product =>
        [product.name, product.sku, product.category, product.collection, product.model, product.material]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    send(res, 200, products);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/categories") {
    const products = await readProducts();
    const categories = [...new Set(products.map(product => product.category).filter(Boolean))].sort();
    send(res, 200, categories);
    return;
  }

  // POST /api/uploads → guarda imagen base64 en assets/uploads/
  if (req.method === "POST" && url.pathname === "/api/uploads") {
    const input = await parseBody(req);
    const image = await saveUpload(input);
    send(res, 201, { image });
    return;
  }

  const productId = getIdFromPath(url.pathname);

  if (req.method === "GET" && productId) {
    const products = await readProducts();
    const product = products.find(item => item.id === productId);
    send(res, product ? 200 : 404, product || { error: "Producto no encontrado" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/products") {
    const products = await readProducts();
    const input = await parseBody(req);
    const product = normalizeProduct(input);
    product.id = products.reduce((max, item) => Math.max(max, item.id), 0) + 1;

    const error = validateProduct(product, products);
    if (error) {
      send(res, 400, { error });
      return;
    }

    products.push(product);
    await writeProducts(products);
    send(res, 201, product);
    return;
  }

  if (req.method === "PATCH" && productId) {
    const products = await readProducts();
    const index = products.findIndex(item => item.id === productId);
    if (index === -1) {
      send(res, 404, { error: "Producto no encontrado" });
      return;
    }

    const input = await parseBody(req);
    const product = normalizeProduct(input, products[index]);
    product.id = products[index].id;

    const error = validateProduct(product, products);
    if (error) {
      send(res, 400, { error });
      return;
    }

    products[index] = product;
    await writeProducts(products);
    send(res, 200, product);
    return;
  }

  if (req.method === "DELETE" && productId) {
    const products = await readProducts();
    const nextProducts = products.filter(item => item.id !== productId);
    if (nextProducts.length === products.length) {
      send(res, 404, { error: "Producto no encontrado" });
      return;
    }

    await writeProducts(nextProducts);
    send(res, 200, { ok: true });
    return;
  }

  send(res, 404, { error: "Ruta no encontrada" });
}

/* ============================================================
   Servidor de archivos estáticos
   ============================================================ */

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

// Cabeceras de seguridad para todas las respuestas estáticas (defensa en profundidad).
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  // Bloquea salir de la carpeta del sitio. Se compara con separador final para que
  // un directorio HERMANO con prefijo igual (joyas-milinov-x) no pase el filtro.
  const root = path.normalize(SITE_ROOT);
  const filePath = path.normalize(path.join(SITE_ROOT, pathname));
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    send(res, 403, { error: "Acceso denegado" });
    return;
  }

  // No exponer la carpeta backend (datos e implementación) por HTTP.
  if (filePath === path.join(SITE_ROOT, "backend") || filePath.startsWith(path.join(SITE_ROOT, "backend") + path.sep)) {
    send(res, 404, { error: "Ruta no encontrada" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      // HTML siempre fresco; imágenes y estáticos cacheados por 1 hora en local
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    res.end(data);
  } catch {
    // Página 404 amigable si existe; si no, JSON
    try {
      const notFound = await fs.readFile(path.join(SITE_ROOT, "404.html"));
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(notFound);
    } catch {
      send(res, 404, { error: "Archivo no encontrado" });
    }
  }
}

/* ============================================================
   Arranque
   ============================================================ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  try {
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      await handleApi(req, res, url);
    } else if (req.method === "GET") {
      await serveStatic(req, res, url);
    } else {
      send(res, 405, { error: "Método no permitido" });
    }
  } catch (error) {
    // Validaciones de negocio (400) ya respondieron antes; aquí solo caen errores
    // inesperados: se registra el detalle en consola y al cliente va un mensaje genérico.
    console.error("[milinov]", error);
    if (!res.headersSent) send(res, 500, { error: "Error interno del servidor" });
  }
});

// Bind explícito a loopback: el panel/API solo es accesible desde esta misma
// máquina, nunca desde otros equipos de la red WiFi (no tiene autenticación).
// Solo arranca el servidor si se ejecuta directamente (no al importarlo en tests).
if (require.main === module) {
  const HOST = process.env.HOST || "127.0.0.1";
  server.listen(PORT, HOST, () => {
    console.log(`Milinov listo (solo local, ${HOST}):`);
    console.log(`  Sitio:  http://localhost:${PORT}/`);
    console.log(`  Admin:  http://localhost:${PORT}/admin.html`);
    console.log(`  API:    http://localhost:${PORT}/api/products`);
  });
}

// Funciones puras expuestas para las pruebas (backend/test/).
module.exports = {
  validateProduct, normalizeProduct, isValidImagePath,
  detectImageType, safeFilename, buildStaticCatalog
};
