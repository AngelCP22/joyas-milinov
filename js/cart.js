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
  if (product.status === "sold_out") return 0;
  return Number.isFinite(product.stock) ? Number(product.stock) : Infinity;
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
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== Number(id));
  saveCart();
}

function changeQty(id, delta) {
  const item = cart.find(entry => entry.id === Number(id));
  if (!item) return;

  const product = findProduct(id);
  const stock = product ? availableStock(product) : 99;
  item.qty = Math.min(item.qty + delta, stock, 99);

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

/** Arma el texto del pedido para WhatsApp (carrito completo o un solo producto). */
function buildWhatsappText(singleProduct = null, qty = 1) {
  const lines = [`Hola ${window.MILINOV.brand}, quiero hacer este pedido:`, ""];

  if (singleProduct) {
    lines.push(`${qty} x ${singleProduct.name} - S/ ${singleProduct.price.toFixed(2)}`);
    lines.push("");
    lines.push(`Total: S/ ${(singleProduct.price * qty).toFixed(2)}`);
  } else {
    cart.forEach(item => {
      const product = findProduct(item.id);
      if (product) lines.push(`${item.qty} x ${product.name} - S/ ${product.price.toFixed(2)}`);
    });
    lines.push("");
    lines.push(`Total: S/ ${getCartTotal().toFixed(2)}`);
  }

  lines.push("");
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
    return `
      <article class="cart-item">
        <img src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" onerror="productImageFallback(event)">
        <div>
          <h4>${esc(product.name)}</h4>
          <p>${esc(product.material)}</p>
          <strong>${money(product.price)}</strong>
          <div class="qty-control">
            <button type="button" aria-label="Quitar una unidad" onclick="changeQty(${product.id}, -1)">−</button>
            <span>${item.qty}</span>
            <button type="button" aria-label="Agregar una unidad" onclick="changeQty(${product.id}, 1)">+</button>
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
  window.open(whatsappCartUrl(), "_blank", "noopener");
}
