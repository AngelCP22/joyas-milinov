-- ============================================================
-- Migración 2/3 — Storage: bucket público `productos` con escritura
-- exclusiva de administradoras bajo un prefijo cerrado.
-- Diseño: docs/agent/DESIGN-ADMIN-INVENTARIO.md (D5, D6).
--
-- Límite de 5 MB y tipos MIME permitidos se aplican del lado servidor por la
-- configuración del bucket (verificado en docs oficiales 2026-08-11); la
-- validación del navegador es solo comodidad, no frontera de seguridad.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Solo se aceptan rutas generadas por el panel: products/<uuid>.<ext>.
-- Nombres no predecibles, sin rutas arbitrarias ni traversal (D5).
create or replace function public.es_ruta_de_foto_valida(name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select name ~ '^products/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpe?g|png)$'
$$;

-- Las fotos del catálogo se sirven por URL pública del bucket, y esa lectura
-- NO pasa por RLS. Por eso esta política de SELECT (que gobierna listar y
-- consultar objetos vía API) se limita a las administradoras: si se abriera a
-- `anon`, cualquiera podría ENUMERAR el bucket y descubrir las fotos de las
-- joyas todavía en borrador, cuyos nombres son aleatorios justamente para que
-- no se puedan adivinar.
create policy "administradoras_listan_fotos" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'productos'
    and exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid())
    )
  );

create policy "administradoras_suben_fotos" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'productos'
    and public.es_ruta_de_foto_valida(name)
    and exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid())
    )
  );

create policy "administradoras_actualizan_fotos" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'productos'
    and exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'productos'
    and public.es_ruta_de_foto_valida(name)
    and exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid())
    )
  );

create policy "administradoras_borran_fotos" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'productos'
    and exists (
      select 1 from public.admin_users a where a.user_id = (select auth.uid())
    )
  );
