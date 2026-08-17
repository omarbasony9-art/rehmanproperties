/**
 * Market value calculation — conservative multi-source logic.
 *
 * Priority (conservative = lowest value wins when multiple sources agree):
 *   Zillow + Redfin + RentCast → Math.min(z, r, rc), CONSERVATIVE_ALL
 *   Zillow + Redfin             → Math.min(z, r),     CONSERVATIVE_ZILLOW_REDFIN
 *   Zillow + RentCast           → Math.min(z, rc),    CONSERVATIVE_ZILLOW_RENTCAST
 *   Redfin + RentCast           → Math.min(r, rc),    CONSERVATIVE_REDFIN_RENTCAST
 *   Only Zillow                 → zillowEstimate,      ZILLOW
 *   Only Redfin                 → redfinEstimate,      REDFIN
 *   Only RentCast               → rentcastEstimate,    RENTCAST
 *   None                        → null,                NONE
 *
 * IMPORTANT: null means unknown. Never convert to 0.
 */

export type MarketValueSource =
  | "CONSERVATIVE_ALL"
  | "CONSERVATIVE_ZILLOW_REDFIN"
  | "CONSERVATIVE_ZILLOW_RENTCAST"
  | "CONSERVATIVE_REDFIN_RENTCAST"
  | "ZILLOW"
  | "REDFIN"
  | "RENTCAST"
  | "NONE";

export interface MarketValueResult {
  marketValueUsed:   number | null;
  marketValueSource: MarketValueSource;
}

export function calculateMarketValue(
  zillowEstimate:   number | null,
  redfinEstimate:   number | null,
  rentcastEstimate: number | null = null,
): MarketValueResult {
  const z  = zillowEstimate;
  const r  = redfinEstimate;
  const rc = rentcastEstimate;

  if (z != null && r != null && rc != null) {
    return { marketValueUsed: Math.min(z, r, rc), marketValueSource: "CONSERVATIVE_ALL" };
  }
  if (z != null && r != null) {
    return { marketValueUsed: Math.min(z, r), marketValueSource: "CONSERVATIVE_ZILLOW_REDFIN" };
  }
  if (z != null && rc != null) {
    return { marketValueUsed: Math.min(z, rc), marketValueSource: "CONSERVATIVE_ZILLOW_RENTCAST" };
  }
  if (r != null && rc != null) {
    return { marketValueUsed: Math.min(r, rc), marketValueSource: "CONSERVATIVE_REDFIN_RENTCAST" };
  }
  if (z != null)  return { marketValueUsed: z,  marketValueSource: "ZILLOW" };
  if (r != null)  return { marketValueUsed: r,  marketValueSource: "REDFIN" };
  if (rc != null) return { marketValueUsed: rc, marketValueSource: "RENTCAST" };

  return { marketValueUsed: null, marketValueSource: "NONE" };
}
