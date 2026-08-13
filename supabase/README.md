# Base de datos del inventario (Supabase)

Migraciones versionadas del panel privado de inventario. Reemplazan al antiguo
`backend/supabase/schema.sql` (que queda solo como referencia histórica).

## Contenido

| Archivo | Qué hace |
|---|---|
| `migrations/20260811120000_inventario_inicial.sql` | Tablas `products` y `admin_users`, constraints, trigger `updated_at`/`version`, índices, grants mínimos y RLS |
| `migrations/20260811120100_storage_productos.sql` | Bucket `productos` (público, 5 MB, JPEG/PNG/WebP) y políticas de escritura solo-admin bajo `products/<uuid>.<ext>` |
| `migrations/20260811120200_realtime_catalogo.sql` | Aviso de cambios por Broadcast (topic privado `catalog`, ping sin datos) |
| `seed.sql` | Catálogo real (generado: `node scripts/generate-seed.mjs`) |
| `rollback/20260811_revertir_inventario.sql` | Reversión completa — SOLO sin datos reales (leer advertencia interna) |

## Cómo aplicar en el proyecto de la clienta

El CLI no está instalado en este repo (binario pesado); instalarlo con
`scoop install supabase` o usar `npx supabase` (descarga al vuelo, Node 20+).

```bash
npx supabase login
npx supabase link --project-ref <REF_DEL_PROYECTO>
npx supabase db push --include-seed
```

`db push` corre contra el proyecto hosted sin Docker. Las migraciones son
forward-only: para deshacer un cambio con datos reales se escribe una nueva
migración correctiva, nunca `supabase db reset --linked` (destructivo,
prohibido contra el proyecto real).

## Pasos manuales en el Dashboard (una sola vez)

1. **Authentication → Sign In / Up**: desactivar "Allow new users to sign up"
   y "Allow anonymous sign-ins" (solo la dueña tendrá cuenta, creada a mano).
2. **Authentication → Users**: crear la cuenta de la administradora.
3. **SQL Editor**: autorizarla (reemplazar el correo):
   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'CORREO_DE_LA_DUEÑA';
   ```
4. **Authentication → URL Configuration**: Site URL
   `https://www.milinovjoyeria.com` y agregar a Redirect URLs
   `https://www.milinovjoyeria.com/admin` (recuperación de contraseña).
5. **Project Settings → API Keys**: copiar la URL del proyecto y la clave
   `sb_publishable_…` para las variables de entorno del build (ver
   `docs/DEPLOY-ADMIN.md`). Jamás copiar una clave `sb_secret_…`.
6. **Advisors (Database → Security/Performance Advisor)**: ejecutar y revisar.
   Alerta esperada y aceptada: `0006_multiple_permissive_policies` (WARN) por
   las dos políticas SELECT de `products` (ver comentario en la migración 1).

## Retirar una administradora

```sql
delete from public.admin_users
where user_id = (select id from auth.users where email = 'CORREO_A_RETIRAR');
```

Esto corta el acceso a datos al instante (cada política consulta la tabla).
El token ya emitido puede vivir hasta 1 h: para corte total, además usar
Dashboard → Authentication → Users → "Sign out user" (o ban).

## Evidencia local

`npm test` aplica estas migraciones reales sobre Postgres embebido (PGlite)
y ejecuta la matriz de permisos completa (anon / autenticado no-admin /
admin) más las constraints y triggers: `backend/test/supabase-schema.test.js`.
