# Technical debt

## TD-007 — Recolección segura de fotos huérfanas

- Origin: Revisión adversarial de concurrencia del panel, 2026-08-13.
- Impact and risk: Al cancelar una subida, retirar fotos de una galería o borrar un producto pueden quedar objetos sin referencias en Storage, consumiendo espacio. Se desactivó el borrado automático desde el navegador porque la comprobación en Postgres y el borrado en Storage no forman una operación atómica; una carrera podía romper una foto válida.
- Priority: P2
- Proposed remediation: Implementar un job servidor-side periódico que construya el conjunto de referencias, aplique una ventana de gracia, registre candidatos y vuelva a comprobar antes de borrar. Nunca borrar en la misma solicitud interactiva del panel.
- Owner: Backend/operations
- State: OPEN

## TD-005 — Tres dimensiones de revisión adversarial quedaron sin ejecutar automáticamente

- Origin: La revisión adversarial del 2026-08-11 se cortó por el límite de
  gasto de la organización: murieron 3 de 6 dimensiones (seguridad SQL,
  corrección del panel, integridad de migraciones) y los 12 verificadores.
- Impact and risk: Los hallazgos supervivientes se verificaron a mano contra el
  código y las 3 dimensiones faltantes se revisaron manualmente (de ahí
  salieron los defectos de portada NULL y enumeración del bucket), pero no hay
  una segunda opinión independiente sobre esas áreas.
- Priority: P2
- Resolution: Codex ejecutó una revisión independiente manual de seguridad SQL,
  integridad de migraciones y corrección del panel el 2026-08-13. Detectó y
  corrigió el borrado sin control de versión y la limpieza no atómica de
  Storage; añadió regresiones y dejó `npm run verify` en 64/64.
- Owner: Codex
- State: RESOLVED

## TD-006 — El simulador PGlite no reproduce los grants reales de storage/realtime

- Origin: `backend/test/helpers/supabase-sim.js` (2026-08-11).
- Impact and risk: Las políticas RLS de `storage.objects` y `realtime.messages`
  se prueban sobre un esquema propio con grants que el simulador concede. En el
  proyecto real esos grants los administra Supabase, así que una diferencia
  podría hacer que una política se comporte distinto (más restrictiva o más
  permisiva) de lo que indican las pruebas.
- Priority: P2
- Proposed remediation: Repetir la matriz contra el proyecto real en preview
  (docs/DEPLOY-ADMIN.md, paso 2) antes de activar producción. Las pruebas
  locales cubren la lógica de las políticas, no la configuración del hosted.
- Owner: Agente que ejecute la activación
- State: OPEN

## TD-003 — Recepción anónima del canal privado Realtime sin documentación oficial

- Origin: Diseño D7 del panel de inventario (2026-08-11). Los ejemplos
  oficiales de políticas sobre `realtime.messages` usan solo `TO authenticated`;
  el caso "anon recibe broadcasts de un topic privado" no está documentado.
- Impact and risk: Si el proyecto real no autoriza a `anon`, la tienda pública
  no recibe el ping en vivo. Mitigado: la tienda degrada a sondeo de 60 s +
  refetch por visibilidad/reconexión, así que el catálogo nunca queda
  desactualizado de forma permanente.
- Priority: P2
- Proposed remediation: Verificarlo en la matriz de preview
  (docs/DEPLOY-ADMIN.md, paso 2). Si `anon` no recibe: opción a) canal público
  (`private: false`) aceptando que clientes puedan emitir pings espurios
  (solo provocan refetch), u opción b) dejar el sondeo como mecanismo de la
  tienda y el canal privado solo para el panel.
- Owner: Agente que ejecute la activación
- State: OPEN

## TD-004 — Confirmación de borrado con confirm() nativo

- Origin: Panel de inventario (2026-08-11).
- Impact and risk: El diálogo nativo no es estilizable y su texto puede
  truncarse en móviles; el flujo es correcto (nombre + irreversibilidad +
  alternativa de borrador).
- Priority: P3
- Proposed remediation: Modal propio accesible cuando haya presupuesto de UI.
- Owner: Sin asignar
- State: ACCEPTED

## TD-001 — Redirect apex hostname to canonical www

- Origin: Cloudflare production deployment on 2026-08-08.
- Impact and risk: Both hostnames work and canonical tags use `www`, but the apex does not issue a 301 redirect. Low SEO/analytics duplication risk.
- Priority: P3
- Proposed remediation: Add a Cloudflare Redirect Rule from `milinovjoyeria.com/*` to `https://www.milinovjoyeria.com/$1` when the API token has Rulesets edit permission.
- Owner: Site administrator
- State: ACCEPTED

## TD-002 — Reauthorize Cloudflare Pages GitHub webhook

- Origin: Cloudflare production deployment on 2026-08-08.
- Impact and risk: The project can clone and build `main`, but pushes did not automatically start a Pages deployment. Future changes require a manual build until the integration is reauthorized.
- Priority: P2
- Proposed remediation: In Cloudflare Pages, reconnect the `AngelCP22/joyas-milinov` GitHub repository and confirm production deployments are enabled for `main`.
- Owner: Repository administrator
- State: OPEN
