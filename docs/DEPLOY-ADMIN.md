# Activación del panel privado de inventario

Procedimiento completo para encender el panel en producción. **Hoy el panel
está DESACTIVADO**: `/admin`, `/admin.html` y `/js/admin.js` responden 404 y
`supabase.enabled` es `false`. Nada de esta guía se ejecuta sin la aprobación
explícita de la propietaria (gate del handoff §13: P0 = 0, P1 = 0 y
confirmación del usuario).

## Resumen del mecanismo

El build tiene un gate por variable de entorno (`scripts/build-static.mjs`):

| Modo | Variables | Resultado |
|---|---|---|
| Desactivado (hoy) | *(ninguna)* | Panel ausente de `dist/`, Supabase apagado |
| Gate aprobado | `MILINOV_ADMIN_GATE=on` + `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` | Panel publicado y configuración inyectada en `dist/js/config.js` |

El build **falla** si el gate está activo con variables ausentes o inválidas
(URL que no sea `https://<proyecto>.supabase.co`, clave que no sea
`sb_publishable_…`). `scripts/audit-static.mjs` audita el resultado en ambos
modos y siempre bloquea secretos (claves `sb_secret`, JWT, cadenas de
conexión) y enlaces públicos al panel. Evidencia automatizada:
`backend/test/build-gate.test.js`.

## Paso 0 — Prerrequisitos (una sola vez)

1. La clienta crea el proyecto Supabase (ella es la propietaria de la cuenta).
2. Aplicar migraciones y seed: ver [`supabase/README.md`](../supabase/README.md)
   (`npx supabase link` + `npx supabase db push --include-seed`).
3. Pasos manuales del Dashboard (mismo README): desactivar registro público y
   anonymous sign-ins, crear la cuenta de la dueña, insertarla en
   `admin_users`, configurar Site URL + Redirect URL
   (`https://www.milinovjoyeria.com/admin`), copiar URL + clave publishable.
4. Ejecutar los **Advisors** (Database → Advisors) y corregir cualquier alerta
   de seguridad. Aceptada y documentada: `0006_multiple_permissive_policies`
   (dos políticas SELECT deliberadas en `products`).

## Paso 1 — Preview (nunca directo a producción)

1. En Cloudflare Pages crear un **preview** (rama `admin-preview` o deploy
   manual) con las tres variables de entorno del gate configuradas SOLO para
   preview.
2. `npm run verify` local con el gate:

   ```bash
   MILINOV_ADMIN_GATE=on SUPABASE_URL=https://PROYECTO.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_XXX npm run verify
   ```

3. Desplegar el preview y ejecutar la **matriz de seguridad** (paso 2).

## Paso 2 — Matriz de seguridad en preview (obligatoria)

La matriz SQL ya corre en local (`npm test` → `supabase-schema.test.js`, 27
pruebas sobre las migraciones reales). En preview se repite contra el proyecto
real vía API (con `curl` o la consola del navegador, usando SOLO la clave
publishable):

| Prueba | Esperado |
|---|---|
| `GET /rest/v1/products?select=*` sin sesión | Solo `active`/`sold_out`; ningún `draft` |
| `POST /rest/v1/products` sin sesión | 401/403 |
| `PATCH /rest/v1/products?id=eq.1` sin sesión | 401/403 o 0 filas |
| Login con cuenta NO autorizada → panel | "Esta cuenta no tiene permiso" y sesión cerrada |
| Con el JWT de la cuenta no autorizada: `POST /rest/v1/products` | Violación RLS |
| `GET /rest/v1/admin_users` con JWT no autorizado | 0 filas |
| Subir archivo al bucket sin sesión / con cuenta no admin | Rechazado |
| `storage.from('productos').list()` sin sesión o con cuenta no admin | Vacío/denegado (no se puede enumerar el bucket) |
| Abrir la URL pública de una foto publicada sin sesión | 200 (lectura pública por diseño) |
| Subir un `.svg` o >5 MB como admin | Rechazado (bucket) |
| Login admin → crear joya con 2 fotos (celular y PC) | OK; visible en la tienda preview |
| Cambiar precio/stock desde el panel | Se refleja en otra pestaña de la tienda (Realtime o sondeo) |
| Dos pestañas del panel editando la misma joya | La segunda recibe el aviso de conflicto |
| **Anon recibe el broadcast** (tienda abierta sin sesión, cambiar stock como admin) | La tienda se actualiza sin recargar. Si el canal privado no autoriza a `anon` (caso no documentado por Supabase, ver TECH_DEBT TD-003), la tienda igual se actualiza por sondeo/visibilidad — verificar y registrar cuál de los dos ocurrió |
| `/backend/*`, `/docs/*`, `/supabase/*` en preview | 404 |
| `view-source` de `js/config.js` en preview | Solo URL + `sb_publishable_…` |

Registrar comandos y resultados en `docs/agent/CHANGELOG.md` (sin copiar
claves).

## Paso 3 — Producción (solo con confirmación de la propietaria)

1. Configurar las tres variables en el entorno de **producción** de Pages.
2. Redesplegar `main` (o fusionar el commit de activación, que debe ser
   pequeño y revisable).
3. Verificación post-despliegue:
   - Tienda y catálogo: `200`, catálogo visible.
   - `/admin`: muestra el login, nunca inventario sin sesión.
   - `/backend/*`, `/docs/*`, `/supabase/*`, SQL y fuentes: `404`.
   - Login admin: CRUD + fotos + precio/stock + tiempo real funcionando.
   - Cuenta no autorizada: acceso denegado también por API directa.
4. Repetir los Advisors de Supabase tras el primer uso real.

## Rollback (probado, sin depender de Supabase)

1. **Frontend** (siempre seguro): quitar `MILINOV_ADMIN_GATE` (o ponerla en
   `off`) en Pages y redesplegar. El panel desaparece de `dist/`,
   `supabase.enabled` vuelve a `false` y la tienda sirve el catálogo estático
   de `js/products.js`. No requiere que Supabase esté disponible.
2. **Realtime**: si solo falla el canal, no hace falta rollback: la tienda ya
   degrada a sondeo lento + refetch por visibilidad/reconexión.
3. **Base de datos**: las migraciones son forward-only. Con datos reales,
   corregir con una nueva migración; el script
   `supabase/rollback/20260811_revertir_inventario.sql` SOLO se usa sin datos
   reales (leer su advertencia). Jamás borra el bucket ni las fotos.
4. **Respaldo**: exportar desde el panel ("Exportar respaldo" → `products.js`)
   y/o `npx supabase db dump` antes de cualquier cambio de esquema posterior.

## Qué está prohibido siempre

- Poner claves `sb_secret_…`, `service_role`, contraseñas o cadenas de
  conexión en el repo, en `dist/` o en variables del frontend.
- Enlazar el panel desde la tienda, el sitemap, robots.txt o llms.txt.
- `supabase db reset --linked` contra el proyecto real.
- Activar producción sin la matriz de preview completa y la confirmación
  explícita de la propietaria.
