const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 3001);
const DATA_FILE = path.join(__dirname, "data", "products.json");
const UPLOAD_DIR = path.join(__dirname, "..", "assets", "uploads");

async function readProducts() {
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeProducts(products) {
  await fs.writeFile(DATA_FILE, `${JSON.stringify(products, null, 2)}\n`, "utf8");
}

function send(res, status, payload) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
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
  return null;
}

function getIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/products\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    send(res, 204, {});
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      send(res, 200, { ok: true, service: "milinov-backend" });
      return;
    }

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
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Milinov backend listo en http://localhost:${PORT}`);
});
