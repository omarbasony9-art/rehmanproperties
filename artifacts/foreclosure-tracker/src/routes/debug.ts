/**
 * GET /api/debug/scraper
 * Returns a live diagnostic snapshot of scraper / database state.
 * Protected by the same REFRESH_SECRET as POST /api/refresh.
 */

import { Router, type Request, type Response } from "express";
import { query } from "../db.js";
import { fetchListPage } from "../scraper.js";

export const debugRouter = Router();

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
