/**
 * Valuation endpoints.
 *
 * POST   /api/foreclosures/:sheriffNumber/valuation
 *   Fetch Zillow estimate for a property. No auth required (admin UI).
 *   ?force=true  skips the 7-day cache.
 *
 * PATCH  /api/foreclosures/:sheriffNumber/valuation/redfin
 *   Manual Redfin estimate entry. Protected by REFRESH_SECRET.
 *   Body: { "estimate": 325000 }
 *
 * POST   /api/foreclosures/:sheriffNumber/recalculate
 *   Recalculate deal metrics from stored values. No auth required.
 *
 * POST   /api/valuations/refresh
 *   Bulk Zillow refresh. Protected by REFRESH_SECRET.
 *   ?force=true  ignores cache.
 */

import { Router, type Request, type Response } from "express";
import { query } from "../db.js";
import { lookupValuation, lookupRedfinValuation, recalculateDeal, runBulkZillowRefresh, runBulkRedfinRefresh } from "../valuation.js";

export const valuationsRouter = Router();

// ── Single property: Zillow ───────────────────────────────────────────────────

valuationsRouter.post(
  "/foreclosures/:sheriffNumber/valuation",
  async (req: Request, res: Response): Promise<void> => {
    const sheriffNumber = String(req.params["sheriffNumber"]).toUpperCase();
    const force         = req.query["force"] === "true";

    const rows = await query<{
      sheriff_number: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zip_code: string | null;
      upset_amount: string | null;
    }>(
      `SELECT sheriff_number, address, city, state, zip_code, upset_amount
       FROM foreclosures WHERE sheriff_number=$1`,
      [sheriffNumber],
    );

    if (!rows.length) {
      res.status(404).json({ error: "Foreclosure not found" });
      return;
    }
    const prop = rows[0]!;
    if (!prop.address || !prop.city || !prop.state || !prop.zip_code) {
      res.status(422).json({ error: "Property has incomplete address" });
      return;
    }

    try {
      const outcome = await lookupValuation(
        sheriffNumber, prop.address, prop.city, prop.state, prop.zip_code, force,
      );

      // Return the refreshed property row
      const updated = await query(
        `SELECT zillow_estimate, zillow_status, redfin_estimate, redfin_status,
                market_value_used, market_value_source,
                estimated_spread, discount_percent, equity_multiple,
                deal_rating, deal_score, deal_warnings, valuation_updated_at
         FROM foreclosures WHERE sheriff_number=$1`,
        [sheriffNumber],
      );

      res.json({ sheriffNumber, outcome, ...updated[0] });
    } catch (err) {
      console.error(`[POST /valuations/${sheriffNumber}]`, err);
      res.status(500).json({ error: "Valuation request failed" });
    }
  },
);

// ── Single property: Redfin (manual entry) ───────────────────────────────────

valuationsRouter.patch(
  "/foreclosures/:sheriffNumber/valuation/redfin",
  async (req: Request, res: Response): Promise<void> => {
    // Auth: REFRESH_SECRET bearer token
    const secret = process.env["REFRESH_SECRET"];
    if (secret) {
      const auth = req.headers["authorization"] ?? "";
      if (auth !== `Bearer ${secret}`) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const sheriffNumber = String(req.params["sheriffNumber"]).toUpperCase();
    const body = req.body as { estimate?: unknown };
    const rawEstimate = body.estimate;

    if (rawEstimate == null) {
      res.status(400).json({ error: "Body must include { estimate: number }" });
      return;
    }
    const estimate = typeof rawEstimate === "number" ? rawEstimate : parseFloat(String(rawEstimate));
    if (isNaN(estimate) || estimate <= 0) {
      res.status(400).json({ error: "estimate must be a positive number" });
      return;
    }

    const exists = await query(
      `SELECT sheriff_number FROM foreclosures WHERE sheriff_number=$1`,
      [sheriffNumber],
    );
    if (!exists.length) {
      res.status(404).json({ error: "Foreclosure not found" });
      return;
    }

    try {
      await query(
        `UPDATE foreclosures SET
           redfin_estimate=$2, redfin_fetched_at=NOW(), redfin_status='SUCCESS',
           last_updated=NOW()
         WHERE sheriff_number=$1`,
        [sheriffNumber, estimate],
      );

      await recalculateDeal(sheriffNumber);

      const updated = await query(
        `SELECT redfin_estimate, redfin_status, redfin_fetched_at,
                market_value_used, market_value_source,
                estimated_spread, discount_percent, equity_multiple,
                deal_rating, deal_score, deal_warnings, valuation_updated_at
         FROM foreclosures WHERE sheriff_number=$1`,
        [sheriffNumber],
      );

      res.json({ sheriffNumber, redfinStatus: "SUCCESS", ...updated[0] });
    } catch (err) {
      console.error(`[PATCH /valuations/${sheriffNumber}/redfin]`, err);
      res.status(500).json({ error: "Failed to save Redfin estimate" });
    }
  },
);

// ── Single property: Redfin (automated) ──────────────────────────────────────

valuationsRouter.post(
  "/foreclosures/:sheriffNumber/valuation/redfin-auto",
  async (req: Request, res: Response): Promise<void> => {
    const sheriffNumber = String(req.params["sheriffNumber"]).toUpperCase();
    const force         = req.query["force"] === "true";

    const rows = await query<{
      sheriff_number: string;
      address: string | null;
      city: string | null;
      state: string | null;
      zip_code: string | null;
    }>(
      `SELECT sheriff_number, address, city, state, zip_code FROM foreclosures WHERE sheriff_number=$1`,
      [sheriffNumber],
    );

    if (!rows.length) { res.status(404).json({ error: "Foreclosure not found" }); return; }
    const prop = rows[0]!;
    if (!prop.address || !prop.city || !prop.state || !prop.zip_code) {
      res.status(422).json({ error: "Property has incomplete address" }); return;
    }

    try {
      const outcome = await lookupRedfinValuation(
        sheriffNumber, prop.address, prop.city, prop.state, prop.zip_code, force,
      );
      const updated = await query(
        `SELECT redfin_estimate, redfin_status, redfin_fetched_at, redfin_property_url,
                zillow_estimate, zillow_status,
                market_value_used, market_value_source,
                estimated_spread, discount_percent, equity_multiple,
                deal_rating, deal_score, deal_warnings, valuation_updated_at
         FROM foreclosures WHERE sheriff_number=$1`,
        [sheriffNumber],
      );
      res.json({ sheriffNumber, outcome, ...updated[0] });
    } catch (err) {
      console.error(`[POST /valuation/redfin-auto/${sheriffNumber}]`, err);
      res.status(500).json({ error: "Redfin valuation request failed" });
    }
  },
);

// ── Bulk Redfin refresh ───────────────────────────────────────────────────────

valuationsRouter.post(
  "/valuations/redfin-refresh",
  async (req: Request, res: Response): Promise<void> => {
    const secret = process.env["REFRESH_SECRET"];
    if (!secret) { res.status(503).json({ error: "REFRESH_SECRET not configured" }); return; }
    const auth = req.headers["authorization"] ?? "";
    if (auth !== `Bearer ${secret}`) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!process.env["REDFIN_RAPIDAPI_KEY"]) {
      res.status(503).json({ error: "REDFIN_RAPIDAPI_KEY not configured" }); return;
    }

    const force       = req.query["force"]       === "true";
    const noThreshold = req.query["noThreshold"] === "true";
    res.json({ status: "redfin_refresh_started", force, noThreshold });

    runBulkRedfinRefresh(force, noThreshold).then((stats) => {
      console.log("[valuations/redfin-refresh] Done:", stats);
    }).catch((err) => {
      console.error("[valuations/redfin-refresh] Error:", err);
    });
  },
);

// ── Recalculate deal (from stored values) ────────────────────────────────────

valuationsRouter.post(
  "/foreclosures/:sheriffNumber/recalculate",
  async (req: Request, res: Response): Promise<void> => {
    const sheriffNumber = String(req.params["sheriffNumber"]).toUpperCase();

    const exists = await query(
      `SELECT sheriff_number FROM foreclosures WHERE sheriff_number=$1`,
      [sheriffNumber],
    );
    if (!exists.length) {
      res.status(404).json({ error: "Foreclosure not found" });
      return;
    }

    try {
      await recalculateDeal(sheriffNumber);
      const updated = await query(
        `SELECT market_value_used, market_value_source,
                estimated_spread, discount_percent, equity_multiple,
                deal_rating, deal_score, deal_warnings, valuation_updated_at
         FROM foreclosures WHERE sheriff_number=$1`,
        [sheriffNumber],
      );
      res.json({ sheriffNumber, recalculated: true, ...updated[0] });
    } catch (err) {
      console.error(`[POST /recalculate/${sheriffNumber}]`, err);
      res.status(500).json({ error: "Recalculation failed" });
    }
  },
);

// ── Bulk Zillow refresh ───────────────────────────────────────────────────────

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

    if (!process.env["ZILLOW_RAPIDAPI_KEY"]) {
      res.status(503).json({ error: "ZILLOW_RAPIDAPI_KEY not configured" });
      return;
    }

    const force       = req.query["force"]       === "true";
    const noThreshold = req.query["noThreshold"] === "true";
    res.json({ status: "valuation_refresh_started", force, noThreshold });

    runBulkZillowRefresh(force, noThreshold).then((stats) => {
      console.log("[valuations/refresh] Done:", stats);
    }).catch((err) => {
      console.error("[valuations/refresh] Error:", err);
    });
  },
);
