import { Router, type IRouter } from "express";
import { db, inquiriesTable, propertyPhotosTable } from "@workspace/db";
import { eq, count, desc, asc, and, sql } from "drizzle-orm";
import {
  createSession,
  validateSession,
  destroySession,
  checkAdminPassword,
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
  const { password } = req.body ?? {};

  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "Password is required." });
    return;
  }

  if (!checkAdminPassword(password)) {
    // Small delay to deter brute-force
    await new Promise<void>((r) => setTimeout(r, 500));
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const token = createSession();

  res.cookie(COOKIE_NAME, token, {
    signed: true,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
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
  res.clearCookie(COOKIE_NAME);
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

export default router;
