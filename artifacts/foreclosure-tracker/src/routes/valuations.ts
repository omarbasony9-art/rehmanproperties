/**
 * Valuation endpoints.
 *
 * POST /api/foreclosures/:sheriffNumber/valuation
 *   Manually trigger RentCast valuation for a single property.
 *   No auth required (admin calls from the UI).
 *
 * POST /api/valuations/refresh
 *   Bulk valuation run for all qualifying properties (upsetAmount <= $280k).
 *   Protected by REFRESH_SECRET bearer token.
 *   ?force=true  re-values even if cached < 7 days old.
 */

import { Router, type Request, type Response } from "express";
import { query } from "../db.js";
import { forceValuation, lookupValuation } from "../valuation.js";
import { scoreDeal, computeWarnings } from "../deals.js";

export const valuationsRouter = Router();

// ── Manual single-property valuation ─────────────────────────────────────────

valuationsRouter.post(
  "/foreclosures/:sheriffNumber/valuation",
  async (req: Request, res: Response): Promise<void> => {
    const sheriffNumber = String(req.params["sheriffNumber"]).toUpperCase();
    const forceRefresh  = req.query["force"] === "true";

    // Load the property
    const rows = await query<{
      sheriff_number: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zip_code: string | null;
      upset_amount: string | null;
    }>(
      `SELECT sheriff_number, address, city, state, zip_code, upset_amount
       FROM foreclosures WHERE sheriff_number = $1`,
      [sheriffNumber],
    );

    if (!rows.length) {
      res.status(404).json({ error: "Foreclosure not found" });
      return;
    }

    const prop = rows[0]!;
    if (!prop.address || !prop.city || !prop.state || !prop.zip_code) {
      res.status(422).json({ error: "Property has incomplete address — cannot look up valuation" });
      return;
    }

    const apiKey = process.env["RENTCAST_API_KEY"];
    if (!apiKey) {
      res.status(503).json({ error: "RENTCAST_API_KEY not configured" });
      return;
    }

    try {
      const { result, status } = await forceValuation(
        sheriffNumber,
        prop.address,
        prop.city,
        prop.state,
        prop.zip_code,
        forceRefresh,
      );

      // Re-score with the new valuation
      if (result?.estimatedMarketValue && prop.upset_amount) {
        const upsetAmount = parseFloat(prop.upset_amount);
        const metrics = scoreDeal(upsetAmount, result.estimatedMarketValue);
        const warnings = computeWarnings({
          upsetAmount,
          estimatedMarketValue: result.estimatedMarketValue,
          propertyValuationAvailable: true,
        });

        await query(
          `UPDATE foreclosures SET
             deal_rating=$1, deal_score=$2, estimated_spread=$3,
             discount_percent=$4, equity_multiple=$5, deal_warnings=$6,
             last_updated=NOW()
           WHERE sheriff_number=$7`,
          [
            metrics.dealRating, metrics.dealScore, metrics.estimatedSpread,
            metrics.discountPercent, metrics.equityMultiple, warnings,
            sheriffNumber,
          ],
        );
      }

      res.json({
        sheriffNumber,
        valuationStatus: status,
        estimatedMarketValue: result?.estimatedMarketValue ?? null,
        lastSalePrice: result?.lastSalePrice ?? null,
        bedrooms: result?.bedrooms ?? null,
        bathrooms: result?.bathrooms ?? null,
        squareFeet: result?.squareFeet ?? null,
        yearBuilt: result?.yearBuilt ?? null,
        propertyType: result?.propertyType ?? null,
        fetchedAt: result?.fetchedAt ?? null,
      });
    } catch (err) {
      console.error(`[POST /valuations/${sheriffNumber}]`, err);
      res.status(500).json({ error: "Valuation request failed" });
    }
  },
);

// ── Bulk valuation refresh ────────────────────────────────────────────────────

const UPSET_THRESHOLD = 280_000;

valuationsRouter.post(
  "/valuations/refresh",
  async (req: Request, res: Response): Promise<void> => {
    const secret = process.env["REFRESH_SECRET"];
    if (!secret) {
      res.status(503).json({ error: "REFRESH_SECRET not configured" });
      return;
    }
    const auth = req.headers["authorization"] ?? "";
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const apiKey = process.env["RENTCAST_API_KEY"];
    if (!apiKey) {
      res.status(503).json({ error: "RENTCAST_API_KEY not configured" });
      return;
    }

    const forceRefresh = req.query["force"] === "true";

    res.json({ status: "valuation_refresh_started", forceRefresh });

    // Fire-and-forget
    runBulkValuation(forceRefresh).catch((err) => {
      console.error("[valuations/refresh] Uncaught error:", err);
    });
  },
);

async function runBulkValuation(force: boolean): Promise<void> {
  // Load qualifying properties
  const qualifying = await query<{
    sheriff_number: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    upset_amount: string | null;
    priors_liens_taxes: string | null;
    occupancy_status: string | null;
    valuation_status: string | null;
  }>(
    `SELECT f.sheriff_number, f.address, f.city, f.state, f.zip_code,
            f.upset_amount, f.priors_liens_taxes, f.occupancy_status,
            f.valuation_status
     FROM foreclosures f
     LEFT JOIN property_values pv ON pv.sheriff_number = f.sheriff_number
     WHERE f.is_removed = FALSE
       AND f.upset_amount IS NOT NULL
       AND f.upset_amount <= $1
       AND f.address IS NOT NULL
       AND f.city IS NOT NULL
       AND ($2 OR pv.fetched_at IS NULL OR pv.fetched_at < NOW() - INTERVAL '7 days')`,
    [UPSET_THRESHOLD, force],
  );

  console.log(`[valuations/refresh] Qualifying: ${qualifying.length} (force=${force})`);

  let succeeded = 0, failed = 0, notFound = 0;

  for (const prop of qualifying) {
    if (!prop.address || !prop.city || !prop.state || !prop.zip_code || !prop.upset_amount) {
      continue;
    }
    const upsetAmount = parseFloat(prop.upset_amount);

    try {
      const val = await lookupValuation(
        prop.sheriff_number,
        prop.address,
        prop.city,
        prop.state,
        prop.zip_code,
      );

      if (val?.estimatedMarketValue) {
        const metrics = scoreDeal(upsetAmount, val.estimatedMarketValue);
        const warnings = computeWarnings({
          priorsLiensTaxes: prop.priors_liens_taxes,
          upsetAmount,
          estimatedMarketValue: val.estimatedMarketValue,
          occupancyStatus: prop.occupancy_status,
          propertyValuationAvailable: true,
        });
        await query(
          `UPDATE foreclosures SET
             deal_rating=$1, deal_score=$2, estimated_spread=$3,
             discount_percent=$4, equity_multiple=$5, deal_warnings=$6,
             last_updated=NOW()
           WHERE sheriff_number=$7`,
          [
            metrics.dealRating, metrics.dealScore, metrics.estimatedSpread,
            metrics.discountPercent, metrics.equityMultiple, warnings,
            prop.sheriff_number,
          ],
        );
        succeeded++;
      } else if (val?.valuationStatus === "NOT_FOUND") {
        notFound++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[valuations/refresh] Error for ${prop.sheriff_number}:`, err);
      failed++;
    }
  }

  console.log(`[valuations/refresh] Done — succeeded:${succeeded} notFound:${notFound} failed:${failed}`);
}
