import { Router, type IRouter } from "express";
import { db, inquiriesTable, propertyPhotosTable, adminConfigTable } from "@workspace/db";
import { eq, count, desc, asc, and, sql } from "drizzle-orm";
import {
  createSession,
  validateSession,
  destroySession,
  checkAdminPassword,
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
} from "../lib/auth";

const router: IRouter = Router();
const COOKIE_NAME = "admin_token";
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Middleware helper
function isAuthenticated(req: Parameters<Parameters<IRouter["get"]>[1]>[0]): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (req as any).signedCookies?.[COOKIE_NAME];
  return validateSession(token);
}

// POST /admin/login
router.post("/admin/login", async (req, res): Promise<void> => {
  const ip = req.ip ?? "unknown";

  // Rate limit check
  const rateCheck = checkLoginRateLimit(ip);
  if (!rateCheck.allowed) {
    res.status(429).json({ error: `Too many failed attempts. Try again in ${rateCheck.lockedFor} seconds.` });
    return;
  }

  const { password } = req.body ?? {};

  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required." });
    return;
  }

  // Load DB password hash override if it exists
  const [hashRow] = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, "password_hash"));
  const storedHash = hashRow?.value ?? null;

  if (!checkAdminPassword(password, storedHash)) {
    recordFailedLogin(ip);
    await new Promise<void>((r) => setTimeout(r, 500));
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  clearLoginAttempts(ip);
  const token = createSession();

  res.cookie(COOKIE_NAME, token, {
    signed: true,
    httpOnly: true,
    // Replit preview runs inside a cross-site iframe (replit.com embeds the
    // app's *.replit.dev domain). SameSite=Lax cookies are blocked by all
    // modern browsers in that context. SameSite=None + Secure is required.
    // Both Replit dev (mTLS proxy) and Cloudflare production use HTTPS, so
    // Secure=true is always safe here.
    secure: true,
    sameSite: "none",
    maxAge: COOKIE_MAX_AGE,
  });

  req.log.info("Admin login successful");
  res.json({ authenticated: true });
});

// POST /admin/logout
router.post("/admin/logout", async (req, res): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const token = (req as any).signedCookies?.[COOKIE_NAME];
  if (token && typeof token === "string") {
    destroySession(token);
  }
  res.clearCookie(COOKIE_NAME, { secure: true, sameSite: "none" });
  res.json({ success: true });
});

// GET /admin/me
router.get("/admin/me", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  res.json({ authenticated: true });
});

// GET /admin/stats
router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const rows = await db
    .select({ status: inquiriesTable.status, cnt: count() })
    .from(inquiriesTable)
    .groupBy(inquiriesTable.status);

  const statsMap: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    statsMap[row.status] = Number(row.cnt);
    total += Number(row.cnt);
  }

  res.json({
    new: statsMap["new"] ?? 0,
    contacted: statsMap["contacted"] ?? 0,
    appointment: statsMap["appointment"] ?? 0,
    offerMade: statsMap["offer_made"] ?? 0,
    underContract: statsMap["under_contract"] ?? 0,
    closed: statsMap["closed"] ?? 0,
    lost: statsMap["lost"] ?? 0,
    total,
  });
});

const VALID_STATUSES = [
  "new",
  "contacted",
  "appointment",
  "offer_made",
  "under_contract",
  "closed",
  "lost",
] as const;

// GET /admin/inquiries
router.get("/admin/inquiries", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query["limit"] ?? "20"), 10)),
  );
  const search = String(req.query["search"] ?? "").trim();
  const statusRaw = String(req.query["status"] ?? "").trim();
  const sortByRaw = String(req.query["sortBy"] ?? "created_at").trim();
  const sortDirRaw = String(req.query["sortDir"] ?? "desc").trim();

  const offset = (page - 1) * limit;

  const validSortColumns: Record<string, typeof inquiriesTable.createdAt | typeof inquiriesTable.fullName | typeof inquiriesTable.status | typeof inquiriesTable.address> = {
    created_at: inquiriesTable.createdAt,
    full_name: inquiriesTable.fullName,
    status: inquiriesTable.status,
    address: inquiriesTable.address,
  };
  const sortColumn =
    validSortColumns[sortByRaw] ?? inquiriesTable.createdAt;
  const sortFn = sortDirRaw === "asc" ? asc : desc;

  const conditions = [];
  if (search) {
    conditions.push(
      sql`(
        ${inquiriesTable.fullName} ILIKE ${"%" + search + "%"}
        OR ${inquiriesTable.address} ILIKE ${"%" + search + "%"}
        OR ${inquiriesTable.inquiryNumber} ILIKE ${"%" + search + "%"}
        OR ${inquiriesTable.email} ILIKE ${"%" + search + "%"}
        OR ${inquiriesTable.phone} ILIKE ${"%" + search + "%"}
      )`,
    );
  }
  if (statusRaw && (VALID_STATUSES as readonly string[]).includes(statusRaw)) {
    conditions.push(eq(inquiriesTable.status, statusRaw));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalResult] = await Promise.all([
    db
      .select({
        id: inquiriesTable.id,
        inquiryNumber: inquiriesTable.inquiryNumber,
        createdAt: inquiriesTable.createdAt,
        status: inquiriesTable.status,
        fullName: inquiriesTable.fullName,
        email: inquiriesTable.email,
        phone: inquiriesTable.phone,
        preferredContact: inquiriesTable.preferredContact,
        address: inquiriesTable.address,
        city: inquiriesTable.city,
        state: inquiriesTable.state,
        zip: inquiriesTable.zip,
        propertyType: inquiriesTable.propertyType,
      })
      .from(inquiriesTable)
      .where(where)
      .orderBy(sortFn(sortColumn))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(inquiriesTable)
      .where(where),
  ]);

  res.json({
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    total: Number(totalResult[0]?.total ?? 0),
    page,
    limit,
  });
});

// GET /admin/inquiries/export.csv — must be before /:id to avoid route conflict
router.get("/admin/inquiries/export.csv", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }

  const rows = await db.select({
    inquiryNumber: inquiriesTable.inquiryNumber,
    createdAt: inquiriesTable.createdAt,
    status: inquiriesTable.status,
    fullName: inquiriesTable.fullName,
    email: inquiriesTable.email,
    phone: inquiriesTable.phone,
    preferredContact: inquiriesTable.preferredContact,
    address: inquiriesTable.address,
    city: inquiriesTable.city,
    state: inquiriesTable.state,
    zip: inquiriesTable.zip,
    propertyType: inquiriesTable.propertyType,
    bedrooms: inquiriesTable.bedrooms,
    bathrooms: inquiriesTable.bathrooms,
    squareFootage: inquiriesTable.squareFootage,
    occupied: inquiriesTable.occupied,
    propertyCondition: inquiriesTable.propertyCondition,
    repairs: inquiriesTable.repairs,
    sellingReason: inquiriesTable.sellingReason,
    sellingTimeline: inquiriesTable.sellingTimeline,
    source: inquiriesTable.source,
  }).from(inquiriesTable).orderBy(desc(inquiriesTable.createdAt));

  function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = String(v instanceof Date ? v.toISOString() : v).replace(/"/g, '""');
    return `"${s}"`;
  }

  const headers = [
    "Inquiry Number","Date","Status","Full Name","Email","Phone","Preferred Contact",
    "Address","City","State","ZIP","Property Type","Bedrooms","Bathrooms",
    "Sq Footage","Occupied","Condition","Repairs","Selling Reason","Selling Timeline","Source",
  ];

  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map(r => [
      r.inquiryNumber, r.createdAt, r.status, r.fullName, r.email, r.phone, r.preferredContact,
      r.address, r.city, r.state, r.zip, r.propertyType, r.bedrooms, r.bathrooms,
      r.squareFootage, r.occupied, r.propertyCondition, r.repairs,
      r.sellingReason, r.sellingTimeline, r.source,
    ].map(csvEscape).join(",")),
  ];

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="inquiries-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(lines.join("\r\n"));
});

// GET /admin/inquiries/:id
router.get("/admin/inquiries/:id", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const raw = Array.isArray(req.params["id"])
    ? req.params["id"][0]
    : req.params["id"];
  const id = parseInt(raw ?? "", 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID." });
    return;
  }

  const [inquiry] = await db
    .select()
    .from(inquiriesTable)
    .where(eq(inquiriesTable.id, id));

  if (!inquiry) {
    res.status(404).json({ error: "Inquiry not found." });
    return;
  }

  const photos = await db
    .select()
    .from(propertyPhotosTable)
    .where(eq(propertyPhotosTable.inquiryId, id));

  res.json({
    ...inquiry,
    createdAt: inquiry.createdAt.toISOString(),
    photos: photos.map((p) => ({
      ...p,
      uploadedAt: p.uploadedAt.toISOString(),
    })),
  });
});

// PATCH /admin/inquiries/:id
router.patch("/admin/inquiries/:id", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const raw = Array.isArray(req.params["id"])
    ? req.params["id"][0]
    : req.params["id"];
  const id = parseInt(raw ?? "", 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID." });
    return;
  }

  const { status, notes } = req.body ?? {};
  const updateData: Partial<typeof inquiriesTable.$inferInsert> = {};

  if (status !== undefined) {
    if (!(VALID_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ error: "Invalid status value." });
      return;
    }
    updateData.status = status;
  }

  if (notes !== undefined) {
    updateData.notes =
      notes === null || notes === ""
        ? null
        : String(notes).slice(0, 10000);
  }

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update." });
    return;
  }

  const [updated] = await db
    .update(inquiriesTable)
    .set(updateData)
    .where(eq(inquiriesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Inquiry not found." });
    return;
  }

  const photos = await db
    .select()
    .from(propertyPhotosTable)
    .where(eq(propertyPhotosTable.inquiryId, id));

  req.log.info({ id, updateData }, "Inquiry updated");

  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    photos: photos.map((p) => ({
      ...p,
      uploadedAt: p.uploadedAt.toISOString(),
    })),
  });
});

// POST /admin/foreclosure-refresh  — server-side proxy so REFRESH_SECRET never reaches the browser
router.post("/admin/foreclosure-refresh", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  const refreshSecret = process.env.REFRESH_SECRET;
  if (!refreshSecret) {
    res.status(503).json({ error: "REFRESH_SECRET not configured on the server." });
    return;
  }
  try {
    const upstream = await fetch("http://localhost:25309/api/refresh", {
      method: "POST",
      headers: { Authorization: `Bearer ${refreshSecret}` },
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch {
    res.status(502).json({ error: "Could not reach the Foreclosure Tracker service." });
  }
});

export default router;
