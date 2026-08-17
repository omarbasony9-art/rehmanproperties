/**
 * Deal scoring and rating — deterministic financial calculations only.
 * NO AI.
 */

export type DealRating = "EXTREME" | "MAJOR" | "STRONG" | "NORMAL" | "UNKNOWN";

export type DealWarning =
  | "KNOWN_PRIOR_LIEN"
  | "TAX_LIEN"
  | "MUNICIPAL_LIEN"
  | "HOA_LIEN"
  | "UNKNOWN_MARKET_VALUE"
  | "NO_UPSET_AMOUNT"
  | "OWNER_OCCUPIED"
  | "PROPERTY_DATA_MISSING";

export interface DealMetrics {
  dealRating: DealRating;
  dealScore: number;
  estimatedSpread: number | null;
  discountPercent: number | null;
  equityMultiple: number | null;
}

/**
 * Calculate deal rating and score.
 *
 * Note: A property can still be a major deal while having warnings.
 * Warnings are informational — they do NOT downgrade or exclude deals.
 *
 * EXTREME: discountPercent >= 40 AND spread >= 100,000
 *   (also counts as MAJOR, but displayed rating is EXTREME)
 * MAJOR:   upsetAmount <= 280,000 AND discountPercent >= 30 AND spread >= 75,000
 * STRONG:  discountPercent >= 20 AND spread >= 50,000
 * NORMAL:  everything else when data is available
 * UNKNOWN: no upsetAmount or no estimatedMarketValue
 */
export function scoreDeal(
  upsetAmount: number | null,
  estimatedMarketValue: number | null,
): DealMetrics {
  if (!upsetAmount || !estimatedMarketValue || estimatedMarketValue <= 0) {
    return {
      dealRating: "UNKNOWN",
      dealScore: 0,
      estimatedSpread: null,
      discountPercent: null,
      equityMultiple: null,
    };
  }

  const spread = estimatedMarketValue - upsetAmount;
  const discount = (spread / estimatedMarketValue) * 100;
  const multiple = estimatedMarketValue / upsetAmount;

  // Rating
  let rating: DealRating = "NORMAL";
  if (discount >= 40 && spread >= 100_000) {
    rating = "EXTREME";
  } else if (upsetAmount <= 280_000 && discount >= 30 && spread >= 75_000) {
    rating = "MAJOR";
  } else if (discount >= 20 && spread >= 50_000) {
    rating = "STRONG";
  }

  // Score (0–100)
  // Discount % → up to 50 pts  (50% discount = 50 pts, capped)
  const discountPts = Math.min(50, Math.max(0, discount));

  // Dollar spread → up to 30 pts  ($150k spread = 30 pts, capped)
  const spreadPts = Math.min(30, Math.max(0, (spread / 150_000) * 30));

  // Low upset amount → up to 10 pts  ($0 = 10 pts, $280k = 0 pts, capped)
  const upsetPts = Math.min(
    10,
    Math.max(0, ((280_000 - upsetAmount) / 280_000) * 10),
  );

  // Property data confidence → 10 pts (always full when we have MV)
  const dataPts = 10;

  const score = Math.round(discountPts + spreadPts + upsetPts + dataPts);

  return {
    dealRating: rating,
    dealScore: Math.min(100, score),
    estimatedSpread: Math.round(spread * 100) / 100,
    discountPercent: Math.round(discount * 100) / 100,
    equityMultiple: Math.round(multiple * 100) / 100,
  };
}

/**
 * Compute deal warnings from raw property fields.
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

  if (!opts.upsetAmount) warnings.push("NO_UPSET_AMOUNT");
  if (!opts.estimatedMarketValue) warnings.push("UNKNOWN_MARKET_VALUE");
  if (!opts.propertyValuationAvailable) warnings.push("PROPERTY_DATA_MISSING");

  if (/tax\s+lien|tax\s+sale\s+cert/i.test(priors)) warnings.push("TAX_LIEN");
  if (/municipal\s+lien|municipality/i.test(priors)) warnings.push("MUNICIPAL_LIEN");
  if (/hoa|homeowner|condominium\s+assoc/i.test(priors)) warnings.push("HOA_LIEN");
  if (/prior\s+mortgage|prior\s+lien|second\s+lien|third\s+lien/i.test(priors)) {
    warnings.push("KNOWN_PRIOR_LIEN");
  }

  const occupancy = (opts.occupancyStatus ?? "").toLowerCase();
  if (/owner\s*occupied/i.test(occupancy)) warnings.push("OWNER_OCCUPIED");

  return [...new Set(warnings)]; // deduplicate
}
