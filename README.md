# Milinov Jewelry — Sitio web de la joyería

Sitio web de **Milinov Jewelry**: joyas delicadas en **Plata 950** y **cobre con enchape de oro 18k**, con envíos a todo el Perú. Catálogo con filtros, carrito de compras y checkout por **WhatsApp** (sin pasarela de pagos: el pedido llega como mensaje listo para coordinar pago y envío).

Hecho con **HTML + CSS + JavaScript vanilla** (sin frameworks ni build). Incluye un **backend local opcional** en Node.js para administrar inventario, precios y stock desde un panel visual.

> Documentación técnica completa en [docs/DOCUMENTACION.md](docs/DOCUMENTACION.md).

---

## Páginas

| Página | Qué es |
|---|---|
| [index.html](index.html) | **Portada / tienda principal** (fija): hero, secciones por material y destacados. Es lo primero que se ve al entrar |
| [catalogo.html](catalogo.html) | Catálogo con búsqueda, filtros (categoría/material/colección) y orden por precio |
| [producto.html](producto.html) | Detalle de producto (`?id=N`), cantidad y compra por WhatsApp |
| [nosotros.html](nosotros.html) | Historia y propuesta de la marca |
| [contacto.html](contacto.html) | Formulario que abre WhatsApp con el mensaje listo |
| [enlaces.html](enlaces.html) | Hub de enlaces tipo Linktree (redes + acceso a la tienda). Ideal para la **bio de Instagram** |
| [admin.html](admin.html) | **Panel local** de inventario (requiere el backend encendido) |
| [404.html](404.html) | Página de error amigable |

> Antes había dos "portadas" (un Linktree y la tienda). Ahora la **tienda es la portada fija** (`index.html`) y el Linktree quedó como página aparte (`enlaces.html`) para usarlo en redes — así hay una sola tienda principal con URL única.

## Cómo ver el sitio

**Opción A — Con backend (recomendado, sitio + admin + inventario real):**

```bash
cd backend
npm start
```

Abre <http://localhost:3001> — el mismo servidor sirve el sitio, el panel admin y el API. Requiere Node.js 18 o superior ([nodejs.org](https://nodejs.org)). No hay dependencias que instalar.

**Opción B — Solo el sitio estático:** abre `index.html` directamente en el navegador, o usa cualquier servidor estático. Sin backend, la tienda usa el catálogo de respaldo de [js/products.js](js/products.js) y todo lo demás funciona igual (carrito, filtros, WhatsApp).

## Configuración: lo primero que debes cambiar

1. **Número de WhatsApp** — edita `whatsapp` en [js/config.js](js/config.js) (formato internacional sin `+`, ej. `51987654321`). Ese único cambio actualiza **todos** los botones y enlaces de WhatsApp del sitio.
2. **Dominio real** — al publicar, reemplaza `www.milinovjewelry.com` por tu dominio en: [robots.txt](robots.txt), [sitemap.xml](sitemap.xml) y las etiquetas `<link rel="canonical">` / `og:` de cada HTML.
3. **Correo y ciudad** — también en [js/config.js](js/config.js) y en los footers.

## Administrar productos (precios, stock, fotos)

1. Arranca el backend (`cd backend && npm start`).
2. Abre <http://localhost:3001/admin.html>.
3. Crea, edita o elimina joyas; sube fotos (JPG/PNG/WebP, máx. 5 MB) — quedan en `assets/uploads/`.
4. Los cambios se guardan en `backend/data/products.json` y la tienda los muestra al instante (estados: Activo / Borrador / Agotado; los agotados se muestran con insignia y no se pueden agregar al carrito).

### La tienda principal nunca se rompe al subir fotos

El panel **gestiona todo** el inventario, pero la tienda principal está protegida: si el backend está apagado, vacío o falla, la portada cae automáticamente al catálogo fijo de respaldo [js/products.js](js/products.js) y subir una foto solo **agrega** (no toca lo existente). Por eso "subir fotos" nunca deja la tienda en blanco.

**Para publicar sin backend** (hosting estático, lo más común): en el panel pulsa **"Exportar respaldo"** → descarga un `products.js` con todo tu inventario actual → reemplázalo en `js/products.js` y sube ese archivo junto con las fotos. Así la tienda pública queda idéntica a lo que ves en el admin, sin necesitar el backend en línea.

> ⚠️ **No subas `admin.html` ni la carpeta `backend/` a un hosting público**: el panel no tiene contraseña, está diseñado para usarse solo en tu computadora.

## Publicar el sitio (hosting estático)

Sube todo **excepto** `backend/`, `admin.html`, `assets/source-joyas/` y `assets/contact-sheet.jpg` a cualquier hosting estático (Netlify, Vercel, GitHub Pages, cPanel…). No hay paso de build. Detalle completo en [docs/DOCUMENTACION.md](docs/DOCUMENTACION.md).

## Estructura

```
├── index.html              ← portada = TIENDA principal (fija)
├── catalogo.html / producto.html / nosotros.html / contacto.html
├── enlaces.html            ← hub de enlaces (Linktree) para redes
├── admin.html / 404.html
├── css/styles.css          ← estilos (sin frameworks)
├── js/
│   ├── config.js           ← ⚙️ CONFIGURACIÓN (WhatsApp, marca, API)
│   ├── products.js         ← catálogo estático de respaldo
│   ├── cart.js             ← carrito (localStorage) + checkout WhatsApp
│   ├── app.js              ← render, filtros, slider, accesibilidad
│   └── admin.js            ← lógica del panel admin
├── assets/                 ← imágenes (products/, banners/, uploads/)
├── backend/                ← API + servidor local (Node, sin dependencias)
├── robots.txt, sitemap.xml ← SEO (cambiar dominio al publicar)
└── docs/DOCUMENTACION.md   ← documentación técnica completa
```
