# Engineering log

## 2026-08-08 — Cloudflare production domain

- Agent: Codex
- Objective: Publish the existing storefront on Cloudflare Pages at the new domain.
- Changes and files: Canonical URLs, Open Graph URLs, JSON-LD, `robots.txt`, `sitemap.xml`, `llms.txt`, runtime site URL, and deployment documentation.
- Decisions: Use Cloudflare Pages with GitHub auto-deploys; canonical hostname is `www.milinovjoyeria.com` and the apex is also attached.
- Tests and results: `npm run verify` passed (13 pages audited, 11 backend tests); both domains and clean routes returned HTTP 200; Pages build/deploy succeeded; desktop/mobile browser checks passed without console errors or horizontal overflow.
- Problems found/fixed: Production metadata still referenced GitHub Pages; Cloudflare clean URLs initially caused unnecessary 308 redirects; the static auditor still treated the real domain as provisional.
- Pending work: Configure Supabase before enabling the online inventory panel.
