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
  whatsapp: "51999999999",

  // Datos de la marca (se usan en mensajes y datos estructurados).
  brand: "Milinov Jewelry",
  email: "hola@milinovjewelry.com",
  city: "Lima, Perú",

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
