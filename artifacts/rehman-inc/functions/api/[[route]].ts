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

// ─── Types ─────────────────────────────────────────────────────────────────

type Env = {
  DB: D1Database;
  PHOTOS: R2Bucket;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  INQUIRY_NOTIFICATION_EMAIL?: string;
  SESSION_SECRET: string;
  ADMIN_PASSWORD?: string;
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

const VALID_PAGES = ["home","sell","how-it-works","why-us","properties","faq","contact","footer"];

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
  // Photos served via /api/photos/:key endpoint below
  const origin = new URL(c.req.url).origin;
  return c.json(photos.map((p) => ({
    ...p,
    url: `${origin}/api/photos/${p.objectKey}`,
  })));
});

// ══════════════════════════════════════════════════════════════════════════
// R2 UPLOAD — direct upload proxy (PUT /api/r2-upload?key=...)
// Frontend first gets a key from /api/inquiries/upload-url,
// then PUTs the file here. No S3 signing needed.
// ══════════════════════════════════════════════════════════════════════════

app.put("/r2-upload", async (c) => {
  const key = c.req.query("key");
  // Validate: must start with "photos/"
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

// Serve R2 photos (private access through function)
app.get("/photos/*", async (c) => {
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

app.post("/inquiries/upload-url", async (c) => {
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

// ══════════════════════════════════════════════════════════════════════════
// Export for Cloudflare Pages
// ══════════════════════════════════════════════════════════════════════════

export const onRequest = handle(app);
