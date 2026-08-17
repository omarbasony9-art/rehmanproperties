import { Router } from "express";
import { query } from "../db.js";

export const dealsRouter = Router();

/**
 * GET /api/deals
 * Returns EXTREME, MAJOR, STRONG deals sorted by deal_score DESC.
 * Query params: rating, minimumDiscount, minimumSpread, maxUpset
 */
dealsRouter.get("/", async (req, res) => {
  try {
    const rating = req.query["rating"] ? String(req.query["rating"]).toUpperCase() : null;
    const minDiscount = req.query["minimumDiscount"]
      ? parseFloat(String(req.query["minimumDiscount"]))
      : null;
    const minSpread = req.query["minimumSpread"]
      ? parseFloat(String(req.query["minimumSpread"]))
      : null;
    const maxUpset = req.query["maxUpset"]
      ? parseFloat(String(req.query["maxUpset"]))
      : null;

    const conditions: string[] = [
      "f.is_removed = FALSE",
      "f.deal_rating IN ('EXTREME','MAJOR','STRONG')",
    ];
    const params: unknown[] = [];
    let pi = 1;

    if (rating && ["EXTREME", "MAJOR", "STRONG"].includes(rating)) {
      conditions.push(`f.deal_rating = $${pi++}`);
      params.push(rating);
    }
    if (minDiscount != null && !isNaN(minDiscount)) {
      conditions.push(`f.discount_percent >= $${pi++}`);
      params.push(minDiscount);
    }
    if (minSpread != null && !isNaN(minSpread)) {
      conditions.push(`f.estimated_spread >= $${pi++}`);
      params.push(minSpread);
    }
    if (maxUpset != null && !isNaN(maxUpset)) {
      conditions.push(`f.upset_amount <= $${pi++}`);
      params.push(maxUpset);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const rows = await query(
      `SELECT f.*, pv.estimated_market_value, pv.bedrooms, pv.bathrooms,
              pv.square_feet, pv.year_built, pv.property_type as pv_property_type,
              pv.fetched_at as valuation_fetched_at
       FROM foreclosures f
       LEFT JOIN property_values pv ON pv.sheriff_number = f.sheriff_number
       ${where}
       ORDER BY f.deal_score DESC NULLS LAST`,
      params,
    );

    res.json(rows.map(formatDeal));
  } catch (err) {
    console.error("[GET /deals]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/deals/new
 * Returns major/strong/extreme deals discovered in the past 48 hours.
 */
dealsRouter.get("/new", async (req, res) => {
  try {
    const rows = await query(
      `SELECT f.*, pv.estimated_market_value, pv.bedrooms, pv.bathrooms,
              pv.square_feet, pv.year_built, pv.property_type as pv_property_type,
              pv.fetched_at as valuation_fetched_at
       FROM foreclosures f
       LEFT JOIN property_values pv ON pv.sheriff_number = f.sheriff_number
       WHERE f.is_removed = FALSE
         AND f.deal_rating IN ('EXTREME','MAJOR','STRONG')
         AND f.first_seen > NOW() - INTERVAL '48 hours'
       ORDER BY f.deal_score DESC NULLS LAST`,
    );

    res.json(rows.map(formatDeal));
  } catch (err) {
    console.error("[GET /deals/new]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatDeal(row: any): Record<string, unknown> {
  const firstSeenDate = row.first_seen ? new Date(row.first_seen) : null;
  const isNew = firstSeenDate
    ? Date.now() - firstSeenDate.getTime() < 48 * 3_600_000
    : false;

  return {
    sheriffNumber: row.sheriff_number,
    courtCaseNumber: row.court_case_number,
    currentSaleDate: row.current_sale_date,
    plaintiff: row.plaintiff,
    defendant: row.defendant,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    upsetAmount: row.upset_amount ? parseFloat(row.upset_amount) : null,
    approxJudgment: row.approx_judgment ? parseFloat(row.approx_judgment) : null,
    estimatedMarketValue: row.estimated_market_value
      ? parseFloat(row.estimated_market_value)
      : null,
    foreclosureType: row.foreclosure_type,
    dealRating: row.deal_rating,
    dealScore: row.deal_score ? parseFloat(row.deal_score) : 0,
    estimatedSpread: row.estimated_spread ? parseFloat(row.estimated_spread) : null,
    discountPercent: row.discount_percent ? parseFloat(row.discount_percent) : null,
    equityMultiple: row.equity_multiple ? parseFloat(row.equity_multiple) : null,
    dealWarnings: row.deal_warnings ?? [],
    occupancyStatus: row.occupancy_status,
    detailUrl: row.detail_url,
    googleMapsUrl: row.google_maps_url,
    zillowUrl: row.zillow_url,
    bedrooms: row.bedrooms ? parseFloat(row.bedrooms) : null,
    bathrooms: row.bathrooms ? parseFloat(row.bathrooms) : null,
    squareFeet: row.square_feet ? parseFloat(row.square_feet) : null,
    yearBuilt: row.year_built ? parseFloat(row.year_built) : null,
    firstSeen: row.first_seen,
    lastChanged: row.last_changed,
    isNew,
  };
}
