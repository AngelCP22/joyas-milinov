# Handoffs

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
