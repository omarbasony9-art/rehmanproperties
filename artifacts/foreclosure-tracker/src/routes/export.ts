import { Router } from "express";
import { query } from "../db.js";

export const exportRouter = Router();

// Rating sort order: EXTREME first, then MAJOR, STRONG, NORMAL, UNKNOWN
const RATING_ORDER = `
  CASE f.deal_rating
    WHEN 'EXTREME' THEN 1
    WHEN 'MAJOR'   THEN 2
    WHEN 'STRONG'  THEN 3
    WHEN 'NORMAL'  THEN 4
    ELSE 5
  END
`;

/**
 * GET /api/export/google-sheets
 * Returns a flat array of arrays, Google Apps Script-friendly.
 * First row is the header.
 *
 * Sort: EXTREME → MAJOR → STRONG → NORMAL → UNKNOWN, then deal_score DESC.
 */
exportRouter.get("/google-sheets", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT f.sheriff_number, f.court_case_number, f.current_sale_date,
              f.plaintiff, f.defendant,
              CONCAT_WS(', ', f.address, f.city, f.state, f.zip_code) as full_address,
              f.foreclosure_type, f.approx_judgment, f.upset_amount,
              pv.estimated_market_value,
              f.estimated_spread, f.discount_percent, f.equity_multiple,
              f.deal_rating, f.deal_score, f.deal_warnings,
              f.priors_liens_taxes, f.attorney, f.occupancy_status,
              f.google_maps_url, f.zillow_url, f.detail_url,
              f.valuation_status, f.last_updated
       FROM foreclosures f
       LEFT JOIN property_values pv ON pv.sheriff_number = f.sheriff_number
       WHERE f.is_removed = FALSE
       ORDER BY ${RATING_ORDER}, f.deal_score DESC NULLS LAST`,
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
      "Estimated Market Value",
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
      "CivilView URL",
      "Valuation Status",
      "Last Updated",
    ];

    const data = rows.map((r: Record<string, unknown>) => [
      r["sheriff_number"],
      r["court_case_number"],
      r["current_sale_date"],
      r["plaintiff"],
      r["defendant"],
      r["full_address"],
      r["foreclosure_type"],
      r["approx_judgment"] != null ? parseFloat(String(r["approx_judgment"])) : null,
      r["upset_amount"]    != null ? parseFloat(String(r["upset_amount"]))    : null,
      r["estimated_market_value"] != null ? parseFloat(String(r["estimated_market_value"])) : null,
      r["estimated_spread"]  != null ? parseFloat(String(r["estimated_spread"]))  : null,
      r["discount_percent"]  != null ? parseFloat(String(r["discount_percent"]))  : null,
      r["equity_multiple"]   != null ? parseFloat(String(r["equity_multiple"]))   : null,
      r["deal_rating"],
      r["deal_score"] != null ? parseFloat(String(r["deal_score"])) : null,
      Array.isArray(r["deal_warnings"]) ? (r["deal_warnings"] as string[]).join(", ") : "",
      r["priors_liens_taxes"],
      r["attorney"],
      r["occupancy_status"],
      r["google_maps_url"],
      r["zillow_url"],
      r["detail_url"],
      r["valuation_status"],
      r["last_updated"],
    ]);

    res.json([headers, ...data]);
  } catch (err) {
    console.error("[GET /export/google-sheets]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
