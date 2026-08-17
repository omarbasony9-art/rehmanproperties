import pg from "pg";

const { Pool } = pg;

if (!process.env["DATABASE_URL"]) {
  throw new Error("DATABASE_URL environment variable is required.");
}

export const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err.message);
});

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function initDb(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS foreclosures (
      id                       SERIAL PRIMARY KEY,
      sheriff_number           TEXT    UNIQUE NOT NULL,
      court_case_number        TEXT,
      current_sale_date        TEXT,
      original_sale_date       TEXT,
      plaintiff                TEXT,
      defendant                TEXT,
      address                  TEXT,
      city                     TEXT,
      state                    TEXT,
      zip_code                 TEXT,
      attorney                 TEXT,
      approx_judgment          NUMERIC,
      upset_amount             NUMERIC,
      priors_liens_taxes       TEXT,
      tax_lot                  TEXT,
      block                    TEXT,
      nearest_cross_street     TEXT,
      occupancy_status         TEXT,
      property_notes           TEXT,
      detail_url               TEXT,
      google_maps_url          TEXT,
      zillow_url               TEXT,
      foreclosure_type         TEXT    DEFAULT 'unknown',
      classification_confidence TEXT,
      classification_evidence   TEXT,
      deal_rating              TEXT    DEFAULT 'UNKNOWN',
      deal_score               NUMERIC DEFAULT 0,
      estimated_spread         NUMERIC,
      discount_percent         NUMERIC,
      equity_multiple          NUMERIC,
      deal_warnings            TEXT[]  DEFAULT '{}',
      first_seen               TIMESTAMPTZ DEFAULT NOW(),
      last_seen                TIMESTAMPTZ DEFAULT NOW(),
      last_changed             TIMESTAMPTZ DEFAULT NOW(),
      last_detail_check        TIMESTAMPTZ,
      last_updated             TIMESTAMPTZ DEFAULT NOW(),
      is_removed               BOOLEAN DEFAULT FALSE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS status_history (
      id               SERIAL PRIMARY KEY,
      sheriff_number   TEXT NOT NULL REFERENCES foreclosures(sheriff_number) ON DELETE CASCADE,
      event_date       TEXT,
      event_description TEXT,
      recorded_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_status_history_sheriff
      ON status_history(sheriff_number)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS property_values (
      id                     SERIAL PRIMARY KEY,
      sheriff_number         TEXT UNIQUE NOT NULL REFERENCES foreclosures(sheriff_number) ON DELETE CASCADE,
      estimated_market_value NUMERIC,
      active_listing_price   NUMERIC,
      last_sale_price        NUMERIC,
      last_sale_date         TEXT,
      tax_assessed_value     NUMERIC,
      bedrooms               NUMERIC,
      bathrooms              NUMERIC,
      square_feet            NUMERIC,
      year_built             NUMERIC,
      property_type          TEXT,
      comparable_sales       JSONB,
      provider               TEXT DEFAULT 'rentcast',
      fetched_at             TIMESTAMPTZ DEFAULT NOW(),
      raw_response           JSONB
    )
  `);

  // Migrations — safe to run on every startup
  await query(`
    ALTER TABLE foreclosures
      ADD COLUMN IF NOT EXISTS valuation_status TEXT DEFAULT 'UNKNOWN'
  `);

  // Fix: spec requires dealScore=null (not 0) when rating is UNKNOWN
  await query(`
    UPDATE foreclosures
    SET deal_score = NULL
    WHERE deal_rating = 'UNKNOWN' AND (deal_score = 0 OR deal_score IS NULL)
  `);

  // Rename old warning value NO_UPSET_AMOUNT → MISSING_UPSET_AMOUNT
  await query(`
    UPDATE foreclosures
    SET deal_warnings = array_replace(deal_warnings, 'NO_UPSET_AMOUNT', 'MISSING_UPSET_AMOUNT')
    WHERE 'NO_UPSET_AMOUNT' = ANY(deal_warnings)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS refresh_runs (
      id               SERIAL PRIMARY KEY,
      started_at       TIMESTAMPTZ DEFAULT NOW(),
      completed_at     TIMESTAMPTZ,
      number_found     INTEGER,
      number_new       INTEGER,
      number_updated   INTEGER,
      number_failed    INTEGER,
      major_deals_found INTEGER,
      error            TEXT,
      success          BOOLEAN DEFAULT FALSE
    )
  `);

  console.log("[db] Schema initialized.");
}
