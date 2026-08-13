-- ============================================================
-- ROLLBACK COMPLETO de las migraciones 20260811120000..20260811120200.
--
-- ⚠️ SOLO es seguro ejecutarlo cuando la base NO tiene datos reales que
-- conservar (proyecto de desarrollo, preview o un despliegue inicial
-- fallido). `drop table public.products` DESTRUYE el inventario.
-- Con datos reales el rollback correcto es una migración correctiva
-- forward (`supabase migration new ...`), nunca este script.
--
-- Este script NO borra el bucket `productos` ni sus archivos: las fotos
-- subidas jamás se destruyen como parte de un rollback (handoff §14).
-- El rollback del frontend es independiente y no requiere Supabase:
-- quitar MILINOV_ADMIN_GATE del build y redesplegar.
-- ============================================================

-- Tiempo real
drop trigger if exists products_avisar_cambio on public.products;
drop function if exists public.avisar_cambio_catalogo();
drop policy if exists "catalogo_aviso_lectura" on realtime.messages;

-- Storage (solo políticas; el bucket y las fotos se conservan)
drop policy if exists "administradoras_listan_fotos" on storage.objects;
drop policy if exists "administradoras_suben_fotos" on storage.objects;
drop policy if exists "administradoras_actualizan_fotos" on storage.objects;
drop policy if exists "administradoras_borran_fotos" on storage.objects;
drop function if exists public.es_ruta_de_foto_valida(text);

-- Inventario
drop trigger if exists products_mantener_fila on public.products;
drop function if exists public.products_mantener_fila();
drop table if exists public.products;
drop table if exists public.admin_users;
drop function if exists public.es_arreglo_de_textos(jsonb);

-- Historial de migraciones del CLI: marcar como revertidas (no ejecuta SQL):
--   supabase migration repair --status reverted 20260811120000
--   supabase migration repair --status reverted 20260811120100
--   supabase migration repair --status reverted 20260811120200
