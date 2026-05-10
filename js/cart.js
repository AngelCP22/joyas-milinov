const WHATSAPP_NUMBER = "51999999999";
let cart = JSON.parse(localStorage.getItem("milinov_cart")) || [];

function saveCart() {
  localStorage.setItem("milinov_cart", JSON.stringify(cart));
  updateCartUI();
}

function findProduct(id) {
  return PRODUCTS.find(product => product.id === Number(id));
}

function addToCart(id, qty = 1) {
  const product = findProduct(id);
  if (!product) return;

  const existing = cart.find(item => item.id === product.id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id: product.id, qty });
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
  const item = cart.find(product => product.id === Number(id));
  if (!item) return;
  item.qty += delta;
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

function buildWhatsappText(singleProduct = null, qty = 1) {
  let lines = ["Hola Milinov Jewelry, quiero hacer este pedido:", ""];

  if (singleProduct) {
    const total = singleProduct.price * qty;
    lines.push(`${qty} x ${singleProduct.name} - S/ ${singleProduct.price.toFixed(2)}`);
    lines.push("");
    lines.push(`Total: S/ ${total.toFixed(2)}`);
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
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${buildWhatsappText()}`;
}

function whatsappSingleUrl(product, qty = 1) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${buildWhatsappText(product, qty)}`;
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
  const countNodes = document.querySelectorAll("[data-cart-count]");

  countNodes.forEach(node => node.textContent = getCartCount());

  if (cartTotal) cartTotal.textContent = `S/ ${getCartTotal().toFixed(2)}`;

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
        <img src="${product.image}" alt="${product.name}" onerror="this.src='https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=400&q=80'">
        <div>
          <h4>${product.name}</h4>
          <p>${product.material}</p>
          <strong>S/ ${product.price.toFixed(2)}</strong>
          <div class="qty-control">
            <button type="button" onclick="changeQty(${product.id}, -1)">−</button>
            <span>${item.qty}</span>
            <button type="button" onclick="changeQty(${product.id}, 1)">+</button>
          </div>
        </div>
        <button class="remove-btn" type="button" onclick="removeFromCart(${product.id})">×</button>
      </article>
    `;
  }).join("");
}

function checkoutWhatsapp() {
  if (!cart.length) {
    showToast("Agrega productos antes de enviar el pedido");
    return;
  }
  window.open(whatsappCartUrl(), "_blank");
}
