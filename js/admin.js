/**
 * Panel de inventario. En producción usa Supabase Auth, Database y Storage;
 * en localhost conserva el backend Node como modo de desarrollo.
 *
 * Seguridad real = grants + RLS en supabase/migrations/ (el navegador solo
 * valida para dar mensajes claros). Reglas compartidas: js/inventory-rules.js.
 * Diseño: docs/agent/DESIGN-ADMIN-INVENTARIO.md (D1, D5, D6, D7).
 */
const API_URL = window.MILINOV?.apiUrl || "http://localhost:3001/api";
const SUPABASE_CONFIG = window.MILINOV?.supabase || {};
const SUPABASE_KEY = SUPABASE_CONFIG.publishableKey || SUPABASE_CONFIG.anonKey || "";
const IS_LOCAL = location.protocol === "file:" || ["localhost", "127.0.0.1", "::1", ""].includes(location.hostname);
const HAS_SUPABASE = Boolean(SUPABASE_CONFIG.enabled && SUPABASE_CONFIG.url && SUPABASE_KEY && window.supabase);
const RULES = window.MilinovRules;

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
const recoveryView = document.querySelector("#adminRecovery");
const appView = document.querySelector("#adminApp");
const loginForm = document.querySelector("#adminLoginForm");
const recoveryForm = document.querySelector("#adminRecoveryForm");
const authStatus = document.querySelector("#adminAuthStatus");
const recoveryStatus = document.querySelector("#adminRecoveryStatus");
const identityNode = document.querySelector("#adminIdentity");
const logoutButton = document.querySelector("#adminLogout");
const forgotLink = document.querySelector("#adminForgot");
const productsView = document.querySelector("#productsView");
const saveButton = document.querySelector("#saveProduct");
const viewButtons = [...document.querySelectorAll("[data-admin-view]")];
const statButtons = [...document.querySelectorAll("[data-inventory-filter]")];
const searchInput = document.querySelector("#adminSearch");
const categoryFilter = document.querySelector("#adminCategoryFilter");
const statusFilter = document.querySelector("#adminStatusFilter");
const formTitle = document.querySelector("#formTitle");
const formEyebrow = document.querySelector("#formEyebrow");

let products = [];
let selectedImages = [];
let db = null;
let dataMode = "local";
let realtimeChannel = null;
let realtimeRetryTimer = null;
let realtimePollTimer = null;
let realtimeRetryDelay = 2000;
let inventoryFilter = "all";
let saving = false;            // candado global contra dobles envíos
let passwordRecoveryPending = false; // enlace de recuperación abierto: exigir nueva contraseña

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
    featured: Boolean(row.featured),
    version: row.version ?? null
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
  delete payload.version;     // la versión la administra el trigger de la base
  delete payload.created_at;
  delete payload.updated_at;
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

/** Error especial para distinguir un conflicto de concurrencia (D1). */
class ConflictError extends Error {
  constructor() {
    super("Otro dispositivo modificó esta joya. Se recargó el inventario: revisa y vuelve a guardar.");
    this.name = "ConflictError";
  }
}

/**
 * Capa de datos. En modo supabase, PATCH y DELETE exigen la versión leída: si
 * otra sesión guardó antes, la base no devuelve filas y se lanza ConflictError.
 */
async function request(path, options = {}) {
  if (dataMode === "local") return localRequest(path, options);

  const method = (options.method || "GET").toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;
  const match = path.match(/^\/products(?:\/(\d+))?$/);
  if (!match) throw new Error("Operación no disponible");

  const id = match[1] ? Number(match[1]) : null;
  if (method === "GET" && !id) {
    const { data, error } = await db.from("products").select("*").order("id");
    if (error) throw new Error(error.message);
    return (data || []).map(fromDatabase);
  }
  if (method === "POST" && !id) {
    const { data, error } = await db.from("products").insert(toDatabase(body)).select().single();
    if (error) throw new Error(friendlyDbError(error));
    return fromDatabase(data);
  }
  if (method === "PATCH" && id) {
    if (!Number.isInteger(options.expectedVersion)) throw new ConflictError();
    let query = db.from("products").update(toDatabase(body)).eq("id", id);
    // Concurrencia optimista: solo pisa la fila si nadie la cambió desde que se leyó.
    query = query.eq("version", options.expectedVersion);
    const { data, error } = await query.select();
    if (error) throw new Error(friendlyDbError(error));
    if (!data || !data.length) throw new ConflictError();
    return fromDatabase(data[0]);
  }
  if (method === "DELETE" && id) {
    if (!Number.isInteger(options.expectedVersion)) throw new ConflictError();
    let query = db.from("products").delete().eq("id", id);
    query = query.eq("version", options.expectedVersion);
    const { data, error } = await query.select();
    if (error) throw new Error(friendlyDbError(error));
    if (!data || !data.length) throw new ConflictError();
    return fromDatabase(data[0]);
  }
  throw new Error("Operación no disponible");
}

/** Traduce los errores de constraints de la base a mensajes operativos. */
function friendlyDbError(error) {
  const text = `${error.message || ""} ${error.details || ""}`;
  if (/products_sku_unico|duplicate key/i.test(text)) return "Ese SKU ya existe en otro producto";
  if (/products_precio_anterior_mayor/i.test(text)) return "El precio anterior (oferta) debe ser mayor que el precio actual";
  if (/products_activo_con_stock/i.test(text)) return "Un producto activo necesita stock: usa Agotado o Borrador";
  if (/products_publicado_completo/i.test(text)) return "Para publicar completa categoría, material, modelo y al menos una foto";
  if (/products_portada_coherente|products_images_arreglo/i.test(text)) return "La galería de fotos quedó inconsistente: vuelve a abrir el producto";
  if (/row-level security/i.test(text)) return "Tu cuenta no tiene permiso para esta operación";
  return error.message || "Error de base de datos";
}

function setStatus(message) {
  if (statusNode) statusNode.textContent = message;
}

/* ============================================================
   Imágenes: validación + compresión en el navegador + subida (D5, D6)
   ============================================================ */

/**
 * Redimensiona (máx. 1200 px) y comprime una imagen en el navegador antes de
 * subirla. No amplía imágenes pequeñas. Devuelve { dataUrl, name }.
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

/**
 * Frontera de entrada de un archivo: tamaño y contenido real (magic bytes).
 * El servidor (bucket) repite estas reglas; aquí solo damos el error temprano.
 */
async function assertValidImageFile(file) {
  if (file.size > RULES.MAX_IMAGE_BYTES) {
    throw new Error(`${file.name}: supera 5 MB`);
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!RULES.detectImageType(head)) {
    throw new Error(`${file.name}: no es una imagen JPG, PNG o WebP válida`);
  }
}

async function uploadImage(file) {
  await assertValidImageFile(file);
  const { dataUrl, name } = await compressImage(file);
  if (dataMode === "supabase") {
    const blob = await fetch(dataUrl).then(response => response.blob());
    // Nombre no predecible bajo el prefijo cerrado del bucket (D5).
    const path = RULES.storageImagePath(blob.type, crypto.randomUUID());
    const { error } = await db.storage.from("productos").upload(path, blob, {
      contentType: blob.type,
      cacheControl: "31536000",
      upsert: false
    });
    if (error) throw new Error(`No se pudo subir ${name}: ${error.message}`);
    return db.storage.from("productos").getPublicUrl(path).data.publicUrl;
  }
  const result = await localRequest("/uploads", {
    method: "POST",
    body: JSON.stringify({ filename: name, dataUrl })
  });
  return result.image;
}

async function handleFiles(fileList) {
  const files = [...fileList].filter(file => file.type.startsWith("image/") || file.type === "");
  if (!files.length) return;

  const errores = [];
  let subidas = 0;
  for (const file of files) {
    setStatus(`Subiendo foto ${subidas + errores.length + 1} de ${files.length}...`);
    try {
      selectedImages.push(await uploadImage(file));
      subidas++;
      renderThumbs();
    } catch (error) {
      errores.push(error.message);
    }
  }
  renderThumbs();
  if (errores.length) {
    setStatus(`${subidas} foto(s) lista(s); ${errores.length} con error: ${errores.join(" · ")}`);
  } else {
    setStatus(`${selectedImages.length} foto(s) lista(s)`);
  }
}

function renderThumbs() {
  if (!thumbsBox) return;
  thumbsBox.innerHTML = selectedImages.map((src, i) => `
    <div class="admin-thumb${i === 0 ? " is-cover" : ""}">
      <img src="${esc(src)}" alt="Foto ${i + 1} de la joya">
      ${i === 0
        ? `<span class="cover-tag">Portada</span>`
        : `<button type="button" data-makecover="${i}" title="Usar como portada" aria-label="Usar foto ${i + 1} como portada">★</button>`}
      <button type="button" class="thumb-del" data-delimg="${i}" title="Quitar foto" aria-label="Quitar foto ${i + 1}">×</button>
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
  if (!RULES.isValidImagePath(value)) {
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
  return RULES.normalizeProduct({
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
  });
}

function fillForm(product) {
  Object.entries(product).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field || key === "images") return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";
  });
  // Siempre explícitos: un duplicado sin id/version no debe heredar los de una
  // edición anterior (guardaría ENCIMA de otra joya).
  form.elements.id.value = product.id ?? "";
  form.elements.version.value = product.version ?? "";
  selectedImages = Array.isArray(product.images) && product.images.length
    ? product.images.slice()
    : (product.image ? [product.image] : []);
  renderThumbs();
  formTitle.textContent = product.id ? "Editar joya" : "Agregar joya";
  formEyebrow.textContent = product.name || "Producto";
  setAdminView("editor");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearForm() {
  form.reset();
  form.elements.id.value = "";
  form.elements.version.value = "";
  selectedImages = [];
  renderThumbs();
  formTitle.textContent = "Agregar joya";
  formEyebrow.textContent = "Nuevo producto";
}

/* ============================================================
   Tabla de productos (con edición en línea y duplicar)
   ============================================================ */

const STATUS_LABELS = { active: "Activo", draft: "Borrador", sold_out: "Agotado" };

function setAdminView(view) {
  const showEditor = view === "editor";
  form.hidden = !showEditor;
  productsView.hidden = showEditor;
  viewButtons.forEach(button => {
    const active = button.dataset.adminView === view;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (!showEditor) window.scrollTo({ top: 0, behavior: "smooth" });
}

function matchesInventoryFilter(product) {
  if (inventoryFilter === "active") return product.status === "active" && Number(product.stock) > 0;
  if (inventoryFilter === "low") return product.status === "active" && Number(product.stock) > 0 && Number(product.stock) <= 3;
  if (inventoryFilter === "sold_out") return product.status === "sold_out" || Number(product.stock) === 0;
  return true;
}

function visibleProducts() {
  const term = searchInput?.value.trim().toLocaleLowerCase("es") || "";
  const category = categoryFilter?.value || "";
  const status = statusFilter?.value || "";

  return products.filter(product => {
    const searchable = [
      product.name,
      product.sku,
      product.model,
      product.material,
      product.collection
    ].join(" ").toLocaleLowerCase("es");
    return matchesInventoryFilter(product)
      && (!term || searchable.includes(term))
      && (!category || product.category === category)
      && (!status || product.status === status);
  });
}

function renderInventorySummary() {
  const available = products.filter(product => product.status === "active" && Number(product.stock) > 0).length;
  const low = products.filter(product => product.status === "active" && Number(product.stock) > 0 && Number(product.stock) <= 3).length;
  const soldOut = products.filter(product => product.status === "sold_out" || Number(product.stock) === 0).length;
  document.querySelector("#statTotal").textContent = products.length;
  document.querySelector("#statActive").textContent = available;
  document.querySelector("#statLow").textContent = low;
  document.querySelector("#statSoldOut").textContent = soldOut;
}

function renderProducts() {
  const visible = visibleProducts();
  renderInventorySummary();
  if (!visible.length) {
    tableBody.innerHTML = `
      <tr>
        <td class="admin-empty" colspan="6">
          <strong>No hay productos con estos filtros</strong>
          <span>Prueba otra búsqueda o limpia los filtros.</span>
        </td>
      </tr>
    `;
    setStatus(`0 de ${products.length} productos`);
    return;
  }

  tableBody.innerHTML = visible.map(product => `
    <tr data-id="${Number(product.id)}" data-version="${Number(product.version) || ""}">
      <td>
        <span class="admin-product-cell">
          <img src="${esc(product.image || "assets/placeholder.svg")}" alt="" loading="lazy" onerror="this.src='assets/placeholder.svg'">
          <span><strong>${esc(product.name)}</strong><small>${esc(product.sku)} · ${esc(product.model)}</small></span>
        </span>
      </td>
      <td>${esc(product.category)}</td>
      <td><input class="cell-edit" type="number" min="0" step="0.01" value="${Number(product.price)}" data-field="price" aria-label="Precio de ${esc(product.name)}"></td>
      <td><input class="cell-edit" type="number" min="0" step="1" value="${Number(product.stock)}" data-field="stock" aria-label="Stock de ${esc(product.name)}"></td>
      <td><span class="status-pill ${esc(product.status)}">${STATUS_LABELS[product.status] || esc(product.status)}</span></td>
      <td class="admin-row-actions">
        <button type="button" data-edit="${Number(product.id)}">Editar</button>
        <button type="button" data-duplicate="${Number(product.id)}">Duplicar</button>
        <button type="button" data-delete="${Number(product.id)}">Eliminar</button>
      </td>
    </tr>
  `).join("");
  setStatus(visible.length === products.length
    ? `${products.length} productos cargados`
    : `${visible.length} de ${products.length} productos`);
}

async function loadProducts() {
  try {
    tableBody?.setAttribute("aria-busy", "true");
    products = await request("/products");
    renderProducts();
  } catch (error) {
    const sinConexionLocal = dataMode === "local" && error instanceof TypeError;
    setStatus(sinConexionLocal
      ? "No se pudo conectar. Ejecuta: cd backend && npm start"
      : `No se pudo cargar el inventario: ${error.message}. Usa "Actualizar inventario" para reintentar.`);
  } finally {
    tableBody?.removeAttribute("aria-busy");
  }
}

// Edición en línea de precio y stock: guarda al salir de la casilla.
tableBody?.addEventListener("change", async event => {
  const input = event.target.closest(".cell-edit");
  if (!input) return;
  const row = input.closest("tr");
  const id = Number(row.dataset.id);
  const version = Number(row.dataset.version) || null;
  const field = input.dataset.field;
  const value = Number(input.value);

  const invalid = RULES.validateCellEdit(field, input.value);
  if (invalid) {
    input.value = input.defaultValue;
    setStatus(`${invalid}: se restauró el valor anterior`);
    return;
  }

  const current = products.find(product => product.id === id);
  const changes = { [field]: value };
  if (field === "stock" && current) {
    const nuevoEstado = RULES.stockStatusRule(current.status, value);
    if (nuevoEstado !== current.status) changes.status = nuevoEstado;
  }

  input.disabled = true;
  setStatus(`Guardando ${field === "price" ? "precio" : "stock"}...`);
  try {
    await request(`/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
      expectedVersion: version
    });
    setStatus(`Actualizado: ${field === "price" ? "precio" : "stock"}`);
  } catch (error) {
    input.value = input.defaultValue; // revertir visualmente la edición fallida
    setStatus(error.message);
  } finally {
    input.disabled = false;
    await loadProducts();
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
      delete copy.version;
      copy.sku = ""; // forzar un SKU único nuevo (no se permiten duplicados)
      copy.name = `${copy.name} (copia)`;
      fillForm(copy);
      setStatus("Producto duplicado: escribe un SKU único y guarda como nuevo");
    }
  }

  if (deleteId) {
    const product = products.find(item => item.id === Number(deleteId));
    if (!product) return;
    const confirmado = confirm(
      `¿Eliminar "${product.name}" (${product.sku}) DEFINITIVAMENTE?\n\n` +
      `Esta acción no se puede deshacer. Si prefieres conservar su historial, ` +
      `cancela y cámbiala a estado "Borrador".`
    );
    if (!confirmado) return;
    try {
      await request(`/products/${deleteId}`, {
        method: "DELETE",
        expectedVersion: Number(product.version) || null
      });
      await loadProducts();
      setStatus("Producto eliminado");
    } catch (error) {
      setStatus(error.message);
      await loadProducts();
    }
  }
});

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (saving) return; // candado contra doble envío
  const id = form.elements.id.value;
  const expectedVersion = Number(form.elements.version.value) || null;

  const product = productFromForm();
  product.status = RULES.stockStatusRule(product.status, product.stock);
  const invalid = RULES.validateProduct(product, id ? products.filter(p => p.id !== Number(id)) : products);
  if (invalid) {
    setStatus(invalid);
    return;
  }

  saving = true;
  if (saveButton) { saveButton.disabled = true; saveButton.textContent = "Guardando..."; }
  try {
    if (id) {
      await request(`/products/${id}`, { method: "PATCH", body: JSON.stringify(product), expectedVersion });
      await loadProducts();
      setStatus(`Producto actualizado: ${product.name}`);
    } else {
      await request("/products", { method: "POST", body: JSON.stringify(product) });
      await loadProducts();
      setStatus(`Producto creado: ${product.name}`);
    }
    clearForm();
    setAdminView("products");
  } catch (error) {
    setStatus(error.message);
    if (error instanceof ConflictError) await loadProducts();
    // No se limpia el formulario: la edición del usuario no se pierde.
  } finally {
    saving = false;
    if (saveButton) { saveButton.disabled = false; saveButton.textContent = "Guardar producto"; }
  }
});

/* ============================================================
   Importar / exportar CSV (todo-o-nada, handoff §10)
   ============================================================ */

async function importCsv(file) {
  if (!file) return;
  if (saving) return;
  const text = await file.text();

  const { products: nuevos, errors } = RULES.validateCsvImport(text, products);
  if (errors.length) {
    console.table(errors);
    setStatus(`Importación cancelada: ${errors.length} fila(s) con error, no se importó NADA. ` +
      `Detalle: ${errors.slice(0, 3).join(" · ")}${errors.length > 3 ? " · … (resto en la consola, tecla F12)" : ""}`);
    return;
  }
  if (!nuevos.length) {
    setStatus("El CSV no tiene filas de datos");
    return;
  }

  saving = true;
  setStatus(`Importando ${nuevos.length} producto(s)...`);
  try {
    if (dataMode === "supabase") {
      // Un solo INSERT multi-fila: o entran todos o no entra ninguno (atómico).
      const { error } = await db.from("products").insert(nuevos.map(toDatabase));
      if (error) throw new Error(friendlyDbError(error));
    } else {
      for (const producto of nuevos) {
        await localRequest("/products", { method: "POST", body: JSON.stringify(producto) });
      }
    }
    await loadProducts();
    setStatus(`Importación lista: ${nuevos.length} producto(s) creado(s)`);
  } catch (error) {
    setStatus(`Importación fallida (no quedaron filas a medias): ${error.message}`);
    await loadProducts();
  } finally {
    saving = false;
  }
}

function downloadCsvTemplate() {
  const headers = "gender,sku,name,category,collection,model,material,price,stock,status,image,description";
  const ejemplo = 'Mujer,MIL-COL-099,Collar Luna,Collares,Silver,Luna,Plata 950,129,5,active,assets/products/collar-luna.jpg,"Collar delicado con dije de luna"';
  const blob = new Blob([`${headers}\n${ejemplo}\n`], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, "plantilla-productos.csv");
}

/**
 * Exporta el catálogo al formato de js/products.js y lo descarga, para
 * publicar la tienda sin backend. No incluye ningún dato de autenticación.
 *
 * EXCLUYE los borradores a propósito: este archivo se sube al hosting y la
 * tienda estática pinta todo lo que contiene sin filtrar por estado, así que
 * incluirlos publicaría piezas no terminadas con precios tentativos — justo lo
 * que las políticas RLS impiden del lado servidor.
 */
function exportBackup() {
  const publicables = products.filter(product => product.status !== "draft");
  const borradores = products.length - publicables.length;
  if (!publicables.length) {
    setStatus(products.length
      ? "Todos los productos son borradores: no hay nada publicable para exportar"
      : "No hay productos para exportar");
    return;
  }
  const items = publicables.map(product => {
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
    " * Solo incluye piezas publicadas (activas y agotadas); los borradores quedan fuera.\n" +
    ` * Generado: ${new Date().toLocaleString("es-PE")}\n` +
    " */\n";
  // Neutraliza "</script>" por defensa en profundidad (por si algún día se
  // incrustara el catálogo inline en un <script> en vez de cargarlo como archivo).
  const content = `${header}const PRODUCTS = [\n${items}\n];\n`.replace(/<\/(script)/gi, "<\\/$1");
  const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
  triggerDownload(blob, "products.js");
  setStatus(`Respaldo descargado con ${publicables.length} pieza(s) publicada(s)` +
    `${borradores ? `; se excluyeron ${borradores} borrador(es)` : ""}. Reemplaza js/products.js en tu hosting.`);
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
   Acceso al panel, recuperación de contraseña y tiempo real
   ============================================================ */

function showOnly(view) {
  [loginView, setupView, recoveryView, appView].forEach(node => {
    if (node) node.hidden = node !== view;
  });
}

async function openOnlineAdmin(user) {
  // Mientras haya una recuperación de contraseña en curso, nada puede llevar al
  // panel: si no, el enlace del correo entraría directo al inventario y la
  // contraseña comprometida seguiría vigente sin que nadie la cambie.
  if (passwordRecoveryPending) {
    showOnly(recoveryView);
    return false;
  }

  const { data, error } = await db.from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    await db.auth.signOut();
    showOnly(loginView);
    authStatus.textContent = "Esta cuenta no tiene permiso para administrar la tienda.";
    return false;
  }

  dataMode = "supabase";
  showOnly(appView);
  identityNode.textContent = user.email || "Cuenta administradora";
  logoutButton.hidden = false;
  await loadProducts();
  connectRealtime();
  return true;
}

/**
 * Aviso de cambios por Broadcast (D7): el trigger de la base publica un ping
 * sin datos en el topic privado 'catalog'; aquí solo se re-consulta.
 * Si el canal cae: reintento con backoff + sondeo lento de respaldo.
 */
let realtimeRefreshTimer = null;

function connectRealtime() {
  if (!db || realtimeChannel) return;
  const refresh = () => {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = setTimeout(loadProducts, 200);
  };

  db.realtime.setAuth(); // requerido para autorizar canales privados
  const channel = db.channel("catalog", { config: { private: true } })
    .on("broadcast", { event: "change" }, refresh);
  realtimeChannel = channel;

  channel.subscribe(status => {
    // Los eventos de un canal ya reemplazado o cerrado por nosotros se ignoran:
    // removeChannel() reinyecta CLOSED aquí y sin este guardia cada reintento
    // encadenaba otro reintento en bucle infinito.
    if (realtimeChannel !== channel) return;

    if (status === "SUBSCRIBED") {
      realtimeRetryDelay = 2000;
      clearTimeout(realtimeRetryTimer);   // no matar un canal ya sano
      realtimeRetryTimer = null;
      clearInterval(realtimePollTimer);
      realtimePollTimer = null;
      refresh(); // ponerse al día con lo que pasó mientras no había canal
      return;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      // Respaldo: sondeo lento mientras no haya canal + reintento con backoff.
      if (!realtimePollTimer) realtimePollTimer = setInterval(loadProducts, 60000);
      clearTimeout(realtimeRetryTimer);
      realtimeRetryTimer = setTimeout(async () => {
        realtimeRetryTimer = null;
        await disconnectRealtime({ keepPoll: true });
        realtimeRetryDelay = Math.min(realtimeRetryDelay * 2, 30000);
        connectRealtime();
      }, realtimeRetryDelay);
    }
  });
}

async function disconnectRealtime(options = {}) {
  clearTimeout(realtimeRetryTimer);
  realtimeRetryTimer = null;
  clearTimeout(realtimeRefreshTimer);
  if (!options.keepPoll) {
    clearInterval(realtimePollTimer);
    realtimePollTimer = null;
  }
  const channel = realtimeChannel;
  realtimeChannel = null; // antes de cerrar: su CLOSED ya no debe contar
  if (channel) await db.removeChannel(channel).catch(() => {});
}

// Recuperación de la vista al volver a la pestaña o recuperar conexión.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && dataMode === "supabase" && !appView.hidden) loadProducts();
});
window.addEventListener("online", () => {
  if (dataMode === "supabase" && !appView.hidden) loadProducts();
});

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

forgotLink?.addEventListener("click", async event => {
  event.preventDefault();
  const email = String(new FormData(loginForm).get("email") || "").trim();
  if (!email) {
    authStatus.textContent = "Escribe tu correo arriba y vuelve a tocar el enlace.";
    return;
  }
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${location.pathname}`
  });
  authStatus.textContent = error
    ? "No se pudo enviar el correo de recuperación. Intenta de nuevo en unos minutos."
    : "Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.";
});

recoveryForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(recoveryForm);
  const password = String(data.get("newPassword") || "");
  const confirm = String(data.get("confirmPassword") || "");
  if (password.length < 8) {
    recoveryStatus.textContent = "La nueva contraseña debe tener al menos 8 caracteres.";
    return;
  }
  if (password !== confirm) {
    recoveryStatus.textContent = "Las contraseñas no coinciden.";
    return;
  }
  recoveryStatus.textContent = "Guardando...";
  const { data: updated, error } = await db.auth.updateUser({ password });
  if (error) {
    recoveryStatus.textContent = `No se pudo cambiar la contraseña: ${error.message}`;
    return;
  }
  recoveryStatus.textContent = "";
  recoveryForm.reset();
  passwordRecoveryPending = false; // contraseña ya renovada: puede entrar
  // Limpiar el fragmento para que recargar no reabra el flujo de recuperación.
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  // Si la cuenta no administra la tienda, openOnlineAdmin cierra la sesión y
  // lo explica en la pantalla de acceso.
  await openOnlineAdmin(updated.user);
});

logoutButton?.addEventListener("click", async () => {
  await disconnectRealtime();
  await db.auth.signOut();
  loginForm.reset();
  showOnly(loginView);
  authStatus.textContent = "Sesión cerrada.";
});

async function initAdmin() {
  renderThumbs();

  if (HAS_SUPABASE) {
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""));

    // El enlace del correo trae type=recovery: marcarlo ANTES de crear el
    // cliente, porque getSession() devolverá una sesión válida y sin esta
    // bandera el panel se abriría sin pedir la contraseña nueva.
    passwordRecoveryPending = hashParams.get("type") === "recovery";

    // Errores que Auth devuelve en el fragmento (#error=...&error_description=...),
    // por ejemplo un enlace de recuperación vencido. Se exige que venga el
    // código de error real y se recorta, para que un enlace manipulado no
    // pueda usar el panel auténtico como cartel de texto libre.
    const authError = hashParams.get("error") || hashParams.get("error_code");
    const authErrorText = hashParams.get("error_description");
    if (authError && authErrorText) {
      authStatus.textContent = `No se pudo completar el acceso (${authError.slice(0, 40)}). Solicita un enlace nuevo.`;
    }

    db = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_KEY);

    db.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        passwordRecoveryPending = true;
        await disconnectRealtime();
        showOnly(recoveryView);
        return;
      }
      if (event === "SIGNED_OUT") {
        await disconnectRealtime();
        dataMode = "local";
        showOnly(loginView);
        if (!authStatus.textContent) authStatus.textContent = "Tu sesión terminó. Vuelve a ingresar.";
      }
    });

    const { data: { session } } = await db.auth.getSession();
    if (passwordRecoveryPending) showOnly(recoveryView);
    else if (session?.user) await openOnlineAdmin(session.user);
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
document.querySelector("#clearForm")?.addEventListener("click", () => clearForm());
document.querySelector("#newProduct")?.addEventListener("click", () => {
  clearForm();
  setAdminView("editor");
});
document.querySelector("#closeForm")?.addEventListener("click", () => setAdminView("products"));
document.querySelector("#cancelForm")?.addEventListener("click", () => {
  clearForm();
  setAdminView("products");
});
document.querySelector("#reloadProducts")?.addEventListener("click", loadProducts);
document.querySelector("#exportBackup")?.addEventListener("click", exportBackup);
document.querySelector("#importCsvBtn")?.addEventListener("click", () => csvFile?.click());
document.querySelector("#csvTemplate")?.addEventListener("click", downloadCsvTemplate);
viewButtons.forEach(button => button.addEventListener("click", () => {
  if (button.dataset.adminView === "editor") clearForm();
  setAdminView(button.dataset.adminView);
}));
statButtons.forEach(button => button.addEventListener("click", () => {
  inventoryFilter = button.dataset.inventoryFilter;
  statButtons.forEach(item => item.classList.toggle("is-active", item === button));
  setAdminView("products");
  renderProducts();
}));
[searchInput, categoryFilter, statusFilter].forEach(control => {
  control?.addEventListener(control === searchInput ? "input" : "change", renderProducts);
});
document.querySelector("#clearFilters")?.addEventListener("click", () => {
  searchInput.value = "";
  categoryFilter.value = "";
  statusFilter.value = "";
  inventoryFilter = "all";
  statButtons.forEach(button => button.classList.toggle("is-active", button.dataset.inventoryFilter === "all"));
  renderProducts();
});
csvFile?.addEventListener("change", () => {
  importCsv(csvFile.files[0]);
  csvFile.value = "";
});

if (form && tableBody) initAdmin();
