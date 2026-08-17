import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { runRefresh } from "./refresh.js";
import { foreclosuresRouter } from "./routes/foreclosures.js";
import { dealsRouter } from "./routes/deals.js";
import { healthRouter } from "./routes/health.js";
import { exportRouter } from "./routes/export.js";
import { debugRouter } from "./routes/debug.js";
import { valuationsRouter } from "./routes/valuations.js";
import { query } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The Replit proxy strips the previewPath prefix before forwarding, so
// routes in this app are mounted WITHOUT the /foreclosure-tracker prefix.
const app = express();
app.set("trust proxy", 1);

app.use(express.json({ limit: "100kb" }));

// Replit proxy routing: strip /foreclosure-tracker prefix from all incoming paths
// so that /foreclosure-tracker/api/... hits the same routes as /api/...
app.use((req, _res, next) => {
  const prefix = "/foreclosure-tracker";
  if (req.url.startsWith(prefix)) {
    req.url = req.url.slice(prefix.length) || "/";
  }
  next();
});

// Rate limiting — public API endpoints only
const publicLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

// ── Health ────────────────────────────────────────────────────────────────────
app.use("/api/health", publicLimiter, healthRouter);

// ── Debug (protected by REFRESH_SECRET) ──────────────────────────────────────
app.use("/api/debug", debugRouter);

// ── Valuation endpoints ───────────────────────────────────────────────────────
// POST /api/foreclosures/:sheriffNumber/valuation  — manual single-property
// POST /api/valuations/refresh                     — bulk (REFRESH_SECRET)
app.use("/api", valuationsRouter);

// ── Public foreclosure endpoints ──────────────────────────────────────────────
app.use("/api/foreclosures", publicLimiter, foreclosuresRouter);

// ── Deal endpoints ────────────────────────────────────────────────────────────
// /api/deals/new MUST be registered before /api/deals/:param
app.use("/api/deals", publicLimiter, dealsRouter);

// ── Export ────────────────────────────────────────────────────────────────────
app.use("/api/export", publicLimiter, exportRouter);

// ── Refresh (protected) ───────────────────────────────────────────────────────
app.post("/api/refresh", async (req: Request, res: Response) => {
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

  // Record the run start
  const runRows = await query<{ id: number }>(
    `INSERT INTO refresh_runs (started_at) VALUES (NOW()) RETURNING id`,
  );
  const runId = runRows[0]?.id;

  // Respond immediately — let the scrape run in the background
  res.json({ status: "refresh_started", runId });

  // Run in background (fire-and-forget)
  runRefresh()
    .then(async (result) => {
      if (runId) {
        await query(
          `UPDATE refresh_runs SET
             completed_at=NOW(), number_found=$2, number_new=$3,
             number_updated=$4, number_failed=$5, major_deals_found=$6,
             error=$7, success=$8
           WHERE id=$1`,
          [
            runId,
            result.numberFound,
            result.numberNew,
            result.numberUpdated,
            result.numberFailed,
            result.majorDealsFound,
            result.error,
            !result.error,
          ],
        );
      }
      console.log(
        `[refresh] Complete — found:${result.numberFound} new:${result.numberNew} ` +
          `updated:${result.numberUpdated} failed:${result.numberFailed} ` +
          `deals:${result.majorDealsFound}`,
      );
    })
    .catch(async (err) => {
      console.error("[refresh] Uncaught error:", err);
      if (runId) {
        await query(
          `UPDATE refresh_runs SET completed_at=NOW(), error=$2, success=FALSE WHERE id=$1`,
          [runId, String(err)],
        );
      }
    });
});

// ── Admin UI ──────────────────────────────────────────────────────────────────
// Serve the plain HTML admin page
const adminHtmlPath = path.resolve(__dirname, "admin.html");

app.get("/admin", (_req: Request, res: Response) => {
  res.sendFile(adminHtmlPath);
});

// Also handle the base path redirect → admin
app.get("/", (_req: Request, res: Response) => {
  res.redirect("/admin");
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[app] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
