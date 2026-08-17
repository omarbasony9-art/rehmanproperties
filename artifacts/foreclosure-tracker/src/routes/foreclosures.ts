import { Router } from "express";
import { query } from "../db.js";

export const foreclosuresRouter = Router();

/**
 * GET /api/foreclosures
 * Query params: maxUpset, maxMarketValue, type, page, limit
 */
foreclosuresRouter.get("/", async (req, res) => {
  try {
    const maxUpset = req.query["maxUpset"] ? parseFloat(String(req.query["maxUpset"])) : null;
    const maxMarketValue = req.query["maxMarketValue"]
      ? parseFloat(String(req.query["maxMarketValue"]))
      : null;
    const type = req.query["type"] ? String(req.query["type"]) : null;
    // missingUpset=true → only listings where upset_amount IS NULL (detail fetch failed)
    const missingUpset = req.query["missingUpset"] === "true";
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const pageLimit = Math.min(200, Math.max(1, parseInt(String(req.query["limit"] ?? "50"))));
    const offset = (page - 1) * pageLimit;

    const conditions: string[] = ["f.is_removed = FALSE"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (maxUpset != null && !isNaN(maxUpset)) {
      // Only filter where we actually have an upset amount — never exclude null as "0"
      conditions.push(`f.upset_amount IS NOT NULL AND f.upset_amount <= $${paramIdx++}`);
      params.push(maxUpset);
    }

    if (missingUpset) {
      conditions.push(`f.upset_amount IS NULL`);
    }

    if (maxMarketValue != null && !isNaN(maxMarketValue)) {
      conditions.push(`pv.estimated_market_value <= $${paramIdx++}`);
      params.push(maxMarketValue);
    }

    if (type) {
      conditions.push(`f.foreclosure_type = $${paramIdx++}`);
      params.push(type);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = await query(
      `SELECT f.*, pv.estimated_market_value, pv.bedrooms, pv.bathrooms,
              pv.square_feet, pv.year_built, pv.property_type as pv_property_type,
              pv.fetched_at as valuation_fetched_at
       FROM foreclosures f
       LEFT JOIN property_values pv ON pv.sheriff_number = f.sheriff_number
       ${where}
       ORDER BY f.deal_score DESC NULLS LAST, f.current_sale_date ASC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, pageLimit, offset],
    );

    const countRows = await query<{ total: string }>(
      `SELECT COUNT(*) as total
       FROM foreclosures f
       LEFT JOIN property_values pv ON pv.sheriff_number = f.sheriff_number
       ${where}`,
      params,
    );

    const items = rows.map(formatForeclosure);
    res.json({
      total: parseInt(countRows[0]?.total ?? "0"),
      count: parseInt(countRows[0]?.total ?? "0"),
      page,
      limit: pageLimit,
      items,
    });
  } catch (err) {
    console.error("[GET /foreclosures]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/foreclosures/:sheriffNumber
 */
foreclosuresRouter.get("/:sheriffNumber", async (req, res) => {
  try {
    const sheriffNumber = String(req.params["sheriffNumber"]).toUpperCase();

    const rows = await query(
      `SELECT f.*, pv.estimated_market_value, pv.active_listing_price,
              pv.last_sale_price, pv.last_sale_date, pv.tax_assessed_value,
              pv.bedrooms, pv.bathrooms, pv.square_feet, pv.year_built,
              pv.property_type as pv_property_type, pv.comparable_sales,
              pv.fetched_at as valuation_fetched_at
       FROM foreclosures f
       LEFT JOIN property_values pv ON pv.sheriff_number = f.sheriff_number
       WHERE f.sheriff_number = $1`,
      [sheriffNumber],
    );

    if (!rows.length) {
      res.status(404).json({ error: "Foreclosure not found" });
      return;
    }

    const history = await query<{
      event_date: string | null;
      event_description: string;
    }>(
      `SELECT event_date, event_description FROM status_history
       WHERE sheriff_number=$1 ORDER BY id ASC`,
      [sheriffNumber],
    );

    const record = {
      ...formatForeclosure(rows[0]!),
      statusHistory: history.map((h) => ({
        eventDate: h.event_date,
        eventDescription: h.event_description,
      })),
    };

    res.json(record);
  } catch (err) {
    console.error("[GET /foreclosures/:id]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatForeclosure(row: any): Record<string, unknown> {
  const firstSeenDate = row.first_seen ? new Date(row.first_seen) : null;
  const isNew = firstSeenDate
    ? Date.now() - firstSeenDate.getTime() < 48 * 3_600_000
    : false;

  return {
    sheriffNumber:            row.sheriff_number,
    courtCaseNumber:          row.court_case_number,
    currentSaleDate:          row.current_sale_date,
    originalSaleDate:         row.original_sale_date,
    // Consistent field names matching the frontend Listing interface
    plaintiffName:            row.plaintiff ?? null,
    defendantName:            row.defendant ?? null,
    streetAddress:            row.address ?? null,
    city:                     row.city ?? null,
    state:                    row.state ?? null,
    zipCode:                  row.zip_code ?? null,
    attorney:                 row.attorney ?? null,
    approxJudgment:           row.approx_judgment       ? parseFloat(row.approx_judgment)       : null,
    upsetAmount:              row.upset_amount           ? parseFloat(row.upset_amount)           : null,
    priorsLiensTaxes:         row.priors_liens_taxes ?? null,
    taxLot:                   row.tax_lot ?? null,
    block:                    row.block ?? null,
    nearestCrossStreet:       row.nearest_cross_street ?? null,
    occupancyStatus:          row.occupancy_status ?? null,
    propertyNotes:            row.property_notes ?? null,
    detailUrl:                row.detail_url ?? null,
    googleMapsUrl:            row.google_maps_url ?? null,
    zillowUrl:                row.zillow_url ?? null,
    foreclosureType:          row.foreclosure_type ?? null,
    classificationConfidence: row.classification_confidence ?? null,
    classificationEvidence:   row.classification_evidence ?? null,
    dealRating:               row.deal_rating ?? null,
    dealScore:                row.deal_score             ? parseFloat(row.deal_score)             : 0,
    estimatedSpread:          row.estimated_spread       ? parseFloat(row.estimated_spread)       : null,
    discountPercent:          row.discount_percent       ? parseFloat(row.discount_percent)       : null,
    equityMultiple:           row.equity_multiple        ? parseFloat(row.equity_multiple)        : null,
    // Consistent field name: `warnings` (was `dealWarnings`)
    warnings:                 Array.isArray(row.deal_warnings) ? row.deal_warnings : [],
    // Valuation
    estimatedMarketValue:     row.estimated_market_value ? parseFloat(row.estimated_market_value) : null,
    activeListingPrice:       row.active_listing_price   ? parseFloat(row.active_listing_price)   : null,
    lastSalePrice:            row.last_sale_price        ? parseFloat(row.last_sale_price)        : null,
    lastSaleDate:             row.last_sale_date ?? null,
    taxAssessedValue:         row.tax_assessed_value     ? parseFloat(row.tax_assessed_value)     : null,
    bedrooms:                 row.bedrooms               ? parseFloat(row.bedrooms)               : null,
    bathrooms:                row.bathrooms              ? parseFloat(row.bathrooms)              : null,
    squareFeet:               row.square_feet            ? parseFloat(row.square_feet)            : null,
    yearBuilt:                row.year_built             ? parseFloat(row.year_built)             : null,
    propertyType:             row.pv_property_type ?? null,
    valuationFetchedAt:       row.valuation_fetched_at ?? null,
    // Timestamps
    firstSeen:   row.first_seen,
    lastSeen:    row.last_seen,
    lastChanged: row.last_changed,
    lastUpdated: row.last_updated,
    isNew,
    isRemoved:   row.is_removed,
  };
}
