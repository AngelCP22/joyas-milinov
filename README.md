# Milinov Jewelry — Sitio web de la joyería

Sitio web de **Milinov Jewelry**: joyas delicadas en **Plata 950** y **cobre con enchape de oro 18k**, con envíos a todo el Perú. Catálogo con filtros, carrito de compras y checkout por **WhatsApp** (sin pasarela de pagos: el pedido llega como mensaje listo para coordinar pago y envío).

Hecho con **HTML + CSS + JavaScript vanilla** (sin frameworks ni build). Incluye un **backend local opcional** en Node.js para administrar inventario, precios y stock desde un panel visual.

> Documentación técnica completa en [docs/DOCUMENTACION.md](docs/DOCUMENTACION.md).
> Escalabilidad, portabilidad (sin lock-in) y seguridad en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

---

## Páginas

| Página | Qué es |
|---|---|
| [index.html](index.html) | **Portada**: hero + las **2 secciones Mujer / Hombre**, destacados y testimonios |
| [seccion.html](seccion.html) | Página de sección (`?genero=Mujer\|Hombre`): los **3 materiales** (Plata 950, Oro 18k, Reloj). Plata y Oro despliegan las categorías; Reloj va directo |
| [catalogo.html](catalogo.html) | Catálogo con búsqueda y filtros (**género**/categoría/material/colección) + orden por precio |
| [producto.html](producto.html) | Detalle de producto (`?id=N`), cantidad y compra por WhatsApp |
| [nosotros.html](nosotros.html) | Historia y propuesta de la marca |
| [contacto.html](contacto.html) | Formulario que abre WhatsApp con el mensaje listo |
| [enlaces.html](enlaces.html) | Hub de enlaces tipo Linktree (redes + acceso a la tienda). Ideal para la **bio de Instagram** |
| [terminos.html](terminos.html) | Términos y Condiciones (legal) |
| [privacidad.html](privacidad.html) | Política de Privacidad — Ley 29733 (legal) |
| [reclamaciones.html](reclamaciones.html) | **Libro de Reclamaciones** virtual (Indecopi), con formulario que envía por WhatsApp/correo |
| [admin.html](admin.html) | **Panel local** de inventario (requiere el backend encendido) |
| [404.html](404.html) | Página de error amigable |

> ⚖️ **Antes de vender formalmente en Perú:** completa en las páginas legales tu **razón social** y **RUC** (busca `[RAZÓN SOCIAL]` y `[RUC]`). El Libro de Reclamaciones es exigible a comercios por Indecopi.

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

Todo se edita en [js/config.js](js/config.js):

1. **Número de WhatsApp** (`whatsapp`) — formato internacional sin `+`, ej. `51987654321`. ⚠️ Hoy está el placeholder `51999999999`: **cámbialo o los botones de compra abren un chat a un número falso.** Ese único cambio actualiza todos los botones y enlaces del sitio.
2. **Banner de promo** (`promo.text`) — escribe un texto y aparece la franja superior en todas las páginas (ej. campañas de Día de la Madre, San Valentín, Navidad). Déjalo en `""` para ocultarlo.
3. **Analítica** (`analytics.ga4` / `analytics.metaPixel`) — pega los IDs de Google Analytics 4 y del Píxel de Meta cuando los tengas. Mientras estén vacíos el sitio funciona igual; cuando los pongas, empieza a medir visitas, agregados al carrito y clics a WhatsApp. Detalle en [docs/DOCUMENTACION.md](docs/DOCUMENTACION.md).
4. **Dominio real** — al publicar, reemplaza `www.milinovjoyeria.com` por tu dominio en: [robots.txt](robots.txt), [sitemap.xml](sitemap.xml) y las etiquetas `<link rel="canonical">` / `og:` de cada HTML.
5. **Correo y ciudad** — también en [js/config.js](js/config.js) y en los footers.

## Administrar productos (precios, stock, fotos)

1. Arranca el backend (`cd backend && npm start`).
2. Abre <http://localhost:3001/admin.html>.
3. Crea, edita o elimina joyas. Sube **varias fotos por pieza** (arrastra y suelta o elige; se **comprimen solas** en el navegador, así las fotos pesadas del celular ya no son problema). La primera foto es la portada; puedes marcar otra como portada o quitarlas.
4. Atajos para llenar rápido: **Duplicar** una joya parecida, editar **precio y stock directo en la tabla**, e **Importar CSV** para cargar muchas de golpe (usa el botón "Plantilla CSV" para el formato). Campos extra opcionales: precio en oferta, etiqueta (Nuevo / Más vendido), medida, cuidados y "destacado".
5. Los cambios se guardan en `backend/data/products.json` y la tienda los muestra al instante (estados: Activo / Borrador / Agotado; los agotados se muestran con insignia y no se pueden agregar al carrito).

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
