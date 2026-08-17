import { Router } from "express";
import { query } from "../db.js";

export const foreclosuresRouter = Router();

/**
 * Safe whitelist mapping frontend sort keys → actual DB column names.
 * Only columns listed here can be used as sort keys.
 */
const SORT_COLS: Record<string, string> = {
  upset:    "upset_amount",
  score:    "deal_score",
  date:     "current_sale_date",
  market:   "market_value_used",
  spread:   "estimated_spread",
  discount: "discount_percent",
  sheriff:  "sheriff_number",
  address:  "address",
};

/**
 * GET /api/foreclosures
 * Query params: maxUpset, type, rating, missingUpset, unknownValuation, page, limit,
 *               sortBy (key from SORT_COLS, default "upset"), sortDir ("asc"|"desc", default "asc")
 * Response: { total, count, page, limit, items: Listing[] }
 */
foreclosuresRouter.get("/", async (req, res) => {
  try {
    const maxUpset   = req.query["maxUpset"]   ? parseFloat(String(req.query["maxUpset"]))   : null;
    const type       = req.query["type"]       ? String(req.query["type"])                   : null;
    const rating     = req.query["rating"]     ? String(req.query["rating"]).toUpperCase()   : null;
    const county     = req.query["county"]     ? String(req.query["county"])                 : null;
    const missingUpset  = req.query["missingUpset"]      === "true";
    const unknownVal    = req.query["unknownValuation"]  === "true";
    const page      = Math.max(1, parseInt(String(req.query["page"]  ?? "1")));
    const pageLimit = Math.min(200, Math.max(1, parseInt(String(req.query["limit"] ?? "50"))));
    const offset    = (page - 1) * pageLimit;

    // Sort — default: upset_amount ASC
    const sortKey = String(req.query["sortBy"] ?? "upset");
    const sortCol = SORT_COLS[sortKey] ?? "upset_amount";
    const sortDir = String(req.query["sortDir"] ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    const orderBy = `${sortCol} ${sortDir} NULLS LAST`;

    const conditions: string[] = [
      "is_removed = FALSE",
      "permanently_excluded IS NOT TRUE",
    ];
    const params: unknown[] = [];
    let pi = 1;

    if (maxUpset != null && !isNaN(maxUpset)) {
      conditions.push(`upset_amount IS NOT NULL AND upset_amount <= $${pi++}`);
      params.push(maxUpset);
    }
    if (missingUpset) conditions.push(`upset_amount IS NULL`);
    if (type)         { conditions.push(`foreclosure_type = $${pi++}`); params.push(type); }
    if (rating && ["EXTREME","MAJOR","STRONG","NORMAL","UNKNOWN"].includes(rating)) {
      conditions.push(`deal_rating = $${pi++}`);
      params.push(rating);
    }
    if (unknownVal) conditions.push(`deal_rating = 'UNKNOWN'`);
    if (county && ["Atlantic", "Cape May"].includes(county)) {
      conditions.push(`county = $${pi++}`);
      params.push(county);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const rows = await query(
      `SELECT * FROM foreclosures ${where}
       ORDER BY ${orderBy}
       LIMIT $${pi++} OFFSET $${pi++}`,
      [...params, pageLimit, offset],
    );

    const [countRow] = await query<{ total: string }>(
      `SELECT COUNT(*) as total FROM foreclosures ${where}`,
      params,
    );

    const items = rows.map(formatForeclosure);
    res.json({
      total: parseInt(countRow?.total ?? "0"),
      count: parseInt(countRow?.total ?? "0"),
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
    const rows = await query(`SELECT * FROM foreclosures WHERE sheriff_number=$1`, [sheriffNumber]);

    if (!rows.length) {
      res.status(404).json({ error: "Foreclosure not found" });
      return;
    }

    const history = await query<{ event_date: string | null; event_description: string }>(
      `SELECT event_date, event_description FROM status_history
       WHERE sheriff_number=$1 ORDER BY id ASC`,
      [sheriffNumber],
    );

    res.json({
      ...formatForeclosure(rows[0]!),
      statusHistory: history.map((h) => ({
        eventDate: h.event_date,
        eventDescription: h.event_description,
      })),
    });
  } catch (err) {
    console.error("[GET /foreclosures/:id]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatForeclosure(row: any): Record<string, unknown> {
  const isNew = row.first_seen
    ? Date.now() - new Date(row.first_seen).getTime() < 48 * 3_600_000
    : false;

  const num = (v: unknown) => (v != null ? parseFloat(String(v)) : null);

  return {
    // Identity
    sheriffNumber:            row.sheriff_number,
    county:                   row.county ?? "Atlantic",
    courtCaseNumber:          row.court_case_number ?? null,
    currentSaleDate:          row.current_sale_date ?? null,
    originalSaleDate:         row.original_sale_date ?? null,
    // Parties
    plaintiffName:            row.plaintiff ?? null,
    defendantName:            row.defendant ?? null,
    // Address
    streetAddress:            row.address ?? null,
    city:                     row.city ?? null,
    state:                    row.state ?? null,
    zipCode:                  row.zip_code ?? null,
    // Property details
    attorney:                 row.attorney ?? null,
    approxJudgment:           num(row.approx_judgment),
    upsetAmount:              num(row.upset_amount),
    priorsLiensTaxes:         row.priors_liens_taxes ?? null,
    taxLot:                   row.tax_lot ?? null,
    block:                    row.block ?? null,
    nearestCrossStreet:       row.nearest_cross_street ?? null,
    occupancyStatus:          row.occupancy_status ?? null,
    propertyNotes:            row.property_notes ?? null,
    // Links
    detailUrl:                row.detail_url ?? null,
    googleMapsUrl:            row.google_maps_url ?? null,
    zillowUrl:                row.zillow_url ?? null,        // the old Zillow search link from scraper
    redfinPropertyUrl:        row.redfin_property_url ?? null,
    zillowPropertyUrl:        row.zillow_property_url ?? null,
    // Classification
    foreclosureType:          row.foreclosure_type ?? null,
    classificationConfidence: row.classification_confidence ?? null,
    classificationEvidence:   row.classification_evidence ?? null,
    // Valuation — Zillow
    zillowEstimate:           num(row.zillow_estimate),
    zillowStatus:             row.zillow_status ?? "NOT_CONFIGURED",
    zillowFetchedAt:          row.zillow_fetched_at ?? null,
    // Valuation — Redfin
    redfinEstimate:           num(row.redfin_estimate),
    redfinStatus:             row.redfin_status ?? "NOT_CONFIGURED",
    redfinFetchedAt:          row.redfin_fetched_at ?? null,
    // Market value
    marketValueUsed:          num(row.market_value_used),
    marketValueSource:        row.market_value_source ?? "NONE",
    valuationUpdatedAt:       row.valuation_updated_at ?? null,
    // Deal metrics
    estimatedSpread:          num(row.estimated_spread),
    discountPercent:          num(row.discount_percent),
    equityMultiple:           num(row.equity_multiple),
    dealRating:               row.deal_rating ?? "UNKNOWN",
    dealScore:                num(row.deal_score),
    dealWarnings:             Array.isArray(row.deal_warnings) ? row.deal_warnings : [],
    // For backwards compat with frontend that uses `warnings`
    warnings:                 Array.isArray(row.deal_warnings) ? row.deal_warnings : [],
    // Timestamps
    firstSeen:   row.first_seen  ?? null,
    lastSeen:    row.last_seen   ?? null,
    lastChanged: row.last_changed ?? null,
    lastUpdated: row.last_updated ?? null,
    isNew,
    isRemoved: row.is_removed ?? false,
  };
}
