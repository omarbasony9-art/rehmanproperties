import { Router } from "express";
import { query } from "../db.js";

export const dealsRouter = Router();

const RATING_ORDER = `
  CASE deal_rating
    WHEN 'EXTREME' THEN 1
    WHEN 'MAJOR'   THEN 2
    WHEN 'STRONG'  THEN 3
    ELSE 4
  END
`;

/**
 * GET /api/deals
 * Returns EXTREME, MAJOR, STRONG deals sorted by dealScore DESC, discountPercent DESC.
 * Params: rating, minimumDiscount, minimumSpread, maxUpset
 */
dealsRouter.get("/", async (req, res) => {
  try {
    const rating      = req.query["rating"]         ? String(req.query["rating"]).toUpperCase()       : null;
    const minDiscount = req.query["minimumDiscount"] ? parseFloat(String(req.query["minimumDiscount"])) : null;
    const minSpread   = req.query["minimumSpread"]   ? parseFloat(String(req.query["minimumSpread"]))   : null;
    const maxUpset    = req.query["maxUpset"]         ? parseFloat(String(req.query["maxUpset"]))       : null;

    const conditions: string[] = ["is_removed = FALSE", "deal_rating IN ('EXTREME','MAJOR','STRONG')"];
    const params: unknown[] = [];
    let pi = 1;

    if (rating && ["EXTREME","MAJOR","STRONG"].includes(rating)) {
      conditions.push(`deal_rating = $${pi++}`); params.push(rating);
    }
    if (minDiscount != null && !isNaN(minDiscount)) {
      conditions.push(`discount_percent >= $${pi++}`); params.push(minDiscount);
    }
    if (minSpread != null && !isNaN(minSpread)) {
      conditions.push(`estimated_spread >= $${pi++}`); params.push(minSpread);
    }
    if (maxUpset != null && !isNaN(maxUpset)) {
      conditions.push(`upset_amount IS NOT NULL AND upset_amount <= $${pi++}`); params.push(maxUpset);
    }

    const rows = await query(
      `SELECT * FROM foreclosures
       WHERE ${conditions.join(" AND ")}
       ORDER BY upset_amount ASC NULLS LAST`,
      params,
    );

    const items = rows.map(formatDeal);
    res.json({ items, count: items.length });
  } catch (err) {
    console.error("[GET /deals]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

dealsRouter.get("/new", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM foreclosures
       WHERE is_removed = FALSE
         AND deal_rating IN ('EXTREME','MAJOR','STRONG')
         AND first_seen > NOW() - INTERVAL '48 hours'
       ORDER BY upset_amount ASC NULLS LAST`,
    );
    const items = rows.map(formatDeal);
    res.json({ items, count: items.length });
  } catch (err) {
    console.error("[GET /deals/new]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDeal(row: any): Record<string, unknown> {
  const num = (v: unknown) => (v != null ? parseFloat(String(v)) : null);
  const isNew = row.first_seen
    ? Date.now() - new Date(row.first_seen).getTime() < 48 * 3_600_000
    : false;

  return {
    sheriffNumber:      row.sheriff_number,
    courtCaseNumber:    row.court_case_number ?? null,
    currentSaleDate:    row.current_sale_date ?? null,
    plaintiffName:      row.plaintiff ?? null,
    defendantName:      row.defendant ?? null,
    streetAddress:      row.address ?? null,
    city:               row.city ?? null,
    state:              row.state ?? null,
    zipCode:            row.zip_code ?? null,
    upsetAmount:        num(row.upset_amount),
    approxJudgment:     num(row.approx_judgment),
    foreclosureType:    row.foreclosure_type ?? null,
    // Valuation
    zillowEstimate:     num(row.zillow_estimate),
    zillowStatus:       row.zillow_status ?? "NOT_CONFIGURED",
    redfinEstimate:     num(row.redfin_estimate),
    redfinStatus:       row.redfin_status ?? "NOT_CONFIGURED",
    marketValueUsed:    num(row.market_value_used),
    marketValueSource:  row.market_value_source ?? "NONE",
    // Deal
    estimatedSpread:    num(row.estimated_spread),
    discountPercent:    num(row.discount_percent),
    equityMultiple:     num(row.equity_multiple),
    dealRating:         row.deal_rating ?? "UNKNOWN",
    dealScore:          num(row.deal_score),
    dealWarnings:       Array.isArray(row.deal_warnings) ? row.deal_warnings : [],
    warnings:           Array.isArray(row.deal_warnings) ? row.deal_warnings : [],
    // Links
    detailUrl:          row.detail_url ?? null,
    googleMapsUrl:      row.google_maps_url ?? null,
    redfinPropertyUrl:  row.redfin_property_url ?? null,
    zillowPropertyUrl:  row.zillow_property_url ?? null,
    // Timestamps
    firstSeen:  row.first_seen ?? null,
    lastChanged: row.last_changed ?? null,
    isNew,
  };
}
