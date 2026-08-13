# Engineering log

## 2026-08-13 - Independent inventory admin review

- Agent: Codex
- Objective: Review and continue the previous agent's inventory implementation without activating production.
- Findings fixed: PATCH and DELETE now fail closed without the expected version; automatic deletion of Storage objects was removed because the cross-service reference check was not atomic.
- Decision: Preserve possible orphaned images until a server-side, grace-period cleanup job exists; preventing broken catalog images has priority over immediate storage reclamation.
- Delivery gate: GitHub Pages now runs `npm ci` and `npm run verify` before uploading `dist`; a failed audit or test blocks publication.
- Validation: `npm run verify` passed (64/64 tests), both publication gate modes passed, JavaScript syntax checks passed, responsive browser verification at 390x844 and 1440x900 found no overflow or console errors, and the three public admin URLs returned HTTP 404.

## 2026-08-11 - Inventory admin implementation (production still disabled)

- Agent: Claude (Fable 5)
- Objective: Implement the complete private inventory panel contract from
  `HANDOFF-ADMIN-INVENTARIO.md` without activating production.
- Changes and files: `supabase/` (3 versioned migrations + generated seed +
  rollback + config.toml), `js/inventory-rules.js` (shared validation),
  rewritten `js/admin.js` (session/recovery states, optimistic concurrency via
  `version`, hardened uploads under `products/<uuid>`, orphan-image cleanup,
  atomic all-or-nothing CSV import, broadcast realtime with backoff+poll
  fallback), `js/app.js` (validated hydration, private broadcast channel,
  recovery refetches, real SKU in JSON-LD), `admin.html` (recovery view,
  version field, local vendor), `js/config.js` (publishableKey), `js/cart.js`
  (availability wording), build gate `MILINOV_ADMIN_GATE` in
  `scripts/build-static.mjs` + hardened `scripts/audit-static.mjs` (secret
  scanner, panel-link scanner, per-mode artifacts), `backend/server.js`
  refactor to shared rules, vendored `js/vendor/supabase.min.js` (2.110.7),
  `scripts/generate-seed.mjs`, docs (`docs/DEPLOY-ADMIN.md`,
  `supabase/README.md`, `docs/agent/DESIGN-ADMIN-INVENTARIO.md`, README).
- Key decisions (full rationale in DESIGN doc): optimistic locking with a
  trigger-managed `version` column; Broadcast ping-without-data instead of
  postgres_changes (official docs confirm DELETE events bypass RLS and
  hidden-row UPDATEs are dropped); publishable-key-only client (new key system
  verified against 2026 docs); env-gated build activation with fail-visible
  validation.
- Tests and exact results: `npm run verify` → build OK, audit OK (12 pages,
  disabled mode), 63/63 tests pass, including 28 permission-matrix/constraint
  tests executed against the REAL migrations on embedded Postgres (PGlite):
  anon/non-admin/admin CRUD matrix, draft invisibility, self-add denial,
  instant revocation, optimistic-concurrency conflict, storage path prefix
  enforcement, realtime ping without product data, atomic multi-row insert.
  Browser E2E (local mode, Node backend): 18 products loaded, quick-edit
  stock 0→sold_out→restock→active, invalid price restored, publish-incomplete
  rejected with clear message, draft saved, case-insensitive duplicate SKU
  rejected, strong delete confirm, 390px viewport without horizontal overflow.
- Problems found/fixed (own testing): latent bug where "Editar A → Volver →
  Duplicar B → Guardar" would overwrite product A (stale hidden id/version —
  now reset explicitly in fillForm); payments/supabase `enabled: false`
  ambiguity in tamper test; secret scanner false positives fixed by matching
  real keys/JWTs instead of mentions.
- Problems found/fixed (adversarial review + self-review, same day; all fixed
  and covered by new regression tests):
  - P1 `js/app.js` + `js/admin.js`: infinite realtime reconnect loop — a single
    transient CHANNEL_ERROR left every visitor re-querying the whole catalog
    every ~2 s forever, because `removeChannel()` re-emits CLOSED into the same
    callback and SUBSCRIBED never cancelled the pending retry. Fixed with
    channel-identity guards + retry cancellation (LESSON-002).
  - P2 `supabase/migrations/…_inventario_inicial.sql`: `products_portada_coherente`
    accepted a published product with a full gallery and NULL cover (a CHECK
    that evaluates to NULL passes). Fixed with `image is not null` (LESSON-001).
  - P2 storage: the SELECT policy let `anon` enumerate the bucket, exposing the
    photos of unreleased draft products. Restricted to admins; public URL reads
    (which bypass RLS) keep working.
  - P2 `js/admin.js`: the password-recovery link opened the panel directly
    without forcing a new password (getSession won the race against
    PASSWORD_RECOVERY). Now gated by an explicit pending-recovery flag.
  - P2 `js/admin.js`: "Exportar respaldo" included drafts, and the documented
    flow publishes that file as the static catalog — leaking unreleased pieces
    with tentative prices. Drafts are now excluded and reported.
  - P2 `js/app.js`: out-of-order refetch responses could overwrite fresh data
    with a stale snapshot (sequence token added); a failed vendor script load
    disarmed every recovery path for the whole session (recovery listeners and
    slow poll now register unconditionally, plus load timeout).
  - P2 `js/app.js`: every inventory ping re-rendered the product page, silently
    resetting the chosen quantity and gallery photo and duplicating `view_item`.
  - P2 `scripts/build-static.mjs`: the `[^}]*` regex used to inject the config
    would truncate at any `}` inside the supabase block, producing an invalid
    `config.js` (whole site down) with build, audit and tests all green. Now a
    brace-balanced slice plus a syntax check; the auditor also validates every
    published `.js`.
  - P2 `scripts/audit-static.mjs`: Supabase could be activated without the gate
    from any file other than `config.js` (assignment form, hardcoded key). Now
    scanned across all published files in disabled mode.
  - P2 `scripts/build-static.mjs`: `MILINOV_BUILD_OUT` accepted source
    directory names and the build's first action is a recursive delete — a typo
    could destroy uncommitted source. Now the name must start with `dist`.
  - P3 `js/admin.js`: `#error_description` from the URL fragment was reflected
    verbatim as a system message (content spoofing on the authentic domain);
    photo cleanup compared literal URLs while path normalization accepted
    encoded variants, which could delete a photo still used by another product.
- Review caveat: the adversarial workflow was cut short by an org spend limit
  (3 of 6 review dimensions and all automated verifiers died). The surviving
  findings were verified by hand against the code, and the three missing
  dimensions (SQL security, panel correctness, migration integrity) were
  reviewed manually — that manual pass is what found the NULL-cover and
  bucket-enumeration defects.
- Pending: preview security matrix against a real client-owned Supabase
  project, dashboard manual steps, advisors run, user approval, activation
  (docs/DEPLOY-ADMIN.md). Production remains DISABLED.

## 2026-08-11 - Inventory admin implementation handoff

- Agent: Codex
- Objective: Provide the next agent with a complete, security-gated implementation contract for product photos, prices, stock and realtime storefront updates.
- Changes and files: Added `HANDOFF-ADMIN-INVENTARIO.md` and linked it from continuity status, messages and handoffs.
- Decision: Keep the production panel and Supabase connection disabled until the documented Auth, RLS, Storage, Realtime, adversarial testing and explicit approval gates pass.

## 2026-08-08 - Disable unfinished production admin

- Agent: Codex
- Objective: Make the unfinished inventory panel unavailable from the public deployment until its authentication and storage setup is completed.
- Changes and files: Excluded `admin.html` and `js/admin.js` from `dist`, added both to the forbidden-artifact audit, removed public route references, and added an audited `supabase.enabled: false` kill switch.
- Security decision: Keep the panel source in the private development workflow while publishing no executable admin route or client bundle.
- Reactivation gate: Restore the two public artifacts only after Supabase Auth, RLS, Storage policies, administrator allowlisting, and production access tests pass.

## 2026-08-08 - Hero video framing and brand sizing

- Agent: Codex
- Objective: Integrate the supplied presentation video into the storefront hero without recompression and balance the official logo across breakpoints.
- Changes and files: Adjusted the hero poster, video focal point, text-protection overlay, and responsive logo dimensions in `index.html` and `css/styles.css`.
- Decisions: Preserve the original 1080x1920 MP4 byte-for-byte; use CSS cropping because the supplied source is portrait while the desktop hero is wide.
- Validation: Static build, link audit, backend tests, and desktop/mobile browser checks.

## 2026-08-08 — Cloudflare production domain

- Agent: Codex
- Objective: Publish the existing storefront on Cloudflare Pages at the new domain.
- Changes and files: Canonical URLs, Open Graph URLs, JSON-LD, `robots.txt`, `sitemap.xml`, `llms.txt`, runtime site URL, and deployment documentation.
- Decisions: Use Cloudflare Pages with GitHub auto-deploys; canonical hostname is `www.milinovjoyeria.com` and the apex is also attached.
- Tests and results: `npm run verify` passed (13 pages audited, 11 backend tests); both domains and clean routes returned HTTP 200; Pages build/deploy succeeded; desktop/mobile browser checks passed without console errors or horizontal overflow.
- Problems found/fixed: Production metadata still referenced GitHub Pages; Cloudflare clean URLs initially caused unnecessary 308 redirects; the static auditor still treated the real domain as provisional.
- Pending work: Configure Supabase before enabling the online inventory panel; reauthorize the Cloudflare Pages GitHub webhook for automatic builds.
