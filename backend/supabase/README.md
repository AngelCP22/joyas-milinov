# Inventario en línea con Supabase

Esta configuración activa `admin.html` como panel privado. Desde ahí se pueden
crear joyas, subir fotos, editar precios y cambiar stock desde celular o PC. La
tienda recibe los cambios en tiempo real. No requiere VPS.

## Configuración inicial

1. Crea un proyecto en <https://supabase.com>.
2. Abre **SQL Editor**, pega `schema.sql` y ejecútalo.
3. Ejecuta `seed.sql` para cargar el catálogo actual de 18 productos.
4. En **Authentication > Users**, crea la cuenta que usará la dueña.
5. Autoriza esa cuenta desde SQL Editor, cambiando el correo:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'TU_CORREO';
```

6. En **Project Settings > API**, copia la URL del proyecto y la clave pública
   (`publishable` o la antigua `anon`). Pégalas en `js/config.js`:

```js
supabase: {
  url: "https://TU_PROYECTO.supabase.co",
  anonKey: "TU_CLAVE_PUBLICA"
}
```

7. Publica los cambios y abre `admin.html`. Inicia sesión con la cuenta del paso 4.

## Qué queda funcionando

- Fotos comprimidas en el navegador y guardadas en el bucket `productos`.
- Varias imágenes por joya; la primera se usa como portada.
- Alta, edición, duplicado y eliminación de productos.
- Edición rápida de precio y stock desde la tabla.
- Stock `0` marca automáticamente el producto como agotado.
- Estado activo, borrador o agotado.
- Sincronización en tiempo real entre el panel y la tienda abierta.
- Importación CSV y exportación de un respaldo estático.

## Seguridad

`schema.sql` habilita RLS en las tablas expuestas. El público solo puede leer
productos activos o agotados. Solo usuarios incluidos en `admin_users` pueden
ver borradores, editar productos o subir fotos.

La clave pública puede estar en el navegador. Nunca pongas una clave
`service_role` o secreta en `js/config.js`.

Para agregar otra administradora, crea su usuario y repite el `insert` del paso 5.
Para retirar acceso:

```sql
delete from public.admin_users
where user_id = (select id from auth.users where email = 'CORREO_A_RETIRAR');
```
