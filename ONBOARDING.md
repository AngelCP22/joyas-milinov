# Onboarding — Milinov Jewelry (tienda web)

Guía de traspaso para retomar este proyecto sin contexto previo. Léela completa antes de tocar código.

> **Estado al día (jun 2026) y rumbo decidido con la dueña:**
> - **Top-bar unificado**: una sola franja crema premium en TODAS las páginas (antes el inicio era crema y las internas negras). Fuente única en la base `.top-bar` de `css/styles.css`.
> - **Pagos = Yape y Plin (MVP, IMPLEMENTADO)**: en el carrito botones "Pagar con Yape" y "Pagar con Plin" (colores de marca) → panel con titular, número, QR opcional y total → "enviar comprobante por WhatsApp". Flujo genérico `checkoutWallet(kind)` en cart.js; config en `config.js → payments.yape` / `payments.plin` (poner números reales). Sin backend ni cuenta de comercio; confirmación manual del voucher. Automatizar (agregador Izipay/Culqi + webhook en Edge Function) es fase futura. Tarjeta vía enlace: `payments.checkoutUrl` (opcional, botón "Pagar con tarjeta").
> - **Admin en tiempo real terminado**: `admin.html` ya usa Supabase Auth + Database + Storage, permite fotos drag&drop, precio y stock, y protege escritura con una lista de administradores. Falta pegar la URL + clave pública del proyecto real en `js/config.js` y ejecutar el SQL.
> - **Automático** = los cambios se reflejan incluso en pestañas abiertas mediante Supabase Realtime; también se refresca al volver a la pestaña.

---

## 1. Qué es

Tienda web de **Milinov Jewelry**: joyería peruana (Plata 950 y cobre con enchape de oro 18k) que **vende por WhatsApp** — NO hay pasarela de pago: el carrito arma un mensaje de pedido y abre `wa.me`. Público: mujeres, regalos, tráfico mayormente de Instagram en celular.

- **Stack:** HTML5 + CSS3 + JavaScript ES2020 **vanilla**. Sin frameworks, **sin build, sin `npm install`**.
- **Backend opcional:** Node.js (solo módulos nativos) que sirve el sitio + API REST + panel admin local.
- **Ubicación:** `E:\CODEX\joyas-milinov`.
- **Docs largas:** [README.md](README.md) (inicio rápido) y [docs/DOCUMENTACION.md](docs/DOCUMENTACION.md) (arquitectura completa). **Léelas**; aquí va solo lo esencial + las trampas.

## 2. Restricción clave del entorno

- **Node.js NO está instalado en esta máquina.** No puedes ejecutar el backend ni `npm test` aquí. Verifica el JS del backend por **sintaxis** (`new Function(code)` vía el navegador de preview) y la lógica por lectura. El backend es correcto y está cubierto por tests (`backend/test/`), pero solo el usuario podrá correrlos donde tenga Node.
- **Python sí está** (con Pillow + WebP) — se usa para servir el sitio en preview y para generar WebP.

## 3. Cómo verlo / verificar cambios

- **Preview:** hay un `launch.json` que sirve la carpeta con `python -m http.server` en el puerto **8766** (config `joyas-milinov`). Úsalo con las tools `preview_*`.
- **⚠️ Trampa de caché (importante):** el `http.server` de Python NO manda cabeceras anti-caché fuertes, y el navegador de preview **cachea agresivamente los `.js`/`.html`**. Tras editar, si no ves el cambio: reinicia el server (`preview_stop` + `preview_start` da un `serverId` nuevo y caché fresco) y/o navega con un query nuevo (`?fresh=<n>`). Para confirmar el archivo en disco, haz `fetch(url, {cache:"no-store"})`. (En producción el backend Node SÍ manda `no-cache` en HTML, así que esto es solo del preview.)
- **Verificación habitual:** `fetch` + `new Function(code)` para sintaxis de cada JS; `preview_eval` para inspeccionar el DOM; `preview_screenshot` para lo visual (a veces hace timeout — reintenta o confía en el DOM).
- **Backend real (donde haya Node):** `cd backend && npm start` → todo en `http://localhost:3001`. `npm test` corre las pruebas.

## 4. Mapa de archivos

```
index.html        Portada = TIENDA (hero, materiales, destacados, testimonios)
catalogo.html     Catálogo con filtros/búsqueda/orden
producto.html     Ficha (?id=N): galería, precio/descuento, comprar por WhatsApp
nosotros / contacto / enlaces(Linktree) / 404
terminos / privacidad / reclamaciones   Legales Perú (Libro de Reclamaciones Indecopi)
admin.html        Panel privado en línea (publicar; requiere login)
css/styles.css    Estilos (secciones numeradas 1-10 en comentarios)
js/config.js      ⚙️ Config central (window.MILINOV: whatsapp, promo, analytics, apiUrl)
                  + helpers: esc, money, whatsappUrl, isSoldOut, discountPct,
                    priceHtml, productBadges, webpSibling, bestSrc, picture
js/products.js    Catálogo estático de respaldo (lo regenera el backend)
js/cart.js        Carrito (localStorage) + checkout WhatsApp + confirmación
js/app.js         Render (tarjetas/ficha/catálogo), slider, galería, buy-bar,
                  promo, FAB, cookies, formularios, hidratación desde API
js/admin.js       Panel admin: CRUD, compresión de imágenes, drag&drop, CSV
js/analytics.js   GA4 + Meta Pixel (opcional, gated por consentimiento de cookies)
backend/server.js API + servidor estático + uploads (Node nativo). Escucha en 127.0.0.1
backend/data/products.json   FUENTE DE VERDAD del inventario
backend/test/server.test.js  Pruebas con node:test
assets/products, assets/banners   Fotos en JPG + WebP (sibling .webp generado)
```

## 4-bis. Estructura de navegación (importante)

Tres niveles: **Género → Material → Categoría**.
```
index.html → Mujer/Hombre → seccion.html?genero=… → 3 materiales
  Plata 950 / Cobre+oro 18k → Aretes·Pulseras·Collares·Anillos
  Reloj → directo (categoría "Relojes")
→ catalogo.html?gender=…&material=…&category=…  (grilla de modelos)
```
- Cada producto tiene `gender` ("Hombre"|"Mujer"), **obligatorio** (lo valida el backend y el admin).
- `seccion.html` es una página parametrizada por `?genero=`; la pinta `initSeccion()` en `app.js`.
- `catalogo.html` filtra por género/categoría/material/colección (URL params) y tiene título dinámico.
- La clienta carga modelos+precios desde el admin (Género+Material+Categoría+precio+fotos).

## 4-ter. Pagos, Supabase y animaciones (config.js)

- **Pago**: `payments.enabled`+`checkoutUrl` (enlace Mercado Pago/Izipay/Yape, sin backend). Con `enabled:true` el carrito muestra "Pagar en línea" + "Pedir por WhatsApp". WhatsApp funciona siempre.
- **Supabase** (opcional, catálogo en vivo): `supabase.url`+`anonKey` → tienda y panel usan Supabase; sin creds usa backend local/estático. Esquema/seed/guía en `backend/supabase/`. RLS: lectura pública del catálogo; escritura solo para IDs de `admin_users`; NUNCA usar la service_role key en el front.
- **Animaciones**: `initAnimations()` (clase `.reveal` + IntersectionObserver), respeta prefers-reduced-motion.

## 5. Cómo funciona (modelo mental)

- **Static-first + hidratación:** cada página pinta al instante con `PRODUCTS` (de `js/products.js`); en paralelo `app.js` consulta el backend (`{apiUrl}/products`, timeout 4 s) y, si responde, reemplaza `PRODUCTS` y repinta. Si no hay backend, se queda con el estático. Funciona en 3 escenarios: `file://`, backend local, y hosting estático.
- **Fuente de verdad:** `backend/data/products.json`. Al guardar en el admin, el backend **regenera `js/products.js` automáticamente** (`syncStaticCatalog`), así la tienda estática queda sincronizada.
- **Convenciones (respetarlas):**
  - Todo dato insertado con `innerHTML` pasa por **`esc()`** (anti-XSS). No romper esto.
  - Cada `init*()` en `app.js` es **idempotente** y hace early-return si no encuentra su DOM; por eso el mismo bundle se carga en todas las páginas.
  - Lógica compartida en `config.js` (no duplicar): `isSoldOut`, `money`, `discountPct`, `priceHtml`, `picture/bestSrc`.
  - Imágenes: usa `picture(src, opts)` / `bestSrc(src)` — sirven WebP con fallback JPG. `<picture>` está con `display:contents` en CSS para no romper layouts; OJO: no envolver en `<picture>` imágenes cuyo `src` se cambie por JS (la galería usa `bestSrc` + `<img>` plano por eso).
  - Orden de carga de scripts (en este orden, con `defer`): `lucide → config → analytics → products → cart → app` (admin usa `config → admin`).

## 6. Estado actual

Completado en 4 fases: optimización/responsive/SEO/accesibilidad; venta (WhatsApp, confianza, FAQ, analítica, promo); ficha que vende (galería, badges, descuentos, buy-bar móvil, testimonios); auditoría de ingeniería con correcciones (bugs, seguridad, validaciones, DRY); **diseño unificado** (header premium con íconos Lucide en todas las páginas); **páginas legales Perú**; **respaldo automático**; **tests backend**; **imágenes WebP**. Madurez ~85%.

## 6-bis. Endurecimiento pre-producción hecho (auditoría 2026-06-29)

Tras una auditoría de producción (7 dimensiones, score 72/100), el DEV ya resolvió lo que no dependía de datos del dueño:
- **Dominio alineado**: todo el sitio usa `https://www.milinovjoyeria.com` (antes `milinovjewelry.com`); email `hola@milinovjoyeria.com`. Decisión: **con www**.
- **WhatsApp = fuente única confirmada**: `initWhatsappLinks()` (app.js) reescribe TODOS los `wa.me` desde `config.js` en cada página. Cambiar `config.js:12` arregla los ~23 enlaces. (El audit creyó que estaban hardcodeados; NO lo están en runtime.)
- **`admin.html` privado**: publicado muestra login de Supabase; sin credenciales muestra la pantalla de configuración y nunca renderiza el inventario. En local mantiene compatibilidad con el backend Node.
- **Cabeceras de seguridad para hosting estático**: `_headers` (Cloudflare Pages/Netlify) y `vercel.json` con CSP (default-src 'self', orígenes acotados: fonts, unpkg, jsdelivr, Supabase, GA4/Meta ya pre-permitidos), X-Frame-Options, nosniff, Referrer-Policy, y caché no-cache para html/js/css (sin hash en nombres).
- **Bugs menores**: carrito avisa con toast si una pieza se agotó (no la borra en silencio); `stock` coaccionado a `Number` en la ruta Supabase; targets táctiles del header móvil a 44px (WCAG 2.5.5); `priceRange` del JSON-LD a `S/ 69 - S/ 219`.
- **Fixes de UI (revisión de capturas 2026-06-29)**: (1) `picture > source { display:none }` global — con `picture{display:contents}`, el `<source>` se colaba como celda fantasma en grids/flex (rompía el `.gift-panel`, dejaba hueco y descuadraba imagen/texto). (2) `.cart-footer` heredaba `justify-content:space-between` de la regla compartida con `.cart-head`, encogiendo la columna del grid a ~201px (campos y botones angostos, placeholder "Distrito…" cortado) → se forzó `grid-template-columns:1fr`. (3) `.whatsapp-strip` tenía DOS enlaces (chevron `›` + botón verde) → se quitó el chevron, queda un solo CTA; en móvil ya no se oculta `.whatsapp-action`. El carrito ya suma en vivo con subtotal por línea (precio × cantidad) + total + contador.

## 6-ter. Colección de HOMBRE: fotos listas, faltan precios (2026-06-29)

La dueña entregó fotos reales de una colección masculina (2 relojes Casio + cadenas de plata). Ya están **optimizadas** (JPG + WebP) en `assets/products/` y los **originales archivados** en `assets/source-joyas/*-original.jpg`. La tarjeta "Hombre" de la portada (`index.html`) ya usa `collar-cubano-grueso-plata`. **YA CARGADAS** en el catálogo (ids 11-18 en `js/products.js` + `backend/data/products.json` + `backend/supabase/seed.sql`), reemplazando los relojes de ejemplo. ⚠️ **PRECIOS Y STOCK SON TEMPORALES** (la dueña los corregirá): relojes 189/199; collares 280/390; pulseras 160/140/170/190; stock 5 en todos. Mapeo (todos género **Hombre**; nombres aprobados):

| Foto base (assets/products/) | Producto | Material | Categoría |
|---|---|---|---|
| `reloj-casio-plateado` (+ `reloj-casio-plateado-2` = 2ª foto de galería) | Reloj Casio plateado | Reloj (acero) | Reloj |
| `reloj-casio-negro` | Reloj Casio negro | Reloj (acero) | Reloj |
| `collar-cubano-plata` | Collar cadena cubana | Plata 950 | Collares |
| `collar-cubano-grueso-plata` | Collar cadena cubana gruesa | Plata 950 | Collares |
| `pulsera-cubana-plata` | Pulsera cadena cubana | Plata 950 | Pulseras |
| `pulsera-cordon-plata` | Pulsera cordón (torzal) | Plata 950 | Pulseras |
| `pulsera-rolo-plata` | Pulsera rolo/ancla | Plata 950 | Pulseras |
| `pulsera-placa-personalizada` | Pulsera de placa personalizable (grabado de nombre; la foto muestra "Carlos" de ejemplo) | Plata 950 | Pulseras |

- Al cargarlas, **reemplazar los relojes de ejemplo** id 11/12 (hoy `placeholder.svg`) por `reloj-casio-plateado`/`reloj-casio-negro`.
- Receta para procesar más fotos (Pillow, hay `to_web.py` en el scratchpad de la sesión): cap lado largo **1200px**, JPG **q82** progresivo + WebP **q80**; archivar el original en `source-joyas/`. Node NO está, así que se hace con Python.

## 7. Pendiente (datos que solo tiene el dueño — NO inventar)

BLOQUEANTES de lanzamiento (sin esto NO se publica):
1. ✅ **WhatsApp real LISTO** (2026-06-29): `js/config.js:12` = `51965224616`. Verificado: todos los `wa.me` lo usan.
2. ✅ **Yape/Plin LISTOS** (2026-06-29): ambos = `965 224 616` (mismo nº que WhatsApp, confirmado por la dueña). Verificado: el panel del carrito lo muestra. Opcional: la dueña puede subir su QR (`payments.yape.qr`/`plin.qr`) para más confianza.
3. **Razón social, RUC y fecha** en las 3 páginas legales (buscar `[RAZÓN SOCIAL]`, `[RUC]`, `[completar fecha]` en `terminos.html`, `privacidad.html`, `reclamaciones.html` — están en metadata Y en el cuerpo).

ANTES DE PUBLICAR (no bloquean en desarrollo):
4. **Crear el buzón** `hola@milinovjoyeria.com` (es el canal legal de contacto / derechos ARCO).
5. **Comprar el dominio** `milinovjoyeria.com` y apuntarlo al hosting.
6. **Corregir precios/stock de los 8 productos de HOMBRE** (ver §6-ter): ya están cargados y visibles, pero con precios/stock TEMPORALES que la dueña debe confirmar (editar en `js/products.js` + `backend/data/products.json` + `seed.sql`, o vía el panel admin).
7. **Testimonios reales** en `index.html:165-191` (los actuales son de ejemplo; reseñas falsas = riesgo Indecopi).
8. Resto del catálogo/fotos/precios definitivos de mujer si los hubiera.

## 8. Reglas y trampas

- **Publicar** `admin.html` y `js/admin.js`. **No publicar** la carpeta `backend/`, `assets/source-joyas/` ni `assets/contact-sheet.jpg`. La seguridad del panel depende de Auth + RLS, no de ocultar la URL.
- **SÍ publicar** los archivos de hosting `_headers` (Cloudflare Pages/Netlify) y/o `vercel.json` (Vercel) — aplican CSP y cabeceras de seguridad en producción (en hosting estático no corre `server.js`, así que sin estos archivos el sitio iría sin cabeceras).
- El backend **no tiene autenticación** (uso local); por eso escucha solo en `127.0.0.1`. Si alguna vez se expone, primero agregar token/HTTPS/CORS restringido/rate-limiting.
- **Sobre SOLID:** se aplica DRY/SRP pragmático. NO meter clases/DI/bundler — sería sobre-ingeniería para este tamaño (ya documentado y decidido).
- Al **añadir fotos nuevas**, regenerar sus `.webp` (script de Pillow; ver DOCUMENTACION) o el `<picture>` no tendrá fuente WebP.
- Para publicar sin backend, el admin tiene botón "Exportar respaldo" (genera `js/products.js`).

## 9. Primer paso sugerido para el próximo agente

Arranca el preview (`joyas-milinov`, puerto 8766), abre `/` y `/catalogo.html`, revisa la consola (debe estar limpia) y confirma que entiendes el flujo static-first antes de cambiar nada. Si editas JS y "no se ve", es la caché del preview (ver §3).
