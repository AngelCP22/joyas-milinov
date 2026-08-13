# Handoffs

## HANDOFF-20260813-ADMIN-REVIEWED

- Source agent: Codex
- Target agent: Agent that provisions the client-owned Supabase preview
- Objective: Activate and validate the reviewed inventory panel in preview.
- State: Local implementation REVIEWED; BLOCKED on hosted Supabase, preview
  permission matrix and explicit user approval. Production remains disabled.
- Evidence: `npm run verify` passes 64/64; normal build excludes the panel;
  responsive local checks passed at 390x844 and 1440x900 without overflow or
  console errors; public admin routes on GitHub Pages, apex and `www` return 404.
- Safety changes: Supabase PATCH/DELETE fail closed without `version`; client
  code performs no Storage deletions. Implement TD-007 server-side cleanup
  before reclaiming orphaned files.
- Next action: Follow `docs/DEPLOY-ADMIN.md` against a client-owned Supabase
  project and a gated preview. Do not modify production before the matrix and
  explicit approval.

## HANDOFF-20260811-ADMIN-READY-FOR-PREVIEW

- Source agent: Claude (Fable 5)
- Target agent: Whoever runs the preview + activation with the user
- Objective: The inventory panel contract (`HANDOFF-ADMIN-INVENTARIO.md`) is
  implemented and tested locally. Production is still DISABLED.
- State: Implementation DONE; BLOCKED on external inputs: (1) client-owned
  Supabase project, (2) preview deployment, (3) explicit user approval.
- How to continue: follow `docs/DEPLOY-ADMIN.md` step by step — apply
  `supabase/migrations/` + seed with the CLI, do the dashboard manual steps
  (disable signups, create owner account, insert into `admin_users`, URL
  config), run advisors, deploy a GATED preview, execute the security matrix
  (section "Paso 2"), then ask the user before touching production.
- Evidence available: `npm run verify` (build + audit + 63 tests; 28 of them
  are the permission matrix executed on the real migrations via PGlite, 5 are
  the realtime lifecycle regression with simulated timers); browser E2E of the
  panel and the storefront in local mode; details in
  `docs/agent/CHANGELOG.md` (2026-08-11 implementation entry).
- Known residual risks: TD-003 (anon reception of the private realtime topic
  is undocumented upstream — store degrades to polling if it fails, verify in
  preview); client-side Supabase flows (auth/storage JS) exercised only
  against the simulator + local mode, not a hosted project yet.
- Invariants that must not regress: production build without the gate must
  contain no panel artifacts and no enabled Supabase config (regression tests
  in `backend/test/build-gate.test.js`); no secrets in the repo or dist ever;
  seed is generated, not hand-edited; `backend/supabase/schema.sql` is
  deprecated.

## HANDOFF-20260811-ADMIN-INVENTORY

- Source agent: Codex
- Target agent: Next implementation agent
- Objective: Complete the private Supabase inventory panel for photos, prices, stock and realtime storefront updates.
- State: PLANNING; production activation is explicitly forbidden until the security and acceptance gates pass.
- Detailed contract: `docs/agent/HANDOFF-ADMIN-INVENTARIO.md`.
- Existing implementation: `admin.html`, `js/admin.js`, `js/app.js`, `backend/supabase/schema.sql`, `backend/supabase/seed.sql`.
- Current safety state: `supabase.enabled: false`; `admin.html` and `js/admin.js` excluded from `dist`; production routes return 404.
- Required next action: Audit current code/schema, claim files in STATUS, create a development Supabase project owned by the client, and implement through preview without changing the production gates.

## HANDOFF-20260808-001

- Source agent: Codex
- Objective: Publish Milinov on Cloudflare Pages and connect `milinovjoyeria.com`.
- State: DONE
- Files changed: Site metadata, SEO files, runtime config, README, and continuity records.
- Tests and exact results: `npm run verify` passed (13 static pages, 11 tests); Pages deployment `adacbe1b-9e79-4ddc-b1c8-dabaa40cb851` succeeded; apex, www, catalog, product, links, admin, robots, and sitemap returned HTTP 200; desktop/mobile browser checks showed zero overflow and no console errors.
- Decisions: `www.milinovjoyeria.com` is canonical; apex remains reachable.
- Unresolved problems: Supabase is not configured, so the online admin remains in setup mode.
- Risks: Apex and `www` both serve HTTP 200; canonical metadata points to `www`, but an apex-to-www redirect could not be created because the connected API credential lacks Redirect Rules permission. GitHub pushes did not trigger Pages builds automatically, so the GitHub integration needs reauthorization.
- Next action: Reauthorize the GitHub repository in Cloudflare Pages, then configure Supabase for authenticated online inventory management.
