/**
 * Panel de inventario. En producción usa Supabase Auth, Database y Storage;
 * en localhost conserva el backend Node como modo de desarrollo.
 */
const API_URL = window.MILINOV?.apiUrl || "http://localhost:3001/api";
const SUPABASE_CONFIG = window.MILINOV?.supabase || {};
const IS_LOCAL = location.protocol === "file:" || ["localhost", "127.0.0.1", "::1", ""].includes(location.hostname);
const HAS_SUPABASE = Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey && window.supabase);

const form = document.querySelector("#productForm");
const tableBody = document.querySelector("#adminProducts");
const statusNode = document.querySelector("#adminStatus");
const imageFile = document.querySelector("#imageFile");
const imagePath = document.querySelector("#imagePath");
const thumbsBox = document.querySelector("#adminThumbs");
const dropzone = document.querySelector("#dropzone");
const csvFile = document.querySelector("#csvFile");
const loginView = document.querySelector("#adminLogin");
const setupView = document.querySelector("#adminSetup");
const appView = document.querySelector("#adminApp");
const loginForm = document.querySelector("#adminLoginForm");
const authStatus = document.querySelector("#adminAuthStatus");
const identityNode = document.querySelector("#adminIdentity");
const logoutButton = document.querySelector("#adminLogout");

let products = [];
let selectedImages = [];
let db = null;
let dataMode = "local";
let realtimeChannel = null;

function moneyAdmin(value) {
  return typeof money === "function" ? money(value) : `S/ ${Number(value).toFixed(2)}`;
}

function fromDatabase(row) {
  return {
    ...row,
    oldPrice: row.old_price ?? null,
    sizeMm: row.size_mm ?? "",
    weightG: row.weight_g ?? null,
    images: Array.isArray(row.images) ? row.images : [],
    stock: Number(row.stock),
    price: Number(row.price),
    featured: Boolean(row.featured)
  };
}

function toDatabase(product) {
  const payload = { ...product };
  if ("oldPrice" in payload) payload.old_price = payload.oldPrice;
  if ("sizeMm" in payload) payload.size_mm = payload.sizeMm;
  if ("weightG" in payload) payload.weight_g = payload.weightG;
  delete payload.oldPrice;
  delete payload.sizeMm;
  delete payload.weightG;
  delete payload.id;
  return payload;
}

async function localRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error de API");
  return data;
}

async function request(path, options = {}) {
  if (dataMode === "local") return localRequest(path, options);

  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;
  const match = path.match(/^\/products(?:\/(\d+))?$/);
  if (!match) throw new Error("Operación no disponible");

  const id = match[1] ? Number(match[1]) : null;
  let query;
  if (method === "GET" && !id) query = db.from("products").select("*").order("id");
  else if (method === "POST" && !id) query = db.from("products").insert(toDatabase(body)).select().single();
  else if (method === "PATCH" && id) query = db.from("products").update(toDatabase(body)).eq("id", id).select().single();
  else if (method === "DELETE" && id) query = db.from("products").delete().eq("id", id).select().single();
  else throw new Error("Operación no disponible");

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (Array.isArray(data)) return data.map(fromDatabase);
  return data ? fromDatabase(data) : data;
}

function setStatus(message) {
  if (statusNode) statusNode.textContent = message;
}

/* ============================================================
   Imágenes: compresión en el navegador + subida + galería
   ============================================================ */

/**
 * Redimensiona (máx. 1200 px) y comprime una imagen en el navegador antes de
 * subirla. Resuelve el problema de las fotos de celular de varios MB y deja
 * todas a un tamaño parejo. Devuelve { dataUrl, name }.
 */
function compressImage(file, maxSize = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const scale = maxSize / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        let dataUrl = canvas.toDataURL("image/webp", quality);
        // Si el navegador no soporta WebP, cae a JPEG.
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve({ dataUrl, name: file.name });
      };
      img.onerror = () => reject(new Error("No se pudo procesar la imagen"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file) {
  const { dataUrl, name } = await compressImage(file);
  if (dataMode === "supabase") {
    const blob = await fetch(dataUrl).then(response => response.blob());
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const safeBase = name.replace(/\.[^.]+$/, "").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-+|-+$/g, "").toLowerCase() || "joya";
    const { data: userData } = await db.auth.getUser();
    const unique = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `${userData.user.id}/${safeBase}-${unique}.${extension}`;
    const { error } = await db.storage.from("productos").upload(path, blob, {
      contentType: blob.type,
      cacheControl: "31536000",
      upsert: false
    });
    if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
    return db.storage.from("productos").getPublicUrl(path).data.publicUrl;
  }
  const result = await request("/uploads", {
    method: "POST",
    body: JSON.stringify({ filename: name, dataUrl })
  });
  return result.image;
}

async function handleFiles(fileList) {
  const files = [...fileList].filter(file => file.type.startsWith("image/"));
  if (!files.length) return;

  setStatus(`Subiendo ${files.length} foto(s)...`);
  for (const file of files) {
    try {
      selectedImages.push(await uploadImage(file));
    } catch (error) {
      setStatus(error.message);
    }
  }
  renderThumbs();
  setStatus(`${selectedImages.length} foto(s) lista(s)`);
}

function renderThumbs() {
  if (!thumbsBox) return;
  thumbsBox.innerHTML = selectedImages.map((src, i) => `
    <div class="admin-thumb${i === 0 ? " is-cover" : ""}">
      <img src="${esc(src)}" alt="">
      ${i === 0
        ? `<span class="cover-tag">Portada</span>`
        : `<button type="button" data-makecover="${i}" title="Usar como portada">★</button>`}
      <button type="button" class="thumb-del" data-delimg="${i}" title="Quitar foto">×</button>
    </div>
  `).join("");
}

thumbsBox?.addEventListener("click", event => {
  const del = event.target.dataset.delimg;
  const cover = event.target.dataset.makecover;
  if (del !== undefined) {
    selectedImages.splice(Number(del), 1);
    renderThumbs();
  }
  if (cover !== undefined) {
    const [img] = selectedImages.splice(Number(cover), 1);
    selectedImages.unshift(img);
    renderThumbs();
  }
});

if (dropzone) {
  ["dragover", "dragenter"].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("is-drag"); })
  );
  ["dragleave", "drop"].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("is-drag"); })
  );
  dropzone.addEventListener("drop", e => handleFiles(e.dataTransfer.files));
}

imageFile?.addEventListener("change", () => {
  handleFiles(imageFile.files);
  imageFile.value = "";
});

// Pegar una ruta de imagen ya existente y agregarla a la galería.
imagePath?.addEventListener("change", () => {
  const value = imagePath.value.trim();
  if (!value) return;
  // Solo rutas de imagen válidas: relativas a assets/ o URLs http(s) con extensión de imagen.
  if (!/^(assets\/|https?:\/\/).+\.(jpe?g|png|webp|svg)$/i.test(value)) {
    setStatus("Ruta inválida: debe empezar por 'assets/' o 'http' y terminar en .jpg/.png/.webp");
    return;
  }
  selectedImages.push(value);
  imagePath.value = "";
  renderThumbs();
});

/* ============================================================
   Formulario
   ============================================================ */

function productFromForm() {
  const data = new FormData(form);
  // (data.get(x) || "").trim() en TODOS los campos: data.get devuelve null si el
  // input no existe, y .trim() sobre null lanzaría TypeError.
  return {
    gender: (data.get("gender") || "").trim(),
    sku: (data.get("sku") || "").trim(),
    name: (data.get("name") || "").trim(),
    category: (data.get("category") || "").trim(),
    collection: (data.get("collection") || "").trim(),
    model: (data.get("model") || "").trim(),
    material: (data.get("material") || "").trim(),
    price: Number(data.get("price")),
    oldPrice: data.get("oldPrice") ? Number(data.get("oldPrice")) : null,
    stock: Number(data.get("stock")),
    status: data.get("status"),
    badge: data.get("badge") || "",
    sizeMm: (data.get("sizeMm") || "").trim(),
    care: (data.get("care") || "").trim(),
    featured: data.get("featured") === "on",
    image: selectedImages[0] || "",
    images: selectedImages.slice(),
    description: (data.get("description") || "").trim()
  };
}

function fillForm(product) {
  Object.entries(product).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field || key === "images") return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  });
  selectedImages = Array.isArray(product.images) && product.images.length
    ? product.images.slice()
    : (product.image ? [product.image] : []);
  renderThumbs();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearForm() {
  form.reset();
  form.elements.id.value = "";
  selectedImages = [];
  renderThumbs();
}

/* ============================================================
   Tabla de productos (con edición en línea y duplicar)
   ============================================================ */

const STATUS_LABELS = { active: "Activo", draft: "Borrador", sold_out: "Agotado" };

function renderProducts() {
  tableBody.innerHTML = products.map(product => `
    <tr data-id="${Number(product.id)}">
      <td>
        <span class="admin-product-cell">
          <img src="${esc(product.image || "assets/placeholder.svg")}" alt="" loading="lazy" onerror="this.src='assets/placeholder.svg'">
          <span><strong>${esc(product.name)}</strong><small>${esc(product.sku)} · ${esc(product.model)}</small></span>
        </span>
      </td>
      <td>${esc(product.category)}</td>
      <td><input class="cell-edit" type="number" min="0" step="0.01" value="${Number(product.price)}" data-field="price" aria-label="Precio"></td>
      <td><input class="cell-edit" type="number" min="0" step="1" value="${Number(product.stock)}" data-field="stock" aria-label="Stock"></td>
      <td><span class="status-pill ${esc(product.status)}">${STATUS_LABELS[product.status] || esc(product.status)}</span></td>
      <td class="admin-row-actions">
        <button type="button" data-edit="${Number(product.id)}">Editar</button>
        <button type="button" data-duplicate="${Number(product.id)}">Duplicar</button>
        <button type="button" data-delete="${Number(product.id)}">Eliminar</button>
      </td>
    </tr>
  `).join("");
}

async function loadProducts() {
  try {
    products = await request("/products");
    renderProducts();
    setStatus(`${products.length} productos cargados`);
  } catch (error) {
    const sinConexionLocal = dataMode === "local" && error instanceof TypeError;
    setStatus(sinConexionLocal ? "No se pudo conectar. Ejecuta: cd backend && npm start" : error.message);
  }
}

// Edición en línea de precio y stock: guarda al salir de la casilla.
tableBody?.addEventListener("change", async event => {
  const input = event.target.closest(".cell-edit");
  if (!input) return;
  const id = input.closest("tr").dataset.id;
  const field = input.dataset.field;
  const value = Number(input.value);

  // No enviar valores vacíos, no numéricos, negativos, decimales en stock ni precio 0:
  // se restaura el valor anterior para no poner una joya a S/ 0.00 por descuido.
  const invalid = input.value.trim() === "" || !Number.isFinite(value) || value < 0
    || (field === "stock" && !Number.isInteger(value))
    || (field === "price" && value <= 0);
  if (invalid) {
    input.value = input.defaultValue;
    setStatus("Valor inválido: se restauró el anterior");
    return;
  }

  try {
    const current = products.find(product => product.id === Number(id));
    const changes = { [field]: value };
    if (field === "stock" && value === 0) changes.status = "sold_out";
    if (field === "stock" && value > 0 && current?.status === "sold_out") changes.status = "active";
    await request(`/products/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
    setStatus(`Actualizado: ${field === "price" ? "precio" : "stock"}`);
    await loadProducts();
  } catch (error) {
    setStatus(error.message);
  }
});

tableBody?.addEventListener("click", async event => {
  const editId = event.target.dataset.edit;
  const dupId = event.target.dataset.duplicate;
  const deleteId = event.target.dataset.delete;

  if (editId) {
    const product = products.find(item => item.id === Number(editId));
    if (product) fillForm(product);
  }

  if (dupId) {
    const product = products.find(item => item.id === Number(dupId));
    if (product) {
      const copy = { ...product };
      delete copy.id;
      copy.sku = ""; // forzar un SKU único nuevo (no se permiten duplicados)
      copy.name = `${copy.name} (copia)`;
      fillForm(copy);
      setStatus("Producto duplicado: escribe un SKU único y guarda como nuevo");
    }
  }

  if (deleteId && confirm("¿Eliminar este producto?")) {
    try {
      await request(`/products/${deleteId}`, { method: "DELETE" });
      await loadProducts();
      setStatus("Producto eliminado");
    } catch (error) {
      setStatus(error.message);
    }
  }
});

form?.addEventListener("submit", async event => {
  event.preventDefault();
  const id = form.elements.id.value;

  try {
    const product = productFromForm();
    if (!Number.isFinite(product.price) || product.price <= 0) {
      setStatus("Ingresa un precio válido mayor que 0");
      return;
    }
    if (!Number.isInteger(product.stock) || product.stock < 0) {
      setStatus("El stock debe ser un número entero (0 o más)");
      return;
    }
    if (product.stock === 0) product.status = "sold_out";
    if (!product.images.length) {
      setStatus("Agrega al menos una foto");
      return;
    }
    if (id) {
      await request(`/products/${id}`, { method: "PATCH", body: JSON.stringify(product) });
      setStatus("Producto actualizado");
    } else {
      await request("/products", { method: "POST", body: JSON.stringify(product) });
      setStatus("Producto creado");
    }
    clearForm();
    await loadProducts();
  } catch (error) {
    setStatus(error.message);
  }
});

/* ============================================================
   Importar / exportar CSV
   ============================================================ */

/** Parser CSV mínimo que respeta comillas dobles y el delimitador indicado (',' o ';'). */
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

async function importCsv(file) {
  if (!file) return;
  const text = await file.text();

  // Detecta el delimitador: Excel en español (es-PE) exporta CSV con ';'.
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delimiter = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";

  // Descarta solo filas totalmente vacías (no por número de columnas).
  const rows = parseCsv(text, delimiter).filter(r => !r.every(c => !c.trim()));
  if (rows.length < 2) { setStatus("El CSV está vacío o no tiene filas de datos"); return; }

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const errores = [];
  const skusVistos = new Set();
  let ok = 0;
  setStatus(`Importando ${rows.length - 1} fila(s)...`);

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const fila = r + 1; // número de línea legible (la cabecera es la fila 1)

    if (cells.length !== headers.length) {
      errores.push(`fila ${fila}: tiene ${cells.length} columnas, se esperaban ${headers.length} (¿delimitador o comas sin comillas?)`);
      continue;
    }

    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] || "").trim(); });

    const price = Number(obj.price);
    const stock = Number(obj.stock || 0);
    const status = (obj.status || "active").toLowerCase();
    const sku = (obj.sku || "").toLowerCase();
    // Normaliza género: acepta "hombre"/"mujer" en cualquier capitalización.
    const gender = obj.gender ? obj.gender.charAt(0).toUpperCase() + obj.gender.slice(1).toLowerCase() : "";

    // Validación local antes de gastar una petición por fila (acumula motivos claros).
    const motivos = [];
    if (!obj.sku) motivos.push("SKU vacío");
    else if (skusVistos.has(sku)) motivos.push("SKU repetido dentro del CSV");
    if (!["Hombre", "Mujer"].includes(gender)) motivos.push("género inválido (usa Hombre o Mujer)");
    if (!obj.name) motivos.push("nombre vacío");
    if (!obj.category) motivos.push("categoría vacía");
    if (!Number.isFinite(price) || price <= 0) motivos.push("precio inválido");
    if (!Number.isInteger(stock) || stock < 0) motivos.push("stock inválido");
    if (!["active", "draft", "sold_out"].includes(status)) motivos.push("estado inválido (usa active/draft/sold_out)");
    if (motivos.length) { errores.push(`fila ${fila}: ${motivos.join(", ")}`); continue; }

    skusVistos.add(sku);
    const product = {
      gender, sku: obj.sku, name: obj.name, category: obj.category, collection: obj.collection || "",
      model: obj.model || "", material: obj.material || "",
      price, stock, status,
      image: obj.image || "", images: obj.image ? [obj.image] : [],
      description: obj.description || ""
    };
    try {
      await request("/products", { method: "POST", body: JSON.stringify(product) });
      ok++;
    } catch (error) {
      errores.push(`fila ${fila}: ${error.message}`);
    }
  }

  await loadProducts();
  if (errores.length) {
    console.table(errores);
    setStatus(`Importación: ${ok} creados, ${errores.length} con error (revisa el detalle en la consola del navegador, tecla F12)`);
  } else {
    setStatus(`Importación lista: ${ok} producto(s) creado(s)`);
  }
}

function downloadCsvTemplate() {
  const headers = "gender,sku,name,category,collection,model,material,price,stock,status,image,description";
  const ejemplo = 'Mujer,MIL-COL-099,Collar Luna,Collares,Silver,Luna,Plata 950,129,5,active,assets/products/collar-luna.jpg,"Collar delicado con dije de luna"';
  const blob = new Blob([`${headers}\n${ejemplo}\n`], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, "plantilla-productos.csv");
}

/**
 * Exporta el catálogo actual al formato de js/products.js y lo descarga, para
 * publicar la tienda sin backend. La tienda pública mostrará lo mismo que el panel.
 */
function exportBackup() {
  if (!products.length) {
    setStatus("No hay productos para exportar");
    return;
  }
  const items = products.map(product => {
    const fields = {
      id: product.id, gender: product.gender, name: product.name, category: product.category,
      collection: product.collection, material: product.material, price: product.price,
      oldPrice: product.oldPrice, image: product.image, images: product.images,
      description: product.description, stock: product.stock, status: product.status,
      badge: product.badge, sizeMm: product.sizeMm, care: product.care, featured: product.featured
    };
    const body = Object.entries(fields)
      .filter(([, value]) => value !== "" && value !== null && value !== undefined &&
        !(Array.isArray(value) && value.length === 0) && value !== false)
      .map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`)
      .join(",\n");
    return `  {\n${body}\n  }`;
  }).join(",\n");

  const header =
    "/**\n" +
    " * products.js — Catálogo estático de respaldo (generado desde admin.html).\n" +
    " *\n" +
    " * Reemplaza este archivo en tu hosting para que la tienda pública (sin backend)\n" +
    " * muestre el mismo inventario del panel. No editar a mano: re-exportar desde el admin.\n" +
    ` * Generado: ${new Date().toLocaleString("es-PE")}\n` +
    " */\n";
  // Neutraliza "</script>" por defensa en profundidad (por si algún día se
  // incrustara el catálogo inline en un <script> en vez de cargarlo como archivo).
  const content = `${header}const PRODUCTS = [\n${items}\n];\n`.replace(/<\/(script)/gi, "<\\/$1");
  const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
  triggerDownload(blob, "products.js");
  setStatus("Respaldo descargado: reemplaza js/products.js en tu hosting");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ============================================================
   Acceso al panel y sincronización en tiempo real
   ============================================================ */

function showOnly(view) {
  [loginView, setupView, appView].forEach(node => {
    if (node) node.hidden = node !== view;
  });
}

async function openOnlineAdmin(user) {
  const { data, error } = await db.from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    showOnly(loginView);
    authStatus.textContent = "Esta cuenta no tiene permiso para administrar la tienda.";
    return false;
  }

  dataMode = "supabase";
  showOnly(appView);
  identityNode.textContent = user.email || "Cuenta administradora";
  logoutButton.hidden = false;
  await loadProducts();
  subscribeToInventory();
  return true;
}

function subscribeToInventory() {
  if (!db || realtimeChannel) return;
  let refreshTimer;
  realtimeChannel = db.channel("admin-products-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(loadProducts, 150);
    })
    .subscribe();
}

loginForm?.addEventListener("submit", async event => {
  event.preventDefault();
  authStatus.textContent = "Verificando acceso...";
  const data = new FormData(loginForm);
  const { data: signed, error } = await db.auth.signInWithPassword({
    email: String(data.get("email") || "").trim(),
    password: String(data.get("password") || "")
  });
  if (error) {
    authStatus.textContent = "Correo o contraseña incorrectos.";
    return;
  }
  authStatus.textContent = "";
  await openOnlineAdmin(signed.user);
});

logoutButton?.addEventListener("click", async () => {
  if (realtimeChannel) await db.removeChannel(realtimeChannel);
  realtimeChannel = null;
  await db.auth.signOut();
  loginForm.reset();
  showOnly(loginView);
  authStatus.textContent = "Sesión cerrada.";
});

async function initAdmin() {
  renderThumbs();

  if (HAS_SUPABASE) {
    db = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    const { data: { session } } = await db.auth.getSession();
    if (session?.user) await openOnlineAdmin(session.user);
    else showOnly(loginView);
    return;
  }

  if (IS_LOCAL) {
    dataMode = "local";
    showOnly(appView);
    identityNode.textContent = "Modo local";
    await loadProducts();
    return;
  }

  showOnly(setupView);
}

/* ============================================================
   Listeners de la barra de acciones
   ============================================================ */

// Wiring de la barra de acciones con optional chaining: si admin.js se cargara
// por error en otra página (sin estos elementos), no rompe nada.
document.querySelector("#clearForm")?.addEventListener("click", clearForm);
document.querySelector("#reloadProducts")?.addEventListener("click", loadProducts);
document.querySelector("#exportBackup")?.addEventListener("click", exportBackup);
document.querySelector("#importCsvBtn")?.addEventListener("click", () => csvFile?.click());
document.querySelector("#csvTemplate")?.addEventListener("click", downloadCsvTemplate);
csvFile?.addEventListener("change", () => {
  importCsv(csvFile.files[0]);
  csvFile.value = "";
});

if (form && tableBody) initAdmin();
