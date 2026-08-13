/**
 * inventory-rules.js — Reglas de inventario de Milinov Jewelry.
 *
 * ÚNICA fuente de verdad de validación y normalización de productos, imágenes
 * y CSV. La usan:
 *   - el panel (js/admin.js, navegador, como window.MilinovRules),
 *   - el backend local (backend/server.js, CommonJS),
 *   - las pruebas (backend/test/*.test.js).
 *
 * Las reglas REPLICAN las constraints de supabase/migrations/ (la base manda);
 * aquí solo se traducen a mensajes claros antes de gastar una petición.
 * Este archivo NO se publica en el build desactivado (va junto a admin.js).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MilinovRules = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ESTADOS = ["active", "draft", "sold_out"];
  const GENEROS = ["Hombre", "Mujer"];
  const BADGES = ["", "nuevo", "bestseller"];

  /** Extensión real derivada del MIME validado (nunca del nombre del archivo). */
  const IMAGE_MIME_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp"
  };

  /** Límite de subida (también lo aplica el bucket del lado servidor). */
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  /** Mismo patrón que la política SQL es_ruta_de_foto_valida (D5). */
  const STORAGE_PATH_PATTERN =
    /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpe?g|png)$/;

  /**
   * Verifica los magic bytes y devuelve el tipo real de imagen, o null.
   * Acepta Buffer o Uint8Array (funciona igual en Node y navegador).
   */
  function detectImageType(bytes) {
    if (!bytes || bytes.length < 12) return null;
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    const ascii = (from, to) => String.fromCharCode(...Array.from(bytes.slice(from, to)));
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
    return null;
  }

  /** Ruta de subida no predecible bajo el prefijo cerrado del bucket (D5). */
  function storageImagePath(mimeType, uuid) {
    const ext = IMAGE_MIME_TO_EXT[mimeType];
    if (!ext) throw new Error("Tipo de imagen no permitido (usa JPG, PNG o WebP)");
    const path = `products/${uuid}.${ext}`;
    if (!STORAGE_PATH_PATTERN.test(path)) throw new Error("Nombre de archivo inválido");
    return path;
  }

  /** Solo rutas de imagen razonables: relativas a assets/ o URLs http(s). */
  function isValidImagePath(value) {
    if (typeof value !== "string") return false;
    const v = value.trim();
    if (!v || !/\.(jpe?g|png|webp|svg)$/i.test(v)) return false;
    return v.startsWith("assets/") || /^https?:\/\//i.test(v);
  }

  /** Convierte a número o devuelve null si no es un número válido (campo opcional). */
  function numOrNull(value, fallback = null) {
    if (value === undefined) return fallback;
    if (value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeProduct(input, fallback = {}) {
    const rawImages = Array.isArray(input.images)
      ? input.images
      : (Array.isArray(fallback.images) ? fallback.images : []);
    const images = rawImages.filter(isValidImagePath).map(v => v.trim());
    const image = isValidImagePath(input.image) ? input.image.trim()
      : (images[0] ?? (isValidImagePath(fallback.image) ? fallback.image : ""));
    const gallery = image && !images.length ? [image] : images;

    return {
      ...fallback,
      sku: String(input.sku ?? fallback.sku ?? "").trim(),
      gender: input.gender ?? fallback.gender ?? "",
      name: String(input.name ?? fallback.name ?? "").trim(),
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
      image: gallery[0] ?? "",
      images: gallery,
      description: String(input.description ?? fallback.description ?? "").trim()
    };
  }

  /**
   * Regla stock↔estado (D2): stock 0 nunca queda "active"; al reponer stock,
   * un producto agotado vuelve a "active". Devuelve el estado final.
   */
  function stockStatusRule(status, stock) {
    if (Number(stock) === 0 && status === "active") return "sold_out";
    if (Number(stock) > 0 && status === "sold_out") return "active";
    return status;
  }

  /**
   * Valida un producto ya normalizado contra las MISMAS reglas que las
   * constraints de la base (mensajes en claro). Devuelve string o null.
   */
  function validateProduct(product, products = []) {
    const missing = ["sku", "name"].filter(field => !String(product[field] ?? "").trim());
    if (missing.length) return `Campos requeridos: ${missing.join(", ")}`;
    if (!GENEROS.includes(product.gender)) return "Selecciona el género (Hombre o Mujer)";
    if (String(product.name).length > 120) return "El nombre es demasiado largo (máximo 120 caracteres)";
    if (String(product.description).length > 1000) return "La descripción es demasiado larga (máximo 1000 caracteres)";
    if (!Number.isFinite(product.price) || product.price <= 0) return "El precio debe ser un número mayor que 0";
    if (!Number.isInteger(product.stock) || product.stock < 0) return "El stock debe ser un entero mayor o igual a 0";
    if (!ESTADOS.includes(product.status)) return "Estado inválido";
    if (!BADGES.includes(product.badge ?? "")) return "Etiqueta inválida";
    if (product.oldPrice != null && (!Number.isFinite(product.oldPrice) || product.oldPrice <= product.price)) {
      return "El precio anterior (oferta) debe ser mayor que el precio actual";
    }
    if (product.weightG != null && (!Number.isFinite(product.weightG) || product.weightG < 0)) {
      return "El peso debe ser un número mayor o igual a 0";
    }
    if (product.status === "active" && product.stock === 0) {
      return "Un producto activo necesita stock (usa Agotado o Borrador si no hay unidades)";
    }
    // Publicado (activo o agotado) exige ficha completa, igual que la base.
    if (product.status !== "draft") {
      const etiquetas = { category: "categoría", material: "material", model: "modelo" };
      const incompletos = ["category", "material", "model"]
        .filter(field => !String(product[field] ?? "").trim())
        .map(field => etiquetas[field]);
      if (incompletos.length) {
        return `Para publicar completa: ${incompletos.join(", ")} (o guarda como borrador)`;
      }
      if (!Array.isArray(product.images) || !product.images.length) {
        return "Agrega al menos una foto para publicar (o guarda como borrador)";
      }
    }
    const sku = String(product.sku).trim().toLowerCase();
    if (products.some(p => p.id !== product.id && String(p.sku).trim().toLowerCase() === sku)) {
      return `El SKU '${product.sku}' ya existe en otro producto`;
    }
    return null;
  }

  /** Valida la edición rápida de una celda (precio o stock). Devuelve string o null. */
  function validateCellEdit(field, rawValue) {
    const value = Number(rawValue);
    if (String(rawValue).trim() === "" || !Number.isFinite(value) || value < 0) return "Valor inválido";
    if (field === "stock" && !Number.isInteger(value)) return "El stock debe ser un número entero";
    if (field === "price" && value <= 0) return "El precio debe ser mayor que 0";
    return null;
  }

  /* ============================================================
     CSV
     ============================================================ */

  /** Parser CSV mínimo que respeta comillas dobles y el delimitador indicado. */
  function parseCsv(text, delimiter = ",") {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else {
        field += c;
      }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /** Excel en español (es-PE) exporta con ';': detecta el delimitador real. */
  function detectCsvDelimiter(firstLine) {
    return String(firstLine || "").split(";").length > String(firstLine || "").split(",").length ? ";" : ",";
  }

  /**
   * Valida TODO el CSV antes de escribir nada (todo-o-nada, handoff §10).
   * Devuelve { products, errors }: si errors tiene elementos, no debe
   * importarse ninguna fila.
   */
  function validateCsvImport(text, existingProducts = []) {
    const firstLine = String(text).split(/\r?\n/)[0] || "";
    const delimiter = detectCsvDelimiter(firstLine);
    const rows = parseCsv(String(text), delimiter).filter(r => !r.every(c => !String(c).trim()));
    if (rows.length < 2) return { products: [], errors: ["El CSV está vacío o no tiene filas de datos"] };

    const headers = rows[0].map(h => String(h).trim().toLowerCase());
    const errors = [];
    const products = [];
    const skusVistos = new Set();

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const fila = r + 1; // la cabecera es la fila 1
      if (cells.length !== headers.length) {
        errors.push(`fila ${fila}: tiene ${cells.length} columnas, se esperaban ${headers.length} (¿delimitador o comas sin comillas?)`);
        continue;
      }
      const obj = {};
      headers.forEach((h, i) => { obj[h] = String(cells[i] ?? "").trim(); });

      const gender = obj.gender
        ? obj.gender.charAt(0).toUpperCase() + obj.gender.slice(1).toLowerCase()
        : "";
      const product = normalizeProduct({
        sku: obj.sku, gender, name: obj.name, category: obj.category,
        collection: obj.collection || "", model: obj.model || "", material: obj.material || "",
        price: Number(obj.price),
        oldPrice: obj.oldprice || obj.old_price || null,
        stock: obj.stock === "" ? 0 : Number(obj.stock),
        status: (obj.status || "active").toLowerCase(),
        image: obj.image || "",
        images: obj.image ? [obj.image] : [],
        description: obj.description || ""
      });
      product.status = stockStatusRule(product.status, product.stock);

      const motivos = [];
      const skuKey = product.sku.toLowerCase();
      if (product.sku && skusVistos.has(skuKey)) motivos.push("SKU repetido dentro del CSV");
      const error = validateProduct(product, existingProducts);
      if (error) motivos.push(error);
      if (motivos.length) {
        errors.push(`fila ${fila}: ${motivos.join("; ")}`);
        continue;
      }
      skusVistos.add(skuKey);
      products.push(product);
    }
    return { products, errors };
  }

  return {
    ESTADOS,
    GENEROS,
    BADGES,
    IMAGE_MIME_TO_EXT,
    MAX_IMAGE_BYTES,
    STORAGE_PATH_PATTERN,
    detectImageType,
    storageImagePath,
    isValidImagePath,
    numOrNull,
    normalizeProduct,
    stockStatusRule,
    validateProduct,
    validateCellEdit,
    parseCsv,
    detectCsvDelimiter,
    validateCsvImport
  };
});
