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
  // Tolera BOM (byte order mark) si el JSON fue editado con Bloc de notas.
  const raw = (await fs.readFile(DATA_FILE, "utf8")).replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

/**
 * Escritura atómica: se escribe a un archivo temporal y luego se renombra.
 * Así, si el proceso se interrumpe a mitad de escritura, products.json
 * nunca queda corrupto.
 */
async function writeProducts(products) {
  const tmpFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  await fs.rename(tmpFile, DATA_FILE);
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

/** Convierte cualquier nombre de archivo en un slug seguro y único. */
function safeFilename(name) {
  const ext = path.extname(name).toLowerCase().replace(/[^.\w]/g, "") || ".jpg";
  const base = path.basename(name, ext).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "joya";
  return `${base}-${Date.now()}${ext}`;
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

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = safeFilename(input.filename);
  await fs.writeFile(path.join(UPLOAD_DIR, filename), bytes);
  return `assets/uploads/${filename}`;
}

/* ============================================================
   Validación de productos
   ============================================================ */

function normalizeProduct(input, fallback = {}) {
  return {
    ...fallback,
    sku: input.sku ?? fallback.sku ?? "",
    name: input.name ?? fallback.name ?? "",
    category: input.category ?? fallback.category ?? "",
    collection: input.collection ?? fallback.collection ?? "",
    model: input.model ?? fallback.model ?? "",
    material: input.material ?? fallback.material ?? "",
    price: Number(input.price ?? fallback.price ?? 0),
    stock: Number(input.stock ?? fallback.stock ?? 0),
    status: input.status ?? fallback.status ?? "active",
    image: input.image ?? fallback.image ?? "",
    description: input.description ?? fallback.description ?? ""
  };
}

function validateProduct(product) {
  const missing = ["sku", "name", "category", "model"].filter(field => !String(product[field]).trim());
  if (missing.length) return `Campos requeridos: ${missing.join(", ")}`;
  if (!Number.isFinite(product.price) || product.price < 0) return "El precio debe ser un número mayor o igual a 0";
  if (!Number.isInteger(product.stock) || product.stock < 0) return "El stock debe ser un entero mayor o igual a 0";
  if (!["active", "draft", "sold_out"].includes(product.status)) return "Estado inválido";
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

    const error = validateProduct(product);
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

    const error = validateProduct(product);
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

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  // Bloquea cualquier intento de salir de la carpeta del sitio (../../etc)
  const filePath = path.normalize(path.join(SITE_ROOT, pathname));
  if (!filePath.startsWith(path.normalize(SITE_ROOT))) {
    send(res, 403, { error: "Acceso denegado" });
    return;
  }

  // No exponer la carpeta backend (datos e implementación) por HTTP
  if (filePath.startsWith(path.join(SITE_ROOT, "backend"))) {
    send(res, 404, { error: "Ruta no encontrada" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
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
    send(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Milinov listo:`);
  console.log(`  Sitio:  http://localhost:${PORT}`);
  console.log(`  Tienda: http://localhost:${PORT}/`);
  console.log(`  Admin:  http://localhost:${PORT}/admin.html`);
  console.log(`  API:    http://localhost:${PORT}/api/products`);
});
