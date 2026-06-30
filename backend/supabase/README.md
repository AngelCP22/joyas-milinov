# Base de datos en línea con Supabase (opcional)

Con esto la tienda lee el catálogo **en vivo** desde Supabase y puedes **editar
productos desde cualquier lugar** (sin volver a subir el sitio). Es opcional: si no
configuras nada, la tienda sigue usando el catálogo local/estático como hasta ahora.

## Pasos (una sola vez, ~10 minutos)

1. **Crea un proyecto** gratis en <https://supabase.com> (plan Free).
2. En el panel: **SQL Editor → New query**, pega el contenido de
   [`schema.sql`](schema.sql) y pulsa **Run**. Crea la tabla `products` con sus
   reglas de seguridad (RLS).
3. Repite con [`seed.sql`](seed.sql) para cargar los 12 productos de ejemplo
   (luego los reemplazas por los reales).
4. Ve a **Project Settings → API** y copia:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **Project API keys → `anon` `public`** (la clave pública; **NO** la `service_role`).
5. Pégalas en [`../../js/config.js`](../../js/config.js), en `supabase`:
   ```js
   supabase: {
     url: "https://xxxx.supabase.co",
     anonKey: "eyJ...la-anon-key..."
   }
   ```
6. Listo. Abre la tienda: ahora el catálogo viene de Supabase.

## Cómo administrar productos

Desde Supabase: **Table Editor → products**. Agregas/editas filas (nombre, precio,
género, material, categoría, foto, etc.) y la tienda lo refleja al instante. No
necesitas tocar código ni republicar.

- `gender` debe ser exactamente **Hombre** o **Mujer**.
- `material`: **Plata 950**, **Cobre + enchape oro 18k** o **Reloj**.
- `status`: **active** (visible), **draft** (oculto) o **sold_out** (agotado).
- `images` es un arreglo JSON, p. ej. `["https://...supabase.co/.../foto1.jpg","https://...foto2.jpg"]`
  (o rutas locales `["assets/products/x.jpg"]` si no usas Storage).

## Fotos con Supabase Storage (subir/cambiar fotos sin republicar)

Para poner fotos desde el navegador (sin tocar el sitio):

1. En Supabase: **Storage → New bucket** → nombre `productos` → marca **Public bucket** → crear.
2. Entra al bucket y **arrastra tus fotos** (súbelas optimizadas, ~<300 KB; idealmente cuadradas).
3. En cada foto: **⋯ → Copy URL** (será algo como
   `https://TUPROYECTO.supabase.co/storage/v1/object/public/productos/foto.jpg`).
4. Pega esa URL en el campo **`image`** del producto (Table Editor), y en **`images`**
   si quieres varias: `["https://...foto1.jpg","https://...foto2.jpg"]`.
5. La tienda ya acepta esas URLs (la primera de `images` es la portada). Listo, sin republicar.

> Para quitar/cambiar una foto, reemplázala en Storage o pega otra URL en el producto.
> El bucket debe ser **público** para que la URL funcione directo (sin token).

## Seguridad

- La `anon key` es **pública por diseño** y puede ir en el navegador: las políticas
  **RLS** (en `schema.sql`) solo permiten **leer** productos `active`. Para **escribir**
  hay que estar **autenticado** (tú, desde el panel de Supabase).
- **Nunca** pongas la `service_role` key en `config.js` ni en el frontend.

## Relación con el panel admin local

El panel `admin.html` (backend Node) sigue funcionando para uso local. Si usas
Supabase como fuente en línea, lo natural es administrar desde el **Table Editor de
Supabase**. (Conectar `admin.html` directamente a Supabase con login es un paso
futuro opcional.)
