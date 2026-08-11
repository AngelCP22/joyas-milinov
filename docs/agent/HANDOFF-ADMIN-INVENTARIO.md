# Handoff: panel privado de inventario Milinov

Fecha: 2026-08-11  
Repositorio: `AngelCP22/joyas-milinov`  
Riesgo: **ALTO** (autenticación, autorización, inventario, precios y archivos)  
Estado inicial: **DESACTIVADO EN PRODUCCIÓN**

## 1. Instrucción principal para el siguiente agente

Construye y deja listo el panel privado que permitirá a la propietaria de
Milinov administrar el catálogo sin editar archivos ni volver a desplegar la
tienda. Desde el panel debe poder subir fotografías, crear y editar joyas,
cambiar precio, precio anterior, stock, estado, categoría, material, modelo y
destacados. Los cambios aprobados deben aparecer en la tienda pública y en las
fichas de producto, incluido el stock, mediante Supabase y Realtime.

No publiques ni actives el panel durante el desarrollo. La activación final es
un paso separado y solo puede ejecutarse cuando todas las pruebas de seguridad,
integridad y producción de esta guía estén aprobadas y el usuario lo confirme.

## 2. Situación actual que debes preservar

- La tienda está desplegada en Cloudflare Pages:
  `https://www.milinovjoyeria.com/`.
- El código existente del panel está en `admin.html` y `js/admin.js`.
- El esquema inicial está en `backend/supabase/schema.sql` y el catálogo inicial
  en `backend/supabase/seed.sql`.
- La tienda ya tiene lectura opcional desde Supabase y suscripción Realtime en
  `js/app.js`.
- `js/config.js` contiene `supabase.enabled: false`, URL vacía y clave vacía.
- `scripts/build-static.mjs` excluye `admin.html` y `js/admin.js` de `dist`.
- `scripts/audit-static.mjs` falla si esos archivos se publican o si Supabase se
  activa antes de levantar deliberadamente el bloqueo.
- En producción deben seguir respondiendo `404` mientras se desarrolla:
  `/admin`, `/admin.html`, `/js/admin.js`, `/backend/*`.
- No existe un enlace público al panel y no debe agregarse a navegación, footer,
  sitemap, `robots.txt`, `llms.txt` ni metadatos.
- El repositorio puede contener trabajo de otros agentes. Revisa `git status`,
  `docs/agent/STATUS.md`, `MESSAGES.md`, `HANDOFF.md` y el historial antes de
  modificar archivos. No reviertas cambios ajenos.

## 3. Objetivo de negocio

La propietaria debe poder administrar desde celular o PC:

1. Crear una joya con una o varias fotos.
2. Elegir la foto de portada y ordenar/quitar fotos.
3. Editar nombre, SKU, género, material, categoría, colección y modelo.
4. Editar precio, precio anterior y stock.
5. Marcar una joya como activa, agotada o borrador.
6. Destacar o retirar una joya de la portada.
7. Buscar y filtrar el inventario.
8. Ver alertas de stock bajo y agotado.
9. Duplicar una joya sin duplicar el SKU.
10. Ver en la tienda los cambios sin republicar el sitio.

La organización mínima esperada es:

- **Plata 950:** Collares, Pulseras, Anillos, Dijes y Aretes.
- **Cobre + enchape oro 18k:** Collares, Anillos, Pulseras, Dijes y Aretes.
- Mantener la compatibilidad con género Mujer/Hombre, colecciones y relojes si
  siguen presentes en el catálogo actual.

No implementar pasarela de pago en esta tarea.

## 4. Usuarios y permisos

### Visitante no autenticado

- Puede leer únicamente productos públicos (`active` y `sold_out`).
- No puede leer borradores ni la lista de administradores.
- No puede insertar, actualizar ni eliminar productos.
- Puede descargar imágenes públicas del bucket de productos.
- No puede subir, reemplazar ni borrar imágenes.

### Usuario autenticado no autorizado

- No obtiene permisos administrativos solo por iniciar sesión.
- No puede leer borradores, modificar productos ni escribir en Storage.
- No puede agregarse a sí mismo a `admin_users`.

### Administradora autorizada

- Su `auth.uid()` debe existir en `public.admin_users`.
- Puede leer todos los productos y ejecutar CRUD autorizado.
- Puede subir, actualizar y borrar archivos únicamente en el bucket y prefijo
  asignados a productos.
- No recibe ni utiliza una clave secreta o `service_role` en el navegador.

## 5. Arquitectura recomendada

- **Frontend público y panel:** Cloudflare Pages.
- **Autenticación:** Supabase Auth con correo y contraseña.
- **Datos:** Supabase Postgres mediante Data API.
- **Fotos:** Supabase Storage, bucket `productos`.
- **Actualización inmediata:** Supabase Realtime sobre `public.products`.
- **Autorización real:** grants mínimos + RLS; ocultar la URL no es seguridad.
- **Configuración pública:** URL del proyecto y clave `publishable`. Son visibles
  por diseño, pero no deben confundirse con secretos.
- **Secretos:** ninguna clave `sb_secret_*`, `service_role`, contraseña, token o
  conexión Postgres puede aparecer en HTML, JavaScript público, commits o logs.

El proyecto Supabase debe ser propiedad de la clienta. Preferir variables de
entorno de Cloudflare para generar la configuración pública durante el build,
documentando que URL y publishable key seguirán siendo visibles en el browser.

## 6. Fase A: auditoría y diseño antes de programar

1. Carga las skills `senior-engineering-gate`, `supabase` y
   `supabase-postgres-best-practices`.
2. Consulta el changelog y documentación oficial vigente de Supabase. No uses
   firmas o recomendaciones recordadas sin verificar.
3. Inspecciona `admin.html`, `js/admin.js`, `js/app.js`, `js/config.js`,
   `backend/supabase/*`, `scripts/build-static.mjs` y
   `scripts/audit-static.mjs`.
4. Revisa la lista real de productos y normaliza taxonomías antes de imponer
   constraints.
5. Registra en `docs/agent/STATUS.md` los archivos que tomarás y el estado
   `WORKING`.
6. Define migración, rollback, respaldo, estados de error y matriz de permisos.

No quites los bloqueos de publicación en esta fase.

## 7. Fase B: base de datos y migraciones

No ejecutes `schema.sql` a ciegas en producción. Conviértelo en migraciones
versionadas y revisables con Supabase CLI. Descubre comandos con `--help`.

La base final debe cubrir como mínimo:

- `products.id`: identidad primaria.
- `products.sku`: obligatorio, normalizado y único sin distinguir mayúsculas.
- `gender`, `name`, `category`, `material`, `model`: obligatorios cuando el
  producto vaya a publicarse.
- `price > 0`.
- `old_price IS NULL OR old_price > price`.
- `stock` entero y `stock >= 0`.
- Estados permitidos: `active`, `draft`, `sold_out`.
- `active` debe ser coherente con stock disponible; `stock = 0` debe mostrarse
  como agotado. Decide y documenta la regla exacta también para borradores.
- `images` debe ser un arreglo JSON y `image` debe coincidir con la portada.
- Un producto público debe tener al menos una imagen válida.
- `created_at` y `updated_at`; agrega trigger real para actualizar
  `updated_at`, porque el SQL actual solo define el valor inicial.
- Índices para SKU, estado, categoría/material/género y consultas de destacados.
- `admin_users.user_id` referenciado a `auth.users`.

Evalúa control de concurrencia. Como mínimo evita que dos pestañas sobrescriban
silenciosamente precio o stock antiguo: usa `updated_at` o una columna `version`
en la condición de actualización y muestra conflicto al usuario.

Antes de cualquier migración real:

1. Exporta respaldo de esquema y datos.
2. Prueba migración y rollback en un proyecto de desarrollo.
3. Ejecuta advisors de seguridad y rendimiento.
4. Corrige P0/P1 antes de seguir.

## 8. Fase C: Auth, grants y RLS

Revisa y prueba cada permiso de manera independiente. No aceptes una prueba
visual del login como evidencia de autorización.

Reglas obligatorias:

- RLS activa en todas las tablas expuestas.
- Grants mínimos para `anon` y `authenticated`.
- Políticas de `SELECT`, `INSERT`, `UPDATE` y `DELETE` separadas.
- `UPDATE` debe tener `USING` y `WITH CHECK`, además de política `SELECT`.
- La condición administrativa debe comprobar `auth.uid()` contra
  `public.admin_users`.
- No autorizar mediante `user_metadata`.
- No usar solamente `TO authenticated`: autenticación no equivale a permiso.
- No usar `SECURITY DEFINER` como atajo. Si fuera imprescindible, justificarlo,
  ubicarlo fuera de esquemas expuestos, revocar `EXECUTE` a `PUBLIC` y probarlo.
- Desactivar registro público si solo la propietaria tendrá acceso, o definir un
  proceso de invitación controlado.
- Configurar recuperación de contraseña y URLs de redirección exclusivamente
  para los dominios permitidos.
- Definir cómo revocar sesiones al retirar una administradora.

Matriz mínima de pruebas SQL/API:

| Operación | anon | autenticado no admin | admin |
|---|---:|---:|---:|
| Leer activo/agotado | Sí | Sí | Sí |
| Leer borrador | No | No | Sí |
| Crear producto | No | No | Sí |
| Cambiar precio/stock | No | No | Sí |
| Eliminar producto | No | No | Sí |
| Leer `admin_users` ajeno | No | No | No |
| Subir/reemplazar/borrar foto | No | No | Sí |

## 9. Fase D: fotografías y Storage

Completa y endurece la lógica existente de `compressImage`, `uploadImage` y
`handleFiles`.

Requisitos:

- Formatos permitidos: JPEG, PNG y WebP. No permitir SVG en uploads.
- Validar tipo declarado y contenido real; la validación del navegador no es
  una frontera de seguridad.
- Límite actual sugerido: 5 MB por archivo antes de procesar.
- Comprimir/redimensionar en navegador conservando buena calidad de joyería.
  No ampliar imágenes pequeñas.
- Generar nombres no predecibles y seguros; no aceptar rutas arbitrarias.
- Guardar bajo un prefijo controlado, por ejemplo `products/<uuid>/...`.
- Mostrar progreso, éxito parcial y errores por archivo.
- Permitir varias fotos, portada, reordenamiento y eliminación.
- Exigir `alt` o generar uno razonable desde el nombre/modelo del producto.
- No guardar base64 en Postgres ni en el HTML público.
- Evitar archivos huérfanos: si el usuario cancela o falla el guardado, limpiar
  uploads temporales; al reemplazar/eliminar producto, retirar archivos que ya
  no estén referenciados mediante una operación segura y auditable.
- No borrar una imagen compartida por otro producto sin comprobar referencias.

Las políticas de Storage deben probar lectura pública y escritura exclusiva de
administradores para `bucket_id = 'productos'` y el prefijo autorizado. Para
upsert se requieren permisos de `INSERT`, `SELECT` y `UPDATE`.

## 10. Fase E: panel administrativo

Reutiliza el diseño existente; no lo reemplaces sin causa. Debe ser responsive,
utilizable desde celular y consistente con Milinov.

Completa o verifica:

- Pantalla de login, carga, acceso denegado, sesión expirada y dependencia caída.
- Cerrar sesión y retirar canales Realtime.
- Formulario con validación antes de subir/guardar.
- Alta, edición, borrador, publicación, duplicado y eliminación confirmada.
- Edición rápida de precio y stock con estado de guardando/guardado/error.
- Evitar doble envío y operaciones duplicadas.
- Revertir visualmente una edición fallida; nunca mostrar éxito antes de respuesta.
- Conflicto de actualización visible si otra sesión cambió el mismo producto.
- Resumen de total, activos, stock bajo y agotados.
- Búsqueda y filtros por material, categoría, estado, género y colección.
- Importación CSV validada fila por fila, sin escrituras parciales silenciosas.
- Exportación de respaldo sin exponer datos de autenticación.
- Confirmación fuerte para borrar; preferir borrador/archivado cuando preservar
  historial sea más seguro.
- Accesibilidad: labels, teclado, foco, `aria-live`, contraste y objetivos táctiles.
- No registrar contraseñas, tokens, URLs firmadas privadas ni payloads sensibles.

No almacenar stock solo en `localStorage`; Supabase debe ser la fuente de verdad.

## 11. Fase F: tienda pública y tiempo real

La tienda debe continuar mostrando el catálogo estático inmediatamente y luego
hidratar desde Supabase cuando la integración esté activa.

Verifica que INSERT/UPDATE/DELETE o el mecanismo elegido actualice:

- Portada y slider de destacados.
- Catálogo, filtros y contador.
- Secciones por género/material/categoría.
- Ficha de producto, galería, precio anterior y badges.
- Botón de agregar/comprar y estado agotado.
- Carrito: limitar cantidades al stock, retirar productos eliminados/inactivos y
  recalcular total sin dejar precios antiguos.
- JSON-LD y metadatos dinámicos de producto.

Realtime no reemplaza una lectura de recuperación. Al volver a una pestaña
visible o tras reconectar, vuelve a consultar el catálogo. Maneja canal caído,
timeout y respuesta vacía sin sustituir el catálogo por datos corruptos.

Define semántica de stock: el carrito no reserva unidades. Hasta tener checkout
y webhook, el pedido por WhatsApp debe aclarar que la disponibilidad se confirma
manualmente. No prometas una reserva inexistente.

## 12. Pruebas obligatorias

### Automatizadas

- Unitarias para normalización y validación de producto.
- Unitarias para rutas/nombres/tipos/tamaños de imagen.
- Integración Supabase para permisos anon, no-admin y admin.
- Integración CRUD y actualización de precio/stock.
- Integración Storage: subida, reemplazo, eliminación y denegaciones.
- Integración Realtime o prueba observable equivalente.
- Regresión del build: mientras no haya activación, panel ausente y Supabase
  deshabilitado; durante activación controlada, artefactos presentes solo cuando
  el gate explícito esté habilitado.
- `npm run verify` sin fallos.

### Manuales/E2E

1. Login correcto, incorrecto, usuario no autorizado y sesión expirada.
2. Crear producto con 1 y varias fotos desde PC y móvil.
3. Cambiar portada, ordenar y quitar fotos.
4. Precio inválido, `old_price <= price`, SKU duplicado, stock negativo/decimal.
5. Producto activo, borrador, agotado y reactivado.
6. Dos sesiones editando el mismo producto.
7. Supabase/Storage/Realtime fuera de servicio o con latencia.
8. Cambio de precio y stock visible en otra pestaña de la tienda.
9. Carrito abierto cuando cambia precio, stock o estado.
10. Intentos directos con publishable key para escribir sin autorización.
11. Archivos incorrectos, demasiado grandes y con extensión falsa.
12. Navegación, formularios y tablas en 390 px, tablet y escritorio.

Ejecuta advisors de Supabase después de las políticas y corrige todas las alertas
de seguridad relevantes. Registra comandos y resultados sin copiar secretos.

## 13. Gate de activación y despliegue

No actives nada hasta tener P0 = 0 y P1 = 0 y aprobación explícita del usuario.

La activación final debe ser un commit pequeño y revisable que:

1. Configure de forma operativa la URL y publishable key sin agregar secretos.
2. Cambie `supabase.enabled` a `true` mediante configuración de producción.
3. Agregue `admin.html` a `rootFiles` en `scripts/build-static.mjs`.
4. Permita copiar `js/admin.js` únicamente bajo el gate aprobado.
5. Actualice `scripts/audit-static.mjs` para distinguir build desactivado y build
   activado, conservando las verificaciones de artefactos internos.
6. Mantenga `backend/`, SQL, docs y fuentes fuera de `dist`.
7. No agregue enlaces al panel en la tienda pública, sitemap o robots.
8. Construya y despliegue primero en preview, nunca directamente a producción.
9. Ejecute toda la matriz de seguridad en preview.
10. Requiera confirmación del usuario antes del despliegue productivo.

Después del despliegue verifica HTTP y contenido:

- Tienda y catálogo: `200`.
- Ruta privada elegida: muestra login, no inventario, sin sesión.
- `/js/admin.js`: puede existir solo si el panel ya fue aprobado.
- `/backend/*`, `/docs/*`, SQL y archivos fuente: `404`.
- Usuario no-admin: acceso denegado incluso llamando la API directamente.
- Admin: CRUD, fotos, precio, stock y Realtime funcionan.

Ocultar o renombrar la ruta es defensa secundaria, no autorización.

## 14. Rollback

Prepara rollback antes de activar:

1. Desactivar el flag de Supabase en el frontend.
2. Excluir nuevamente `admin.html` y `js/admin.js` del build.
3. Mantener catálogo estático funcional.
4. Retirar canales Realtime si causan fallos.
5. Revertir migración solo si es segura; no destruir productos ni imágenes.
6. Conservar respaldo exportado y procedimiento de restauración probado.

El rollback de frontend debe poder hacerse sin depender de que Supabase funcione.

## 15. Entregables finales del siguiente agente

- Migraciones versionadas y rollback documentado.
- Panel responsive completo.
- Integración Auth, Database, Storage y Realtime.
- Tests automatizados y evidencia E2E.
- Matriz de permisos ejecutada.
- Advisors sin P0/P1.
- README y documentación operativa actualizados.
- `docs/agent/CHANGELOG.md`, `STATUS.md`, `HANDOFF.md`, `TECH_DEBT.md` y
  `LESSONS.md` actualizados cuando corresponda.
- Preview desplegado y validado.
- Informe final con pruebas exactas, riesgos residuales y verdict.
- Producción todavía desactivada salvo confirmación explícita del usuario.

## 16. Definición de terminado

La tarea está terminada solo si una administradora autorizada puede crear una
joya, subir fotos, modificar precio y stock, y ver el cambio correcto en otra
pestaña de la tienda; al mismo tiempo, un visitante y un usuario autenticado no
autorizado no pueden modificar ningún dato ni archivo usando la interfaz o la
API directa. No debe existir ninguna clave secreta en el cliente y debe haber
rollback probado. Sin esa evidencia, el panel permanece fuera de producción.
