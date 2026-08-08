# Technical debt

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
