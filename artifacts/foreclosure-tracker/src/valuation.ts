/**
 * Valuation orchestrator.
 *
 * Coordinates Zillow + Redfin providers, calculates market value,
 * scores the deal, and persists everything to the foreclosures table.
 *
 * Key rules:
 * - Zillow is the automated source (7-day cache).
 * - Redfin is manual-only via PATCH /api/foreclosures/:id/valuation/redfin.
 * - Market value = conservative minimum of available estimates.
 * - Never converts null to 0.
 * - Deal listing is visible regardless of valuation outcome.
 */

import { query } from "./db.js";
import { fetchZillowEstimate } from "./services/valuation/zillow.js";
import { buildRedfinSearchUrl } from "./services/valuation/redfin.js";
import { calculateMarketValue } from "./services/valuation/market-value.js";
import { scoreDeal, computeWarnings } from "./deals.js";

const ZILLOW_CACHE_DAYS = 7;
const UPSET_THRESHOLD   = 280_000;

/** Property row subset needed for valuation */
interface PropRow {
  sheriff_number:      string;
  address:             string | null;
  city:                string | null;
  state:               string | null;
  zip_code:            string | null;
  upset_amount:        string | null;
  priors_liens_taxes:  string | null;
  occupancy_status:    string | null;
  zillow_estimate:     string | null;
  zillow_fetched_at:   Date | null;
  zillow_status:       string | null;
  redfin_estimate:     string | null;
  redfin_fetched_at:   Date | null;
  redfin_status:       string | null;
}

/**
 * Fetch Zillow estimate and recalculate deal for a property.
 * Respects 7-day cache unless force=true.
 * Does NOT require upsetAmount threshold — that is the caller's responsibility.
 *
 * @returns "fetched" | "cached" | "skipped" | "error"
 */
export async function lookupValuation(
  sheriffNumber: string,
  address: string,
  city: string,
  state: string,
  zip: string,
  force = false,
): Promise<"fetched" | "cached" | "skipped" | "error"> {
  const apiKey = process.env["ZILLOW_RAPIDAPI_KEY"];
  if (!apiKey) {
    // No Zillow credentials — update status and exit cleanly
    await query(
      `UPDATE foreclosures SET zillow_status='NOT_CONFIGURED', last_updated=NOW()
       WHERE sheriff_number=$1`,
      [sheriffNumber],
    );
    return "skipped";
  }

  if (!force) {
    // Check cache
    const cached = await query<{ zillow_fetched_at: Date | null; zillow_status: string | null }>(
      `SELECT zillow_fetched_at, zillow_status FROM foreclosures WHERE sheriff_number=$1`,
      [sheriffNumber],
    );
    const row = cached[0];
    if (row?.zillow_fetched_at && row.zillow_status === "SUCCESS") {
      const ageDays = (Date.now() - row.zillow_fetched_at.getTime()) / 86_400_000;
      if (ageDays < ZILLOW_CACHE_DAYS) {
        return "cached";
      }
    }
  }

  try {
    const result = await fetchZillowEstimate(address, city, state, zip);

    await query(
      `UPDATE foreclosures SET
         zillow_estimate=$2, zillow_fetched_at=$3, zillow_status=$4,
         zillow_property_url=COALESCE($5, zillow_property_url),
         last_updated=NOW()
       WHERE sheriff_number=$1`,
      [
        sheriffNumber,
        result.estimate,
        result.fetchedAt,
        result.status,
        result.propertyUrl,
      ],
    );

    await recalculateDeal(sheriffNumber);
    return result.status === "SUCCESS" ? "fetched" : "skipped";
  } catch (err) {
    console.error(`[valuation] lookupValuation error for ${sheriffNumber}:`, err);
    await query(
      `UPDATE foreclosures SET zillow_status='ERROR', last_updated=NOW() WHERE sheriff_number=$1`,
      [sheriffNumber],
    );
    return "error";
  }
}

/**
 * Run bulk Zillow refresh for all qualifying properties.
 * upsetAmount <= UPSET_THRESHOLD only (unless force includes all).
 */
export async function runBulkZillowRefresh(force = false): Promise<{
  total: number; fetched: number; cached: number; skipped: number; errors: number;
}> {
  const rows = await query<PropRow>(
    `SELECT sheriff_number, address, city, state, zip_code, upset_amount,
            priors_liens_taxes, occupancy_status,
            zillow_estimate, zillow_fetched_at, zillow_status,
            redfin_estimate, redfin_fetched_at, redfin_status
     FROM foreclosures
     WHERE is_removed = FALSE
       AND upset_amount IS NOT NULL
       AND upset_amount <= $1
       AND address IS NOT NULL
       AND city IS NOT NULL
     ORDER BY upset_amount ASC`,
    [UPSET_THRESHOLD],
  );

  const stats = { total: rows.length, fetched: 0, cached: 0, skipped: 0, errors: 0 };

  for (const prop of rows) {
    if (!prop.address || !prop.city || !prop.state || !prop.zip_code) { stats.skipped++; continue; }
    const outcome = await lookupValuation(
      prop.sheriff_number, prop.address, prop.city, prop.state, prop.zip_code, force,
    );
    if (outcome === "fetched")  stats.fetched++;
    else if (outcome === "cached")  stats.cached++;
    else if (outcome === "error")   stats.errors++;
    else                            stats.skipped++;
    // Small delay to avoid rate limits
    await sleep(300);
  }

  return stats;
}

/**
 * Recalculate market value, spread, discount, score, rating, and warnings
 * from the currently stored zillow_estimate + redfin_estimate.
 * Call after any valuation change.
 */
export async function recalculateDeal(sheriffNumber: string): Promise<void> {
  const rows = await query<PropRow>(
    `SELECT sheriff_number, address, city, state, zip_code, upset_amount,
            priors_liens_taxes, occupancy_status,
            zillow_estimate, zillow_fetched_at, zillow_status,
            redfin_estimate, redfin_fetched_at, redfin_status
     FROM foreclosures WHERE sheriff_number=$1`,
    [sheriffNumber],
  );
  if (!rows.length) return;
  const prop = rows[0]!;

  const upsetAmount    = prop.upset_amount     ? parseFloat(prop.upset_amount)    : null;
  const zillowEstimate = prop.zillow_estimate  ? parseFloat(prop.zillow_estimate) : null;
  const redfinEstimate = prop.redfin_estimate  ? parseFloat(prop.redfin_estimate) : null;

  const { marketValueUsed, marketValueSource } = calculateMarketValue(zillowEstimate, redfinEstimate);
  const metrics  = scoreDeal(upsetAmount, marketValueUsed, zillowEstimate, redfinEstimate);
  const warnings = computeWarnings({
    upsetAmount,
    zillowEstimate,
    zillowStatus:    prop.zillow_status,
    zillowFetchedAt: prop.zillow_fetched_at ? new Date(prop.zillow_fetched_at) : null,
    redfinEstimate,
    redfinStatus:    prop.redfin_status,
    marketValueUsed,
    priorsLiensTaxes: prop.priors_liens_taxes,
    occupancyStatus:  prop.occupancy_status,
  });

  // Build redfin search URL if not already stored
  const redfinSearchUrl = (prop.address && prop.city && prop.state && prop.zip_code)
    ? buildRedfinSearchUrl(prop.address, prop.city, prop.state, prop.zip_code)
    : null;

  await query(
    `UPDATE foreclosures SET
       market_value_used=$2, market_value_source=$3,
       estimated_spread=$4, discount_percent=$5, equity_multiple=$6,
       deal_rating=$7, deal_score=$8, deal_warnings=$9,
       redfin_property_url=COALESCE(redfin_property_url, $10),
       valuation_updated_at=NOW(), last_updated=NOW()
     WHERE sheriff_number=$1`,
    [
      sheriffNumber,
      marketValueUsed, marketValueSource,
      metrics.estimatedSpread, metrics.discountPercent, metrics.equityMultiple,
      metrics.dealRating, metrics.dealScore, warnings,
      redfinSearchUrl,
    ],
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
