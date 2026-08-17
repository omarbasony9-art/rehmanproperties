import { Router } from "express";
import { query } from "../db.js";

export const exportRouter = Router();

const RATING_ORDER = `
  CASE deal_rating
    WHEN 'EXTREME' THEN 1
    WHEN 'MAJOR'   THEN 2
    WHEN 'STRONG'  THEN 3
    WHEN 'NORMAL'  THEN 4
    ELSE 5
  END
`;

/**
 * GET /api/export/google-sheets
 * Flat array of arrays for Google Apps Script import.
 * Row 0 = headers.
 * Sort: EXTREME → MAJOR → STRONG → NORMAL → UNKNOWN, then deal_score DESC.
 */
exportRouter.get("/google-sheets", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT sheriff_number, court_case_number, current_sale_date,
              plaintiff, defendant,
              CONCAT_WS(', ', address, city, state, zip_code) AS full_address,
              foreclosure_type, approx_judgment, upset_amount,
              zillow_estimate, zillow_status,
              redfin_estimate, redfin_status,
              market_value_used, market_value_source,
              estimated_spread, discount_percent, equity_multiple,
              deal_rating, deal_score, deal_warnings,
              priors_liens_taxes, attorney, occupancy_status,
              google_maps_url, zillow_url, redfin_property_url, detail_url,
              valuation_updated_at, last_updated
       FROM foreclosures
       WHERE is_removed = FALSE
       ORDER BY ${RATING_ORDER}, deal_score DESC NULLS LAST`,
    );

    const headers = [
      "Sheriff #",
      "Court Case #",
      "Sale Date",
      "Plaintiff",
      "Defendant",
      "Address",
      "Foreclosure Type",
      "Approx Judgment",
      "Upset Amount",
      "Zillow Estimate",
      "Zillow Status",
      "Redfin Estimate",
      "Redfin Status",
      "Market Value Used",
      "Market Value Source",
      "Potential Spread",
      "Discount %",
      "Equity Multiple",
      "Deal Rating",
      "Deal Score",
      "Warnings",
      "Priors/Liens/Taxes",
      "Attorney",
      "Occupancy",
      "Google Maps",
      "Zillow Search",
      "Redfin Search",
      "CivilView URL",
      "Valuation Updated",
      "Last Updated",
    ];

    const num = (v: unknown) => (v != null ? parseFloat(String(v)) : null);

    const data = (rows as Record<string, unknown>[]).map((r) => [
      r["sheriff_number"],
      r["court_case_number"],
      r["current_sale_date"],
      r["plaintiff"],
      r["defendant"],
      r["full_address"],
      r["foreclosure_type"],
      num(r["approx_judgment"]),
      num(r["upset_amount"]),
      num(r["zillow_estimate"]),
      r["zillow_status"],
      num(r["redfin_estimate"]),
      r["redfin_status"],
      num(r["market_value_used"]),
      r["market_value_source"],
      num(r["estimated_spread"]),
      num(r["discount_percent"]),
      num(r["equity_multiple"]),
      r["deal_rating"],
      num(r["deal_score"]),
      Array.isArray(r["deal_warnings"]) ? (r["deal_warnings"] as string[]).join(", ") : "",
      r["priors_liens_taxes"],
      r["attorney"],
      r["occupancy_status"],
      r["google_maps_url"],
      r["zillow_url"],
      r["redfin_property_url"],
      r["detail_url"],
      r["valuation_updated_at"],
      r["last_updated"],
    ]);

    res.json([headers, ...data]);
  } catch (err) {
    console.error("[GET /export/google-sheets]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
