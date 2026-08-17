/**
 * Market value calculation — conservative dual-source logic.
 *
 * Rules (in priority order):
 *   Both Zillow AND Redfin → Math.min(z, r), source = "CONSERVATIVE_ZILLOW_REDFIN"
 *   Only Zillow             → zillowEstimate,  source = "ZILLOW"
 *   Only Redfin             → redfinEstimate,  source = "REDFIN"
 *   Neither                 → null,            source = "NONE"
 *
 * IMPORTANT: null means unknown. Never convert to 0.
 */

export type MarketValueSource =
  | "CONSERVATIVE_ZILLOW_REDFIN"
  | "ZILLOW"
  | "REDFIN"
  | "NONE";

export interface MarketValueResult {
  marketValueUsed: number | null;
  marketValueSource: MarketValueSource;
}

export function calculateMarketValue(
  zillowEstimate: number | null,
  redfinEstimate: number | null,
): MarketValueResult {
  if (zillowEstimate != null && redfinEstimate != null) {
    return {
      marketValueUsed:   Math.min(zillowEstimate, redfinEstimate),
      marketValueSource: "CONSERVATIVE_ZILLOW_REDFIN",
    };
  }
  if (zillowEstimate != null) {
    return { marketValueUsed: zillowEstimate, marketValueSource: "ZILLOW" };
  }
  if (redfinEstimate != null) {
    return { marketValueUsed: redfinEstimate, marketValueSource: "REDFIN" };
  }
  return { marketValueUsed: null, marketValueSource: "NONE" };
}
