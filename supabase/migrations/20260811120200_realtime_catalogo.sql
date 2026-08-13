-- ============================================================
-- Migración 3/3 — Tiempo real por Broadcast con "ping" sin datos.
-- Diseño y por qué NO postgres_changes: docs/agent/DESIGN-ADMIN-INVENTARIO.md (D7).
--
-- Resumen: postgres_changes no filtra los DELETE por RLS (todo suscriptor
-- recibe la PK borrada) y descarta los UPDATE que vuelven invisible una fila
-- (activo→borrador nunca llegaría a la tienda). En su lugar, un trigger envía
-- un aviso mínimo {op} al topic privado 'catalog'; cada cliente re-consulta
-- el catálogo con SUS permisos RLS. El payload no incluye ningún dato de
-- producto, así los borradores jamás se filtran a visitantes.
-- ============================================================

-- Los clientes (tienda anon y panel autenticado) pueden RECIBIR el aviso.
-- No existe política de INSERT: ningún cliente puede publicar en el topic;
-- solo el trigger de la base emite mensajes.
create policy "catalogo_aviso_lectura" on realtime.messages
  for select
  to anon, authenticated
  using (
    (select realtime.topic()) = 'catalog'
    and extension = 'broadcast'
  );

-- SECURITY DEFINER es el patrón oficial documentado para triggers de
-- Broadcast (la escritura en realtime.messages no pertenece al rol que edita
-- productos). Justificación handoff §8: es una función trigger — PostgREST no
-- expone funciones que devuelven trigger, no recibe argumentos del cliente y
-- fija search_path vacío.
create or replace function public.avisar_cambio_catalogo()
returns trigger
security definer
set search_path = ''
language plpgsql
as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('op', tg_op),  -- payload mínimo: sin datos de producto
      'change',                          -- nombre del evento
      'catalog',                         -- topic
      true                               -- canal privado
    );
  exception when others then
    -- El aviso es un canal secundario: si Realtime falla no se bloquea la
    -- escritura del inventario; la tienda se recupera con sus refetch.
    raise warning 'avisar_cambio_catalogo: realtime.send falló: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke execute on function public.avisar_cambio_catalogo() from public, anon, authenticated;

-- Un aviso por sentencia (una importación CSV masiva = un solo ping).
create trigger products_avisar_cambio
  after insert or update or delete on public.products
  for each statement execute function public.avisar_cambio_catalogo();
