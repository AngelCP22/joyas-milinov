# Engineering log

## 2026-08-08 — Cloudflare production domain

- Agent: Codex
- Objective: Publish the existing storefront on Cloudflare Pages at the new domain.
- Changes and files: Canonical URLs, Open Graph URLs, JSON-LD, `robots.txt`, `sitemap.xml`, `llms.txt`, runtime site URL, and deployment documentation.
- Decisions: Use Cloudflare Pages with GitHub auto-deploys; canonical hostname is `www.milinovjoyeria.com` and the apex is also attached.
- Tests and results: Pending final build, static audit, backend tests, DNS, TLS, and live smoke test.
- Problems found/fixed: Production metadata still referenced GitHub Pages.
- Pending work: Create Pages project, attach domains, verify deployment and TLS.
