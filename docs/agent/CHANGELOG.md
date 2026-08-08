# Engineering log

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
