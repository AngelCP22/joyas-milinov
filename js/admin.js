/**
 * admin.js — Panel de inventario (admin.html).
 *
 * Herramienta de uso LOCAL: habla con el backend de backend/server.js
 * (sin autenticación) para crear, editar y eliminar productos, y subir
 * imágenes a assets/uploads/. No publicar admin.html en un hosting público.
 *
 * Depende de: config.js (esc, money, apiUrl).
 */
const API_URL = window.MILINOV?.apiUrl || "http://localhost:3001/api";

const form = document.querySelector("#productForm");
const tableBody = document.querySelector("#adminProducts");
const statusNode = document.querySelector("#adminStatus");
const imageFile = document.querySelector("#imageFile");
const imagePath = document.querySelector("#imagePath");
const imagePreview = document.querySelector("#imagePreview");
let products = [];

function moneyAdmin(value) {
  return typeof money === "function" ? money(value) : `S/ ${Number(value).toFixed(2)}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Error de API");
  return data;
}

function setStatus(message) {
  statusNode.textContent = message;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

async function uploadSelectedImage() {
  const file = imageFile.files?.[0];
  if (!file) return imagePath.value.trim();

  setStatus("Subiendo imagen...");
  const dataUrl = await fileToDataUrl(file);
  const result = await request("/uploads", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      dataUrl
    })
  });

  imagePath.value = result.image;
  imagePreview.src = result.image;
  imageFile.value = "";
  return result.image;
}

function productFromForm() {
  const data = new FormData(form);
  return {
    sku: data.get("sku").trim(),
    name: data.get("name").trim(),
    category: data.get("category").trim(),
    collection: data.get("collection").trim(),
    model: data.get("model").trim(),
    material: data.get("material").trim(),
    price: Number(data.get("price")),
    stock: Number(data.get("stock")),
    status: data.get("status"),
    image: data.get("image").trim(),
    description: data.get("description").trim()
  };
}

function fillForm(product) {
  Object.entries(product).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? "";
  });
  imagePreview.src = product.image || "assets/banners/empaque-regalo.jpg";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearForm() {
  form.reset();
  form.elements.id.value = "";
  imagePreview.src = "assets/banners/empaque-regalo.jpg";
}

const STATUS_LABELS = { active: "Activo", draft: "Borrador", sold_out: "Agotado" };

function renderProducts() {
  tableBody.innerHTML = products.map(product => `
    <tr>
      <td>
        <strong>${esc(product.name)}</strong>
        <small>${esc(product.sku)} · ${esc(product.model)}</small>
      </td>
      <td>${esc(product.category)}</td>
      <td>${moneyAdmin(product.price)}</td>
      <td><span class="stock-pill ${product.stock <= 2 ? "is-low" : ""}">${Number(product.stock)}</span></td>
      <td><span class="status-pill ${esc(product.status)}">${STATUS_LABELS[product.status] || esc(product.status)}</span></td>
      <td>
        <button type="button" data-edit="${Number(product.id)}">Editar</button>
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
    setStatus("No se pudo conectar. Ejecuta: cd backend && npm start");
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const id = form.elements.id.value;

  try {
    const uploadedImage = await uploadSelectedImage();
    const product = productFromForm();
    product.image = uploadedImage;

    if (id) {
      await request(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(product)
      });
      setStatus("Producto actualizado");
    } else {
      await request("/products", {
        method: "POST",
        body: JSON.stringify(product)
      });
      setStatus("Producto creado");
    }
    clearForm();
    await loadProducts();
  } catch (error) {
    setStatus(error.message);
  }
});

tableBody.addEventListener("click", async event => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;

  if (editId) {
    const product = products.find(item => item.id === Number(editId));
    if (product) fillForm(product);
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

imageFile.addEventListener("change", async () => {
  const file = imageFile.files?.[0];
  if (!file) return;
  imagePreview.src = await fileToDataUrl(file);
});

imagePath.addEventListener("input", () => {
  if (imagePath.value.trim()) imagePreview.src = imagePath.value.trim();
});

/**
 * Exporta el catálogo actual del backend al formato de js/products.js y lo
 * descarga. Sirve para sincronizar la tienda pública cuando se publica SIN
 * backend (hosting estático): reemplazas js/products.js por este archivo y
 * la portada muestra exactamente el mismo inventario que gestionaste aquí.
 * Así "el admin gestiona todo" sin que la tienda principal dependa del backend.
 */
function exportBackup() {
  if (!products.length) {
    setStatus("No hay productos para exportar");
    return;
  }

  const items = products.map(product => {
    const fields = {
      id: product.id,
      name: product.name,
      category: product.category,
      collection: product.collection,
      material: product.material,
      price: product.price,
      image: product.image,
      description: product.description,
      stock: product.stock,
      status: product.status
    };
    const body = Object.entries(fields)
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
  const content = `${header}const PRODUCTS = [\n${items}\n];\n`;

  const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "products.js";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("Respaldo descargado: reemplaza js/products.js en tu hosting");
}

document.querySelector("#clearForm").addEventListener("click", clearForm);
document.querySelector("#reloadProducts").addEventListener("click", loadProducts);
document.querySelector("#exportBackup").addEventListener("click", exportBackup);
loadProducts();
