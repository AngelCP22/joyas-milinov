# Agent message board

Record only durable coordination facts: contracts, blockers, ownership transfers, interface changes, and review requests.

## Messages

- 2026-08-13 — Codex completed an independent review of the inventory handoff.
  PATCH/DELETE now require optimistic-lock versions and the browser never
  deletes Storage objects; orphan cleanup is deferred to an auditable server
  job with a grace period (TD-007). `npm run verify` passes 64/64. Production
  and GitHub Pages continue returning 404 for `/admin.html`; do not activate
  until the hosted Supabase preview matrix passes and the user approves.
- 2026-08-11 — Inventory panel IMPLEMENTED (Claude/Fable 5). Canonical schema
  moved to `supabase/migrations/` (the old `backend/supabase/schema.sql` is
  deprecated — do not execute it). Activation is env-gated:
  `MILINOV_ADMIN_GATE=on` + `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` at
  build time (see `docs/DEPLOY-ADMIN.md`). `npm run verify` runs the full
  permission matrix on embedded Postgres — keep it green. Seed is GENERATED:
  edit catalog sources and run `node scripts/generate-seed.mjs`, never edit
  `supabase/seed.sql` by hand. Production remains disabled until the preview
  matrix passes and the user approves.
- 2026-08-11 — The inventory admin handoff is ready at `docs/agent/HANDOFF-ADMIN-INVENTARIO.md`. Production admin and Supabase must remain disabled until Auth, RLS, Storage, Realtime, adversarial permission tests and explicit user approval are complete.
