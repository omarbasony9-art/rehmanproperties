/**
 * Deal scoring and rating — deterministic financial calculations only.
 * NO AI. NO LLM. Rules only.
 *
 * Rating thresholds (spec 2026-08-17):
 *   EXTREME: discountPercent >= 40 AND spread >= 100,000
 *   MAJOR:   discountPercent >= 30 AND spread >= 75,000
 *   STRONG:  discountPercent >= 20 AND spread >= 50,000
 *   NORMAL:  valuation exists but doesn't qualify above
 *   UNKNOWN: no reliable valuation
 *
 * Score components (0–100):
 *   Discount %   → max 50 pts
 *   Dollar spread → max 30 pts
 *   Lower upset  → max 10 pts  ($0=10pts, $280k=0pts)
 *   Data quality → max 10 pts
 *
 * If upsetAmount or estimatedMarketValue is missing:
 *   dealScore = null, dealRating = "UNKNOWN"
 */

export type DealRating = "EXTREME" | "MAJOR" | "STRONG" | "NORMAL" | "UNKNOWN";

export type DealWarning =
  | "KNOWN_PRIOR_LIEN"
  | "TAX_LIEN"
  | "MUNICIPAL_LIEN"
  | "HOA_LIEN"
  | "OWNER_OCCUPIED"
  | "UNKNOWN_MARKET_VALUE"
  | "MISSING_UPSET_AMOUNT"
  | "PROPERTY_DATA_MISSING";

export interface DealMetrics {
  dealRating: DealRating;
  /** null when valuation is missing */
  dealScore: number | null;
  estimatedSpread: number | null;
  /** Rounded to 1 decimal place */
  discountPercent: number | null;
  equityMultiple: number | null;
}

export function scoreDeal(
  upsetAmount: number | null,
  estimatedMarketValue: number | null,
): DealMetrics {
  if (!upsetAmount || !estimatedMarketValue || estimatedMarketValue <= 0) {
    return {
      dealRating: "UNKNOWN",
      dealScore: null,
      estimatedSpread: null,
      discountPercent: null,
      equityMultiple: null,
    };
  }

  const spread    = estimatedMarketValue - upsetAmount;
  const discount  = (spread / estimatedMarketValue) * 100;
  const multiple  = estimatedMarketValue / upsetAmount;

  // Rating — evaluated in priority order: EXTREME > MAJOR > STRONG > NORMAL
  let rating: DealRating = "NORMAL";
  if (discount >= 40 && spread >= 100_000) {
    rating = "EXTREME";
  } else if (discount >= 30 && spread >= 75_000) {
    rating = "MAJOR";
  } else if (discount >= 20 && spread >= 50_000) {
    rating = "STRONG";
  }

  // Score (0–100)
  const discountPts = Math.min(50, Math.max(0, discount));
  const spreadPts   = Math.min(30, Math.max(0, (spread / 150_000) * 30));
  const upsetPts    = Math.min(10, Math.max(0, ((280_000 - upsetAmount) / 280_000) * 10));
  const dataPts     = 10; // full score when both values are present

  const score = Math.round(discountPts + spreadPts + upsetPts + dataPts);

  return {
    dealRating:      rating,
    dealScore:       Math.min(100, score),
    estimatedSpread: Math.round(spread * 100) / 100,
    discountPercent: Math.round(discount * 10) / 10,   // 1 decimal
    equityMultiple:  Math.round(multiple * 100) / 100,
  };
}

/**
 * Compute deal warnings from raw property fields.
 * Warnings are informational — they do NOT downgrade or exclude deals.
 */
export function computeWarnings(opts: {
  priorsLiensTaxes?: string | null;
  upsetAmount?: number | null;
  estimatedMarketValue?: number | null;
  occupancyStatus?: string | null;
  propertyValuationAvailable?: boolean;
}): DealWarning[] {
  const warnings: DealWarning[] = [];
  const priors = (opts.priorsLiensTaxes ?? "").toLowerCase();

  if (!opts.upsetAmount)           warnings.push("MISSING_UPSET_AMOUNT");
  if (!opts.estimatedMarketValue)  warnings.push("UNKNOWN_MARKET_VALUE");
  if (!opts.propertyValuationAvailable) warnings.push("PROPERTY_DATA_MISSING");

  if (/tax\s+lien|tax\s+sale\s+cert/i.test(priors))    warnings.push("TAX_LIEN");
  if (/municipal\s+lien|municipality/i.test(priors))    warnings.push("MUNICIPAL_LIEN");
  if (/hoa|homeowner|condominium\s+assoc/i.test(priors)) warnings.push("HOA_LIEN");
  if (/prior\s+mortgage|prior\s+lien|second\s+lien|third\s+lien/i.test(priors)) {
    warnings.push("KNOWN_PRIOR_LIEN");
  }

  const occupancy = (opts.occupancyStatus ?? "").toLowerCase();
  if (/owner\s*occupied/i.test(occupancy)) warnings.push("OWNER_OCCUPIED");

  return [...new Set(warnings)]; // deduplicate
}
