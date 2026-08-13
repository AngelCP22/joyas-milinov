# Diseño: panel privado de inventario (Fase A)

Fecha: 2026-08-11 · Agente: Claude (Fable 5) · Riesgo: ALTO · Estado producción: DESACTIVADO

## 1. Contrato de tarea

- **Objetivo de negocio**: la propietaria administra catálogo (fotos, precios,
  stock, estados, destacados) desde celular/PC sin editar archivos ni
  redesplegar; la tienda refleja los cambios vía Supabase + Realtime.
- **En alcance**: migraciones versionadas, Auth + RLS, Storage endurecido,
  panel completo, hidratación/tiempo real de la tienda, pruebas automatizadas,
  gate de activación y rollback documentados.
- **Fuera de alcance**: pasarela de pago, reserva de stock en carrito,
  activación de producción (requiere aprobación explícita del usuario).
- **Usuarios/permisos**: anon (lee catálogo público), authenticated no-admin
  (igual que anon + su fila en `admin_users`), admin (CRUD completo + Storage).
- **Dependencias externas**: proyecto Supabase de la clienta (NO existe aún;
  no se crean llaves por cuenta propia — las credenciales las provee la dueña
  del proyecto), Cloudflare Pages preview.
- **Restricciones del entorno de desarrollo**: sin Supabase CLI, Docker ni
  psql en este PC → la evidencia de RLS/constraints se obtiene con Postgres
  embebido (PGlite) en `npm test`; los comandos CLI quedan documentados para
  ejecutarse contra el proyecto real en la activación.
- **Criterios de aceptación**: sección 16 del handoff
  (`HANDOFF-ADMIN-INVENTARIO.md`) + matriz de permisos ejecutada con evidencia.

## 2. Decisiones de diseño (con alternativas)

### D1 — Concurrencia optimista con columna `version`
`products.version integer not null default 1`, incrementada por trigger en
cada UPDATE. El panel envía `.eq('version', esperado)`; 0 filas → conflicto
visible ("otro dispositivo modificó esta joya") y recarga.
*Alternativa rechazada*: comparar `updated_at` — frágil por redondeo de
microsegundos en la serialización JSON ida y vuelta.

### D2 — Regla stock/estado
- `active` exige `stock >= 1` (constraint). El panel pasa a `sold_out`
  automáticamente al llegar a 0 y ofrece reactivar al reponer.
- `sold_out` y `draft` admiten cualquier `stock >= 0` (permite pausar ventas
  manualmente con stock físico).
- La tienda muestra agotado si `status='sold_out' OR stock=0` (`isSoldOut`,
  sin cambios).

### D3 — Coherencia de imágenes
`images` debe ser arreglo JSON de textos (función `check` inmutable).
Publicado (`active`/`sold_out`) exige ≥1 imagen y `image = images->>0`.
Borrador: si hay imágenes, `image` debe ser la portada; si no hay, `image`
vacío. `alt` se genera desde `name` (decisión: sin columna nueva).

### D4 — Campos obligatorios
`sku` siempre obligatorio (no vacío, normalizado con `btrim` por trigger,
único case-insensitive). `gender`, `name`, `category`, `material`, `model`
obligatorios solo al publicar (borradores relajados). `price > 0`,
`old_price NULL o > price`, `stock` entero `>= 0`.

### D5 — Storage con prefijo cerrado
Subidas solo a `productos/products/<uuid>.<webp|jpg|jpeg|png>` (regex en
política). Nombres generados con `crypto.randomUUID()` → no predecibles, sin
rutas arbitrarias. Las fotos publicadas se sirven por URL pública del bucket
(esa lectura no pasa por RLS); **enumerar** el bucket queda solo para admins,
porque de lo contrario un visitante podría descubrir las fotos de las joyas en
borrador pese a sus nombres aleatorios. Escritura solo admins.
`file_size_limit=5MB` y `allowed_mime_types` en el bucket (servidor) +
validación de magic bytes en el cliente (defensa en profundidad, no frontera).
*Alternativa rechazada*: prefijo por `user_id` (código previo) — dificulta la
limpieza y liga las fotos a la cuenta que subió.

### D6 — Sin borrado automático de Storage desde el navegador
El panel sube imágenes, pero no elimina objetos de Storage al cancelar, editar
o borrar productos. Comprobar referencias en Postgres y borrar desde Storage
son operaciones separadas: una carrera entre sesiones podría eliminar una
imagen que acaba de quedar referenciada. Los posibles huérfanos se conservan
hasta implementar un proceso servidor-side auditable con revalidación y un
periodo de gracia.

### D7 — Realtime por Broadcast desde la base (ping sin datos)
Trigger en `products` que envía `realtime.send()` con payload mínimo
`{op}` al topic privado `catalog` — sin datos de fila, así los borradores no
se filtran a visitantes. Los clientes (tienda y panel) reciben el ping y
re-consultan con sus propios permisos RLS.
*Alternativa rechazada*: `postgres_changes` — los UPDATE que vuelven
invisible una fila para `anon` (activo→borrador) no emiten evento para ese
suscriptor y la tienda quedaría desactualizada; además está desaconsejado a
escala. Se retira la publicación `supabase_realtime` sobre `products`.
El trigger degrada con `RAISE WARNING` (no bloquea escrituras si Realtime
falla). Capas de recuperación en la tienda: refetch al volver a pestaña
visible, al evento `online`, al reconectar el canal, y sondeo lento si el
canal queda caído.

### D8 — Claves y configuración pública
Solo URL del proyecto + clave `publishable` (`sb_publishable_…`) en el
cliente; son públicas por diseño. Verificado en docs oficiales (2026-08-11):
los proyectos nuevos desde 2025-11-01 ya no emiten `anon`/`service_role`; la
publishable es reemplazo directo y las tablas nuevas NO se exponen al Data API
sin GRANT explícito (breaking change 2026-05-30). Prohibido `sb_secret_*`,
`service_role`, contraseñas o cadenas de conexión en el repo o `dist` (el
auditor lo verifica en cada build). La configuración se inyecta en
`dist/js/config.js` durante el build desde variables de entorno de Cloudflare
Pages. La revocación de una administradora = borrar su fila en `admin_users`
(corta el acceso a datos al instante porque cada política la consulta) +
cerrar sesiones/ban desde el Dashboard (el JWT emitido vive hasta 1 h).

### D9 — Gate de activación por variable de entorno
`MILINOV_ADMIN_GATE=on` en el build: incluye `admin.html` + `js/admin.js`,
activa `supabase.enabled` e inyecta URL/clave desde `SUPABASE_URL` y
`SUPABASE_PUBLISHABLE_KEY` (build falla si faltan o tienen forma inválida).
Sin la variable (por defecto): build idéntico al actual (panel ausente,
Supabase off). `audit-static.mjs` valida ambos modos y siempre prohíbe
secretos y enlaces públicos al panel.

### D10 — supabase-js servido localmente
Se fija `@supabase/supabase-js@2.110.7` como devDependency y el build copia
el UMD a `js/vendor/supabase.min.js`; `admin.html` y `app.js` dejan de
depender de jsdelivr en runtime (menos superficie de terceros; CSP `self`).

## 3. Matriz de permisos (a probar con evidencia)

| Operación | anon | auth no-admin | admin |
|---|---|---|---|
| SELECT products `active/sold_out` | ✔ | ✔ | ✔ |
| SELECT products `draft` | ✖ | ✖ | ✔ |
| INSERT/UPDATE/DELETE products | ✖ | ✖ | ✔ |
| SELECT `admin_users` propia | ✖ | ✔ (solo su fila) | ✔ (solo su fila) |
| SELECT `admin_users` ajena | ✖ | ✖ | ✖ |
| INSERT/UPDATE/DELETE `admin_users` | ✖ | ✖ | ✖ (solo SQL del dueño del proyecto) |
| Storage INSERT/UPDATE/DELETE en `productos` | ✖ | ✖ | ✔ (solo prefijo `products/…`) |
| Storage SELECT (enumerar el bucket) | ✖ | ✖ | ✔ |
| Leer una foto publicada por su URL pública | ✔ | ✔ | ✔ (no pasa por RLS) |
| Recibir broadcast topic `catalog` | ✔ | ✔ | ✔ (ping sin datos) |

Evidencia: `backend/test/supabase-schema.test.js` (PGlite ejecuta las
migraciones reales + shims de `auth/storage/realtime` y verifica cada celda
con `SET ROLE` + `request.jwt.claims`). En preview se repite la matriz contra
el proyecto real vía API con la publishable key (sección 12 del handoff).

## 4. Migración, respaldo y rollback

- **Migraciones**: `supabase/migrations/<timestamp>_*.sql` (layout CLI
  estándar) + `supabase/seed.sql` (catálogo actual, 18 productos con galería
  coherente). `backend/supabase/schema.sql` queda como referencia histórica y
  se marca como reemplazado.
- **Respaldo**: no existe proyecto en producción todavía; la fuente de verdad
  actual es `js/products.js` / `backend/data/products.json` (en git). Tras la
  activación: exportación desde el panel + `supabase db dump` documentado.
- **Rollback de frontend (sin depender de Supabase)**: quitar
  `MILINOV_ADMIN_GATE` del build y redesplegar → panel ausente y
  `supabase.enabled:false`; la tienda vuelve al catálogo estático.
- **Rollback de base**: los objetos son nuevos (proyecto nuevo); script de
  reversión documentado (drop policies/trigger/tablas) sin tocar Storage.
  No se borran productos ni fotos como parte de un rollback.

## 5. Estados de error definidos (panel)

login inválido · cuenta sin permiso · sesión expirada (onAuthStateChange) ·
recuperación de contraseña (evento PASSWORD_RECOVERY + redirect allowlist) ·
dependencia caída (timeout/fetch fallido con reintento manual) · conflicto de
versión · subida parcial de fotos (por archivo) · CSV inválido (todo-o-nada
con detalle por fila) · doble envío bloqueado · borrado con confirmación
fuerte y alternativa de borrador · canal Realtime caído (reintento con
backoff + sondeo lento de respaldo).

## 6. Rollback de migraciones (patrón oficial)

Supabase CLI no tiene archivos "down": el rollback en hosted es una migración
correctiva forward (`supabase migration new revertir_x`) o, en desarrollo,
`supabase db reset`. `supabase db reset --linked` es DESTRUCTIVO y queda
prohibido contra el proyecto real. Script de reversión completo documentado en
`supabase/rollback/`.
