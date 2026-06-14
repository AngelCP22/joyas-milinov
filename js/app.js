/**
 * app.js — Lógica de interfaz de Milinov Jewelry.
 *
 * Cada función init*() detecta si la página actual tiene los elementos que
 * necesita y, si no, retorna sin hacer nada; por eso el mismo bundle se carga
 * en todas las páginas sin condicionales por página.
 *
 * Flujo de datos del catálogo:
 *   1. Se renderiza al instante con PRODUCTS (catálogo estático en products.js).
 *   2. En paralelo se consulta el backend local (config.js → apiUrl).
 *   3. Si responde, PRODUCTS se reemplaza con el inventario real (precios y
 *      stock actualizados desde admin.html) y las vistas se vuelven a pintar.
 *   4. Si no hay backend (hosting estático), el paso 2 falla en silencio.
 *
 * Depende de: config.js (esc, money, whatsappUrl), products.js, cart.js.
 */

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

/** Imagen local de respaldo cuando falla la carga de una foto de producto. */
function productImageFallback(event) {
  event.target.onerror = null;
  event.target.src = "assets/placeholder.svg";
}

/* ============================================================
   Tarjetas de producto
   ============================================================ */

function productCard(product) {
  const soldOut = product.status === "sold_out" || product.stock === 0;
  return `
    <article class="product-card${soldOut ? " is-sold-out" : ""}">
      <a class="product-image" href="producto.html?id=${Number(product.id)}">
        <img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" decoding="async" onerror="productImageFallback(event)">
        ${soldOut ? `<span class="sold-out-badge">Agotado</span>` : ""}
      </a>
      <div class="product-info">
        <span>${esc(product.collection)} · ${esc(product.material)}</span>
        <h3><a href="producto.html?id=${Number(product.id)}">${esc(product.name)}</a></h3>
        <p>${esc(product.description)}</p>
        <div class="product-footer">
          <strong>${money(product.price)}</strong>
          <button type="button" class="mini-cart-btn" onclick="addToCart(${Number(product.id)})" ${soldOut ? "disabled" : ""}>
            ${soldOut ? "Agotado" : "Agregar"}
          </button>
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

/* ============================================================
   Hidratación desde el backend (no bloquea el primer render)
   ============================================================ */

async function hydrateProductsFromApi() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`${window.MILINOV.apiUrl}/products?status=active`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return false;
    const apiProducts = await response.json();
    if (!Array.isArray(apiProducts) || !apiProducts.length) return false;

    PRODUCTS.splice(0, PRODUCTS.length, ...apiProducts);
    return true;
  } catch {
    // Backend apagado o sitio en hosting estático: se mantiene el catálogo estático.
    return false;
  }
}

/** Repinta todas las vistas que dependen de PRODUCTS tras la hidratación. */
function refreshDynamicViews() {
  renderFeatured();
  initFeaturedSlider();
  buildCatalogFilterOptions();
  applyCatalogFilters();
  initProductPage();
  updateCartUI();
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

/* ============================================================
   Slider de destacados (tienda.html)
   ============================================================ */

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

  window.clearInterval(featuredSlider.timer);

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

  function restartFeaturedSlider() {
    window.clearInterval(featuredSlider.timer);
    // Respeta la preferencia del sistema de reducir movimiento.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    featuredSlider.timer = window.setInterval(() => {
      showPage(featuredSlider.page + 1);
    }, 5200);
  }

  qsa("[data-featured-page]").forEach(button => {
    button.addEventListener("click", () => {
      showPage(Number(button.dataset.featuredPage));
      restartFeaturedSlider();
    });
  });

  showPage(0);
  restartFeaturedSlider();
}

/* ============================================================
   Catálogo: filtros y orden (catalogo.html)
   ============================================================ */

let catalogState = {
  search: "",
  category: "all",
  material: "all",
  collection: "all",
  sort: "featured"
};

/**
 * Reconstruye las opciones de los selects a partir de los productos reales,
 * para que las categorías/colecciones creadas desde el admin aparezcan solas.
 * Conserva la selección actual si sigue siendo válida.
 */
function buildCatalogFilterOptions() {
  const builders = [
    { select: qs("#categoryFilter"), key: "category", allLabel: "Todas las categorías" },
    { select: qs("#materialFilter"), key: "material", allLabel: "Todos los materiales" },
    { select: qs("#collectionFilter"), key: "collection", allLabel: "Todas las colecciones" }
  ];

  builders.forEach(({ select, key, allLabel }) => {
    if (!select) return;
    const values = [...new Set(PRODUCTS.map(product => product[key]).filter(Boolean))].sort();
    const current = catalogState[key];
    select.innerHTML = [`<option value="all">${allLabel}</option>`]
      .concat(values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`))
      .join("");
    select.value = values.includes(current) ? current : "all";
    catalogState[key] = select.value;
  });
}

function initCatalog() {
  const grid = qs("#catalogGrid");
  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  catalogState.category = params.get("category") || "all";
  catalogState.material = params.get("material") || "all";
  catalogState.collection = params.get("collection") || "all";
  catalogState.search = params.get("search") || "";

  const searchInput = qs("#catalogSearch");
  if (searchInput && catalogState.search) searchInput.value = catalogState.search;

  buildCatalogFilterOptions();

  qsa("[data-filter]").forEach(input => {
    const update = event => {
      catalogState[event.target.dataset.filter] = event.target.value;
      applyCatalogFilters();
    };
    input.addEventListener("input", update);
    input.addEventListener("change", update);
  });

  applyCatalogFilters();
}

function applyCatalogFilters() {
  if (!qs("#catalogGrid")) return;

  let filtered = [...PRODUCTS];

  if (catalogState.search) {
    const term = catalogState.search.toLowerCase();
    filtered = filtered.filter(product =>
      [product.name, product.category, product.collection, product.material, product.description]
        .join(" ")
        .toLowerCase()
        .includes(term)
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

  if (catalogState.sort === "price-asc") filtered.sort((a, b) => a.price - b.price);
  if (catalogState.sort === "price-desc") filtered.sort((a, b) => b.price - a.price);

  renderProducts("#catalogGrid", filtered);
  const count = qs("#catalogCount");
  if (count) count.textContent = `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`;
}

/* ============================================================
   Detalle de producto (producto.html)
   ============================================================ */

function initProductPage() {
  const productSection = qs("#productDetail");
  if (!productSection) return;

  const params = new URLSearchParams(window.location.search);
  const id = Number(params.get("id")) || PRODUCTS[0]?.id;
  const product = findProduct(id) || PRODUCTS[0];
  if (!product) return;

  const soldOut = product.status === "sold_out" || product.stock === 0;
  const related = PRODUCTS
    .filter(item => item.id !== product.id && (item.category === product.category || item.collection === product.collection))
    .slice(0, 4);

  document.title = `${product.name} | ${window.MILINOV.brand}`;

  productSection.innerHTML = `
    <div class="product-gallery">
      <div class="main-product-image">
        <img id="mainProductImage" src="${esc(product.image)}" alt="${esc(product.name)}" decoding="async" onerror="productImageFallback(event)">
      </div>
    </div>
    <div class="product-detail-info">
      <span class="eyebrow">${esc(product.collection)} · ${esc(product.material)}</span>
      <h1>${esc(product.name)}</h1>
      <p class="product-price">${money(product.price)}</p>
      <p>${esc(product.description)}</p>
      <ul class="detail-list">
        <li>Material: <strong>${esc(product.material)}</strong></li>
        <li>Categoría: <strong>${esc(product.category)}</strong></li>
        <li>Empaque: <strong>Listo para regalar</strong></li>
        <li>Envío: <strong>A todo el Perú</strong></li>
      </ul>
      ${soldOut ? `<p class="sold-out-note">Esta pieza está agotada por el momento. Escríbenos por WhatsApp para avisarte cuando vuelva.</p>` : ""}
      <div class="product-actions">
        <div class="qty-control large">
          <button type="button" id="productMinus" aria-label="Reducir cantidad">−</button>
          <span id="productQty" aria-live="polite">1</span>
          <button type="button" id="productPlus" aria-label="Aumentar cantidad">+</button>
        </div>
        <button class="btn btn-primary" type="button" id="addProductBtn" ${soldOut ? "disabled" : ""}>
          ${soldOut ? "Agotado" : "Agregar al carrito"}
        </button>
        <button class="btn btn-whatsapp" type="button" id="buyWhatsappBtn">
          ${soldOut ? "Consultar por WhatsApp" : "Comprar por WhatsApp"}
        </button>
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
    qty = Math.min(99, qty + 1);
    qtyNode.textContent = qty;
  });
  qs("#addProductBtn").addEventListener("click", () => addToCart(product.id, qty));
  qs("#buyWhatsappBtn").addEventListener("click", () => window.open(whatsappSingleUrl(product, qty), "_blank", "noopener"));

  renderProducts("#relatedGrid", related.length ? related : PRODUCTS.filter(item => item.id !== product.id).slice(0, 4));
  injectProductJsonLd(product);
}

/** Datos estructurados schema.org/Product para buscadores (SEO). */
function injectProductJsonLd(product) {
  qs("#productJsonLd")?.remove();
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "productJsonLd";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: new URL(product.image, window.location.href).href,
    category: product.category,
    material: product.material,
    brand: { "@type": "Brand", name: window.MILINOV.brand },
    offers: {
      "@type": "Offer",
      priceCurrency: "PEN",
      price: product.price,
      availability: (product.status === "sold_out" || product.stock === 0)
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock"
    }
  });
  document.head.appendChild(script);
}

/* ============================================================
   Utilidades de página
   ============================================================ */

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
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

/**
 * Reescribe todos los enlaces wa.me del HTML con el número configurado en
 * config.js, conservando el mensaje (?text=...) si lo tuvieran. Así el número
 * se cambia en UN solo lugar.
 */
function initWhatsappLinks() {
  qsa('a[href*="wa.me/"]').forEach(link => {
    try {
      const url = new URL(link.href);
      const text = url.searchParams.get("text");
      link.href = whatsappUrl(text ? encodeURIComponent(text) : "");
    } catch {
      link.href = whatsappUrl();
    }
  });
}

function initContactForm() {
  const form = qs("#contactForm");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    const text = encodeURIComponent(
      `Hola ${window.MILINOV.brand}, soy ${data.get("name")}.\n\n${data.get("message")}\n\nMi correo es: ${data.get("email")}`
    );
    window.open(whatsappUrl(text), "_blank", "noopener");
  });
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

  // Cierra carrito y menú con la tecla Escape (accesibilidad).
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeCart();
      closeMobileMenu();
    }
  });

  const checkout = qs("#checkoutWhatsapp");
  if (checkout) checkout.addEventListener("click", checkoutWhatsapp);

  updateCartUI();
}

function openMobileMenu() {
  qs(".mobile-menu")?.classList.add("is-open");
  qs(".overlay")?.classList.add("is-open");
  document.body.classList.add("no-scroll");
}

function closeMobileMenu() {
  qs(".mobile-menu")?.classList.remove("is-open");
  qs(".overlay")?.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
}

/* ============================================================
   Arranque
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // 1) Render inmediato con el catálogo estático (sin esperar al backend).
  renderFeatured();
  initFeaturedSlider();
  initCatalog();
  initProductPage();
  initSearchShortcut();
  initContactForm();
  initWhatsappLinks();
  initUI();
  refreshIcons();

  // 2) Hidratación en segundo plano con el inventario real, si hay backend.
  hydrateProductsFromApi().then(updated => {
    if (updated) refreshDynamicViews();
  });
});
