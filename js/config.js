/**
 * config.js — Configuración central de Milinov Jewelry.
 *
 * ÚNICO lugar donde se edita el número de WhatsApp, los datos de la marca
 * y la URL del API. Todos los demás scripts (cart.js, app.js, admin.js)
 * leen de aquí. Este archivo debe cargarse ANTES que el resto.
 */
window.MILINOV = {
  // Número de WhatsApp en formato internacional SIN "+" ni espacios.
  // Ejemplo Perú: "51987654321". Cambiarlo aquí actualiza todos los
  // botones y enlaces de WhatsApp del sitio automáticamente.
  whatsapp: "51965224616",

  // Datos de la marca (se usan en mensajes y datos estructurados).
  brand: "Milinov Jewelry",
  email: "hola@milinovjoyeria.com",
  city: "Lima, Perú",
  siteUrl: "https://angelcp22.github.io/joyas-milinov/",

  /**
   * Banner de promoción (franja superior). Editable sin tocar el resto del sitio.
   * Déjalo en "" para ocultarlo. Ejemplos de campañas: Día de la Madre, San Valentín, Navidad.
   */
  promo: {
    text: "",        // Ej: "Día de la Madre: 15% OFF en collares con el código MAMA"
    href: ""         // Opcional, a dónde lleva al tocar el banner. Ej: "catalogo.html"
  },

  /**
   * Analítica. Pega aquí tus IDs cuando los tengas (cuentas gratuitas de
   * Google Analytics 4 y Meta Business). Mientras estén vacíos, el sitio
   * funciona igual y no carga nada. Sirven para medir qué de Instagram vende.
   */
  analytics: {
    ga4: "",         // Google Analytics 4, ej. "G-XXXXXXXXXX"
    metaPixel: ""    // Píxel de Meta, ej. "1234567890123456"
  },

  /**
   * Pasarela de pago. Mientras "enabled" sea false, el carrito muestra solo
   * "Pedir por WhatsApp" (publicable tal cual). Cuando tengas la pasarela:
   *   - enabled: true
   *   - checkoutUrl: tu ENLACE de pago (Mercado Pago / Izipay / Yape) — la
   *     forma más simple, no necesita backend; el botón "Pagar en línea" lleva ahí.
   *   - provider: referencia del proveedor (para una integración con SDK a futuro).
   * Con enabled:true aparecen DOS botones: "Pagar en línea" y "Pedir por WhatsApp".
   */
  payments: {
    /**
     * Billeteras móviles (Perú): YAPE y PLIN. Sin backend ni cuenta de comercio:
     * el cliente paga al número/QR y envía el comprobante por WhatsApp para que
     * confirmes el pedido. ⚠️ Reemplaza los números por los reales (pueden ser
     * el mismo número en ambas). El QR es opcional (exporta el de tu app).
     */
    yape: {
      enabled: true,
      number: "965 224 616",
      holder: "Milinov Jewelry",
      qr: ""                         // ej. "assets/yape-qr.png"
    },
    plin: {
      enabled: true,
      number: "965 224 616",
      holder: "Milinov Jewelry",
      qr: ""                         // ej. "assets/plin-qr.png"
    },
    /** Pago con tarjeta vía enlace (Mercado Pago/Izipay). Opcional, para después. */
    enabled: false,
    provider: "",        // "culqi" | "izipay" | "mercadopago"
    checkoutUrl: ""      // ej. "https://mpago.la/xxxx"
  },

  /**
   * Base de datos en línea (Supabase). Catálogo en vivo: si pones aquí la URL y
   * la clave pública de tu proyecto, la tienda lee los productos de Supabase y
   * admin.html permite editarlos con login, sin republicar. Si están vacías, la
   * tienda usa el backend local / el catálogo estático, como hasta ahora.
   * La anon key es pública por diseño; la seguridad la dan las políticas RLS
   * (ver backend/supabase/schema.sql). NO pongas aquí la "service_role" key.
   */
  supabase: {
    url: "",        // https://TUPROYECTO.supabase.co
    anonKey: ""     // clave pública "publishable" o la antigua "anon"
  },

  /**
   * URL base del API de inventario (backend local).
   * - Si el sitio se sirve desde el propio backend (npm start → puerto 3001),
   *   usa la ruta relativa "/api".
   * - Si se abre como archivo (file://) o desde otro servidor local,
   *   apunta a http://localhost:3001/api.
   * - En un hosting estático sin backend, la llamada falla en silencio y
   *   el sitio usa el catálogo estático de js/products.js. Es el diseño esperado.
   */
  apiUrl: (() => {
    if (location.protocol === "file:") return "http://localhost:3001/api";
    if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && location.port !== "3001") {
      return "http://localhost:3001/api";
    }
    return "/api";
  })()
};

/**
 * Escapa texto para insertarlo de forma segura dentro de HTML generado
 * con plantillas (previene inyección de HTML/XSS desde datos de productos).
 */
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Formatea un precio en soles peruanos: 119 → "S/ 119.00" */
const _PEN = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function money(value) {
  return `S/ ${_PEN.format(Number(value) || 0)}`;
}

/** Construye una URL de chat de WhatsApp con mensaje opcional ya codificado. */
function whatsappUrl(encodedText = "") {
  const base = `https://wa.me/${window.MILINOV.whatsapp}`;
  return encodedText ? `${base}?text=${encodedText}` : base;
}

/** URL pública absoluta para metadatos y datos estructurados. */
function absoluteSiteUrl(path = "") {
  return new URL(path, window.MILINOV.siteUrl).href;
}

/**
 * Única fuente de verdad para "¿está agotado?". La usan la tarjeta, la ficha,
 * el JSON-LD y el carrito para que nunca discrepen.
 */
function isSoldOut(product) {
  return product.status === "sold_out" || Number(product.stock) === 0;
}

/**
 * Devuelve la ruta .webp hermana de una imagen del catálogo/banners (donde sí
 * generamos WebP), o null si no aplica (p. ej. fotos subidas, que ya son .webp).
 */
function webpSibling(src) {
  if (typeof src !== "string") return null;
  const s = src.trim();
  return /^assets\/(products|banners)\/.+\.(jpe?g|png)$/i.test(s)
    ? s.replace(/\.(jpe?g|png)$/i, ".webp")
    : null;
}

/** Mejor fuente disponible: el .webp si existe, si no la original. */
function bestSrc(src) {
  return webpSibling(src) || src;
}

/**
 * Genera el HTML de una imagen sirviendo WebP cuando existe (más liviano en
 * móvil) con el JPG como respaldo automático vía <picture>. Para imágenes sin
 * WebP hermano devuelve un <img> normal. No usar en imágenes cuyo src se vaya a
 * cambiar por JS (la galería), porque <source> tiene prioridad sobre img.src.
 */
function picture(src, opts = {}) {
  const o = opts || {};
  const attrs = [
    o.cls && `class="${esc(o.cls)}"`,
    o.id && `id="${esc(o.id)}"`,
    `src="${esc(src)}"`,
    `alt="${esc(o.alt || "")}"`,
    o.ariaHidden && `aria-hidden="true"`,
    `loading="${esc(o.loading || "lazy")}"`,
    `decoding="async"`,
    o.fetchpriority && `fetchpriority="${esc(o.fetchpriority)}"`,
    o.onerror && `onerror="${o.onerror}"`
  ].filter(Boolean).join(" ");
  const img = `<img ${attrs}>`;
  const webp = webpSibling(src);
  return webp ? `<picture><source type="image/webp" srcset="${esc(webp)}">${img}</picture>` : img;
}

/** % de descuento de un producto (0 si no tiene oldPrice válido). */
function discountPct(product) {
  const old = Number(product.oldPrice);
  if (!old || old <= product.price) return 0;
  return Math.round((1 - product.price / old) * 100);
}

/**
 * HTML del precio: si hay oldPrice válido muestra el anterior tachado, el
 * actual y el % de ahorro. Si no, solo el precio normal.
 */
function priceHtml(product) {
  const pct = discountPct(product);
  if (!pct) return `<strong class="price-now">${money(product.price)}</strong>`;
  return `<span class="price-wrap">
      <s class="price-old">${money(product.oldPrice)}</s>
      <strong class="price-now">${money(product.price)}</strong>
      <span class="price-off">-${pct}%</span>
    </span>`;
}

/**
 * Devuelve los badges visibles de un producto (oferta, nuevo, bestseller,
 * pocas unidades), como array de { label, cls } para pintarlos.
 */
function productBadges(product) {
  const badges = [];
  if (discountPct(product)) badges.push({ label: "Oferta", cls: "badge-sale" });
  if (product.badge === "nuevo") badges.push({ label: "Nuevo", cls: "badge-new" });
  if (product.badge === "bestseller") badges.push({ label: "Más vendido", cls: "badge-best" });
  const stock = Number(product.stock);
  if (Number.isFinite(stock) && stock > 0 && stock <= 3 && product.status !== "sold_out") {
    badges.push({ label: `Quedan ${stock}`, cls: "badge-low" });
  }
  return badges;
}
