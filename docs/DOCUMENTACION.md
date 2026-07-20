# Documentación técnica — Milinov Jewelry

Guía completa de arquitectura, funcionamiento y mantenimiento del sitio.
Para el inicio rápido, ver el [README.md](../README.md).

---

## 1. Visión general

| | |
|---|---|
| **Rubro** | Joyería (Plata 950 y cobre + enchape oro 18k), venta por redes y WhatsApp |
| **Stack** | HTML5 + CSS3 + JavaScript ES2020 vanilla. Sin frameworks, sin build, sin npm install |
| **Backend** | Node.js ≥ 18, solo módulos nativos (`http`, `fs`, `path`). Opcional |
| **Checkout** | WhatsApp: el carrito arma el mensaje del pedido; el pago se coordina en el chat |
| **Datos** | `backend/data/products.json` (fuente de verdad) + `js/products.js` (respaldo estático) |

### Flujo de datos del catálogo

```
┌─ Carga de página ─────────────────────────────────────────────┐
│ 1. Se pinta AL INSTANTE con js/products.js (catálogo estático)│
│ 2. En paralelo, fetch a {apiUrl}/products?status=active       │
│    (timeout 4 s, no bloquea nada)                             │
│ 3. ¿Respondió el backend?                                     │
│    Sí → PRODUCTS se reemplaza con el inventario real          │
│         (precios/stock del admin) y se repintan las vistas    │
│    No → silencio: el sitio queda con el catálogo estático     │
└───────────────────────────────────────────────────────────────┘
```

Esto significa que el **mismo código funciona en tres escenarios**: abierto como archivo, servido por el backend local, o publicado en un hosting estático sin backend.

### Tienda principal fija + "el admin gestiona todo" sin romperla

- La **portada es siempre la tienda** (`index.html`). El hub de enlaces tipo Linktree se separó a `enlaces.html` (sirve para la bio de Instagram). Hay una sola tienda principal con URL única (`/`).
- El panel admin gestiona **todo** el inventario (crear, editar, borrar, subir fotos) sobre `backend/data/products.json`.
- La tienda principal queda **protegida** por diseño: el paso 3 del flujo solo reemplaza el catálogo si el backend responde con productos (`length > 0`). Si el backend está apagado, vacío o falla, la portada usa el respaldo `js/products.js` y nunca queda en blanco. Subir un producto solo **agrega** (POST con id incremental); no altera los existentes.
- Para publicar **sin backend**, el admin tiene **"Exportar respaldo"**: descarga un `js/products.js` con el inventario actual. Reemplazas ese archivo en el hosting y la tienda pública refleja lo gestionado en el panel, sin depender del backend en línea.

### Funciones de venta y panel (Fases 1 y 2)

Implementado encima de la base anterior, sin frameworks:

**Confianza y captación (Fase 1):** señales honestas (Yape/Plin/transferencia, envíos 24–72h, cambios 7 días, garantía) en portada y ficha; mensaje de pedido con material, N° de pedido y nombre/distrito; botón flotante de WhatsApp en todo el sitio; FAQ en Contacto; banner de promo editable (`config.js → promo`); analítica opcional GA4 + Píxel de Meta (`config.js → analytics`, eventos en `js/analytics.js`).

**Ficha que vende (Fase 2):**
- **Galería** de varias fotos por joya (`product.images[]`, la 1ª es portada) con miniaturas que cambian la foto principal; en la tarjeta, 2ª foto al pasar el mouse. Compatible hacia atrás: si solo hay `image`, se ve como antes.
- **Badges** automáticos (Oferta / Nuevo / Más vendido / "Quedan N") y **precio con descuento** (tachado + % OFF) cuando hay `oldPrice`. Helpers `priceHtml()` y `productBadges()` en `config.js`.
- **Datos de ficha** opcionales: medida (`sizeMm`), peso (`weightG`), cuidados (`care`), garantía (`warranty`) — renderizado condicional.
- **Barra de compra fija** en móvil (`buildBuyBar` en `app.js`): precio + Agregar/Comprar siempre visibles; se oculta con `IntersectionObserver` cuando los botones de la ficha están en pantalla.
- **Testimonios** estáticos en la portada (editar en `index.html`).
- **Confirmación de pedido** en el carrito (`showOrderConfirm` en `cart.js`): tras abrir WhatsApp, deja un enlace de respaldo y "Copiar pedido" y **no vacía el carrito**.

**Panel admin más potente (Fase 2):** subida de **varias fotos** con **compresión en el navegador** (canvas → máx. 1200 px → WebP, resuelve el límite de 5 MB), **arrastrar y soltar**, **duplicar** producto, **edición en línea** de precio y stock (PATCH al salir de la casilla), **importar CSV** (`parseCsv` + alta por fila) con **plantilla descargable**, y campos nuevos (oferta, etiqueta, medida, cuidados, destacado). El backend (`normalizeProduct`) acepta y guarda todos los campos nuevos.

### Auditoría de ingeniería y correcciones (Fase 3)

Tras una auditoría profunda (bugs, seguridad, validaciones, responsive, SOLID/DRY) con verificación
adversarial, se aplicaron estas correcciones:

**Backend (`server.js`)** — el endurecimiento más importante:
- Escucha **solo en `127.0.0.1`** (loopback): el panel/API nunca queda accesible desde otros equipos de la red por descuido (configurable con `HOST`).
- Subida de imágenes: la **extensión se deriva del tipo MIME validado** (no del nombre del cliente) y se verifican los **magic bytes** del archivo; nombres con entropía anti-colisión. Cierra el vector de "SVG con script disfrazado".
- Cabeceras de seguridad en estáticos: `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`.
- Errores 500 con mensaje **genérico** al cliente (detalle solo en consola del servidor).
- `products.json` ausente → inventario vacío (primer arranque); corrupto → error claro.
- Protección path-traversal comparando con separador final (no bloquea solo, ya no se cuela un directorio hermano con prefijo igual).
- **Validación reforzada** (`validateProduct`): SKU único, precio > 0, `oldPrice` > precio, peso ≥ 0, imagen obligatoria si `status=active`, rutas de imagen válidas (solo `assets/` o `http(s)` con extensión de imagen), longitudes máximas. `model` dejó de ser obligatorio (no se publica y rompía la edición en línea).

**Admin (`admin.js`)**: validación de precio/stock antes de enviar (no más "S/ 0.00" por descuido), edición en línea que revierte valores inválidos, **import CSV** que detecta el delimitador `;` (Excel es-PE), valida columnas y reporta errores **por fila**, deduplica SKU; "Duplicar" deja el SKU vacío para forzar uno único; guardas (`optional chaining`) para que el script no muera si cambia el HTML.

**Tienda (`app.js`/`cart.js`/`config.js`)**: helper único `isSoldOut()` (elimina la lógica de "agotado" repetida en 4 sitios), `cart.js` reutiliza `money()`/`discountPct()` (DRY), `?id` inexistente muestra "no encontrado" en vez de otra joya, el flag **`featured`** ahora sí filtra los destacados de la portada, se corrige una fuga de `IntersectionObserver`, la promo se inserta sin pisar el `top-bar`, y el carrito se depura de productos eliminados.

**CSS**: contrastes corregidos a **WCAG AA** (CTA del hero, kicker, dorado de textos/precios), objetivos táctiles ≥40–44 px en móvil, barra de compra con `safe-area` (notch) y espacio inferior reservado, y **eliminación de CSS muerto** (`.bottom-nav`, `.favorite-btn`, sistema `story-*`).

**Veredicto SOLID** (honesto para este tamaño): se aplicó **SRP/DRY pragmático** (helpers compartidos, guardas, deduplicación de lógica). Un refactor a clases, contenedor de inyección de dependencias o bundler sería **sobre-ingeniería** para un sitio vanilla de ~6 páginas con una sola usuaria; el patrón `init*()` idempotente y la configuración central por `window.MILINOV` ya cumplen el rol.

### Mejoras (Fase 4): legal, diseño unificado, respaldo automático, WebP

- **Páginas legales (Perú):** `terminos.html`, `privacidad.html` (Ley 29733) y `reclamaciones.html` (Libro de Reclamaciones de Indecopi, con formulario que arma la hoja y la envía por WhatsApp o correo — `initReclamoForm()` en `app.js`). Enlazadas desde el footer de todas las páginas. Completar `[RAZÓN SOCIAL]` y `[RUC]`. **Aviso de cookies** (`initCookieBanner()`): solo aparece si hay analítica configurada; hasta aceptar, `analytics.js` **no** carga GA4/Meta (consentimiento real).
- **Diseño unificado:** todas las páginas usan ahora el mismo **header premium** (logo centrado + íconos Lucide), eliminando los emojis 🛍/☰ de las páginas internas. Radios unificados vía tokens (`--radius-lg/md/sm` = 18/14/10) para un acabado consistente menos "burbuja".
- **Respaldo automático:** el backend regenera `js/products.js` en cada guardado (`syncStaticCatalog()` dentro de `writeProducts()`), eliminando el paso manual de "Exportar respaldo" y el riesgo de precios desincronizados.
- **Pruebas del backend:** `backend/test/server.test.js` con el runner nativo `node:test` (sin dependencias) cubre validación, normalización, rutas de imagen, magic bytes y nombres de archivo. Ejecutar: `cd backend && npm test`.
- **Imágenes WebP:** las fotos de catálogo y banners tienen su `.webp` (≈50–85 % más livianas). El render usa `<picture>` con WebP + JPG de respaldo (helpers `picture()`/`bestSrc()` en `config.js`); el hero y los banners también. Para regenerar tras añadir fotos, reconvertir a WebP (p. ej. con un script de Pillow/Squoosh).

### Estructura de navegación (Fase 5): Género → Material → Categoría

A pedido de la clienta, la tienda se organiza en **tres niveles**:

```
Inicio (index.html)
 └─ Mujer / Hombre            (seccion.html?genero=…)
     ├─ Plata 950             → Aretes · Pulseras · Collares · Anillos
     ├─ Cobre + enchape oro 18k → (mismas 4 categorías)
     └─ Reloj                 → directo (categoría "Relojes", sin subdividir)
                                  ↓
                       catalogo.html?gender=…&material=…&category=…  (grilla de modelos)
```

- **Nuevo campo `gender`** (`"Hombre" | "Mujer"`) en cada producto. Es **obligatorio**: el backend (`validateProduct`) rechaza un producto sin género válido; el admin tiene un `<select>` Género; el CSV una columna `gender` (acepta mayúsc./minúsc.).
- **Material `Reloj`** y **categoría `Relojes`** añadidas. Los relojes no se subdividen en aretes/anillos.
- **`seccion.html`** es una sola página parametrizada por `?genero=`; `app.js → initSeccion()` pinta las 3 tarjetas de material con sus enlaces. Reutiliza el catálogo existente: cada enlace abre `catalogo.html` con `gender`/`material`/`category` en la URL.
- **`catalogo.html`** ganó un filtro de **género** (`#genderFilter`) y un **título dinámico** (`#catalogTitle`, ej. "Collares de Plata 950 · Hombre"). `applyCatalogFilters()` filtra por género igual que por material/categoría.
- **La clienta administra modelos y precios** desde `admin.html`: inicia sesión, elige Género + Material + Categoría, escribe nombre y **precio**, sube fotos y guarda; el producto aparece solo en la sección que corresponde. Supabase guarda y sincroniza el inventario en línea.

### Mejoras (Fase 6): pago en línea, Supabase y animaciones

- **Carrito con doble opción** (`config.js → payments`): con `payments.enabled:false` (por defecto) el carrito muestra solo *"Enviar pedido por WhatsApp"* (publicable). Con `enabled:true` aparecen **"Pagar en línea"** + **"Pedir por WhatsApp"** (`injectCheckoutOptions()` en `app.js`). "Pagar en línea" abre `payments.checkoutUrl` (enlace de Mercado Pago/Izipay/Yape — **sin backend**) y muestra el total para enviar el comprobante por WhatsApp (`checkoutOnline()` en `cart.js`). El pedido por WhatsApp funciona siempre.
- **Catálogo y panel en línea con Supabase** (`config.js → supabase`): con `url` + clave pública, la tienda lee productos y `admin.html` usa Auth, Database, Storage y Realtime. Si está vacío, usa el backend local / catálogo estático. El SQL aplica RLS: lectura pública del catálogo y escritura solo para usuarios de `admin_users`. **Nunca** usar la `service_role` key en el frontend.
- **Animaciones** (`initAnimations()` en `app.js`): aparición suave al hacer scroll (clase `.reveal` + `IntersectionObserver`) en secciones, tarjetas y testimonios. Respeta `prefers-reduced-motion` (si está activo, no oculta nada).

---

## 2. Archivos JavaScript

Orden de carga (todos con `defer`, se ejecutan en este orden):
`config.js → products.js → cart.js → app.js`

### js/config.js — Configuración central
- `window.MILINOV`: número de WhatsApp, marca, email, ciudad y `apiUrl`.
- `apiUrl` se autodetecta: `/api` si el sitio lo sirve el backend (puerto 3001), `http://localhost:3001/api` si se abre como archivo o desde otro servidor local.
- Helpers globales: `esc()` (escape de HTML — toda inserción con `innerHTML` pasa por aquí para prevenir XSS), `money()` (formato `S/ 0.00` con `Intl.NumberFormat`), `whatsappUrl()`.

### js/products.js — Catálogo estático de respaldo
Lista `PRODUCTS` con los campos: `id, name, category, collection, material, price, image, description` y opcionales `stock, status`. Mantener sincronizado con `backend/data/products.json` si se publica sin backend.

### js/cart.js — Carrito
- Persistencia en `localStorage` (clave `milinov_cart`), con lectura tolerante a datos corruptos.
- Respeta el stock: si el producto hidratado del API trae `stock`/`status`, no permite agregar más unidades de las disponibles ni productos agotados (tope duro: 99 por ítem).
- `buildWhatsappText()` arma el mensaje del pedido; `checkoutWhatsapp()` lo abre en `wa.me`.

### js/app.js — Interfaz
Cada `init*()` se autodetecta por página (si no encuentra sus elementos, no hace nada):

| Función | Página | Qué hace |
|---|---|---|
| `renderFeatured` + `initFeaturedSlider` | index (tienda) | Grilla de destacados con paginación por puntos, auto-avance cada 5.2 s (se desactiva con `prefers-reduced-motion`) |
| `initCatalog` + `applyCatalogFilters` | catálogo | Filtros por búsqueda/categoría/material/colección + orden por precio. Lee parámetros de URL (`?category=…&material=…&collection=…&search=…`) |
| `buildCatalogFilterOptions` | catálogo | Llena los `<select>` con los valores reales de los productos (las categorías nuevas creadas en el admin aparecen solas) |
| `initProductPage` | producto | Pinta el detalle según `?id=N`, maneja cantidad, inyecta JSON-LD `Product` y actualiza `document.title` |
| `initWhatsappLinks` | todas | Reescribe TODOS los `href` con `wa.me/` usando el número de config.js |
| `initContactForm` | contacto | Convierte el formulario en mensaje de WhatsApp |
| `initUI` | todas | Carrito lateral, menú móvil, overlay, cierre con tecla `Escape` |
| `hydrateProductsFromApi` | todas | Hidratación no bloqueante desde el backend (ver flujo arriba) |

### js/admin.js — Panel de inventario
`admin.html` usa CRUD contra Supabase y sube imágenes a Storage cuando hay credenciales. En desarrollo conserva el API local: las imágenes se convierten a base64 y Node las guarda en `assets/uploads/`.

---

## 3. Backend (backend/server.js)

Servidor HTTP nativo de Node, **sin dependencias**. Hace dos cosas:

1. **Sitio estático**: sirve toda la carpeta del proyecto en `http://localhost:3001` (con tipos MIME correctos, protección contra path traversal, la carpeta `backend/` nunca se expone por HTTP, y 404.html como página de error).
2. **API REST** bajo `/api`:

| Método y ruta | Descripción |
|---|---|
| `GET /api/health` | Ping del servicio |
| `GET /api/products` | Lista productos. Filtros: `?category=`, `?status=`, `?q=` |
| `GET /api/products/:id` | Un producto |
| `POST /api/products` | Crea (valida sku/name/category/model, precio ≥ 0, stock entero ≥ 0) |
| `PATCH /api/products/:id` | Actualiza campos parciales |
| `DELETE /api/products/:id` | Elimina |
| `GET /api/categories` | Categorías únicas existentes |
| `POST /api/uploads` | Sube imagen `{filename, dataUrl}` (JPG/PNG/WebP, máx. 5 MB) |

- Los datos se guardan con **escritura atómica** (archivo temporal + rename): `products.json` nunca queda corrupto aunque se corte el proceso.
- Puerto configurable: `PORT=3002 npm start`.
- **Sin autenticación** — uso local únicamente. Para exponerlo a internet haría falta agregar al menos: autenticación, HTTPS, rate-limiting y CORS restringido.

---

## 4. Decisiones de optimización aplicadas

| Área | Qué se hizo |
|---|---|
| **Fuentes** | `<link rel="preconnect">` + stylesheet en el `<head>` (antes: `@import` dentro del CSS, que bloquea el render en cadena) |
| **JavaScript** | Todos los scripts con `defer`; Lucide (iconos) con versión fijada `0.453.0` (antes `@latest`, irreproducible) |
| **Primer render** | El catálogo pinta sin esperar al backend; la hidratación es en segundo plano con timeout de 4 s (antes: `await fetch` bloqueaba todo el arranque) |
| **Imágenes** | `loading="lazy"` + `decoding="async"` en todo lo bajo el pliegue; el hero de la tienda con `<link rel="preload">` + `fetchpriority="high"` (LCP) |
| **Fallbacks** | Imagen rota → `assets/placeholder.svg` local (antes: URLs de Unsplash, dependencia externa) |
| **SEO** | Títulos únicos, meta description por página, canonical, Open Graph, JSON-LD (`JewelryStore` en tienda, `Product` dinámico en producto), `robots.txt`, `sitemap.xml` |
| **Seguridad** | Todo dato de producto pasa por `esc()` antes de insertarse con `innerHTML`; `rel="noopener"` en enlaces externos; el backend valida tipo y tamaño de las imágenes subidas |
| **Accesibilidad** | Skip-link, `aria-label`/`aria-current`/`role="dialog"`, foco visible (`:focus-visible`), cierre con `Escape`, `aria-live` en toast y contador, `prefers-reduced-motion` |
| **Limpieza** | Eliminada la copia duplicada del proyecto que venía dentro del zip y el código JS muerto (category pills / collections de un diseño anterior) |

### Mejoras recomendadas a futuro (no aplicadas)

- **Convertir imágenes a WebP/AVIF** y generar tamaños responsive (`srcset`). Requiere una herramienta como [Squoosh](https://squoosh.app) (manual) o `sharp` (Node). Ahorro estimado: 40–60 % del peso de imágenes.
- Reemplazar los iconos de CDN por SVGs inline (elimina la única dependencia de CDN aparte de Google Fonts).
- Si el negocio crece: pasarela de pagos (Culqi/Mercado Pago funcionan bien en Perú) y un backend con autenticación.

---

## 5. Tareas frecuentes (recetario)

**Cambiar el número de WhatsApp** → `js/config.js`, campo `whatsapp`. Nada más.

**Agregar una joya (con backend)** → `admin.html` → formulario → Guardar. La foto se sube ahí mismo.

**Agregar una joya (sin backend)** → añadir objeto a `PRODUCTS` en `js/products.js` con `id` único y la foto en `assets/products/` (JPG cuadrado, ~600–900 px, < 200 KB recomendado).

**Marcar agotado** → admin → Estado: "Agotado". La tienda muestra la insignia y bloquea el carrito (el producto sigue visible, lo que genera consultas por WhatsApp).

**Cambiar textos/colores** → textos directo en los HTML; colores en las variables de `:root` al inicio de `css/styles.css` (`--color-gold`, `--color-bg`, etc.).

**Sincronizar la tienda pública con el admin** → en el panel pulsa "Exportar respaldo" → reemplaza el `js/products.js` descargado en tu hosting y sube las fotos nuevas de `assets/uploads/`. La portada pública mostrará lo mismo que el admin, sin backend en línea.

**Publicar** → subir el frontend incluido `admin.html`; excluir `backend/`, `assets/source-joyas/` y `assets/contact-sheet.jpg`. Cambiar dominio en `robots.txt`, `sitemap.xml` y los `canonical`/`og:` de cada HTML. Verificar el número de WhatsApp real en `js/config.js`. Para la bio de Instagram, usa la URL de `enlaces.html`.

---

## 6. Estructura completa

```
joyas-milinov/
├── index.html              Portada = TIENDA principal (fija): hero, materiales, destacados
├── enlaces.html            Hub de enlaces (Linktree) para la bio de redes
├── catalogo.html           Catálogo con filtros
├── producto.html           Detalle (?id=N)
├── nosotros.html           Sobre la marca
├── contacto.html           Formulario → WhatsApp
├── admin.html              Panel privado de inventario (Supabase Auth)
├── 404.html                Error amigable
├── robots.txt              SEO (cambiar dominio)
├── sitemap.xml             SEO (cambiar dominio)
├── css/styles.css          Estilos. Secciones numeradas en el encabezado
├── js/
│   ├── config.js           ⚙️ Configuración + helpers (esc, money)
│   ├── products.js         Catálogo estático de respaldo
│   ├── cart.js             Carrito + WhatsApp
│   ├── app.js              Render y UI de todas las páginas
│   └── admin.js            Panel admin
├── assets/
│   ├── products/           Fotos de catálogo
│   ├── banners/            hero-collar, empaque-regalo, nosotros, contacto
│   ├── uploads/            Fotos subidas desde el admin (la crea el backend)
│   ├── social/whatsapp.svg
│   ├── placeholder.svg     Fallback de imagen rota
│   ├── favicon.svg
│   ├── source-joyas/       Fotos originales (material de trabajo, NO publicar)
│   └── contact-sheet.jpg   Material de trabajo (NO publicar)
├── backend/
│   ├── server.js           API + servidor estático (Node nativo)
│   ├── package.json        Scripts npm (sin dependencias)
│   ├── data/products.json  💾 Fuente de verdad del inventario
│   └── README.md           Documentación del API
└── docs/DOCUMENTACION.md   Este archivo
```
