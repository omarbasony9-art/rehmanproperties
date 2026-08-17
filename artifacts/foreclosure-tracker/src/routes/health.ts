import { Router } from "express";
import { query } from "../db.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    const [listingRow] = await query<{ total: string }>(
      `SELECT COUNT(*) as total FROM foreclosures WHERE is_removed=FALSE`,
    );
    const [majorRow] = await query<{ total: string }>(
      `SELECT COUNT(*) as total FROM foreclosures
       WHERE is_removed=FALSE AND deal_rating IN ('EXTREME','MAJOR','STRONG')`,
    );
    const [lastRunRow] = await query<{ completed_at: string | null }>(
      `SELECT completed_at FROM refresh_runs
       WHERE success=TRUE ORDER BY completed_at DESC LIMIT 1`,
    );

    res.json({
      status: "ok",
      lastRefresh: lastRunRow?.completed_at ?? null,
      listingCount: parseInt(listingRow?.total ?? "0"),
      majorDeals: parseInt(majorRow?.total ?? "0"),
    });
  } catch (err) {
    console.error("[GET /health]", err);
    res.status(500).json({ status: "error", error: String(err) });
  }
});
