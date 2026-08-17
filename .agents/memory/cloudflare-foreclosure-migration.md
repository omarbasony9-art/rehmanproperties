---
name: Cloudflare foreclosure migration
description: How the foreclosure tracker was ported from Express/PostgreSQL/cheerio to Cloudflare Pages Functions + D1 (no cheerio, no Node.js builtins).
---

# Cloudflare Foreclosure Migration

## What was built

All foreclosure business logic lives in `artifacts/rehman-inc/functions/_foreclosures.ts`:
- HTML parsing without cheerio: split HTML on `sale-detail-item` class boundaries, then regex-extract label/value divs
- CivilView scraping: `fetchListPage` + `fetchDetailPage` using native `fetch` + cookie capture
- Zillow/Redfin valuations using env vars from Cloudflare `Env` binding (not process.env)
- Classification, deal scoring, computeWarnings — all ported as pure functions
- D1 raw SQL (not Drizzle) for the `foreclosures` table (schema in `schema.sql`)

Routes added to `artifacts/rehman-inc/functions/api/[[route]].ts`:
- `GET /api/foreclosures/listings` — public, paginated/filtered
- `GET /api/foreclosures/stats` — public aggregate counts
- `GET /api/foreclosures/listings/:sheriff` — single record
- `POST /api/foreclosures/sync/:county` — auth-protected, triggers full scrape+upsert

Admin page: `artifacts/rehman-inc/public/foreclosures-admin.html` (served as static asset at `/foreclosures-admin.html`)

## Key rules

**Why:** Cloudflare Workers cannot run Node.js packages like `cheerio`. HTML parsing must use split + regex approach.

**How to apply:** Whenever porting scraper logic to Workers, use `html.split(/(?=<div[^>]+class="[^"]*targetClass[^"]*")/)` to segment the HTML, then regex inside each segment.

**D1 schema init:** `ensureForeclosuresTable` runs `db.batch([...CREATE TABLE IF NOT EXISTS...])` inside a lazy `fcSchemaReady` guard. The `foreclosures` table is NOT in Drizzle schema — raw D1 SQL only.

**Env vars required in Cloudflare dashboard** (not auto-transferred from Replit secrets):
- `ZILLOW_RAPIDAPI_KEY`, `ZILLOW_RAPIDAPI_HOST`
- `REDFIN_RAPIDAPI_KEY`, `REDFIN_RAPIDAPI_HOST`
Without these, all valuations return `NOT_CONFIGURED` (graceful degradation).

**D1 schema deployment:** After any schema.sql change, run:
```
wrangler d1 execute rehman-inc-db --remote --file=artifacts/rehman-inc/schema.sql
```

**Sync limits:** `MAX_DETAIL_PAGES = 40` per sync call to stay within Workers 30s timeout. Call sync multiple times for full population. County slugs: `atlantic` (countyId=25), `cape-may` (countyId=52).
