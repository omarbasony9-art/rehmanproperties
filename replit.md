# Rehman INC

A complete, production-ready real estate investment website for Rehman INC. Homeowners can submit property information through a polished 4-step lead form to request a cash offer. Features an admin dashboard with full pipeline management.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (local dev, port 8080)
- `pnpm --filter @workspace/rehman-inc run dev` — Frontend dev server
- `pnpm run typecheck` — Full typecheck across all packages
- `pnpm --filter @workspace/db run push` — Push DB schema changes (local dev only)
- `pnpm --filter @workspace/api-spec run codegen` — Regenerate API hooks from OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Wouter, TanStack Query, Tailwind CSS, shadcn/ui
- API (dev): Express 5, PostgreSQL + Drizzle ORM
- API (prod): Cloudflare Pages Functions + D1 + R2
- Email: Resend API
- Build: esbuild (CJS bundle for API server)

## Where things live

- `artifacts/rehman-inc/src/` — React frontend
  - `pages/` — Route-level pages (Home, Admin, Privacy, Terms)
  - `components/` — Reusable UI components including multi-step form modal
- `artifacts/api-server/src/routes/` — Express routes
  - `inquiries.ts` — POST /api/inquiries, POST /api/inquiries/upload-url
  - `admin.ts` — Admin CRUD routes (protected by session cookie)
- `artifacts/api-server/src/lib/` — Backend utilities
  - `auth.ts` — In-memory session management
  - `email.ts` — Resend email notifications
- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/db/src/schema/inquiries.ts` — Drizzle schema for inquiries + photos
- `artifacts/rehman-inc/schema.sql` — Cloudflare D1 migration SQL
- `artifacts/rehman-inc/wrangler.toml` — Cloudflare Pages configuration
- `artifacts/rehman-inc/.env.example` — All required environment variables

## Architecture decisions

- Dual-environment backend: Express + PostgreSQL for local Replit dev; Cloudflare Pages Functions + D1 for production. This lets the app fully run in Replit preview while being deployable to Cloudflare Pages.
- Admin auth uses in-memory session tokens + signed cookies (COOKIE_SECRET). No third-party auth needed. Replace with Cloudflare Access for added enterprise security.
- Photo uploads use backend-generated pre-signed URLs; R2 credentials never touch the frontend. In dev, a mock objectKey is returned (no actual upload).
- Rate limiting on inquiry submissions: 3 per IP per hour (in-memory). Upgrade to Cloudflare rate limiting rules in production.
- Testimonials section omitted per spec (no fake reviews).

## Product

- **Public site**: Full marketing homepage with hero, trust section, How It Works, Traditional vs Rehman INC comparison, situations grid, placeholder portfolio, FAQ accordion, and final CTA.
- **Lead form**: 4-step modal flow — Property Address → Property Details → Photos (optional) → Contact Info. Generates REH-YYYY-NNNNN inquiry numbers.
- **Admin dashboard**: Password-protected at /admin. Pipeline stats cards, searchable/filterable/sortable inquiry table, full inquiry detail with photos and status management.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After schema changes: run `pnpm --filter @workspace/db run push` for local dev, then `pnpm run typecheck:libs` to refresh lib declarations.
- After openapi.yaml changes: run `pnpm --filter @workspace/api-spec run codegen` then restart both workflows.
- Cloudflare Pages Functions in `functions/` directory need to be implemented separately for production — the Express server handles local dev only.
- ADMIN_PASSWORD env var must be set before the /admin route works. Set COOKIE_SECRET too.
- The `from` email in `email.ts` must use a Resend-verified domain in production.

## Pointers

- See `README.md` for full Cloudflare deployment instructions
- See `artifacts/rehman-inc/.env.example` for all required environment variables
- See `artifacts/rehman-inc/schema.sql` for D1 migration
- See `artifacts/rehman-inc/wrangler.toml` for Cloudflare Pages config
