/**
 * Property valuation provider abstraction.
 * Currently supports RentCast via RENTCAST_API_KEY.
 * Cache TTL: 7 days.
 * Never calls the API if cached value is fresh.
 */

import { query } from "./db.js";

const CACHE_TTL_DAYS = 7;

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
  provider: string;
  fetchedAt: string;
}

/**
 * Look up property valuation.
 * Returns cached value if available and fresh (< 7 days old).
 * Returns null if no API key configured or lookup fails.
 */
export async function lookupValuation(
  sheriffNumber: string,
  address: string,
  city: string,
  state: string,
  zip: string,
): Promise<ValuationResult | null> {
  // Check cache first
  const cached = await getCached(sheriffNumber);
  if (cached) return cached;

  const apiKey = process.env["RENTCAST_API_KEY"];
  if (!apiKey) {
    console.log(`[valuation] No RENTCAST_API_KEY — skipping valuation for ${sheriffNumber}`);
    return null;
  }

  const result = await fetchRentCast(apiKey, address, city, state, zip);
  if (result) {
    await upsertCache(sheriffNumber, result);
  }
  return result;
}

async function getCached(sheriffNumber: string): Promise<ValuationResult | null> {
  try {
    const rows = await query<{
      estimated_market_value: string | null;
      active_listing_price: string | null;
      last_sale_price: string | null;
      last_sale_date: string | null;
      tax_assessed_value: string | null;
      bedrooms: string | null;
      bathrooms: string | null;
      square_feet: string | null;
      year_built: string | null;
      property_type: string | null;
      comparable_sales: unknown[] | null;
      provider: string;
      fetched_at: Date;
    }>(
      `SELECT * FROM property_values
       WHERE sheriff_number = $1
         AND fetched_at > NOW() - INTERVAL '${CACHE_TTL_DAYS} days'`,
      [sheriffNumber],
    );

    if (!rows.length) return null;
    const r = rows[0]!;
    return {
      estimatedMarketValue: r.estimated_market_value ? parseFloat(r.estimated_market_value) : null,
      activeListingPrice: r.active_listing_price ? parseFloat(r.active_listing_price) : null,
      lastSalePrice: r.last_sale_price ? parseFloat(r.last_sale_price) : null,
      lastSaleDate: r.last_sale_date,
      taxAssessedValue: r.tax_assessed_value ? parseFloat(r.tax_assessed_value) : null,
      bedrooms: r.bedrooms ? parseFloat(r.bedrooms) : null,
      bathrooms: r.bathrooms ? parseFloat(r.bathrooms) : null,
      squareFeet: r.square_feet ? parseFloat(r.square_feet) : null,
      yearBuilt: r.year_built ? parseFloat(r.year_built) : null,
      propertyType: r.property_type,
      comparableSales: r.comparable_sales,
      provider: r.provider,
      fetchedAt: r.fetched_at.toISOString(),
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
  try {
    const params = new URLSearchParams({
      address: `${address}, ${city}, ${state} ${zip}`,
      propertyType: "Single Family",
      compCount: "5",
    });

    const resp = await fetch(
      `https://api.rentcast.io/v1/properties/value?${params}`,
      {
        headers: {
          "X-Api-Key": apiKey,
          "Accept": "application/json",
        },
      },
    );

    if (!resp.ok) {
      console.warn(
        `[valuation] RentCast returned ${resp.status} for ${address}`,
      );
      return null;
    }

    const data = (await resp.json()) as Record<string, unknown>;

    // Also fetch property details for bedrooms/baths/sqft
    const detailParams = new URLSearchParams({ address: `${address}, ${city}, ${state} ${zip}` });
    const detailResp = await fetch(
      `https://api.rentcast.io/v1/properties?${detailParams}`,
      {
        headers: {
          "X-Api-Key": apiKey,
          "Accept": "application/json",
        },
      },
    );
    let detail: Record<string, unknown> = {};
    if (detailResp.ok) {
      const detailData = await detailResp.json() as unknown;
      if (Array.isArray(detailData) && detailData.length > 0) {
        detail = detailData[0] as Record<string, unknown>;
      }
    }

    return {
      estimatedMarketValue: numOrNull(data["price"]),
      activeListingPrice: numOrNull(detail["listPrice"]),
      lastSalePrice: numOrNull(detail["lastSalePrice"]),
      lastSaleDate: strOrNull(detail["lastSaleDate"]),
      taxAssessedValue: numOrNull(detail["assessedValue"]),
      bedrooms: numOrNull(detail["bedrooms"]),
      bathrooms: numOrNull(detail["bathrooms"]),
      squareFeet: numOrNull(detail["squareFootage"]),
      yearBuilt: numOrNull(detail["yearBuilt"]),
      propertyType: strOrNull(detail["propertyType"]),
      comparableSales: Array.isArray(data["comparables"]) ? (data["comparables"] as unknown[]) : null,
      provider: "rentcast",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[valuation] RentCast fetch error:", err);
    return null;
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
