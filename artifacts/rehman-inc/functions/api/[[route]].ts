import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, asc, count, and, sql } from "drizzle-orm";
import * as schema from "../_schema";
import {
  createToken,
  verifyToken,
  hashIp,
  hashPassword,
  checkAdminPassword,
} from "../_auth";
import { sendInquiryEmail } from "../_email";
import {
  ensureForeclosuresTable,
  runSync,
  queryListings,
  queryStats,
  getForeclosureBySherifffNumber,
  valuateListing,
  recalculateListing,
  updateRedfinEstimate,
  VALID_COUNTIES,
} from "../_foreclosures";

// ─── Types ─────────────────────────────────────────────────────────────────

type Env = {
  DB: D1Database;
  PHOTOS?: R2Bucket; // optional — R2 not required; photo uploads gracefully disabled when absent
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  INQUIRY_NOTIFICATION_EMAIL?: string;
  SESSION_SECRET: string;
  ADMIN_PASSWORD?: string;
  // Foreclosure valuation providers (optional — gracefully degraded when absent)
  ZILLOW_RAPIDAPI_KEY?: string;
  ZILLOW_RAPIDAPI_HOST?: string;
  REDFIN_RAPIDAPI_KEY?: string;
  REDFIN_RAPIDAPI_HOST?: string;
  RENTCAST_API_KEY?: string;
};

const {
  inquiriesTable,
  propertyPhotosTable,
  propertiesTable,
  faqsTable,
  siteSettingsTable,
  auditLogTable,
  inquiryNotesTable,
  adminConfigTable,
} = schema;

// ─── App ───────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>().basePath("/api");

const getDb = (env: Env) => drizzle(env.DB);

const COOKIE_NAME = "admin_token";
const COOKIE_MAX_AGE = 24 * 60 * 60; // 24 h in seconds
const NOW = () => new Date().toISOString();

// ─── Helpers ───────────────────────────────────────────────────────────────

async function isAuthed(c: { req: { header: (k: string) => string | undefined }; env: Env }, cookieVal: string | undefined): Promise<boolean> {
  if (!cookieVal) return false;
  return verifyToken(cookieVal, c.env.SESSION_SECRET);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unauthed = (c: any) => c.json({ error: "Not authenticated." }, 401);

function sanitize(val: unknown, max = 10000): string | null {
  if (val === undefined || val === null) return null;
  return String(val).trim().slice(0, max);
}

function sanitizeObject(obj: unknown, depth: number): unknown {
  if (depth > 5) return null;
  if (typeof obj === "string") return obj.trim().slice(0, 5000);
  if (typeof obj === "boolean" || typeof obj === "number") return obj;
  if (Array.isArray(obj)) return obj.slice(0, 50).map((v) => sanitizeObject(v, depth + 1));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof k === "string" && k.length < 100) result[k] = sanitizeObject(v, depth + 1);
    }
    return result;
  }
  return null;
}

async function addAudit(db: ReturnType<typeof getDb>, action: string, details?: string) {
  try {
    await db.insert(auditLogTable).values({ action, details: details ?? null, createdAt: NOW() });
  } catch { /* non-critical */ }
}

function parseId(raw: string | undefined): number | null {
  const n = parseInt(raw ?? "", 10);
  return isNaN(n) ? null : n;
}

// ─── Health ────────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({ ok: true }));

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — AUTH
// ══════════════════════════════════════════════════════════════════════════

app.post("/admin/login", async (c) => {
  const db = getDb(c.env);
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For") ??
    "unknown";

  // Rate limit
  const ipKey = `ratelimit:${await hashIp(ip, c.env.SESSION_SECRET)}`;
  const [rlRow] = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, ipKey));
  if (rlRow) {
    const rl = JSON.parse(rlRow.value) as { count: number; resetAt: number };
    if (rl.count >= 5 && rl.resetAt > Date.now()) {
      return c.json({ error: `Too many failed attempts. Try again in ${Math.ceil((rl.resetAt - Date.now()) / 1000)} seconds.` }, 429);
    }
  }

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }

  const { password } = body;
  if (!password || typeof password !== "string") {
    return c.json({ error: "Password is required." }, 400);
  }

  const [hashRow] = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, "password_hash"));
  const valid = await checkAdminPassword(password, hashRow?.value ?? null, c.env.ADMIN_PASSWORD);

  if (!valid) {
    const now = Date.now();
    const existing = rlRow
      ? (JSON.parse(rlRow.value) as { count: number; resetAt: number })
      : { count: 0, resetAt: now + 15 * 60 * 1000 };
    existing.count++;
    if (existing.count >= 5) existing.resetAt = now + 15 * 60 * 1000;
    const rlVal = JSON.stringify(existing);
    await db.insert(adminConfigTable)
      .values({ key: ipKey, value: rlVal, updatedAt: NOW() })
      .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: rlVal, updatedAt: NOW() } });
    await new Promise((r) => setTimeout(r, 500));
    return c.json({ error: "Invalid credentials." }, 401);
  }

  // Clear rate limit on success
  try { await db.delete(adminConfigTable).where(eq(adminConfigTable.key, ipKey)); } catch { /* ok */ }

  const token = await createToken(c.env.SESSION_SECRET);
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return c.json({ authenticated: true });
});

app.post("/admin/logout", async (c) => {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
  return c.json({ success: true });
});

app.get("/admin/me", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  return c.json({ authenticated: true });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — STATS & INQUIRIES
// ══════════════════════════════════════════════════════════════════════════

app.get("/admin/stats", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);

  const rows = await db
    .select({ status: inquiriesTable.status, cnt: count() })
    .from(inquiriesTable)
    .groupBy(inquiriesTable.status);

  const m: Record<string, number> = {};
  let total = 0;
  for (const r of rows) { m[r.status] = Number(r.cnt); total += Number(r.cnt); }

  return c.json({
    new: m["new"] ?? 0, contacted: m["contacted"] ?? 0,
    appointment: m["appointment"] ?? 0, offerMade: m["offer_made"] ?? 0,
    underContract: m["under_contract"] ?? 0, closed: m["closed"] ?? 0,
    lost: m["lost"] ?? 0, total,
  });
});

const VALID_STATUSES = ["new","contacted","appointment","offer_made","under_contract","closed","lost"] as const;

app.get("/admin/inquiries/export.csv", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);

  const rows = await db.select({
    inquiryNumber: inquiriesTable.inquiryNumber, createdAt: inquiriesTable.createdAt,
    status: inquiriesTable.status, fullName: inquiriesTable.fullName,
    email: inquiriesTable.email, phone: inquiriesTable.phone,
    preferredContact: inquiriesTable.preferredContact, address: inquiriesTable.address,
    city: inquiriesTable.city, state: inquiriesTable.state, zip: inquiriesTable.zip,
    propertyType: inquiriesTable.propertyType, bedrooms: inquiriesTable.bedrooms,
    bathrooms: inquiriesTable.bathrooms, squareFootage: inquiriesTable.squareFootage,
    occupied: inquiriesTable.occupied, propertyCondition: inquiriesTable.propertyCondition,
    repairs: inquiriesTable.repairs, sellingReason: inquiriesTable.sellingReason,
    sellingTimeline: inquiriesTable.sellingTimeline, source: inquiriesTable.source,
  }).from(inquiriesTable).orderBy(desc(inquiriesTable.createdAt));

  function esc(v: unknown): string {
    if (v === null || v === undefined) return "";
    return `"${String(v).replace(/"/g, '""')}"`;
  }
  const headers = [
    "Inquiry Number","Date","Status","Full Name","Email","Phone","Preferred Contact",
    "Address","City","State","ZIP","Property Type","Bedrooms","Bathrooms",
    "Sq Footage","Occupied","Condition","Repairs","Selling Reason","Selling Timeline","Source",
  ];
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) => [
      r.inquiryNumber, r.createdAt, r.status, r.fullName, r.email, r.phone,
      r.preferredContact, r.address, r.city, r.state, r.zip, r.propertyType,
      r.bedrooms, r.bathrooms, r.squareFootage, r.occupied, r.propertyCondition,
      r.repairs, r.sellingReason, r.sellingTimeline, r.source,
    ].map(esc).join(",")),
  ];

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="inquiries-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

app.get("/admin/inquiries", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "20", 10)));
  const search = (c.req.query("search") ?? "").trim();
  const statusRaw = (c.req.query("status") ?? "").trim();
  const sortByRaw = (c.req.query("sortBy") ?? "created_at").trim();
  const sortDirRaw = (c.req.query("sortDir") ?? "desc").trim();
  const offset = (page - 1) * limit;

  const colMap: Record<string, typeof inquiriesTable.createdAt | typeof inquiriesTable.fullName | typeof inquiriesTable.status | typeof inquiriesTable.address> = {
    created_at: inquiriesTable.createdAt,
    full_name: inquiriesTable.fullName,
    status: inquiriesTable.status,
    address: inquiriesTable.address,
  };
  const sortCol = colMap[sortByRaw] ?? inquiriesTable.createdAt;
  const sortFn = sortDirRaw === "asc" ? asc : desc;

  const conditions = [];
  if (search) {
    const like = `%${search}%`;
    conditions.push(sql`(
      ${inquiriesTable.fullName} LIKE ${like}
      OR ${inquiriesTable.address} LIKE ${like}
      OR ${inquiriesTable.inquiryNumber} LIKE ${like}
      OR ${inquiriesTable.email} LIKE ${like}
      OR ${inquiriesTable.phone} LIKE ${like}
    )`);
  }
  if (statusRaw && (VALID_STATUSES as readonly string[]).includes(statusRaw)) {
    conditions.push(eq(inquiriesTable.status, statusRaw));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalResult] = await Promise.all([
    db.select({
      id: inquiriesTable.id, inquiryNumber: inquiriesTable.inquiryNumber,
      createdAt: inquiriesTable.createdAt, status: inquiriesTable.status,
      fullName: inquiriesTable.fullName, email: inquiriesTable.email,
      phone: inquiriesTable.phone, preferredContact: inquiriesTable.preferredContact,
      address: inquiriesTable.address, city: inquiriesTable.city,
      state: inquiriesTable.state, zip: inquiriesTable.zip,
      propertyType: inquiriesTable.propertyType,
    }).from(inquiriesTable).where(where).orderBy(sortFn(sortCol)).limit(limit).offset(offset),
    db.select({ total: count() }).from(inquiriesTable).where(where),
  ]);

  return c.json({ items, total: Number(totalResult[0]?.total ?? 0), page, limit });
});

app.get("/admin/inquiries/:id/notes", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);
  const notes = await db.select().from(inquiryNotesTable)
    .where(eq(inquiryNotesTable.inquiryId, id)).orderBy(asc(inquiryNotesTable.createdAt));
  return c.json(notes);
});

app.post("/admin/inquiries/:id/notes", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }
  const note = sanitize(body.note, 10000);
  if (!note) return c.json({ error: "Note text is required." }, 400);

  const [inquiry] = await db.select({ id: inquiriesTable.id, inquiryNumber: inquiriesTable.inquiryNumber })
    .from(inquiriesTable).where(eq(inquiriesTable.id, id));
  if (!inquiry) return c.json({ error: "Inquiry not found." }, 404);

  const [row] = await db.insert(inquiryNotesTable)
    .values({ inquiryId: id, note, createdAt: NOW() }).returning();
  await addAudit(db, "note_added", `Note added to inquiry #${inquiry.inquiryNumber}`);
  return c.json(row, 201);
});

app.get("/admin/inquiries/:id", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);

  const [inquiry] = await db.select().from(inquiriesTable).where(eq(inquiriesTable.id, id));
  if (!inquiry) return c.json({ error: "Inquiry not found." }, 404);

  const photos = await db.select().from(propertyPhotosTable)
    .where(eq(propertyPhotosTable.inquiryId, id));
  return c.json({ ...inquiry, photos });
});

app.patch("/admin/inquiries/:id", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }

  const update: Partial<typeof inquiriesTable.$inferInsert> = {};
  if (body.status !== undefined) {
    if (!(VALID_STATUSES as readonly string[]).includes(body.status as string))
      return c.json({ error: "Invalid status value." }, 400);
    update.status = body.status as string;
  }
  if (body.notes !== undefined) {
    update.notes = body.notes === null || body.notes === "" ? null : String(body.notes).slice(0, 10000);
  }
  if (Object.keys(update).length === 0) return c.json({ error: "No fields to update." }, 400);

  const [updated] = await db.update(inquiriesTable).set(update)
    .where(eq(inquiriesTable.id, id)).returning();
  if (!updated) return c.json({ error: "Inquiry not found." }, 404);

  const photos = await db.select().from(propertyPhotosTable)
    .where(eq(propertyPhotosTable.inquiryId, id));
  return c.json({ ...updated, photos });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — PROPERTIES
// ══════════════════════════════════════════════════════════════════════════

app.get("/admin/properties", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);
  const rows = await db.select().from(propertiesTable)
    .orderBy(asc(propertiesTable.sortOrder), desc(propertiesTable.createdAt));
  return c.json(rows.map((r) => ({ ...r, imageKeys: r.imageKeys ? JSON.parse(r.imageKeys) : [] })));
});

app.post("/admin/properties", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);
  let b: Record<string, unknown>;
  try { b = await c.req.json(); } catch { b = {}; }

  const title = sanitize(b.title, 500);
  if (!title) return c.json({ error: "Title is required." }, 400);
  const imageKeys = Array.isArray(b.imageKeys) ? (b.imageKeys as unknown[]).filter((k): k is string => typeof k === "string") : [];
  const now = NOW();
  const [row] = await db.insert(propertiesTable).values({
    title, displayAddress: sanitize(b.displayAddress, 500),
    propertyType: sanitize(b.propertyType, 100), description: sanitize(b.description),
    status: b.status === "draft" ? "draft" : "published",
    featured: b.featured === true, sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : 0,
    imageKeys: JSON.stringify(imageKeys), createdAt: now, updatedAt: now,
  }).returning();
  await addAudit(db, "property_added", `Property "${title}" added`);
  return c.json({ ...row, imageKeys }, 201);
});

app.get("/admin/properties/:id", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);
  const [row] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, id));
  if (!row) return c.json({ error: "Not found." }, 404);
  return c.json({ ...row, imageKeys: row.imageKeys ? JSON.parse(row.imageKeys) : [] });
});

app.put("/admin/properties/:id", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);
  let b: Record<string, unknown>;
  try { b = await c.req.json(); } catch { b = {}; }

  const update: Partial<typeof propertiesTable.$inferInsert> = { updatedAt: NOW() };
  if (b.title !== undefined) update.title = sanitize(b.title, 500) ?? "";
  if (b.displayAddress !== undefined) update.displayAddress = sanitize(b.displayAddress, 500);
  if (b.propertyType !== undefined) update.propertyType = sanitize(b.propertyType, 100);
  if (b.description !== undefined) update.description = sanitize(b.description);
  if (b.status !== undefined) update.status = b.status === "draft" ? "draft" : "published";
  if (b.featured !== undefined) update.featured = b.featured === true;
  if (b.sortOrder !== undefined) update.sortOrder = typeof b.sortOrder === "number" ? b.sortOrder : 0;
  if (b.imageKeys !== undefined) {
    const keys = Array.isArray(b.imageKeys) ? (b.imageKeys as unknown[]).filter((k): k is string => typeof k === "string") : [];
    update.imageKeys = JSON.stringify(keys);
  }
  const [row] = await db.update(propertiesTable).set(update)
    .where(eq(propertiesTable.id, id)).returning();
  if (!row) return c.json({ error: "Not found." }, 404);
  await addAudit(db, "property_updated", `Property #${id} updated`);
  return c.json({ ...row, imageKeys: row.imageKeys ? JSON.parse(row.imageKeys) : [] });
});

app.delete("/admin/properties/:id", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);
  const [row] = await db.delete(propertiesTable).where(eq(propertiesTable.id, id)).returning();
  if (!row) return c.json({ error: "Not found." }, 404);
  await addAudit(db, "property_removed", `Property #${id} "${row.title}" removed`);
  return c.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — FAQs
// ══════════════════════════════════════════════════════════════════════════

app.get("/admin/faqs", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);
  return c.json(await db.select().from(faqsTable)
    .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt)));
});

app.post("/admin/faqs/reorder", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }
  if (!Array.isArray(body.order)) return c.json({ error: "order must be an array of ids." }, 400);
  const now = NOW();
  await Promise.all(
    (body.order as number[]).map((id, idx) =>
      db.update(faqsTable).set({ sortOrder: idx, updatedAt: now }).where(eq(faqsTable.id, id))
    )
  );
  return c.json({ success: true });
});

app.post("/admin/faqs", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);
  let b: Record<string, unknown>;
  try { b = await c.req.json(); } catch { b = {}; }

  const question = sanitize(b.question, 1000);
  const answer = sanitize(b.answer, 10000);
  if (!question) return c.json({ error: "Question is required." }, 400);
  if (!answer) return c.json({ error: "Answer is required." }, 400);
  const now = NOW();
  const [row] = await db.insert(faqsTable).values({
    question, answer, published: b.published !== false,
    sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : 0,
    createdAt: now, updatedAt: now,
  }).returning();
  await addAudit(db, "faq_added", `FAQ added: "${question.slice(0, 60)}"`);
  return c.json(row, 201);
});

app.put("/admin/faqs/:id", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);
  let b: Record<string, unknown>;
  try { b = await c.req.json(); } catch { b = {}; }

  const update: Partial<typeof faqsTable.$inferInsert> = { updatedAt: NOW() };
  if (b.question !== undefined) update.question = sanitize(b.question, 1000) ?? "";
  if (b.answer !== undefined) update.answer = sanitize(b.answer, 10000) ?? "";
  if (b.published !== undefined) update.published = b.published === true;
  if (b.sortOrder !== undefined) update.sortOrder = typeof b.sortOrder === "number" ? b.sortOrder : 0;
  const [row] = await db.update(faqsTable).set(update).where(eq(faqsTable.id, id)).returning();
  if (!row) return c.json({ error: "Not found." }, 404);
  await addAudit(db, "faq_updated", `FAQ #${id} updated`);
  return c.json(row);
});

app.delete("/admin/faqs/:id", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);
  const [row] = await db.delete(faqsTable).where(eq(faqsTable.id, id)).returning();
  if (!row) return c.json({ error: "Not found." }, 404);
  await addAudit(db, "faq_deleted", `FAQ #${id} deleted`);
  return c.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN — SITE SETTINGS
// ══════════════════════════════════════════════════════════════════════════

const SAFE_SETTING_KEYS = new Set([
  "company_name","contact_name","contact_phone","contact_email",
  "instagram_url","facebook_url","linkedin_url","twitter_url",
  "notification_email","main_cta_text","address","tagline","about_text",
]);

app.get("/admin/site-settings", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);
  const rows = await db.select().from(siteSettingsTable);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return c.json(out);
});

app.put("/admin/site-settings", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);
  let updates: Record<string, unknown>;
  try { updates = await c.req.json(); } catch { updates = {}; }

  const saved: string[] = [];
  const now = NOW();
  for (const [key, val] of Object.entries(updates)) {
    if (!SAFE_SETTING_KEYS.has(key)) continue;
    const value = sanitize(val, 2000);
    if (value === null) continue;
    await db.insert(siteSettingsTable).values({ key, value, updatedAt: now })
      .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value, updatedAt: now } });
    saved.push(key);
  }
  await addAudit(db, "settings_updated", `Updated: ${saved.join(", ")}`);
  return c.json({ success: true, updated: saved });
});

// ── Page Content ────────────────────────────────────────────────────────────

const VALID_PAGES = ["home","sell","how-it-works","why-us","properties","faq","contact","footer","privacy","terms"];

app.get("/admin/page-content/:page", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const page = c.req.param("page");
  if (!VALID_PAGES.includes(page)) return c.json({ error: "Invalid page." }, 400);
  const db = getDb(c.env);
  const [row] = await db.select().from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, `page_content:${page}`));
  return c.json(row ? JSON.parse(row.value) : {});
});

app.put("/admin/page-content/:page", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const page = c.req.param("page");
  if (!VALID_PAGES.includes(page)) return c.json({ error: "Invalid page." }, 400);
  const db = getDb(c.env);
  let content: unknown;
  try { content = await c.req.json(); } catch { content = {}; }
  const clean = sanitizeObject(content, 0);
  const value = JSON.stringify(clean);
  const now = NOW();
  await db.insert(siteSettingsTable).values({ key: `page_content:${page}`, value, updatedAt: now })
    .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value, updatedAt: now } });
  await addAudit(db, "content_updated", `Page content updated: ${page}`);
  return c.json({ success: true });
});

// ── Audit Log ───────────────────────────────────────────────────────────────

app.get("/admin/audit-log", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;
  const rows = await db.select().from(auditLogTable)
    .orderBy(desc(auditLogTable.createdAt)).limit(limit).offset(offset);
  return c.json(rows);
});

// ── Change Password ─────────────────────────────────────────────────────────

app.post("/admin/change-password", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || typeof currentPassword !== "string")
    return c.json({ error: "Current password is required." }, 400);
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4)
    return c.json({ error: "New password must be at least 4 characters." }, 400);

  const [hashRow] = await db.select().from(adminConfigTable)
    .where(eq(adminConfigTable.key, "password_hash"));
  const valid = await checkAdminPassword(currentPassword, hashRow?.value ?? null, c.env.ADMIN_PASSWORD);
  if (!valid) {
    await new Promise((r) => setTimeout(r, 500));
    return c.json({ error: "Current password is incorrect." }, 401);
  }

  const newHash = await hashPassword(newPassword);
  const now = NOW();
  await db.insert(adminConfigTable).values({ key: "password_hash", value: newHash, updatedAt: now })
    .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: newHash, updatedAt: now } });

  await addAudit(db, "password_changed", "Admin password changed");
  return c.json({ success: true });
});

// ── Inquiry Photos (admin view) ─────────────────────────────────────────────

app.get("/admin/inquiry-photos/:id", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "Invalid ID." }, 400);
  const db = getDb(c.env);
  const photos = await db.select().from(propertyPhotosTable)
    .where(eq(propertyPhotosTable.inquiryId, id));
  // When R2 is not configured, photo URLs won't resolve — that's expected
  const origin = new URL(c.req.url).origin;
  return c.json(photos.map((p) => ({
    ...p,
    url: c.env.PHOTOS ? `${origin}/api/photos/${p.objectKey}` : null,
  })));
});

// ══════════════════════════════════════════════════════════════════════════
// R2 UPLOAD — optional. Endpoints return 503 when R2 binding is absent.
// ══════════════════════════════════════════════════════════════════════════

app.put("/r2-upload", async (c) => {
  if (!c.env.PHOTOS) return c.json({ error: "Photo storage is not configured." }, 503);
  const key = c.req.query("key");
  if (!key || !key.startsWith("photos/") || key.includes("..")) {
    return c.json({ error: "Invalid key." }, 400);
  }
  const mimeType = c.req.header("Content-Type") ?? "application/octet-stream";
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(mimeType)) {
    return c.json({ error: "Invalid content type." }, 400);
  }
  const body = await c.req.arrayBuffer();
  if (body.byteLength > 20 * 1024 * 1024) {
    return c.json({ error: "File too large. Max 20 MB." }, 413);
  }
  await c.env.PHOTOS.put(key, body, { httpMetadata: { contentType: mimeType } });
  return c.json({ success: true });
});

// Serve R2 photos — returns 404 when R2 binding is absent
app.get("/photos/*", async (c) => {
  if (!c.env.PHOTOS) return c.json({ error: "Not found." }, 404);
  const key = c.req.param("*");
  if (!key) return c.json({ error: "Not found." }, 404);
  const obj = await c.env.PHOTOS.get(key);
  if (!obj) return c.json({ error: "Not found." }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC INQUIRIES
// ══════════════════════════════════════════════════════════════════════════

// In-memory rate limiter (resets per isolate lifetime — fine for edge deployments)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

// Admin-only photo upload URL (auth-protected)
app.post("/admin/properties/upload-url", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);

  if (!c.env.PHOTOS) return c.json({ error: "Photo storage is not configured." }, 503);

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }

  const filename = sanitize(body.filename);
  const mimeType = sanitize(body.mimeType);
  if (!filename) return c.json({ error: "filename is required." }, 400);

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!mimeType || !allowed.includes(mimeType)) {
    return c.json({ error: "Invalid file type. Allowed: JPEG, PNG, WEBP" }, 400);
  }

  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extMap[mimeType] ?? "jpg";
  const rand = new Uint8Array(8);
  crypto.getRandomValues(rand);
  const randHex = Array.from(rand).map((b) => b.toString(16).padStart(2, "0")).join("");
  const objectKey = `photos/${Date.now()}-${randHex}.${ext}`;

  const origin = new URL(c.req.url).origin;
  const uploadUrl = `${origin}/api/r2-upload?key=${encodeURIComponent(objectKey)}`;
  return c.json({ uploadUrl, objectKey });
});

app.post("/inquiries/upload-url", async (c) => {
  // Photo uploads are disabled when R2 is not configured
  if (!c.env.PHOTOS) {
    return c.json({ error: "Photo uploads are not available." }, 503);
  }

  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }

  const filename = sanitize(body.filename);
  const mimeType = sanitize(body.mimeType);
  if (!filename) return c.json({ error: "filename is required." }, 400);

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!mimeType || !allowed.includes(mimeType)) {
    return c.json({ error: "Invalid file type. Allowed: JPEG, PNG, WEBP" }, 400);
  }

  const extMap: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = extMap[mimeType] ?? "jpg";
  const rand = new Uint8Array(8);
  crypto.getRandomValues(rand);
  const randHex = Array.from(rand).map((b) => b.toString(16).padStart(2, "0")).join("");
  const objectKey = `photos/${Date.now()}-${randHex}.${ext}`;

  // Return upload URL pointing to our own R2 proxy endpoint
  const origin = new URL(c.req.url).origin;
  const uploadUrl = `${origin}/api/r2-upload?key=${encodeURIComponent(objectKey)}`;
  return c.json({ uploadUrl, objectKey });
});

app.post("/inquiries", async (c) => {
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For") ??
    "unknown";
  if (!checkRateLimit(ip)) {
    return c.json({ error: "Too many submissions. Please try again later." }, 429);
  }

  const db = getDb(c.env);
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { body = {}; }

  // Sanitize required fields
  const address = sanitize(body.address);
  const city = sanitize(body.city);
  const state = sanitize(body.state);
  const zip = sanitize(body.zip);
  const fullName = sanitize(body.fullName);
  const email = sanitize(body.email);
  const phone = sanitize(body.phone);
  const preferredContact = sanitize(body.preferredContact);

  if (!address || address.length < 3) return c.json({ error: "A valid property address is required." }, 400);
  if (!city) return c.json({ error: "City is required." }, 400);
  if (!state || state.length < 2) return c.json({ error: "State is required." }, 400);
  if (!zip || zip.length < 5) return c.json({ error: "A valid ZIP code is required." }, 400);
  if (!fullName || fullName.length < 2) return c.json({ error: "Full name is required." }, 400);
  if (!email || !email.includes("@")) return c.json({ error: "A valid email address is required." }, 400);
  if (!phone || phone.replace(/\D/g, "").length < 10) return c.json({ error: "A valid phone number is required." }, 400);
  if (!["call","text","email"].includes(preferredContact ?? "")) return c.json({ error: "Preferred contact method is required." }, 400);
  if (body.contactConsent !== true) return c.json({ error: "Contact consent is required." }, 400);

  const validPropTypes = ["single_family","multi_family","condo","townhouse","land","other"];
  const propertyTypeRaw = sanitize(body.propertyType);
  const propertyType = propertyTypeRaw && validPropTypes.includes(propertyTypeRaw) ? propertyTypeRaw : null;

  const validConditions = ["excellent","good","needs_some_work","needs_major_repairs"];
  const conditionRaw = sanitize(body.propertyCondition);
  const propertyCondition = conditionRaw && validConditions.includes(conditionRaw) ? conditionRaw : null;

  const validTimelines = ["asap","within_30_days","one_to_three_months","three_to_six_months","just_exploring"];
  const timelineRaw = sanitize(body.sellingTimeline);
  const sellingTimeline = timelineRaw && validTimelines.includes(timelineRaw) ? timelineRaw : null;

  const photoKeys = (Array.isArray(body.photoKeys) ? body.photoKeys : [])
    .filter((k): k is string => typeof k === "string" && k.length > 0)
    .slice(0, 15);

  // Generate inquiry number
  const [{ total }] = await db.select({ total: count() }).from(inquiriesTable);
  const seq = String(Number(total) + 1).padStart(5, "0");
  const inquiryNumber = `REH-${new Date().getFullYear()}-${seq}`;
  const now = NOW();

  const [inquiry] = await db.insert(inquiriesTable).values({
    inquiryNumber, status: "new",
    fullName: fullName!, email: email!, phone: phone!,
    preferredContact: preferredContact!, address: address!,
    city: city!, state: state!, zip: zip!,
    propertyType, bedrooms: sanitize(body.bedrooms), bathrooms: sanitize(body.bathrooms),
    squareFootage: sanitize(body.squareFootage), occupied: sanitize(body.occupied),
    propertyCondition, repairs: sanitize(body.repairs),
    sellingReason: sanitize(body.sellingReason), sellingTimeline, contactConsent: true,
    source: sanitize(body.source) ?? "website",
    utmSource: sanitize(body.utmSource), utmMedium: sanitize(body.utmMedium),
    utmCampaign: sanitize(body.utmCampaign), createdAt: now,
  }).returning();

  if (photoKeys.length > 0) {
    await db.insert(propertyPhotosTable).values(
      photoKeys.map((key) => ({
        inquiryId: inquiry.id, objectKey: key,
        originalFilename: key.split("/").pop() ?? key,
        mimeType: null, uploadedAt: now,
      }))
    );
  }

  // Send email (non-blocking)
  sendInquiryEmail(inquiry, photoKeys, c.env).catch((err) => {
    console.error("Failed to send inquiry email:", err);
  });

  return c.json({
    id: inquiry.id, inquiryNumber: inquiry.inquiryNumber,
    message: "Your inquiry has been received. We will contact you shortly.",
    firstName: fullName!.split(" ")[0] ?? fullName,
  }, 201);
});

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC SITE DATA
// ══════════════════════════════════════════════════════════════════════════

app.get("/site/faqs", async (c) => {
  const db = getDb(c.env);
  const rows = await db.select({
    id: faqsTable.id, question: faqsTable.question,
    answer: faqsTable.answer, sortOrder: faqsTable.sortOrder,
  }).from(faqsTable)
    .where(eq(faqsTable.published, true))
    .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt));
  return c.json(rows);
});

app.get("/site/properties", async (c) => {
  const db = getDb(c.env);
  const rows = await db.select().from(propertiesTable)
    .where(eq(propertiesTable.status, "published"))
    .orderBy(asc(propertiesTable.sortOrder), desc(propertiesTable.createdAt));
  return c.json(rows.map((r) => ({ ...r, imageKeys: r.imageKeys ? JSON.parse(r.imageKeys) : [] })));
});

const PUBLIC_KEYS = new Set([
  "company_name","contact_name","contact_phone","contact_email",
  "instagram_url","facebook_url","linkedin_url","twitter_url",
  "main_cta_text","address","tagline",
]);

app.get("/site/settings", async (c) => {
  const db = getDb(c.env);
  const rows = await db.select().from(siteSettingsTable);
  const out: Record<string, string> = {};
  for (const r of rows) if (PUBLIC_KEYS.has(r.key)) out[r.key] = r.value;
  return c.json(out);
});

app.get("/site/page-content/:page", async (c) => {
  const page = c.req.param("page");
  if (!VALID_PAGES.includes(page)) return c.json({ error: "Invalid page." }, 400);
  const db = getDb(c.env);
  const [row] = await db.select().from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, `page_content:${page}`));
  return c.json(row ? JSON.parse(row.value) : {});
});

// ── Seed: insert default settings without overwriting existing ones ────────
app.post("/site/seed", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  const db = getDb(c.env);

  const DEFAULT_SETTINGS: { key: string; value: string }[] = [
    { key: "company_name",   value: "Rehman INC" },
    { key: "contact_name",   value: "Ali Rehman" },
    { key: "contact_phone",  value: "609-582-1061" },
    { key: "contact_email",  value: "Aliproperties91@gmail.com" },
    { key: "instagram_url",  value: "https://www.instagram.com/ali_monopoly/?utm_source=ig_web_button_share_sheet" },
    { key: "page_content:home", value: JSON.stringify({
      heroEyebrow:       "Direct Real Estate Investments",
      heroHeadline:      "Sell Your House for Cash.",
      heroSubheadline:   "Skip the Repairs. Skip the Stress.",
      heroBody:          "Sell your property as-is and see if Rehman INC can provide a straightforward, no-obligation offer.",
      heroCta:           "GET MY CASH OFFER",
      heroImage:         "",
      howItWorksTitle:   "How It Works",
      howItWorksSubtitle:"Our process is designed to be transparent, efficient, and entirely built around your needs.",
      whyUsTitle:        "A Simpler Way to Sell Your Property",
      whyUsSubtitle:     "",
      situationsTitle:   "Whatever The Situation, Let's Talk.",
      situationsSubtitle:"We work with property owners navigating a variety of circumstances.",
      finalCtaTitle:     "Ready To Talk About Your Property?",
      finalCtaSubtitle:  "Enter your property address below to start the process. No pressure, no obligations.",
      finalCtaButton:    "GET STARTED",
    }) },
    { key: "page_content:sell", value: JSON.stringify({
      heroEyebrow:  "Sell Directly",
      heroHeadline: "Sell Your Property Without the Traditional Hassle.",
      heroSubtext:  "Tell us about your property and see whether Rehman INC is the right fit for your situation.",
      formTitle:    "Start Your Inquiry",
      formSubtitle: "It takes just a few minutes to provide the details we need to begin our review.",
    }) },
    { key: "page_content:how-it-works", value: JSON.stringify({
      heroEyebrow:  "The Process",
      heroHeadline: "A Straightforward Way to Sell.",
      heroSubtext:  "From the first property details to the final conversation, we keep the process clear and direct.",
      step1Title:   "Tell us about your property",
      step1Body:    "Submit your address and answer a few initial questions about the property's condition and your current situation.",
      step2Title:   "Rehman INC reviews the property",
      step2Body:    "Our team evaluates the property's location, current condition, market factors, and required repairs.",
      step3Title:   "Discuss an offer if the property is a fit",
      step3Body:    "If the property aligns with our criteria, we'll have a straightforward conversation about a cash offer with no obligation.",
    }) },
    { key: "page_content:why-us", value: JSON.stringify({
      heroEyebrow:  "Why Rehman INC",
      heroHeadline: "Real Estate. Direct Conversations. Clear Decisions.",
      heroSubtext:  "We provide property owners with an alternative to the traditional listing process.",
      intro:        "Rehman INC works directly with property owners who prioritize simplicity, speed, and certainty over the traditional listing process.",
    }) },
    { key: "page_content:contact", value: JSON.stringify({
      heroEyebrow:  "Contact Rehman INC",
      heroHeadline: "Let's Talk About Your Property.",
      heroSubtext:  "Have a property you're considering selling? Send us the details and we'll get in touch.",
      intro:        "",
    }) },
    { key: "page_content:privacy", value: JSON.stringify({
      pageTitle:   "Privacy Policy",
      lastUpdated: "October 2026",
      disclaimer:  "This page describes our privacy practices and is for informational purposes only. It does not constitute legal advice.",
    }) },
    { key: "page_content:terms", value: JSON.stringify({
      pageTitle:   "Terms of Service",
      lastUpdated: "October 2026",
      disclaimer:  "This page is for informational purposes only and does not constitute legal, tax, or financial advice.",
    }) },
    { key: "page_content:faq", value: JSON.stringify({
      heroEyebrow:  "Common Questions",
      heroHeadline: "Questions About Selling? Start Here.",
      heroSubtext:  "Learn more about the Rehman INC process and what to expect when you contact us.",
    }) },
    { key: "page_content:properties", value: JSON.stringify({
      heroEyebrow:  "Our Portfolio",
      heroHeadline: "Real Estate We Acquire and Manage.",
      heroSubtext:  "Explore the types of properties that fit the Rehman INC investment strategy.",
    }) },
    { key: "page_content:footer", value: JSON.stringify({
      tagline:    "We provide straightforward, no-obligation cash offers for properties in any condition. Skip the repairs, showings, and uncertainty of a traditional sale.",
      disclaimer: "Rehman INC does not provide legal, tax, or financial advice.",
      copyright:  "",
    }) },
  ];

  let inserted = 0;
  const now = NOW();
  for (const row of DEFAULT_SETTINGS) {
    const [existing] = await db.select().from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, row.key));

    if (!existing) {
      // No record yet — insert the full default
      await db.insert(siteSettingsTable).values({ ...row, updatedAt: now });
      inserted++;
    } else if (row.key.startsWith("page_content:")) {
      // Merge field-level: defaults only fill keys that are missing or blank
      let current: Record<string, string> = {};
      try { current = JSON.parse(existing.value) as Record<string, string>; } catch { /* ok */ }
      const defaults = JSON.parse(row.value) as Record<string, string>;
      let changed = false;
      for (const [k, v] of Object.entries(defaults)) {
        if (!current[k] || current[k].trim() === "") {
          current[k] = v;
          changed = true;
        }
      }
      if (changed) {
        await db.update(siteSettingsTable)
          .set({ value: JSON.stringify(current), updatedAt: now })
          .where(eq(siteSettingsTable.key, row.key));
        inserted++;
      }
    }
    // For non-page_content scalar settings, skip if exists (never overwrite)
  }

  return c.json({ ok: true, inserted, total: DEFAULT_SETTINGS.length });
});

// ══════════════════════════════════════════════════════════════════════════
// FORECLOSURE TRACKER
// ══════════════════════════════════════════════════════════════════════════

// ── Schema init helper (run once per cold-start, idempotent) ────────────────
let fcSchemaReady = false;
async function ensureFcSchema(env: Env): Promise<void> {
  if (fcSchemaReady) return;
  await ensureForeclosuresTable(env.DB);
  fcSchemaReady = true;
}

// ── Sort-column compat map: old sortBy names → D1 column names ───────────────
const FC_SORT_COMPAT: Record<string, string> = {
  upset: "upset_amount", upset_amount: "upset_amount",
  score: "deal_score",   deal_score: "deal_score",
  date:  "current_sale_date", current_sale_date: "current_sale_date",
  rating:"deal_rating",  deal_rating: "deal_rating",
  spread:"estimated_spread", estimated_spread: "estimated_spread",
  discount: "discount_percent", discount_percent: "discount_percent",
  market: "market_value_used", market_value_used: "market_value_used",
  sheriff: "sheriff_number", sheriff_number: "sheriff_number",
};

// GET /api/foreclosures — backward-compat alias for /api/foreclosures/listings
// Accepts old-style params: page, limit, sortBy, sortDir, county, rating, maxUpset
// as well as new-style params: sort, order, offset, deal, upsetMax
app.get("/foreclosures", async (c) => {
  await ensureFcSchema(c.env);
  const q = c.req.query();

  // Map old-style → new-style params
  const rawSort   = q.sortBy ?? q.sort ?? "upset_amount";
  const sort      = FC_SORT_COMPAT[rawSort] ?? "upset_amount";
  const order     = (q.sortDir ?? q.order ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const limit     = Math.min(parseInt(q.limit ?? "50", 10) || 50, 1000);
  const page      = Math.max(parseInt(q.page ?? "1", 10) || 1, 1);
  const offset    = q.offset != null ? parseInt(q.offset, 10) || 0 : (page - 1) * limit;
  const deal      = q.rating ?? q.deal;
  const upsetMaxRaw = q.maxUpset ?? q.upsetMax;
  const upsetMax  = upsetMaxRaw != null ? (parseFloat(upsetMaxRaw) || undefined) : undefined;
  const county    = q.county;
  const search    = q.search;

  try {
    const result = await queryListings(c.env.DB, { sort, order, limit, offset, deal, upsetMax, county, search });
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// GET /api/foreclosures/listings — public (no auth required)
app.get("/foreclosures/listings", async (c) => {
  try {
    await ensureFcSchema(c.env);
    const q = c.req.query;
    const county = q("county") ?? undefined;
    const search = q("search") ?? undefined;
    const deal = q("deal") ?? undefined;
    const type = q("type") ?? undefined;
    const upsetMaxRaw = q("upsetMax");
    const upsetMax = upsetMaxRaw ? parseFloat(upsetMaxRaw) : undefined;
    const sort = q("sort") ?? undefined;
    const order = (q("order") ?? "desc") as "asc" | "desc";
    const limitRaw = q("limit");
    const limit = limitRaw ? Math.min(parseInt(limitRaw), 500) : 200;
    const offsetRaw = q("offset");
    const offset = offsetRaw ? parseInt(offsetRaw) : 0;

    const { rows, total } = await queryListings(c.env.DB, {
      county, search, deal, type, upsetMax, sort, order, limit, offset,
    });
    return c.json({ rows, total, limit, offset });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[foreclosures/listings] error:", err);
    return c.json({ error: "Unable to load foreclosure listings", detail }, 500);
  }
});

// GET /api/foreclosures/stats — public
app.get("/foreclosures/stats", async (c) => {
  try {
    await ensureFcSchema(c.env);
    const stats = await queryStats(c.env.DB);
    return c.json({
      ...stats,
      // Safe booleans only — key values are never sent to the browser
      zillowConfigured:   Boolean(c.env.ZILLOW_RAPIDAPI_KEY),
      redfinConfigured:   Boolean(c.env.REDFIN_RAPIDAPI_KEY),
      rentcastConfigured: Boolean(c.env.RENTCAST_API_KEY),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[foreclosures/stats] error:", err);
    return c.json({ error: "Unable to load foreclosure stats", detail }, 500);
  }
});

// GET /api/foreclosures/listings/:sheriffNumber — public
app.get("/foreclosures/listings/:sheriff", async (c) => {
  try {
    await ensureFcSchema(c.env);
    const sheriff = c.req.param("sheriff");
    if (!sheriff) return c.json({ error: "sheriff_number required" }, 400);
    const row = await getForeclosureBySherifffNumber(c.env.DB, sheriff.toUpperCase());
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[foreclosures/listing] error:", err);
    return c.json({ error: "Unable to load foreclosure listing", detail }, 500);
  }
});

// POST /api/foreclosures/sync/:county — admin only
app.post("/foreclosures/sync/:county", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);

  const countySlug = c.req.param("county");
  if (!VALID_COUNTIES.includes(countySlug)) {
    return c.json({ error: `Unknown county. Valid: ${VALID_COUNTIES.join(", ")}` }, 400);
  }

  await ensureFcSchema(c.env);

  const fcEnv = {
    ZILLOW_RAPIDAPI_KEY: c.env.ZILLOW_RAPIDAPI_KEY,
    ZILLOW_RAPIDAPI_HOST: c.env.ZILLOW_RAPIDAPI_HOST,
    REDFIN_RAPIDAPI_KEY: c.env.REDFIN_RAPIDAPI_KEY,
    REDFIN_RAPIDAPI_HOST: c.env.REDFIN_RAPIDAPI_HOST,
  };

  try {
    const summary = await runSync(countySlug, c.env.DB, fcEnv);
    return c.json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[foreclosures/sync] error:", err);
    return c.json({ error: msg }, 500);
  }
});

// POST /api/foreclosures/listings/:sheriff/valuate — admin only
app.post("/foreclosures/listings/:sheriff/valuate", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  await ensureFcSchema(c.env);
  const sheriff = c.req.param("sheriff")?.toUpperCase();
  if (!sheriff) return c.json({ error: "sheriff_number required" }, 400);
  const fcEnv = {
    ZILLOW_RAPIDAPI_KEY: c.env.ZILLOW_RAPIDAPI_KEY,
    ZILLOW_RAPIDAPI_HOST: c.env.ZILLOW_RAPIDAPI_HOST,
    REDFIN_RAPIDAPI_KEY: c.env.REDFIN_RAPIDAPI_KEY,
    REDFIN_RAPIDAPI_HOST: c.env.REDFIN_RAPIDAPI_HOST,
  };
  try {
    const result = await valuateListing(c.env.DB, sheriff, fcEnv);
    const row = await getForeclosureBySherifffNumber(c.env.DB, sheriff);
    return c.json({ ok: true, ...result, listing: row });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// POST /api/foreclosures/listings/:sheriff/recalculate — admin only
app.post("/foreclosures/listings/:sheriff/recalculate", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  await ensureFcSchema(c.env);
  const sheriff = c.req.param("sheriff")?.toUpperCase();
  if (!sheriff) return c.json({ error: "sheriff_number required" }, 400);
  try {
    const result = await recalculateListing(c.env.DB, sheriff);
    const row = await getForeclosureBySherifffNumber(c.env.DB, sheriff);
    return c.json({ ok: true, ...result, listing: row });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// PATCH /api/foreclosures/listings/:sheriff/redfin — admin only
app.patch("/foreclosures/listings/:sheriff/redfin", async (c) => {
  const token = getCookie(c, COOKIE_NAME);
  if (!(await isAuthed(c as never, token))) return unauthed(c);
  await ensureFcSchema(c.env);
  const sheriff = c.req.param("sheriff")?.toUpperCase();
  if (!sheriff) return c.json({ error: "sheriff_number required" }, 400);
  const body = await c.req.json<{ estimate?: unknown }>();
  const estimate = typeof body.estimate === "number" && body.estimate > 0 ? body.estimate : null;
  if (!estimate) return c.json({ error: "estimate must be a positive number" }, 400);
  try {
    const result = await updateRedfinEstimate(c.env.DB, sheriff, estimate);
    const row = await getForeclosureBySherifffNumber(c.env.DB, sheriff);
    return c.json({ ok: true, ...result, listing: row });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Export for Cloudflare Pages
// ══════════════════════════════════════════════════════════════════════════

export const onRequest = handle(app);
