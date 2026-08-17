# Rehman INC — Real Estate Investment Website

A complete, production-ready website for Rehman INC, a cash home-buying company. Homeowners can submit property information through a polished multi-step form. An admin dashboard provides full lead management with pipeline tracking.

## Tech Stack

| Layer | Dev (Replit) | Production (Cloudflare) |
|-------|-------------|------------------------|
| Frontend | React + Vite + TypeScript | Cloudflare Pages (static) |
| Backend API | Express 5 (Node.js) | Cloudflare Pages Functions |
| Database | PostgreSQL + Drizzle ORM | Cloudflare D1 (SQLite) |
| File Storage | Mock (not stored) | Cloudflare R2 |
| Email | Resend API | Resend API |

## Getting Started

### 1. Local Development

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp artifacts/rehman-inc/.env.example .env.local
# Edit .env.local with your values

# Start the API server
pnpm --filter @workspace/api-server run dev

# Start the frontend (in another terminal)
pnpm --filter @workspace/rehman-inc run dev
```

### 2. Environment Variables

Copy `artifacts/rehman-inc/.env.example` to `.env.local` and fill in the values.

**Required for the site to function:**
- `ADMIN_PASSWORD` — password for the `/admin` dashboard
- `COOKIE_SECRET` — random string for signing session cookies (generate with `openssl rand -hex 32`)
- `DATABASE_URL` — PostgreSQL connection string (local dev only)

**Required for email notifications:**
- `RESEND_API_KEY` — from [resend.com](https://resend.com)
- `INQUIRY_NOTIFICATION_EMAIL` — email address to receive new inquiry alerts

**Required for photo uploads (production):**
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`

**Optional (analytics):**
- `VITE_GA_MEASUREMENT_ID` — Google Analytics 4
- `VITE_GOOGLE_ADS_CONVERSION_ID` — Google Ads
- `VITE_META_PIXEL_ID` — Meta Pixel
- `VITE_CLOUDFLARE_TURNSTILE_SITE_KEY` — bot protection

### 3. Database Setup (Local Development)

The local dev environment uses PostgreSQL with Drizzle ORM.

```bash
# Push schema changes to local PostgreSQL
pnpm --filter @workspace/db run push
```

### 4. Cloudflare D1 Setup (Production)

1. Create a D1 database:
   ```bash
   wrangler d1 create rehman-inc-db
   ```
2. Copy the `database_id` from the output into `artifacts/rehman-inc/wrangler.toml`
3. Apply the schema:
   ```bash
   wrangler d1 execute rehman-inc-db --file=artifacts/rehman-inc/schema.sql
   ```

### 5. Cloudflare R2 Setup (Production)

1. Create an R2 bucket:
   ```bash
   wrangler r2 bucket create rehman-inc-photos
   ```
2. Generate an R2 API token in the Cloudflare dashboard (R2 → Manage API Tokens)
3. Add these secrets to your Cloudflare Pages project:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME` = `rehman-inc-photos`
4. Configure a public custom domain for your R2 bucket and set `R2_PUBLIC_URL`

### 6. Email Setup (Resend)

1. Sign up at [resend.com](https://resend.com)
2. Add and verify your sending domain
3. Generate an API key
4. Add to environment: `RESEND_API_KEY` and `INQUIRY_NOTIFICATION_EMAIL`
5. Update the `from` address in `artifacts/api-server/src/lib/email.ts` to use your verified domain

### 7. Cloudflare Pages Deployment

1. Push your code to GitHub
2. Go to Cloudflare Dashboard → Pages → Create a project → Connect to Git
3. Configure build settings:
   - **Build command:** `pnpm --filter @workspace/rehman-inc run build`
   - **Build output directory:** `artifacts/rehman-inc/dist/public`
4. Set all production environment variables in the Pages project settings
5. Connect a custom domain in Pages → Custom Domains

> **Note:** Cloudflare Pages Functions (`functions/` directory) must be implemented for full production functionality. The Express server handles local development; the Functions handle production API calls using D1 and R2 bindings.

### 8. Admin Dashboard Setup

The admin dashboard is at `/admin`. It's protected by a password set via the `ADMIN_PASSWORD` environment variable.

**For production security:**
- Use a strong, unique password (at least 20 characters)
- Set `COOKIE_SECRET` to a random 32+ character string
- The `/admin` path is blocked in `robots.txt`
- Consider IP allowlisting via Cloudflare Access for additional protection

**Set secrets via Wrangler:**
```bash
wrangler secret put ADMIN_PASSWORD
wrangler secret put COOKIE_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put INQUIRY_NOTIFICATION_EMAIL
```

## Project Structure

```
artifacts/
├── api-server/          # Express backend (local dev)
│   └── src/
│       ├── routes/
│       │   ├── inquiries.ts   # POST /api/inquiries, upload-url
│       │   └── admin.ts       # Admin CRUD routes
│       └── lib/
│           ├── auth.ts        # Session management
│           └── email.ts       # Resend email notification
├── rehman-inc/          # React + Vite frontend
│   ├── src/
│   │   ├── pages/       # Route-level page components
│   │   ├── components/  # Reusable UI components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utilities
│   ├── public/          # Static assets (robots.txt, sitemap.xml)
│   ├── schema.sql       # Cloudflare D1 migration
│   └── wrangler.toml    # Cloudflare configuration
lib/
├── api-spec/
│   └── openapi.yaml     # OpenAPI spec (source of truth for all API contracts)
└── db/
    └── src/schema/      # Drizzle schema (inquiries, property_photos)
```

## Adding Local SEO Pages

The site is structured to easily add location-based SEO pages:

```tsx
// Add routes like:
<Route path="/sell-my-house-fast" component={SellFastPage} />
<Route path="/sell-house-as-is" component={SellAsIsPage} />
```

Create the page component in `artifacts/rehman-inc/src/pages/` and add to `sitemap.xml`.

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_PASSWORD` | Yes | Admin dashboard password |
| `COOKIE_SECRET` | Yes | Session cookie signing key |
| `DATABASE_URL` | Dev only | PostgreSQL connection string |
| `RESEND_API_KEY` | For email | Resend API key |
| `INQUIRY_NOTIFICATION_EMAIL` | For email | Notification recipient |
| `R2_ACCOUNT_ID` | For photos | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | For photos | R2 access key |
| `R2_SECRET_ACCESS_KEY` | For photos | R2 secret key |
| `R2_BUCKET_NAME` | For photos | R2 bucket name |
| `R2_PUBLIC_URL` | For photos | Public URL for R2 |
| `VITE_GA_MEASUREMENT_ID` | Optional | Google Analytics 4 |
| `VITE_META_PIXEL_ID` | Optional | Meta Pixel |
| `VITE_CLOUDFLARE_TURNSTILE_SITE_KEY` | Optional | Bot protection |
| `VITE_CONTACT_PHONE` | Optional | Displayed phone number |
| `VITE_CONTACT_EMAIL` | Optional | Displayed email address |
