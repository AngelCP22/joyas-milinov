/**
 * cart.js — Carrito de compras de Milinov Jewelry.
 *
 * El carrito se guarda en localStorage (clave "milinov_cart") para que
 * persista entre páginas y visitas. El checkout no procesa pagos: arma un
 * mensaje con el pedido y lo abre en WhatsApp, donde se coordina pago y envío.
 *
 * Depende de: config.js (esc, money, whatsappUrl) y products.js (PRODUCTS).
 */

const CART_STORAGE_KEY = "milinov_cart";

/** Lee el carrito guardado tolerando datos corruptos o formatos viejos. */
function loadCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_STORAGE_KEY));
    if (!Array.isArray(stored)) return [];
    return stored.filter(item => item && Number(item.id) > 0 && Number(item.qty) > 0)
      .map(item => ({ id: Number(item.id), qty: Math.min(99, Math.floor(Number(item.qty))) }));
  } catch {
    return [];
  }
}

let cart = loadCart();

function saveCart() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // localStorage lleno o bloqueado: el carrito sigue funcionando en memoria.
  }
  updateCartUI();
}

function findProduct(id) {
  return PRODUCTS.find(product => product.id === Number(id));
}

/** Stock disponible de un producto, o Infinity si el dato no existe (catálogo estático). */
function availableStock(product) {
  if (isSoldOut(product)) return 0;
  return Number.isFinite(product.stock) ? Number(product.stock) : Infinity;
}

/** Quita del carrito productos que ya no existen en el catálogo (eliminados en el admin). */
function pruneCart() {
  const before = cart.length;
  cart = cart.filter(item => findProduct(item.id));
  if (cart.length !== before) saveCart();
}

function addToCart(id, qty = 1) {
  const product = findProduct(id);
  if (!product) return;

  const stock = availableStock(product);
  if (stock <= 0) {
    showToast(`${product.name} está agotado por ahora`);
    return;
  }

  const existing = cart.find(item => item.id === product.id);
  const currentQty = existing ? existing.qty : 0;
  const newQty = Math.min(currentQty + qty, stock, 99);

  if (newQty === currentQty) {
    showToast(`Solo quedan ${stock} unidades de ${product.name}`);
    return;
  }

  if (existing) {
    existing.qty = newQty;
  } else {
    cart.push({ id: product.id, qty: newQty });
  }

  saveCart();
  openCart();
  showToast(`${product.name} agregado al carrito`);

  if (window.trackEvent) {
    window.trackEvent("add_to_cart", { content_name: product.name, value: product.price, currency: "PEN" });
  }
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== Number(id));
  saveCart();
}

function changeQty(id, delta) {
  const item = cart.find(entry => entry.id === Number(id));
  if (!item) return;

  const product = findProduct(id);
  // Si el producto ya no existe en el catálogo, se retira del carrito.
  if (!product) {
    removeFromCart(id);
    return;
  }

  // Si la pieza se agotó mientras estaba en el carrito, avisamos y la retiramos
  // (en vez de borrarla en silencio al tocar "+").
  const stock = availableStock(product);
  if (stock <= 0) {
    showToast(`${product.name} quedó agotado y se quitó del carrito`);
    removeFromCart(id);
    return;
  }

  const newQty = Math.min(item.qty + delta, stock, 99);
  // Tope de stock alcanzado al sumar: informamos sin cambiar la cantidad.
  if (delta > 0 && newQty === item.qty) {
    showToast(`Solo quedan ${stock} unidades de ${product.name}`);
    return;
  }

  item.qty = newQty;
  if (item.qty <= 0) {
    removeFromCart(id);
    return;
  }
  saveCart();
}

function getCartTotal() {
  return cart.reduce((total, item) => {
    const product = findProduct(item.id);
    return total + (product ? product.price * item.qty : 0);
  }, 0);
}

function getCartCount() {
  return cart.reduce((total, item) => total + item.qty, 0);
}

/** Código corto de pedido (para que la vendedora identifique cada chat). */
function orderCode() {
  return `M${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

/** Lee nombre y distrito del cliente si los campos opcionales del carrito existen. */
function getCustomerInfo() {
  return {
    name: document.querySelector("#cartName")?.value.trim() || "",
    city: document.querySelector("#cartCity")?.value.trim() || ""
  };
}

/** Arma el texto del pedido para WhatsApp (carrito completo o un solo producto). */
function buildWhatsappText(singleProduct = null, qty = 1) {
  const lines = [`Hola ${window.MILINOV.brand}, quiero hacer este pedido:`, ""];

  const lineFor = (product, units) => {
    const promo = discountPct(product) ? ` (antes ${money(product.oldPrice)})` : "";
    return `${units} x ${product.name} (${product.material}) - ${money(product.price)}${promo}`;
  };

  if (singleProduct) {
    lines.push(lineFor(singleProduct, qty));
    lines.push("");
    lines.push(`Total: S/ ${(singleProduct.price * qty).toFixed(2)}`);
  } else {
    cart.forEach(item => {
      const product = findProduct(item.id);
      if (product) lines.push(lineFor(product, item.qty));
    });
    lines.push("");
    lines.push(`Total: S/ ${getCartTotal().toFixed(2)}`);
  }

  const { name, city } = getCustomerInfo();
  lines.push("");
  lines.push(`Pedido ${orderCode()}`);
  if (name) lines.push(`Nombre: ${name}`);
  if (city) lines.push(`Distrito/ciudad: ${city}`);
  lines.push("Quedo atenta/o para coordinar el pago y envío.");
  return encodeURIComponent(lines.join("\n"));
}

function whatsappCartUrl() {
  return whatsappUrl(buildWhatsappText());
}

function whatsappSingleUrl(product, qty = 1) {
  return whatsappUrl(buildWhatsappText(product, qty));
}

function openCart() {
  document.querySelector(".cart-drawer")?.classList.add("is-open");
  document.querySelector(".overlay")?.classList.add("is-open");
  document.body.classList.add("no-scroll");
}

function closeCart() {
  document.querySelector(".cart-drawer")?.classList.remove("is-open");
  document.querySelector(".overlay")?.classList.remove("is-open");
  document.body.classList.remove("no-scroll");
}

function updateCartUI() {
  const cartItems = document.querySelector("#cartItems");
  const cartTotal = document.querySelector("#cartTotal");

  document.querySelectorAll("[data-cart-count]").forEach(node => {
    node.textContent = getCartCount();
  });

  if (cartTotal) cartTotal.textContent = money(getCartTotal());

  if (!cartItems) return;

  if (!cart.length) {
    cartItems.innerHTML = `
      <div class="empty-cart">
        <p>Tu carrito está vacío.</p>
        <a href="catalogo.html" class="btn btn-outline">Ver catálogo</a>
      </div>
    `;
    return;
  }

  cartItems.innerHTML = cart.map(item => {
    const product = findProduct(item.id);
    if (!product) return "";
    // Subtotal de la línea = precio unitario × cantidad. Se recalcula en cada
    // render (cada vez que se cuenta/descuenta con − / +), así suma en vivo.
    const lineTotal = product.price * item.qty;
    return `
      <article class="cart-item">
        <img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" onerror="productImageFallback(event)">
        <div class="cart-item-body">
          <h4>${esc(product.name)}</h4>
          <p>${esc(product.material)}</p>
          <div class="cart-item-row">
            <div class="qty-control">
              <button type="button" aria-label="Quitar una unidad" onclick="changeQty(${product.id}, -1)">−</button>
              <span>${item.qty}</span>
              <button type="button" aria-label="Agregar una unidad" onclick="changeQty(${product.id}, 1)">+</button>
            </div>
            <div class="cart-item-price">
              <strong>${money(lineTotal)}</strong>
              ${item.qty > 1 ? `<small>${money(product.price)} c/u</small>` : ""}
            </div>
          </div>
        </div>
        <button class="remove-btn" type="button" aria-label="Eliminar ${esc(product.name)} del carrito" onclick="removeFromCart(${product.id})">×</button>
      </article>
    `;
  }).join("");
}

function checkoutWhatsapp() {
  if (!cart.length) {
    showToast("Agrega productos antes de enviar el pedido");
    return;
  }
  if (window.trackEvent) {
    window.trackEvent("initiate_checkout", { value: getCartTotal(), currency: "PEN", num_items: getCartCount() });
  }
  const url = whatsappCartUrl();
  window.open(url, "_blank", "noopener");
  showOrderConfirm(url);
}

/**
 * Pago en línea: lleva al enlace de la pasarela configurada en config.js
 * (payments.checkoutUrl). Si no hay enlace, avisa cómo configurarlo. El detalle
 * del pedido viaja igual por WhatsApp, así que aquí solo se inicia el cobro.
 */
function checkoutOnline() {
  if (!cart.length) {
    showToast("Agrega productos antes de pagar");
    return;
  }
  const pay = (window.MILINOV && window.MILINOV.payments) || {};
  if (window.trackEvent) {
    window.trackEvent("initiate_checkout", { value: getCartTotal(), currency: "PEN", num_items: getCartCount(), method: "online" });
  }
  if (pay.checkoutUrl) {
    window.open(pay.checkoutUrl, "_blank", "noopener");
    showToast(`Abrimos el pago. Tu total es ${money(getCartTotal())}. Envíanos el comprobante por WhatsApp.`);
    return;
  }
  showToast("Falta configurar el enlace de pago (payments.checkoutUrl en config.js).");
}

// Billeteras móviles soportadas (etiqueta visible + clase de estilo).
const WALLETS = {
  yape: { label: "Yape", cls: "wallet-yape" },
  plin: { label: "Plin", cls: "wallet-plin" }
};

/** Texto de WhatsApp del pedido con la nota de pago por la billetera elegida. */
function walletWhatsappUrl(label) {
  const pedido = decodeURIComponent(buildWhatsappText());
  return whatsappUrl(encodeURIComponent(`${pedido}\n\nPagué por ${label} y te envío el comprobante. 📸`));
}

/**
 * Muestra dentro del carrito los datos para pagar por Yape o Plin (titular,
 * número, QR opcional y el total), con un botón para enviar el comprobante por
 * WhatsApp. No procesa el pago: el cliente paga en su app y tú confirmas con el
 * comprobante. Cero backend, cero cuenta de comercio.
 */
function checkoutWallet(kind) {
  if (!cart.length) {
    showToast("Agrega productos antes de pagar");
    return;
  }
  const meta = WALLETS[kind];
  const cfg = (window.MILINOV.payments && window.MILINOV.payments[kind]) || {};
  const items = document.querySelector("#cartItems");
  if (!items || !meta) return;
  items.querySelector(".wallet-panel")?.remove();

  if (window.trackEvent) {
    window.trackEvent("initiate_checkout", { method: kind, value: getCartTotal(), currency: "PEN" });
  }

  const qr = cfg.qr
    ? `<img class="wallet-qr" src="${esc(cfg.qr)}" alt="Código QR de ${esc(meta.label)}" loading="lazy" onerror="this.style.display='none'">`
    : "";

  const box = document.createElement("div");
  box.className = `wallet-panel ${meta.cls}`;
  box.innerHTML = `
    <span class="wallet-badge">${esc(meta.label)}</span>
    <strong>Paga ${money(getCartTotal())}</strong>
    <p class="wallet-num">${esc(cfg.holder || window.MILINOV.brand)}<br><b>${esc(cfg.number || "")}</b></p>
    ${qr}
    <p class="wallet-help">Paga por ${esc(meta.label)} y envíanos el comprobante por WhatsApp para confirmar tu pedido.</p>
    <a class="btn btn-whatsapp" href="${walletWhatsappUrl(meta.label)}" target="_blank" rel="noopener">Ya pagué — enviar comprobante</a>
    <button class="btn btn-outline" type="button" id="walletBack">Volver</button>
  `;
  items.prepend(box);
  box.querySelector("#walletBack").addEventListener("click", () => box.remove());
}

/**
 * Muestra una confirmación dentro del carrito tras enviar el pedido. NO vacía
 * el carrito: si el navegador bloqueó la ventana de WhatsApp o el cliente la
 * cerró, ofrece un enlace de respaldo y un botón para copiar el pedido, para
 * no perder la venta.
 */
function showOrderConfirm(url) {
  const items = document.querySelector("#cartItems");
  if (!items) return;
  items.querySelector(".cart-confirm")?.remove();

  const box = document.createElement("div");
  box.className = "cart-confirm";
  box.innerHTML = `
    <strong>¡Tu pedido se abrió en WhatsApp!</strong>
    <p>Si no se abrió solo, toca el botón o copia tu pedido y pégalo en nuestro chat.</p>
    <a class="btn btn-whatsapp" href="${url}" target="_blank" rel="noopener">Abrir WhatsApp</a>
    <button type="button" class="btn btn-outline" id="copyOrder">Copiar pedido</button>
  `;
  items.prepend(box);

  box.querySelector("#copyOrder").addEventListener("click", async () => {
    const text = decodeURIComponent(buildWhatsappText());
    try {
      await navigator.clipboard.writeText(text);
      showToast("Pedido copiado");
    } catch {
      showToast("Copia manualmente desde el chat");
    }
  });
}
