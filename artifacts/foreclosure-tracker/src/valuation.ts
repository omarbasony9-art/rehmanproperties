/**
 * Property valuation provider abstraction.
 * Currently supports RentCast via RENTCAST_API_KEY.
 * Cache TTL: 7 days per property.
 *
 * valuationStatus values:
 *   SUCCESS    — RentCast returned a price estimate
 *   NOT_FOUND  — RentCast could not identify the property
 *   ERROR      — Network/API error
 *   SKIPPED    — No API key configured, or upset_amount > $280k threshold
 *   UNKNOWN    — Not yet attempted
 */

import { query } from "./db.js";

const CACHE_TTL_DAYS = 7;

export type ValuationStatus = "SUCCESS" | "NOT_FOUND" | "ERROR" | "SKIPPED" | "UNKNOWN";

export interface ValuationResult {
  estimatedMarketValue: number | null;
  activeListingPrice: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  taxAssessedValue: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  comparableSales: unknown[] | null;
  valuationStatus: ValuationStatus;
  provider: string;
  fetchedAt: string;
}

/**
 * Look up property valuation.
 *
 * Returns cached value if available and fresh (< 7 days old).
 * Returns null if no API key configured or lookup fails.
 *
 * The caller is responsible for the upsetAmount threshold check —
 * this function always attempts if called.
 */
export async function lookupValuation(
  sheriffNumber: string,
  address: string,
  city: string,
  state: string,
  zip: string,
): Promise<ValuationResult | null> {
  // Check DB cache first
  const cached = await getCached(sheriffNumber);
  if (cached) return cached;

  const apiKey = process.env["RENTCAST_API_KEY"];
  if (!apiKey) {
    console.log(`[valuation] No RENTCAST_API_KEY — skipping ${sheriffNumber}`);
    await setValuationStatus(sheriffNumber, "SKIPPED");
    return null;
  }

  const result = await fetchRentCast(apiKey, address, city, state, zip);
  if (result) {
    await upsertCache(sheriffNumber, result);
    await setValuationStatus(sheriffNumber, result.valuationStatus);
  }
  return result;
}

/**
 * Manually trigger valuation for a specific property regardless of upset threshold.
 * Used by POST /api/foreclosures/:sheriffNumber/valuation.
 */
export async function forceValuation(
  sheriffNumber: string,
  address: string,
  city: string,
  state: string,
  zip: string,
  force = false,
): Promise<{ result: ValuationResult | null; status: ValuationStatus }> {
  if (!force) {
    // Still respect the 7-day cache unless force=true
    const cached = await getCached(sheriffNumber);
    if (cached) return { result: cached, status: cached.valuationStatus };
  }

  const apiKey = process.env["RENTCAST_API_KEY"];
  if (!apiKey) {
    return { result: null, status: "SKIPPED" };
  }

  const result = await fetchRentCast(apiKey, address, city, state, zip);
  const status: ValuationStatus = result?.valuationStatus ?? "ERROR";
  if (result) {
    await upsertCache(sheriffNumber, result);
  }
  await setValuationStatus(sheriffNumber, status);
  return { result, status };
}

async function setValuationStatus(sheriffNumber: string, status: ValuationStatus): Promise<void> {
  try {
    await query(
      `UPDATE foreclosures SET valuation_status=$2, last_updated=NOW() WHERE sheriff_number=$1`,
      [sheriffNumber, status],
    );
  } catch (err) {
    console.error("[valuation] Status update error:", err);
  }
}

async function getCached(sheriffNumber: string): Promise<ValuationResult | null> {
  try {
    const rows = await query<{
      estimated_market_value: string | null;
      active_listing_price:   string | null;
      last_sale_price:        string | null;
      last_sale_date:         string | null;
      tax_assessed_value:     string | null;
      bedrooms:               string | null;
      bathrooms:              string | null;
      square_feet:            string | null;
      year_built:             string | null;
      property_type:          string | null;
      comparable_sales:       unknown[] | null;
      provider:               string;
      fetched_at:             Date;
      valuation_status:       string | null;
    }>(
      `SELECT pv.*, f.valuation_status
       FROM property_values pv
       JOIN foreclosures f ON f.sheriff_number = pv.sheriff_number
       WHERE pv.sheriff_number = $1
         AND pv.fetched_at > NOW() - INTERVAL '${CACHE_TTL_DAYS} days'`,
      [sheriffNumber],
    );

    if (!rows.length) return null;
    const r = rows[0]!;
    return {
      estimatedMarketValue: r.estimated_market_value ? parseFloat(r.estimated_market_value) : null,
      activeListingPrice:   r.active_listing_price   ? parseFloat(r.active_listing_price)   : null,
      lastSalePrice:        r.last_sale_price         ? parseFloat(r.last_sale_price)         : null,
      lastSaleDate:         r.last_sale_date,
      taxAssessedValue:     r.tax_assessed_value      ? parseFloat(r.tax_assessed_value)      : null,
      bedrooms:             r.bedrooms                ? parseFloat(r.bedrooms)                : null,
      bathrooms:            r.bathrooms               ? parseFloat(r.bathrooms)               : null,
      squareFeet:           r.square_feet             ? parseFloat(r.square_feet)             : null,
      yearBuilt:            r.year_built              ? parseFloat(r.year_built)              : null,
      propertyType:         r.property_type,
      comparableSales:      r.comparable_sales,
      valuationStatus:      (r.valuation_status as ValuationStatus) ?? "SUCCESS",
      provider:             r.provider,
      fetchedAt:            r.fetched_at.toISOString(),
    };
  } catch (err) {
    console.error("[valuation] Cache read error:", err);
    return null;
  }
}

async function fetchRentCast(
  apiKey: string,
  address: string,
  city: string,
  state: string,
  zip: string,
): Promise<ValuationResult | null> {
  // Normalize address for RentCast
  const normalizedAddress = `${address.trim()}, ${city.trim()}, ${state.trim()} ${zip.trim()}`;

  try {
    // Primary: AVM (automated valuation model)
    const avmParams = new URLSearchParams({
      address:      normalizedAddress,
      propertyType: "Single Family",
      compCount:    "5",
    });

    const avmResp = await fetch(
      `https://api.rentcast.io/v1/properties/value?${avmParams}`,
      { headers: { "X-Api-Key": apiKey, Accept: "application/json" } },
    );

    if (avmResp.status === 404 || avmResp.status === 422) {
      console.warn(`[valuation] RentCast property not found: ${normalizedAddress}`);
      return {
        estimatedMarketValue: null,
        activeListingPrice:   null,
        lastSalePrice:        null,
        lastSaleDate:         null,
        taxAssessedValue:     null,
        bedrooms:             null,
        bathrooms:            null,
        squareFeet:           null,
        yearBuilt:            null,
        propertyType:         null,
        comparableSales:      null,
        valuationStatus:      "NOT_FOUND",
        provider:             "rentcast",
        fetchedAt:            new Date().toISOString(),
      };
    }

    if (!avmResp.ok) {
      console.warn(`[valuation] RentCast AVM ${avmResp.status} for ${normalizedAddress}`);
      return {
        estimatedMarketValue: null,
        activeListingPrice:   null,
        lastSalePrice:        null,
        lastSaleDate:         null,
        taxAssessedValue:     null,
        bedrooms:             null,
        bathrooms:            null,
        squareFeet:           null,
        yearBuilt:            null,
        propertyType:         null,
        comparableSales:      null,
        valuationStatus:      "ERROR",
        provider:             "rentcast",
        fetchedAt:            new Date().toISOString(),
      };
    }

    const avmData = (await avmResp.json()) as Record<string, unknown>;

    // Secondary: property details (bedrooms/baths/sqft)
    let detail: Record<string, unknown> = {};
    try {
      const detailParams = new URLSearchParams({ address: normalizedAddress });
      const detailResp = await fetch(
        `https://api.rentcast.io/v1/properties?${detailParams}`,
        { headers: { "X-Api-Key": apiKey, Accept: "application/json" } },
      );
      if (detailResp.ok) {
        const detailData = await detailResp.json() as unknown;
        if (Array.isArray(detailData) && detailData.length > 0) {
          detail = detailData[0] as Record<string, unknown>;
        }
      }
    } catch {
      // Non-fatal — AVM data is sufficient for deal scoring
    }

    return {
      estimatedMarketValue: numOrNull(avmData["price"]),
      activeListingPrice:   numOrNull(detail["listPrice"]),
      lastSalePrice:        numOrNull(detail["lastSalePrice"]),
      lastSaleDate:         strOrNull(detail["lastSaleDate"]),
      taxAssessedValue:     numOrNull(detail["assessedValue"]),
      bedrooms:             numOrNull(detail["bedrooms"]),
      bathrooms:            numOrNull(detail["bathrooms"]),
      squareFeet:           numOrNull(detail["squareFootage"]),
      yearBuilt:            numOrNull(detail["yearBuilt"]),
      propertyType:         strOrNull(detail["propertyType"]),
      comparableSales:      Array.isArray(avmData["comparables"]) ? (avmData["comparables"] as unknown[]) : null,
      valuationStatus:      "SUCCESS",
      provider:             "rentcast",
      fetchedAt:            new Date().toISOString(),
    };
  } catch (err) {
    console.error("[valuation] RentCast fetch error:", err);
    return {
      estimatedMarketValue: null,
      activeListingPrice:   null,
      lastSalePrice:        null,
      lastSaleDate:         null,
      taxAssessedValue:     null,
      bedrooms:             null,
      bathrooms:            null,
      squareFeet:           null,
      yearBuilt:            null,
      propertyType:         null,
      comparableSales:      null,
      valuationStatus:      "ERROR",
      provider:             "rentcast",
      fetchedAt:            new Date().toISOString(),
    };
  }
}

async function upsertCache(
  sheriffNumber: string,
  v: ValuationResult,
): Promise<void> {
  try {
    await query(
      `INSERT INTO property_values
         (sheriff_number, estimated_market_value, active_listing_price, last_sale_price,
          last_sale_date, tax_assessed_value, bedrooms, bathrooms, square_feet, year_built,
          property_type, comparable_sales, provider, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (sheriff_number) DO UPDATE SET
         estimated_market_value = EXCLUDED.estimated_market_value,
         active_listing_price   = EXCLUDED.active_listing_price,
         last_sale_price        = EXCLUDED.last_sale_price,
         last_sale_date         = EXCLUDED.last_sale_date,
         tax_assessed_value     = EXCLUDED.tax_assessed_value,
         bedrooms               = EXCLUDED.bedrooms,
         bathrooms              = EXCLUDED.bathrooms,
         square_feet            = EXCLUDED.square_feet,
         year_built             = EXCLUDED.year_built,
         property_type          = EXCLUDED.property_type,
         comparable_sales       = EXCLUDED.comparable_sales,
         provider               = EXCLUDED.provider,
         fetched_at             = NOW()`,
      [
        sheriffNumber,
        v.estimatedMarketValue,
        v.activeListingPrice,
        v.lastSalePrice,
        v.lastSaleDate,
        v.taxAssessedValue,
        v.bedrooms,
        v.bathrooms,
        v.squareFeet,
        v.yearBuilt,
        v.propertyType,
        v.comparableSales ? JSON.stringify(v.comparableSales) : null,
        v.provider,
      ],
    );
  } catch (err) {
    console.error("[valuation] Cache write error:", err);
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
