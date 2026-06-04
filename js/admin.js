const API_URL = "http://localhost:3001/api";

const form = document.querySelector("#productForm");
const tableBody = document.querySelector("#adminProducts");
const statusNode = document.querySelector("#adminStatus");
const imageFile = document.querySelector("#imageFile");
const imagePath = document.querySelector("#imagePath");
const imagePreview = document.querySelector("#imagePreview");
let products = [];

function moneyAdmin(value) {
  return `S/ ${Number(value).toFixed(2)}`;
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

function renderProducts() {
  tableBody.innerHTML = products.map(product => `
    <tr>
      <td>
        <strong>${product.name}</strong>
        <small>${product.sku} · ${product.model}</small>
      </td>
      <td>${product.category}</td>
      <td>${moneyAdmin(product.price)}</td>
      <td><span class="stock-pill ${product.stock <= 2 ? "is-low" : ""}">${product.stock}</span></td>
      <td><span class="status-pill ${product.status}">${product.status}</span></td>
      <td>
        <button type="button" data-edit="${product.id}">Editar</button>
        <button type="button" data-delete="${product.id}">Eliminar</button>
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

document.querySelector("#clearForm").addEventListener("click", clearForm);
document.querySelector("#reloadProducts").addEventListener("click", loadProducts);
loadProducts();
