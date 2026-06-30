# Arquitectura: escalabilidad, portabilidad y seguridad

Documento de garantías técnicas para Milinov Jewelry. Resume **por qué el proyecto
es escalable, se puede migrar a cualquier lado sin perder datos, y mantiene los
datos protegidos**. Pensado para la dueña y para cualquier desarrollador futuro.

---

## 1. Principio: tus datos son tuyos y portables (sin lock-in)

Nada depende de un proveedor propietario. Todo vive en **formatos y tecnologías estándar**:

| Capa | Tecnología | Portabilidad |
|---|---|---|
| **Sitio (frontend)** | HTML + CSS + JS vanilla, sin build | Corre en **cualquier** hosting estático (Netlify, Vercel, Cloudflare, cPanel…). Copiar/pegar archivos. |
| **Base de datos** | **PostgreSQL** (Supabase ES Postgres estándar) | Se exporta con `pg_dump` y se importa en **cualquier** Postgres: Neon, Railway, RDS, un VPS propio, etc. |
| **Fotos** | Archivos en Supabase Storage (S3 compatible) o en `assets/` | Descargables; se mueven a cualquier almacenamiento (S3, otro CDN, el propio hosting). |
| **Respaldo del catálogo** | `products.json` + `js/products.js` autogenerados | Copia secundaria legible y versionable, independiente de la BD. |

**Conclusión:** migrar = exportar y volver a importar. **No se pierde ni un dato** y el sitio casi no cambia.

## 2. Capa de acceso a datos (adapter) — por qué se puede cambiar de proveedor fácil

El frontend NO está casado con Supabase. Lee el catálogo en este orden (en `js/app.js`):

```
hydrateProductsFromApi()
  1) loadFromSupabase()   ← adaptador delgado de Supabase (1 función)
  2) backend local (API)  ← Node propio
  3) catálogo estático    ← js/products.js (respaldo, nunca queda en blanco)
```

- Cada fuente es **independiente y opcional**. Si mañana cambias Supabase por Neon
  o un backend propio, **solo se reescribe `loadFromSupabase()`** (mapea filas →
  objetos de producto). El resto del sitio no se entera. Eso es el **patrón
  repositorio/adaptador**: la app pide "dame productos", no le importa de dónde vienen.
- Apagar un proveedor degrada con elegancia (cae a la siguiente fuente), no rompe.

## 3. No perder datos: respaldo (backup)

1. **Automático de Supabase:** el plan Free hace backups diarios; los planes de pago,
   point-in-time. (Actívalos/revísalos en *Database → Backups*.)
2. **Export manual periódico** (recomendado mensual y antes de cambios grandes):
   - BD: en Supabase *Database → Backups → Download*, o `pg_dump` →
     `pg_dump "postgresql://...":` genera un `.sql` con TODO.
   - Catálogo: botón **"Exportar respaldo"** del admin → `products.js` (copia legible).
   - Fotos: descargar el bucket de Storage.
3. **Versionado (Git):** el código y `products.json` viven en Git → historial completo,
   se puede volver atrás a cualquier punto.

> Regla: **3-2-1** — 3 copias, en 2 medios, 1 fuera del sitio (ej. la nube + tu PC).

## 4. Migrar a otro lado (playbook, sin romper)

Mover la BD de Supabase a cualquier Postgres (Neon, Railway, RDS, VPS):
1. `pg_dump` del proyecto actual → archivo `.sql`.
2. Crear la BD nueva y `psql < archivo.sql` (o restaurar el dump). Datos intactos.
3. En `js/config.js`, actualizar `supabase.url`/`anonKey` (o, si el proveedor no es
   Supabase, ajustar el adaptador `loadFromSupabase()` al nuevo cliente).
4. Mover las fotos del bucket al nuevo almacenamiento y (si cambia el dominio de las
   URLs) actualizar las rutas con un `UPDATE`.
5. El **sitio estático** se sube igual a cualquier hosting; el dominio se reapunta por DNS.

Cambiar de **hosting del sitio**: es copiar archivos a otro proveedor y reapuntar el
dominio. Cero pérdida.

## 5. Escalabilidad

- **Frontend estático + CDN:** escala "infinito" por diseño (lo sirve una CDN; aguanta
  picos de tráfico sin tocar nada).
- **Postgres:** escala vertical (más recursos) y con índices; soporta catálogos grandes
  y miles de pedidos sin rediseño. Hay **paginación "Ver más"** preparada en el catálogo.
- **Plan Free de Supabase** alcanza para empezar (1 GB datos, ~50k usuarios/mes de Auth,
  backups diarios). Cuando el volumen lo justifique, subir de plan es un clic — **sin
  migrar de tecnología**.
- **Imágenes** en WebP + `loading=lazy` → la tienda sigue rápida aunque crezca el catálogo.

## 6. Seguridad: que los datos no queden expuestos

- **RLS (Row Level Security)** en Postgres (ver `backend/supabase/schema.sql`):
  - El público (anon key) **solo puede LEER** productos `active`. No puede escribir ni
    ver borradores.
  - Cuando se agreguen cuentas/pedidos: cada usuario verá **solo sus propios pedidos**
    (política `user_id = auth.uid()`). Nadie ve datos de otro.
- **Claves:**
  - La **`anon key` es pública** por diseño (va en el navegador); es segura **porque RLS
    la limita**. 
  - La **`service_role` key es secreta**: NUNCA en el frontend ni en Git. Solo en
    variables de entorno / Edge Functions del servidor.
  - Llaves de la pasarela: el **secret** solo en el servidor (Edge Function/webhook),
    nunca en `config.js`.
- **Pagos / tarjetas (PCI):** se usa **pasarela hospedada** (enlace o formulario del
  proveedor) → los datos de tarjeta **nunca pasan por el sitio**, así el alcance PCI es
  mínimo. ⚠️ Nunca poner un formulario de tarjeta propio.
- **Transporte:** **HTTPS** en todo el sitio (SSL gratis del hosting).
- **Cabeceras de seguridad** ya presentes en el backend estático (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`).
- **Anti-XSS:** todo dato se inserta con `esc()`; las imágenes subidas se validan por
  tipo real (magic bytes) en el backend.
- **Datos personales (Ley 29733):** mínimos necesarios, con consentimiento al registrarse,
  derecho ARCO y la política de privacidad publicada. No se guardan tarjetas.
- **Backups cifrados / acceso por contraseña fuerte + 2FA** en las cuentas de Supabase,
  hosting y registrador.

## 7. Checklist al crecer (cuentas + pagos)

- [ ] Tabla `orders`/`order_items` con RLS por `user_id` (cada quien ve lo suyo).
- [ ] Auth de Supabase (correo/Google) para registro e historial.
- [ ] Webhook de la pasarela en una **Edge Function** (la secret key vive ahí, no en el front).
- [ ] Ampliar Términos, Privacidad y consentimiento (registro/checkout).
- [ ] Activar y probar restauración de backups (un backup que no se prueba no existe).
