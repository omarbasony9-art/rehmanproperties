/**
 * GET /api/debug/scraper      — live scraper / database diagnostic
 * GET /api/debug/valuations   — Zillow + Redfin configuration and last-call status
 *
 * Both routes are protected by REFRESH_SECRET.
 */

import { Router, type Request, type Response } from "express";
import { query } from "../db.js";
import { fetchListPage } from "../scraper.js";

export const debugRouter = Router();

// ── GET /api/debug/valuations ─────────────────────────────────────────────────
debugRouter.get("/valuations", async (req: Request, res: Response): Promise<void> => {
  const secret = process.env["REFRESH_SECRET"];
  if (!secret) { res.status(503).json({ error: "REFRESH_SECRET not configured" }); return; }
  const auth = req.headers["authorization"] ?? "";
  if (auth !== `Bearer ${secret}`) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Derive "last call" from the most recent DB row for each provider
  const [zRow] = await query<{
    sheriff_number: string; zillow_status: string | null;
    zillow_fetched_at: Date | null; zillow_estimate: string | null;
    address: string | null; city: string | null;
  }>(
    `SELECT sheriff_number, zillow_status, zillow_fetched_at, zillow_estimate, address, city
     FROM foreclosures
     WHERE zillow_fetched_at IS NOT NULL
     ORDER BY zillow_fetched_at DESC LIMIT 1`,
  );

  const [rRow] = await query<{
    sheriff_number: string; redfin_status: string | null;
    redfin_fetched_at: Date | null; redfin_estimate: string | null;
    address: string | null; city: string | null;
  }>(
    `SELECT sheriff_number, redfin_status, redfin_fetched_at, redfin_estimate, address, city
     FROM foreclosures
     WHERE redfin_fetched_at IS NOT NULL
     ORDER BY redfin_fetched_at DESC LIMIT 1`,
  );

  const [counts] = await query<{
    z_success: string; z_not_found: string; z_error: string; z_not_configured: string;
    r_success: string; r_not_found: string; r_error: string; r_not_configured: string;
    total: string;
  }>(
    `SELECT
       SUM(CASE WHEN zillow_status='SUCCESS'        THEN 1 ELSE 0 END)::text AS z_success,
       SUM(CASE WHEN zillow_status='NOT_FOUND'      THEN 1 ELSE 0 END)::text AS z_not_found,
       SUM(CASE WHEN zillow_status='ERROR'          THEN 1 ELSE 0 END)::text AS z_error,
       SUM(CASE WHEN zillow_status='NOT_CONFIGURED' THEN 1 ELSE 0 END)::text AS z_not_configured,
       SUM(CASE WHEN redfin_status='SUCCESS'        THEN 1 ELSE 0 END)::text AS r_success,
       SUM(CASE WHEN redfin_status='NOT_FOUND'      THEN 1 ELSE 0 END)::text AS r_not_found,
       SUM(CASE WHEN redfin_status='ERROR'          THEN 1 ELSE 0 END)::text AS r_error,
       SUM(CASE WHEN redfin_status='NOT_CONFIGURED' THEN 1 ELSE 0 END)::text AS r_not_configured,
       COUNT(*)::text AS total
     FROM foreclosures WHERE is_removed=FALSE`,
  );

  res.json({
    zillow: {
      configured:          !!process.env["ZILLOW_RAPIDAPI_KEY"] && !!process.env["ZILLOW_RAPIDAPI_HOST"],
      host:                process.env["ZILLOW_RAPIDAPI_HOST"] ?? null,
      searchEndpoint:      "/autocomplete?query=<address>",
      detailEndpoint:      "/byzpid?zpid=<zpid>",
      estimateField:       "zestimate (top-level of /byzpid response)",
      lastPropertyTested:  zRow ? `${zRow.sheriff_number} — ${zRow.address}, ${zRow.city}` : null,
      lastStatus:          zRow?.zillow_status ?? null,
      lastFetchedAt:       zRow?.zillow_fetched_at ?? null,
      lastEstimate:        zRow?.zillow_estimate ? parseFloat(zRow.zillow_estimate) : null,
      lastError:           null,
      dbCounts: {
        success:       parseInt(counts?.z_success ?? "0"),
        notFound:      parseInt(counts?.z_not_found ?? "0"),
        error:         parseInt(counts?.z_error ?? "0"),
        notConfigured: parseInt(counts?.z_not_configured ?? "0"),
        total:         parseInt(counts?.total ?? "0"),
      },
    },
    redfin: {
      configured:          !!process.env["REDFIN_RAPIDAPI_KEY"] && !!process.env["REDFIN_RAPIDAPI_HOST"],
      host:                process.env["REDFIN_RAPIDAPI_HOST"] ?? null,
      searchEndpoint:      "/properties/auto-complete?query=<address>",
      detailEndpoint:      "/property/detail?url=<redfin-relative-url>",
      estimateField:       "data.aboveTheFold.addressSectionInfo.priceInfo.amount (label='Redfin Estimate')",
      lastPropertyTested:  rRow ? `${rRow.sheriff_number} — ${rRow.address}, ${rRow.city}` : null,
      lastStatus:          rRow?.redfin_status ?? null,
      lastFetchedAt:       rRow?.redfin_fetched_at ?? null,
      lastEstimate:        rRow?.redfin_estimate ? parseFloat(rRow.redfin_estimate) : null,
      lastError:           null,
      dbCounts: {
        success:       parseInt(counts?.r_success ?? "0"),
        notFound:      parseInt(counts?.r_not_found ?? "0"),
        error:         parseInt(counts?.r_error ?? "0"),
        notConfigured: parseInt(counts?.r_not_configured ?? "0"),
        total:         parseInt(counts?.total ?? "0"),
      },
    },
  });
});

debugRouter.get("/scraper", async (req: Request, res: Response): Promise<void> => {
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

  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    civilViewReachable: false,
    httpStatus: null,
    htmlBytes: null,
    containsKnownSheriff: false,
    tableRowsFound: null,
    listingsParsed: null,
    detailLinksFound: null,
    databaseActiveCount: null,
    lastRefresh: null,
    lastError: null,
  };

  // ── CivilView connectivity ──────────────────────────────────────────────
  try {
    const t0 = Date.now();
    const stubs = await fetchListPage();
    const ms = Date.now() - t0;

    report.civilViewReachable = true;
    report.listingsParsed     = stubs.length;
    report.tableRowsFound     = stubs.length; // same — one stub per valid row
    report.detailLinksFound   = stubs.length;
    report.containsKnownSheriff = stubs.some((s) =>
      ["F-26000646", "F-25001254", "F-26000696"].includes(s.sheriffNumber),
    );
    report.fetchTimeMs = ms;
    report.firstFiveStubs = stubs.slice(0, 5).map((s) => ({
      sheriffNumber: s.sheriffNumber,
      propertyId:    s.propertyId,
      saleDate:      s.saleDate,
      plaintiff:     s.plaintiff?.slice(0, 60),
      defendant:     s.defendant?.slice(0, 60),
      address:       s.address?.slice(0, 80),
      detailUrl:     s.detailUrl,
    }));
  } catch (err) {
    report.civilViewReachable = false;
    report.lastError = err instanceof Error ? err.message : String(err);
  }

  // ── Database counts ──────────────────────────────────────────────────────
  try {
    const [activeRow] = await query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM foreclosures WHERE is_removed=FALSE`,
    );
    report.databaseActiveCount = parseInt(activeRow?.cnt ?? "0");

    const [allRow] = await query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM foreclosures`,
    );
    report.databaseTotalCount = parseInt(allRow?.cnt ?? "0");

    const [noUpset] = await query<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM foreclosures WHERE upset_amount IS NULL AND is_removed=FALSE`,
    );
    report.missingUpsetCount = parseInt(noUpset?.cnt ?? "0");

    const [lastRun] = await query<{ completed_at: string; number_found: number; error: string | null }>(
      `SELECT completed_at, number_found, error
       FROM refresh_runs
       ORDER BY id DESC
       LIMIT 1`,
    );
    if (lastRun) {
      report.lastRefresh = lastRun.completed_at;
      report.lastRefreshFound = lastRun.number_found;
      report.lastError = lastRun.error ?? report.lastError;
    }
  } catch (err) {
    report.dbError = err instanceof Error ? err.message : String(err);
  }

  res.json(report);
});
