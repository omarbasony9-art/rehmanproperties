---
name: Dual-environment backend pattern
description: Express+PostgreSQL for Replit dev, Cloudflare D1/R2 for Cloudflare Pages production — coexist in one monorepo.
---

# Dual-Environment Backend (Rehman INC)

**The rule:** Express server in `artifacts/api-server/` handles all local dev API calls. The same API contract (OpenAPI) will be served by Cloudflare Pages Functions in `artifacts/rehman-inc/functions/` for production deployment.

**Why:** The user explicitly wants Cloudflare D1/R2 (not PostgreSQL/Supabase) for production, but Replit's environment uses PostgreSQL. Rather than fighting either constraint, both coexist: Drizzle+PG for local preview, CF Functions stubs (not yet implemented) for prod.

**How to apply:**
- DB schema lives in two places: `lib/db/src/schema/` (Drizzle/PG for dev) and `artifacts/rehman-inc/schema.sql` (D1 SQLite for prod).
- Admin session auth uses in-memory Set + signed cookies in Express. CF Functions will need KV or Durable Objects for session storage.
- Photo uploads: Express returns a mock objectKey in dev; prod CF Functions will generate real R2 pre-signed URLs.
- The `functions/` directory in the artifact is a production stub — needs implementing with CF Worker bindings (DB, PHOTOS, env vars).
- `artifacts/rehman-inc/wrangler.toml` has D1 and R2 bindings configured; replace the `database_id` placeholder.
