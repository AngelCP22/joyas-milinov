function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

function money(value) {
  return `S/ ${Number(value).toFixed(2)}`;
}

function productImageFallback(event) {
  event.target.src = "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=85";
}

function productCard(product) {
  return `
    <article class="product-card">
      <a class="product-image" href="producto.html?id=${product.id}">
        <img src="${product.image}" alt="${product.name}" onerror="productImageFallback(event)">
      </a>
      <div class="product-info">
        <span>${product.collection} · ${product.material}</span>
        <h3><a href="producto.html?id=${product.id}">${product.name}</a></h3>
        <p>${product.description}</p>
        <div class="product-footer">
          <strong>${money(product.price)}</strong>
          <button type="button" class="mini-cart-btn" onclick="addToCart(${product.id})">Agregar</button>
        </div>
      </div>
    </article>
  `;
}

function renderProducts(target, products) {
  const node = typeof target === "string" ? qs(target) : target;
  if (!node) return;
  if (!products.length) {
    node.innerHTML = `<div class="no-results">No encontramos productos con esos filtros.</div>`;
    return;
  }
  node.innerHTML = products.map(productCard).join("");
}

async function hydrateProductsFromApi() {
  try {
    const response = await fetch("http://localhost:3001/api/products?status=active");
    if (!response.ok) return;
    const apiProducts = await response.json();
    if (!Array.isArray(apiProducts) || !apiProducts.length) return;
    PRODUCTS.splice(0, PRODUCTS.length, ...apiProducts);
  } catch {
    // Si el backend no está encendido, el sitio usa los productos estáticos.
  }
}

const featuredSlider = {
  page: 0,
  timer: null
};

function renderFeatured() {
  renderProducts("#featuredGrid", PRODUCTS);
}

function initFeaturedSlider() {
  const grid = qs("#featuredGrid");
  const dots = qs("#featuredDots");
  if (!grid || !dots) return;

  const cards = qsa("#featuredGrid .product-card");
  const pageSize = 4;
  const pages = Math.ceil(cards.length / pageSize);

  if (pages <= 1) {
    dots.innerHTML = "";
    cards.forEach(card => card.classList.remove("is-slider-hidden"));
    return;
  }

  dots.innerHTML = Array.from({ length: pages }, (_, index) => `
    <button type="button" aria-label="Ver grupo ${index + 1}" data-featured-page="${index}"></button>
  `).join("");

  function showPage(page) {
    featuredSlider.page = (page + pages) % pages;
    const start = featuredSlider.page * pageSize;
    const end = start + pageSize;

    cards.forEach((card, index) => {
      card.classList.toggle("is-slider-hidden", index < start || index >= end);
    });

    qsa("[data-featured-page]").forEach((button, index) => {
      button.classList.toggle("is-active", index === featuredSlider.page);
      button.setAttribute("aria-current", index === featuredSlider.page ? "true" : "false");
    });
  }

  qsa("[data-featured-page]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(Number(button.dataset.featuredPage));
      restartFeaturedSlider();
    });
  });

  function restartFeaturedSlider() {
    window.clearInterval(featuredSlider.timer);
    featuredSlider.timer = window.setInterval(() => {
      showPage(featuredSlider.page + 1);
    }, 5200);
  }

  showPage(featuredSlider.page);
  restartFeaturedSlider();
}

function renderCategoryPills() {
  const node = qs("#categoryPills");
  if (!node) return;
  node.innerHTML = CATEGORIES.map(cat => `
    <a class="category-pill" href="catalogo.html?category=${encodeURIComponent(cat)}">
      <span>${cat.charAt(0)}</span>
      ${cat}
    </a>
  `).join("");
}

function renderCollections() {
  const node = qs("#collectionsGrid");
  if (!node) return;

  const data = [
    { name: "Silver", copy: "Plata 950 para todos los días." },
    { name: "Golden", copy: "Brillo cálido y sofisticado." },
    { name: "Rose", copy: "Romántico, suave y femenino." },
    { name: "Gold18k", copy: "Piezas premium en oro 18k." }
  ];

  node.innerHTML = data.map(item => `
    <a class="collection-card" href="catalogo.html?collection=${item.name}">
      <span>Colección</span>
      <h3>${item.name}</h3>
      <p>${item.copy}</p>
    </a>
  `).join("");
}

let catalogState = {
  search: "",
  category: "all",
  material: "all",
  collection: "all",
  sort: "featured"
};

function initCatalog() {
  const grid = qs("#catalogGrid");
  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  catalogState.category = params.get("category") || "all";
  catalogState.material = params.get("material") || "all";
  catalogState.collection = params.get("collection") || "all";

  const categorySelect = qs("#categoryFilter");
  const materialSelect = qs("#materialFilter");
  const collectionSelect = qs("#collectionFilter");

  if (categorySelect) categorySelect.value = catalogState.category;
  if (materialSelect) materialSelect.value = catalogState.material;
  if (collectionSelect) collectionSelect.value = catalogState.collection;

  qsa("[data-filter]").forEach(input => {
    input.addEventListener("input", event => {
      catalogState[event.target.dataset.filter] = event.target.value;
      applyCatalogFilters();
    });
    input.addEventListener("change", event => {
      catalogState[event.target.dataset.filter] = event.target.value;
      applyCatalogFilters();
    });
  });

  applyCatalogFilters();
}

function applyCatalogFilters() {
  let filtered = [...PRODUCTS];

  if (catalogState.search) {
    const term = catalogState.search.toLowerCase();
    filtered = filtered.filter(product =>
      product.name.toLowerCase().includes(term) ||
      product.category.toLowerCase().includes(term) ||
      product.collection.toLowerCase().includes(term) ||
      product.material.toLowerCase().includes(term)
    );
  }

  if (catalogState.category !== "all") {
    filtered = filtered.filter(product => product.category === catalogState.category);
  }

  if (catalogState.material !== "all") {
    filtered = filtered.filter(product => product.material === catalogState.material);
  }

  if (catalogState.collection !== "all") {
    filtered = filtered.filter(product => product.collection === catalogState.collection);
  }

  if (catalogState.sort === "price-asc") {
    filtered.sort((a, b) => a.price - b.price);
  }

  if (catalogState.sort === "price-desc") {
    filtered.sort((a, b) => b.price - a.price);
  }

  renderProducts("#catalogGrid", filtered);
  const count = qs("#catalogCount");
  if (count) count.textContent = `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`;
}

function initProductPage() {
  const productSection = qs("#productDetail");
  if (!productSection) return;

  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("id")) || 1;
  const product = findProduct(id) || PRODUCTS[0];
  const related = PRODUCTS.filter(item => item.id !== product.id && (item.category === product.category || item.collection === product.collection)).slice(0, 4);

  productSection.innerHTML = `
    <div class="product-gallery">
      <div class="main-product-image">
        <img id="mainProductImage" src="${product.image}" alt="${product.name}" onerror="productImageFallback(event)">
      </div>
      <div class="thumbs">
        <button type="button"><img src="${product.image}" alt="${product.name}" onerror="productImageFallback(event)"></button>
        <button type="button"><img src="${product.image}" alt="${product.name}" onerror="productImageFallback(event)"></button>
        <button type="button"><img src="${product.image}" alt="${product.name}" onerror="productImageFallback(event)"></button>
      </div>
    </div>
    <div class="product-detail-info">
      <span class="eyebrow">${product.collection} · ${product.material}</span>
      <h1>${product.name}</h1>
      <p class="product-price">${money(product.price)}</p>
      <p>${product.description}</p>
      <ul class="detail-list">
        <li>Material: <strong>${product.material}</strong></li>
        <li>Categoría: <strong>${product.category}</strong></li>
        <li>Empaque: <strong>Listo para regalar</strong></li>
        <li>Envío: <strong>A todo el Perú</strong></li>
      </ul>
      <div class="product-actions">
        <div class="qty-control large">
          <button type="button" id="productMinus">−</button>
          <span id="productQty">1</span>
          <button type="button" id="productPlus">+</button>
        </div>
        <button class="btn btn-primary" type="button" id="addProductBtn">Agregar al carrito</button>
        <button class="btn btn-whatsapp" type="button" id="buyWhatsappBtn">Comprar por WhatsApp</button>
      </div>
    </div>
  `;

  let qty = 1;
  const qtyNode = qs("#productQty");
  qs("#productMinus").addEventListener("click", () => {
    qty = Math.max(1, qty - 1);
    qtyNode.textContent = qty;
  });
  qs("#productPlus").addEventListener("click", () => {
    qty += 1;
    qtyNode.textContent = qty;
  });
  qs("#addProductBtn").addEventListener("click", () => addToCart(product.id, qty));
  qs("#buyWhatsappBtn").addEventListener("click", () => window.open(whatsappSingleUrl(product, qty), "_blank"));

  renderProducts("#relatedGrid", related.length ? related : PRODUCTS.slice(0, 4));
}

function initSearchShortcut() {
  const input = qs("#globalSearch");
  if (!input) return;
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && input.value.trim()) {
      window.location.href = `catalogo.html?search=${encodeURIComponent(input.value.trim())}`;
    }
  });
}

function showToast(message) {
  let toast = qs(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function initUI() {
  qsa("[data-open-cart]").forEach(btn => btn.addEventListener("click", openCart));
  qsa("[data-close-cart]").forEach(btn => btn.addEventListener("click", closeCart));
  qs(".overlay")?.addEventListener("click", () => {
    closeCart();
    closeMobileMenu();
  });

  qsa("[data-open-menu]").forEach(btn => btn.addEventListener("click", openMobileMenu));
  qsa("[data-close-menu]").forEach(btn => btn.addEventListener("click", closeMobileMenu));

  const checkout = qs("#checkoutWhatsapp");
  if (checkout) checkout.addEventListener("click", checkoutWhatsapp);

  updateCartUI();
}

function openMobileMenu() {
  const menu = qs(".mobile-menu");
  if (menu) {
    menu.classList.add("is-open");
    menu.style.transform = "translateX(0)";
  }
  qs(".overlay")?.classList.add("is-open");
  document.body.classList.add("no-scroll");
}

function closeMobileMenu() {
  const menu = qs(".mobile-menu");
  if (menu) {
    menu.classList.remove("is-open");
    menu.style.transform = "translateX(-100%)";
  }
  qs(".overlay")?.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
}

function initContactForm() {
  const form = qs("#contactForm");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    const text = encodeURIComponent(
      `Hola Milinov Jewelry, soy ${data.get("name")}.\n\n${data.get("message")}\n\nMi correo es: ${data.get("email")}`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, "_blank");
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await hydrateProductsFromApi();
  renderFeatured();
  initFeaturedSlider();
  renderCategoryPills();
  renderCollections();
  initCatalog();
  initProductPage();
  initSearchShortcut();
  initContactForm();
  initUI();

  const params = new URLSearchParams(window.location.search);
  const catalogSearch = qs("#catalogSearch");
  if (catalogSearch && params.get("search")) {
    catalogSearch.value = params.get("search");
    catalogState.search = params.get("search");
    applyCatalogFilters();
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
});
