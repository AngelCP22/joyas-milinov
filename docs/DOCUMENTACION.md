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
CRUD contra el API + subida de imágenes (se convierten a base64 en el navegador y el backend las guarda en `assets/uploads/`). Solo se usa en `admin.html`.

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

**Publicar** → subir todo menos `backend/`, `admin.html`, `assets/source-joyas/`, `assets/contact-sheet.jpg` (sí se sube `enlaces.html`). Cambiar dominio en `robots.txt`, `sitemap.xml` y los `canonical`/`og:` de cada HTML. Verificar el número de WhatsApp real en `js/config.js`. Para la bio de Instagram, usa la URL de `enlaces.html`.

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
├── admin.html              Panel local de inventario (NO publicar)
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
