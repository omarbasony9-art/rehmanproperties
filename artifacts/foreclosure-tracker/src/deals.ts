/**
 * Deal scoring and rating — deterministic financial calculations only.
 * NO AI. NO LLM. Rules only.
 *
 * Rating thresholds (evaluate in order):
 *   EXTREME: discountPercent >= 40 AND estimatedSpread >= $100k
 *   MAJOR:   discountPercent >= 30 AND estimatedSpread >= $75k
 *   STRONG:  discountPercent >= 20 AND estimatedSpread >= $50k
 *   NORMAL:  valid market value exists but doesn't qualify above
 *   UNKNOWN: market value or upset amount is missing
 *
 * Score (0–100):
 *   Discount score   — max 50 pts: min(discountPercent, 50)
 *   Spread score     — max 30 pts: min(spread / 150000 * 30, 30)
 *   Upset score      — max 10 pts: tiered by upset amount
 *   Val. confidence  — max 10 pts: both=10, one=6, none=0
 *
 * dealScore = null when marketValueUsed is missing.
 */

export type DealRating = "EXTREME" | "MAJOR" | "STRONG" | "NORMAL" | "UNKNOWN";

export type DealWarning =
  | "OWNER_OCCUPIED"
  | "TAX_LIEN"
  | "HOA_LIEN"
  | "MUNICIPAL_LIEN"
  | "KNOWN_PRIOR_LIEN"
  | "MISSING_UPSET_AMOUNT"
  | "NO_ZILLOW_ESTIMATE"
  | "NO_REDFIN_ESTIMATE"
  | "VALUATIONS_DIFFER_SIGNIFICANTLY"
  | "MARKET_VALUE_UNKNOWN"
  | "NEGATIVE_SPREAD"
  | "VALUATION_STALE"
  // Data-quality warnings (especially useful for multi-county diagnostics)
  | "UPSET_NOT_FOUND"           // CivilView detail page scraped but no upset value found
  | "ZILLOW_NO_MATCH"           // Zillow API returned no property match
  | "ZILLOW_MISMATCH"           // Zillow returned a property but address doesn't match
  | "REDFIN_NO_MATCH"           // Redfin API returned no property match
  | "REDFIN_MISMATCH"           // Redfin returned a property but address doesn't match
  | "UNIT_MATCH_UNCERTAIN"      // Unit/condo number in address — match confidence reduced
  | "DETAIL_PAGE_FAILED";       // CivilView detail page could not be fetched

export interface DealMetrics {
  dealRating: DealRating;
  /** null when marketValueUsed is missing */
  dealScore: number | null;
  estimatedSpread: number | null;
  /** Rounded to 1 decimal place, null when marketValueUsed is missing */
  discountPercent: number | null;
  equityMultiple: number | null;
}

export function scoreDeal(
  upsetAmount: number | null,
  marketValueUsed: number | null,
  zillowEstimate: number | null,
  redfinEstimate: number | null,
): DealMetrics {
  if (!upsetAmount || !marketValueUsed || marketValueUsed <= 0) {
    return {
      dealRating:      "UNKNOWN",
      dealScore:       null,
      estimatedSpread: null,
      discountPercent: null,
      equityMultiple:  null,
    };
  }

  const spread   = marketValueUsed - upsetAmount;
  const discount = (spread / marketValueUsed) * 100;
  const multiple = marketValueUsed / upsetAmount;

  // Rating — evaluated in priority order
  let rating: DealRating = "NORMAL";
  if (discount >= 40 && spread >= 100_000) {
    rating = "EXTREME";
  } else if (discount >= 30 && spread >= 75_000) {
    rating = "MAJOR";
  } else if (discount >= 20 && spread >= 50_000) {
    rating = "STRONG";
  }

  // Discount score: min(discountPercent, 50)
  const discountScore = Math.min(50, Math.max(0, discount));

  // Spread score: min(spread / 150000 * 30, 30)
  const spreadScore = Math.min(30, Math.max(0, (spread / 150_000) * 30));

  // Upset score — tiered
  let upsetScore = 0;
  if (upsetAmount <= 100_000)       upsetScore = 10;
  else if (upsetAmount <= 150_000)  upsetScore = 8;
  else if (upsetAmount <= 200_000)  upsetScore = 6;
  else if (upsetAmount <= 250_000)  upsetScore = 4;
  else if (upsetAmount <= 280_000)  upsetScore = 2;
  else                              upsetScore = 0;

  // Valuation confidence
  const hasZillow = zillowEstimate != null;
  const hasRedfin = redfinEstimate != null;
  const valConfidence = (hasZillow && hasRedfin) ? 10 : (hasZillow || hasRedfin) ? 6 : 0;

  const rawScore = discountScore + spreadScore + upsetScore + valConfidence;
  const dealScore = Math.min(100, Math.round(rawScore));

  return {
    dealRating:      rating,
    dealScore,
    estimatedSpread: Math.round(spread * 100) / 100,
    discountPercent: Math.round(discount * 10) / 10,
    equityMultiple:  Math.round(multiple * 100) / 100,
  };
}

/**
 * Compute deal warnings from property fields.
 * Warnings are informational — they do NOT exclude deals.
 */
export function computeWarnings(opts: {
  upsetAmount?: number | null;
  zillowEstimate?: number | null;
  zillowStatus?: string | null;
  zillowFetchedAt?: Date | null;
  redfinEstimate?: number | null;
  redfinStatus?: string | null;
  marketValueUsed?: number | null;
  priorsLiensTaxes?: string | null;
  occupancyStatus?: string | null;
}): DealWarning[] {
  const warnings = new Set<DealWarning>();
  const priors   = (opts.priorsLiensTaxes ?? "").toLowerCase();

  // Missing data
  if (!opts.upsetAmount) {
    warnings.add("MISSING_UPSET_AMOUNT");
    warnings.add("UPSET_NOT_FOUND");
  }
  if (!opts.marketValueUsed)     warnings.add("MARKET_VALUE_UNKNOWN");
  // Only flag missing estimates when the provider IS configured (configured but no value = actionable)
  if (opts.zillowStatus && opts.zillowStatus !== "SUCCESS" && opts.zillowStatus !== "NOT_CONFIGURED") {
    warnings.add("NO_ZILLOW_ESTIMATE");
    warnings.add("ZILLOW_NO_MATCH");
  }
  if (opts.redfinStatus && opts.redfinStatus !== "SUCCESS" && opts.redfinStatus !== "NOT_CONFIGURED") {
    warnings.add("NO_REDFIN_ESTIMATE");
    warnings.add("REDFIN_NO_MATCH");
  }

  // Stale Zillow (> 7 days old)
  if (opts.zillowStatus === "SUCCESS" && opts.zillowFetchedAt) {
    const ageDays = (Date.now() - opts.zillowFetchedAt.getTime()) / 86_400_000;
    if (ageDays > 7) warnings.add("VALUATION_STALE");
  }

  // Valuations differ significantly (> 15%)
  if (opts.zillowEstimate != null && opts.redfinEstimate != null) {
    const diff = Math.abs(opts.zillowEstimate - opts.redfinEstimate);
    const pct  = diff / Math.min(opts.zillowEstimate, opts.redfinEstimate);
    if (pct > 0.15) warnings.add("VALUATIONS_DIFFER_SIGNIFICANTLY");
  }

  // Negative spread
  if (opts.marketValueUsed != null && opts.upsetAmount != null && opts.marketValueUsed < opts.upsetAmount) {
    warnings.add("NEGATIVE_SPREAD");
  }

  // Lien flags
  if (/tax\s+lien|tax\s+sale\s+cert/i.test(priors))              warnings.add("TAX_LIEN");
  if (/municipal\s+lien|municipality/i.test(priors))              warnings.add("MUNICIPAL_LIEN");
  if (/hoa|homeowner|condominium\s+assoc/i.test(priors))          warnings.add("HOA_LIEN");
  if (/prior\s+mortgage|prior\s+lien|second\s+lien|third\s+lien/i.test(priors)) {
    warnings.add("KNOWN_PRIOR_LIEN");
  }

  // Occupancy
  if (/owner\s*occupied/i.test(opts.occupancyStatus ?? "")) warnings.add("OWNER_OCCUPIED");

  return [...warnings];
}
