/**
 * analytics.js — Analítica opcional (Google Analytics 4 + Píxel de Meta).
 *
 * Lee los IDs desde js/config.js (window.MILINOV.analytics). Si están vacíos,
 * NO carga nada y el sitio funciona igual. Cuando pongas tus IDs, empieza a
 * medir automáticamente las visitas y los eventos clave del embudo:
 *   - view_item        → al abrir una ficha de producto
 *   - add_to_cart      → al agregar al carrito (cart.js)
 *   - initiate_checkout→ al enviar el pedido por WhatsApp (cart.js)
 *   - contact_whatsapp → al tocar cualquier enlace de WhatsApp (app.js)
 *
 * Expone window.trackEvent(nombre, params) que reenvía el evento a GA4 y a Meta.
 * Debe cargarse DESPUÉS de config.js y ANTES de cart.js / app.js.
 *
 * PRIVACIDAD: GA4/Meta solo se cargan si hay IDs configurados Y el usuario aceptó
 * las cookies (localStorage "milinov_cookies" === "accepted"). El aviso de cookies
 * lo muestra app.js → initCookieBanner(), que llama a window.MILINOV_loadAnalytics().
 */
(function () {
  let loaded = false;

  function consentioCookies() {
    try { return localStorage.getItem("milinov_cookies") === "accepted"; } catch { return false; }
  }

  function loadAnalytics() {
    if (loaded) return;
    const cfg = (window.MILINOV && window.MILINOV.analytics) || {};
    const ga4 = (cfg.ga4 || "").trim();
    const metaPixel = (cfg.metaPixel || "").trim();
    if (!ga4 && !metaPixel) return;     // nada configurado
    if (!consentioCookies()) return;    // requiere consentimiento
    loaded = true;

  // Google Analytics 4 (gtag.js)
  if (ga4) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ga4);
  }

  // Píxel de Meta (Facebook/Instagram)
  if (metaPixel) {
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
      n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", metaPixel);
    window.fbq("track", "PageView");
  }
  } // fin de loadAnalytics

  // Permite que el aviso de cookies (app.js) cargue la analítica al aceptar.
  window.MILINOV_loadAnalytics = loadAnalytics;

  // Mapea nuestros nombres de evento a los estándar de Meta.
  const META_EVENTS = {
    view_item: "ViewContent",
    add_to_cart: "AddToCart",
    initiate_checkout: "InitiateCheckout",
    contact_whatsapp: "Contact"
  };

  /**
   * Envía un evento a las plataformas activas. Seguro de llamar siempre:
   * si no hay analítica configurada, simplemente no hace nada.
   */
  window.trackEvent = function (name, params) {
    params = params || {};
    try { if (window.gtag) window.gtag("event", name, params); } catch (e) {}
    try {
      if (window.fbq) {
        const mapped = META_EVENTS[name];
        if (mapped) window.fbq("track", mapped, params);
        else window.fbq("trackCustom", name, params);
      }
    } catch (e) {}
  };

  // Intenta cargar al inicio (si el usuario ya había aceptado en una visita previa).
  loadAnalytics();
})();
