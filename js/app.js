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

let catalogSupabaseClient = null;
let inventoryRealtimeChannel = null;

/** Imagen local de respaldo cuando falla la carga de una foto de producto. */
function productImageFallback(event) {
  event.target.onerror = null;
  event.target.src = "assets/placeholder.svg";
}

/* ============================================================
   Tarjetas de producto
   ============================================================ */

function productCard(product) {
  const soldOut = isSoldOut(product);
  const badges = soldOut ? [] : productBadges(product);
  const badgesHtml = badges.length
    ? `<div class="badges">${badges.map(b => `<span class="badge ${b.cls}">${esc(b.label)}</span>`).join("")}</div>`
    : "";
  // Segunda foto que aparece al pasar el mouse (si el producto tiene galería)
  const hoverImg = Array.isArray(product.images) && product.images[1]
    ? picture(product.images[1], { cls: "hover-img", ariaHidden: true })
    : "";
  return `
    <article class="product-card${soldOut ? " is-sold-out" : ""}">
      <a class="product-image" href="producto.html?id=${Number(product.id)}">
        ${picture(product.image, { alt: product.name, onerror: "productImageFallback(event)" })}
        ${hoverImg}
        ${soldOut ? `<span class="sold-out-badge">Agotado</span>` : badgesHtml}
      </a>
      <div class="product-info">
        <span>${esc(product.collection)} · ${esc(product.material)}</span>
        <h3><a href="producto.html?id=${Number(product.id)}">${esc(product.name)}</a></h3>
        <p>${esc(product.description)}</p>
        <div class="product-footer">
          ${priceHtml(product)}
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
  // 1) Supabase (catálogo en línea), si está configurado en config.js.
  try {
    const fromSupabase = await loadFromSupabase();
    if (Array.isArray(fromSupabase)) {
      PRODUCTS.splice(0, PRODUCTS.length, ...fromSupabase);
      return true;
    }
  } catch {
    // Si Supabase falla, se intenta el backend local.
  }

  // 2) Backend local (Node). Si tampoco hay, queda el catálogo estático.
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
    return false;
  }
}

/**
 * Lee el catálogo desde Supabase si hay credenciales en config.js. Carga el
 * cliente oficial desde CDN bajo demanda y mapea las columnas (snake_case de
 * Postgres) a las claves que usa la tienda. Devuelve null si no está configurado
 * o falla (entonces se usa el backend local / catálogo estático).
 */
async function loadFromSupabase() {
  const cfg = (window.MILINOV && window.MILINOV.supabase) || {};
  if (!cfg.url || !cfg.anonKey) return null;

  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7/dist/umd/supabase.min.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  if (!catalogSupabaseClient) {
    catalogSupabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
  }
  const { data, error } = await catalogSupabaseClient.from("products")
    .select("*")
    .in("status", ["active", "sold_out"])
    .order("id");
  if (error || !Array.isArray(data)) return null;

  return data.map(row => ({
    id: row.id,
    gender: row.gender,
    name: row.name,
    category: row.category,
    collection: row.collection,
    material: row.material,
    price: Number(row.price),
    oldPrice: row.old_price,
    image: row.image,
    images: Array.isArray(row.images) ? row.images : [],
    description: row.description,
    stock: Number(row.stock),
    status: row.status,
    badge: row.badge,
    sizeMm: row.size_mm,
    weightG: row.weight_g,
    care: row.care,
    warranty: row.warranty,
    featured: row.featured
  }));
}

/** Escucha cambios de inventario y repinta la tienda sin recargar la página. */
function subscribeInventoryRealtime() {
  if (!catalogSupabaseClient || inventoryRealtimeChannel) return;
  let refreshTimer;
  const refresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const updated = await loadFromSupabase();
      if (!Array.isArray(updated)) return;
      PRODUCTS.splice(0, PRODUCTS.length, ...updated);
      refreshDynamicViews();
    }, 180);
  };

  inventoryRealtimeChannel = catalogSupabaseClient.channel("store-products-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "products" }, refresh)
    .subscribe();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
}

/** Repinta todas las vistas que dependen de PRODUCTS tras la hidratación. */
function refreshDynamicViews() {
  pruneCart();
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
  // Muestra solo los productos marcados como "destacados" en el admin; si
  // ninguno está marcado, muestra todo el catálogo (la portada nunca queda vacía).
  const destacados = PRODUCTS.filter(product => product.featured);
  renderProducts("#featuredGrid", destacados.length ? destacados : PRODUCTS);
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
    cards.forEach(card => {
      card.classList.remove("is-slider-hidden");
      card.removeAttribute("aria-hidden");
      card.inert = false;
    });
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
      const hidden = index < start || index >= end;
      card.classList.toggle("is-slider-hidden", hidden);
      card.setAttribute("aria-hidden", hidden ? "true" : "false");
      card.inert = hidden;
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
  gender: "all",
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
    { select: qs("#genderFilter"), key: "gender", allLabel: "Hombre y Mujer" },
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
  catalogState.gender = params.get("gender") || "all";
  catalogState.category = params.get("category") || "all";
  catalogState.material = params.get("material") || "all";
  catalogState.collection = params.get("collection") || "all";
  catalogState.search = params.get("search") || "";
  catalogState.sort = params.get("sort") || "featured";
  if (!["featured", "price-asc", "price-desc"].includes(catalogState.sort)) catalogState.sort = "featured";

  const searchInput = qs("#catalogSearch");
  if (searchInput && catalogState.search) searchInput.value = catalogState.search;
  const sortInput = qs("#sortFilter");
  if (sortInput && ["featured", "price-asc", "price-desc"].includes(catalogState.sort)) {
    sortInput.value = catalogState.sort;
  }

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

  if (catalogState.gender !== "all") {
    filtered = filtered.filter(product => product.gender === catalogState.gender);
  }

  if (catalogState.search) {
    const term = normalizeSearch(catalogState.search);
    filtered = filtered.filter(product =>
      normalizeSearch([product.name, product.category, product.collection, product.material, product.description].join(" "))
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

  const url = new URL(window.location.href);
  ["gender", "category", "material", "collection", "search", "sort"].forEach(key => {
    const value = String(catalogState[key] || "").trim();
    if (!value || value === "all" || (key === "sort" && value === "featured")) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  });
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);

  renderProducts("#catalogGrid", filtered);
  const count = qs("#catalogCount");
  if (count) count.textContent = `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`;

  // Título dinámico según los filtros activos (ej. "Collares de Plata 950 · Mujer").
  const title = qs("#catalogTitle");
  if (title) {
    const parts = [];
    if (catalogState.category !== "all") parts.push(catalogState.category);
    if (catalogState.material !== "all") parts.push(`de ${catalogState.material}`);
    if (catalogState.gender !== "all") parts.push(`· ${catalogState.gender}`);
    title.textContent = parts.length ? parts.join(" ") : "Joyas para cada momento";
  }

  const clear = qs("#clearCatalogFilters");
  if (clear) {
    const active = catalogState.search || ["gender", "category", "material", "collection"].some(key => catalogState[key] !== "all") || catalogState.sort !== "featured";
    clear.hidden = !active;
  }
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function clearCatalogFilters() {
  catalogState = { search: "", gender: "all", category: "all", material: "all", collection: "all", sort: "featured" };
  qsa("[data-filter]").forEach(input => {
    input.value = input.tagName === "SELECT" ? "all" : "";
  });
  const sort = qs("#sortFilter");
  if (sort) sort.value = "featured";
  applyCatalogFilters();
}

/**
 * Página de sección (seccion.html?genero=Hombre|Mujer): muestra los 3 materiales
 * (Plata 950, Cobre + enchape oro 18k, Reloj). Plata y Oro despliegan las 4
 * categorías; Reloj enlaza directo a su catálogo.
 */
function initSeccion() {
  const node = qs("#seccionContent");
  if (!node) return;

  const params = new URLSearchParams(window.location.search);
  const genero = params.get("genero") === "Hombre" ? "Hombre" : "Mujer";
  document.title = `${genero} | ${window.MILINOV.brand}`;
  const titulo = qs("#seccionTitulo");
  if (titulo) titulo.textContent = genero === "Hombre" ? "Joyas para Él" : "Joyas para Ella";

  const categorias = ["Aretes", "Pulseras", "Collares", "Anillos"];
  const materiales = [
    { name: "Plata 950", img: "assets/products/collar-placa-love.jpg", cats: categorias },
    { name: "Cobre + enchape oro 18k", img: "assets/products/collar-mini-amor.jpg", cats: categorias },
    { name: "Reloj", img: "assets/placeholder.svg", cats: null }
  ];

  node.innerHTML = materiales.map(material => {
    const base = `catalogo.html?gender=${encodeURIComponent(genero)}&material=${encodeURIComponent(material.name)}`;
    const sublinks = material.cats
      ? `<div class="seccion-cats">${material.cats.map(c => `<a href="${base}&category=${encodeURIComponent(c)}">${esc(c)}</a>`).join("")}<a class="seccion-all" href="${base}">Ver todo</a></div>`
      : `<div class="seccion-cats"><a class="seccion-all" href="${base}">Ver relojes</a></div>`;
    return `
      <article class="seccion-card">
        <a class="seccion-card-media" href="${base}">
          ${picture(material.img, { alt: material.name })}
          <span class="seccion-card-name">${esc(material.name)}</span>
        </a>
        ${sublinks}
      </article>`;
  }).join("");

  refreshIcons();
}

/* ============================================================
   Detalle de producto (producto.html)
   ============================================================ */

function initProductPage() {
  const productSection = qs("#productDetail");
  if (!productSection) return;

  const params = new URLSearchParams(window.location.search);
  const idParam = params.get("id");

  // Si vino ?id pero no corresponde a ningún producto, mostrar "no encontrado"
  // en vez de caer en silencio al primer producto del catálogo.
  if (idParam !== null && !findProduct(Number(idParam))) {
    productSection.innerHTML = `<div class="no-results">No encontramos esta joya. <a href="catalogo.html">Ver el catálogo</a></div>`;
    document.title = `Producto no encontrado | ${window.MILINOV.brand}`;
    return;
  }

  const product = findProduct(Number(idParam)) || PRODUCTS[0];
  if (!product) return;

  const soldOut = isSoldOut(product);
  const images = Array.isArray(product.images) && product.images.length ? product.images : [product.image];
  const badges = soldOut ? [] : productBadges(product);
  const related = PRODUCTS
    .filter(item => item.id !== product.id && (item.category === product.category || item.collection === product.collection))
    .slice(0, 4);

  document.title = `${product.name} | ${window.MILINOV.brand}`;
  updateProductMetadata(product);

  const thumbsHtml = images.length > 1
    ? `<div class="thumbs">${images.map((src, i) => `
          <button type="button" class="${i === 0 ? "is-active" : ""}" data-thumb="${esc(bestSrc(src))}" aria-label="Ver foto ${i + 1}">
            <img src="${esc(bestSrc(src))}" alt="" loading="lazy" onerror="productImageFallback(event)">
          </button>`).join("")}</div>`
    : "";

  const badgesHtml = badges.length
    ? `<div class="badges detail-badges">${badges.map(b => `<span class="badge ${b.cls}">${esc(b.label)}</span>`).join("")}</div>`
    : "";

  const extraRows = [];
  if (product.sizeMm) extraRows.push(`<li>Medida: <strong>${esc(product.sizeMm)}</strong></li>`);
  if (product.weightG) extraRows.push(`<li>Peso aprox.: <strong>${esc(product.weightG)} g</strong></li>`);

  const careBlock = (product.care || product.warranty)
    ? `<div class="product-care">
        ${product.care ? `<p><i data-lucide="sparkles"></i> ${esc(product.care)}</p>` : ""}
        ${product.warranty ? `<p><i data-lucide="shield-check"></i> ${esc(product.warranty)}</p>` : ""}
      </div>`
    : "";

  productSection.innerHTML = `
    <div class="product-gallery">
      <div class="main-product-image">
        <img id="mainProductImage" src="${esc(bestSrc(images[0]))}" alt="${esc(product.name)}" decoding="async" onerror="productImageFallback(event)">
      </div>
      ${thumbsHtml}
    </div>
    <div class="product-detail-info">
      ${badgesHtml}
      <span class="eyebrow">${esc(product.collection)} · ${esc(product.material)}</span>
      <h1>${esc(product.name)}</h1>
      <p class="product-price">${priceHtml(product)}</p>
      <p>${esc(product.description)}</p>
      <ul class="detail-list">
        <li>Material: <strong>${esc(product.material)}</strong></li>
        ${extraRows.join("\n        ")}
        <li>Categoría: <strong>${esc(product.category)}</strong></li>
        <li>Empaque: <strong>Listo para regalar</strong></li>
        <li>Envío: <strong>A todo el Perú</strong></li>
      </ul>
      ${careBlock}
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
      <ul class="product-guarantees">
        <li><i data-lucide="credit-card"></i> Pago con Yape, Plin o transferencia</li>
        <li><i data-lucide="truck"></i> Envíos a todo el Perú · 24–72 h</li>
        <li><i data-lucide="refresh-cw"></i> Cambios dentro de 7 días</li>
        <li><i data-lucide="shield-check"></i> Garantía del enchape</li>
      </ul>
    </div>
  `;

  // Galería: cambiar la foto principal al tocar una miniatura
  qsa("#productDetail [data-thumb]").forEach(btn => {
    btn.addEventListener("click", () => {
      qs("#mainProductImage").src = btn.dataset.thumb;
      qsa("#productDetail [data-thumb]").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  let qty = 1;
  const available = availableStock(product);
  const stockLimit = Number.isFinite(available) ? Math.max(1, Math.min(99, available)) : 99;
  const qtyNode = qs("#productQty");
  qs("#productMinus").addEventListener("click", () => {
    qty = Math.max(1, qty - 1);
    qtyNode.textContent = qty;
  });
  qs("#productPlus").addEventListener("click", () => {
    const next = Math.min(stockLimit, qty + 1);
    if (next === qty && !soldOut) showToast(`Solo quedan ${stockLimit} unidades de ${product.name}`);
    qty = next;
    qtyNode.textContent = qty;
  });
  qs("#addProductBtn").addEventListener("click", () => addToCart(product.id, qty));
  qs("#buyWhatsappBtn").addEventListener("click", () => window.open(whatsappSingleUrl(product, qty), "_blank", "noopener"));

  // Barra de compra fija en móvil (precio + acciones siempre visibles al hacer scroll)
  buildBuyBar(
    product,
    () => addToCart(product.id, qty),
    () => window.open(whatsappSingleUrl(product, qty), "_blank", "noopener"),
    soldOut
  );

  renderProducts("#relatedGrid", related.length ? related : PRODUCTS.filter(item => item.id !== product.id).slice(0, 4));
  injectProductJsonLd(product);
  refreshIcons();

  if (window.trackEvent) {
    window.trackEvent("view_item", { content_name: product.name, value: product.price, currency: "PEN" });
  }
}

/**
 * Barra de compra fija al pie en móvil: muestra el precio y los botones de
 * Agregar / Comprar por WhatsApp, siempre visibles al hacer scroll. Se oculta
 * automáticamente cuando los botones principales están en pantalla.
 */
let buyBarObserver = null;

function buildBuyBar(product, onAdd, onBuy, soldOut) {
  qs(".buy-bar")?.remove();
  // Desconecta el observer anterior para no acumular observadores huérfanos
  // cuando la ficha se re-renderiza (p. ej. tras la hidratación desde el backend).
  buyBarObserver?.disconnect();
  buyBarObserver = null;
  const bar = document.createElement("div");
  bar.className = "buy-bar";
  bar.innerHTML = `
    <div class="buy-bar-price">${priceHtml(product)}</div>
    <div class="buy-bar-actions">
      <button type="button" class="btn btn-outline" id="buyBarAdd" ${soldOut ? "disabled" : ""}>${soldOut ? "Agotado" : "Agregar"}</button>
      <button type="button" class="btn btn-whatsapp" id="buyBarWa">${soldOut ? "Consultar" : "Comprar"}</button>
    </div>
  `;
  document.body.appendChild(bar);
  document.body.classList.add("has-buy-bar");
  bar.querySelector("#buyBarAdd").addEventListener("click", onAdd);
  bar.querySelector("#buyBarWa").addEventListener("click", onBuy);

  // Oculta la barra cuando los botones de compra de la ficha están visibles.
  const actions = qs(".product-actions");
  if (actions && "IntersectionObserver" in window) {
    buyBarObserver = new IntersectionObserver(entries => {
      entries.forEach(e => bar.classList.toggle("is-hidden", e.isIntersecting));
    }, { rootMargin: "0px 0px -30% 0px" });
    buyBarObserver.observe(actions);
  }
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
    image: (Array.isArray(product.images) && product.images.length ? product.images : [product.image]).map(absoluteSiteUrl),
    url: absoluteSiteUrl(`producto.html?id=${Number(product.id)}`),
    sku: `MIL-${Number(product.id)}`,
    category: product.category,
    material: product.material,
    brand: { "@type": "Brand", name: window.MILINOV.brand },
    offers: {
      "@type": "Offer",
      priceCurrency: "PEN",
      price: product.price,
      url: absoluteSiteUrl(`producto.html?id=${Number(product.id)}`),
      itemCondition: "https://schema.org/NewCondition",
      availability: isSoldOut(product)
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock"
    }
  });
  document.head.appendChild(script);
}

function updateProductMetadata(product) {
  const url = absoluteSiteUrl(`producto.html?id=${Number(product.id)}`);
  const image = absoluteSiteUrl(bestSrc(product.image));
  const description = `${product.name} en ${product.material}. ${product.description} Precio ${money(product.price)}.`;
  const setMeta = (selector, attribute, value) => {
    const node = qs(selector);
    if (node) node.setAttribute(attribute, value);
  };
  setMeta('link[rel="canonical"]', "href", url);
  setMeta('meta[name="description"]', "content", description);
  setMeta('meta[property="og:title"]', "content", `${product.name} | ${window.MILINOV.brand}`);
  setMeta('meta[property="og:description"]', "content", description);
  setMeta('meta[property="og:image"]', "content", image);
  setMeta('meta[property="og:url"]', "content", url);
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

/**
 * Libro de Reclamaciones (reclamaciones.html): valida y arma la hoja de
 * reclamación, y la envía por WhatsApp o correo (no hay backend en producción).
 */
function initReclamoForm() {
  const form = qs("#reclamoForm");
  if (!form) return;

  const obligatorios = ["nombre", "documento", "telefono", "email", "detalle", "pedidoConsumidor"];

  const buildText = () => {
    const data = new FormData(form);
    const g = key => (data.get(key) || "").toString().trim();
    return [
      `HOJA DE RECLAMACIÓN — ${window.MILINOV.brand}`,
      `Tipo: ${g("tipo")}`,
      "",
      "1) CONSUMIDOR",
      `Nombre: ${g("nombre")}`,
      `DNI/CE: ${g("documento")}`,
      `Teléfono: ${g("telefono")}`,
      `Correo: ${g("email")}`,
      `Domicilio: ${g("domicilio") || "-"}`,
      "",
      "2) BIEN CONTRATADO",
      `Tipo: ${g("tipoBien")} · Monto: S/ ${g("monto") || "-"}`,
      `N.° de pedido: ${g("pedido") || "-"}`,
      `Descripción: ${g("descripcionBien") || "-"}`,
      "",
      "3) DETALLE",
      g("detalle"),
      "",
      "Pedido del consumidor:",
      g("pedidoConsumidor")
    ].join("\n");
  };

  const falta = () => {
    const data = new FormData(form);
    return obligatorios.some(key => !(data.get(key) || "").toString().trim());
  };

  const msg = qs("#reclamoMsg");
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (falta()) { if (msg) msg.textContent = "Completa los campos obligatorios (nombre, documento, teléfono, correo, detalle y tu pedido)."; return; }
    window.open(whatsappUrl(encodeURIComponent(buildText())), "_blank", "noopener");
    if (msg) msg.textContent = "Se abrió WhatsApp con tu hoja de reclamación. Te responderemos en un máximo de 15 días hábiles.";
  });

  qs("#reclamoEmail")?.addEventListener("click", () => {
    if (falta()) { if (msg) msg.textContent = "Completa los campos obligatorios antes de enviar."; return; }
    const subject = encodeURIComponent(`Libro de Reclamaciones — ${window.MILINOV.brand}`);
    window.location.href = `mailto:${window.MILINOV.email}?subject=${subject}&body=${encodeURIComponent(buildText())}`;
    if (msg) msg.textContent = "Se abrió tu correo con la hoja de reclamación.";
  });
}

/**
 * Aviso de cookies. Solo aparece si hay analítica configurada (config.js) y el
 * usuario aún no decidió. Hasta aceptar, analytics.js no carga GA4/Meta.
 */
function initCookieBanner() {
  const cfg = (window.MILINOV && window.MILINOV.analytics) || {};
  const hayAnalitica = (cfg.ga4 || "").trim() || (cfg.metaPixel || "").trim();
  if (!hayAnalitica) return;

  let decision = null;
  try { decision = localStorage.getItem("milinov_cookies"); } catch {}
  if (decision) return;

  const bar = document.createElement("div");
  bar.className = "cookie-bar";
  bar.setAttribute("role", "dialog");
  bar.setAttribute("aria-label", "Aviso de cookies");
  bar.innerHTML = `
    <p>Usamos cookies de analítica para mejorar la tienda. Puedes aceptarlas o rechazarlas. <a href="privacidad.html">Más información</a>.</p>
    <div class="cookie-actions">
      <button type="button" class="btn btn-outline" id="cookieReject">Rechazar</button>
      <button type="button" class="btn btn-primary" id="cookieAccept">Aceptar</button>
    </div>`;
  document.body.appendChild(bar);

  const decidir = value => {
    try { localStorage.setItem("milinov_cookies", value); } catch {}
    bar.remove();
  };
  bar.querySelector("#cookieAccept").addEventListener("click", () => {
    decidir("accepted");
    window.MILINOV_loadAnalytics?.();
  });
  bar.querySelector("#cookieReject").addEventListener("click", () => decidir("rejected"));
}

function initUI() {
  const menu = qs(".mobile-menu");
  if (menu) {
    menu.setAttribute("aria-hidden", "true");
    menu.inert = true;
  }
  const drawer = qs(".cart-drawer");
  if (drawer) {
    drawer.setAttribute("aria-hidden", "true");
    drawer.inert = true;
  }
  qsa("[data-open-menu], [data-open-cart]").forEach(btn => btn.setAttribute("aria-expanded", "false"));

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

  pruneCart();
  injectCheckoutFields();
  injectCheckoutOptions();
  injectWhatsappFab();

  // Mide cada clic a WhatsApp como un evento de contacto (analítica opcional).
  document.addEventListener("click", event => {
    const link = event.target.closest('a[href*="wa.me/"]');
    if (link && window.trackEvent) window.trackEvent("contact_whatsapp", {});
  });

  updateCartUI();
  qs("#clearCatalogFilters")?.addEventListener("click", clearCatalogFilters);
}

/**
 * Inserta en el carrito dos campos opcionales (nombre y distrito/ciudad) que
 * se incluyen en el mensaje de WhatsApp. Se guardan en localStorage para no
 * volver a pedirlos. Se inyecta por JS para no duplicar HTML en cada página.
 */
function injectCheckoutFields() {
  const footer = qs(".cart-footer");
  if (!footer || qs("#cartName")) return;

  const wrap = document.createElement("div");
  wrap.className = "cart-customer";
  wrap.innerHTML = `
    <input id="cartName" type="text" placeholder="Tu nombre (opcional)" autocomplete="name">
    <input id="cartCity" type="text" placeholder="Distrito / ciudad (opcional)" autocomplete="address-level2">
  `;
  const row = footer.querySelector(".cart-footer-row");
  if (row) row.insertAdjacentElement("afterend", wrap);
  else footer.prepend(wrap);

  ["cartName", "cartCity"].forEach(id => {
    const input = qs("#" + id);
    try { input.value = localStorage.getItem("milinov_" + id) || ""; } catch {}
    input.addEventListener("input", () => {
      try { localStorage.setItem("milinov_" + id, input.value); } catch {}
    });
  });
}

/**
 * Si la pasarela está activa (config.js → payments.enabled), agrega el botón
 * "Pagar en línea" junto al de WhatsApp, dando al cliente las dos opciones.
 * Si no está activa, el carrito queda solo con "Enviar pedido por WhatsApp".
 */
function injectCheckoutOptions() {
  const wa = qs("#checkoutWhatsapp");
  if (!wa || qs("[data-wallet]") || qs("#checkoutOnline")) return;
  const pay = (window.MILINOV && window.MILINOV.payments) || {};
  const wallets = ["yape", "plin"].filter(k => pay[k] && pay[k].enabled);
  const onlineOn = pay.enabled && pay.checkoutUrl;
  if (!wallets.length && !onlineOn) return; // sin pasarela: queda solo "Enviar pedido por WhatsApp"

  // Hay opción de pago → el botón de WhatsApp pasa a ser la alternativa secundaria.
  wa.textContent = "Pedir por WhatsApp";
  wa.classList.remove("btn-primary");
  wa.classList.add("btn-whatsapp");

  wallets.forEach(kind => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn btn-${kind}`; // btn-yape / btn-plin (colores de marca)
    btn.dataset.wallet = kind;
    btn.textContent = `Pagar con ${kind === "yape" ? "Yape" : "Plin"}`;
    wa.insertAdjacentElement("beforebegin", btn);
    btn.addEventListener("click", () => checkoutWallet(kind));
  });

  if (onlineOn) {
    const btn = document.createElement("button");
    btn.id = "checkoutOnline";
    btn.type = "button";
    btn.className = "btn btn-outline";
    btn.textContent = "Pagar con tarjeta";
    wa.insertAdjacentElement("beforebegin", btn);
    btn.addEventListener("click", checkoutOnline);
  }
}

/**
 * Animaciones de entrada al hacer scroll (aparecer suave). Respeta
 * prefers-reduced-motion: si el usuario pidió menos movimiento, no hace nada
 * y todo se ve normal (no se añade la clase que oculta).
 */
function initAnimations() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  const targets = qsa(".section-title, .gift-panel, .testimonial, .gender-card, .seccion-card, .benefit, .about-card, .contact-card, .product-care, .faq-list details");
  if (!targets.length) return;

  targets.forEach(el => el.classList.add("reveal"));
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        obs.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  targets.forEach(el => io.observe(el));
}

/** Botón flotante de WhatsApp, presente en todas las páginas de la tienda. */
function injectWhatsappFab() {
  if (qs(".wa-fab")) return;
  const fab = document.createElement("a");
  fab.className = "wa-fab";
  fab.href = whatsappUrl();
  fab.target = "_blank";
  fab.rel = "noopener";
  fab.setAttribute("aria-label", "Escríbenos por WhatsApp");
  fab.innerHTML = `<img src="assets/social/whatsapp.svg" alt="" aria-hidden="true">`;
  document.body.appendChild(fab);
}

/**
 * Pinta el banner de promoción en la franja superior si window.MILINOV.promo.text
 * tiene contenido. Se edita en un solo lugar (config.js) y aparece en todas las páginas.
 */
function initPromoBar() {
  const promo = (window.MILINOV && window.MILINOV.promo) || {};
  if (!promo.text) return;
  const container = qs(".top-bar .container");
  if (!container) return;
  // Inserta la promo como un nodo propio (sin pisar el resto del top-bar).
  container.querySelector(".promo-msg")?.remove();
  const node = document.createElement(promo.href ? "a" : "span");
  node.className = "promo-msg";
  if (promo.href) node.href = promo.href;
  node.textContent = promo.text;
  container.appendChild(node);
  qs(".top-bar")?.classList.add("is-promo");
}

function openMobileMenu() {
  closeCart();
  const menu = qs(".mobile-menu");
  menu?.classList.add("is-open");
  menu?.setAttribute("aria-hidden", "false");
  if (menu) menu.inert = false;
  qsa("[data-open-menu]").forEach(btn => btn.setAttribute("aria-expanded", "true"));
  qs(".overlay")?.classList.add("is-open");
  document.body.classList.add("no-scroll");
  qs("[data-close-menu]")?.focus();
}

function closeMobileMenu() {
  const menu = qs(".mobile-menu");
  menu?.classList.remove("is-open");
  menu?.setAttribute("aria-hidden", "true");
  if (menu) menu.inert = true;
  qsa("[data-open-menu]").forEach(btn => btn.setAttribute("aria-expanded", "false"));
  const cartOpen = qs(".cart-drawer")?.classList.contains("is-open");
  qs(".overlay")?.classList.toggle("is-open", !!cartOpen);
  document.body.classList.toggle("no-scroll", !!cartOpen);
}

/* ============================================================
   Arranque
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  // 1) Render inmediato con el catálogo estático (sin esperar al backend).
  initPromoBar();
  renderFeatured();
  initFeaturedSlider();
  initCatalog();
  initSeccion();
  initProductPage();
  initSearchShortcut();
  initContactForm();
  initReclamoForm();
  initCookieBanner();
  initWhatsappLinks();
  initUI();
  initAnimations();
  refreshIcons();

  // 2) Hidratación en segundo plano con el inventario real, si hay backend.
  hydrateProductsFromApi().then(updated => {
    if (updated) refreshDynamicViews();
    subscribeInventoryRealtime();
  });
});
