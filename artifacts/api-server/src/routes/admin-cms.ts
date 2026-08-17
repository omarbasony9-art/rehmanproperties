import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  propertiesTable,
  faqsTable,
  siteSettingsTable,
  auditLogTable,
  inquiryNotesTable,
  adminConfigTable,
  inquiriesTable,
  propertyPhotosTable,
} from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { hashPassword, checkAdminPassword } from "../lib/auth";

const router: IRouter = Router();
const COOKIE_NAME = "admin_token";

function isAuthenticated(req: Parameters<Parameters<IRouter["get"]>[1]>[0]): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookieToken = (req as any).signedCookies?.[COOKIE_NAME];
  if (cookieToken && validateSession(cookieToken)) return true;

  const authHeader = req.headers.authorization ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    return validateSession(bearerToken);
  }
  return false;
}

function sanitize(val: unknown, max = 10000): string | null {
  if (val === undefined || val === null) return null;
  return String(val).trim().slice(0, max);
}

async function addAuditLog(action: string, details?: string): Promise<void> {
  try {
    await db.insert(auditLogTable).values({ action, details: details ?? null });
  } catch { /* non-critical */ }
}

// ─── PROPERTIES ────────────────────────────────────────────────────────────

router.get("/admin/properties", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const rows = await db.select().from(propertiesTable).orderBy(asc(propertiesTable.sortOrder), desc(propertiesTable.createdAt));
  res.json(rows.map(r => ({ ...r, imageKeys: r.imageKeys ? JSON.parse(r.imageKeys) : [] })));
});

router.post("/admin/properties", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const b = req.body ?? {};
  const title = sanitize(b.title, 500);
  if (!title) { res.status(400).json({ error: "Title is required." }); return; }
  const imageKeys = Array.isArray(b.imageKeys) ? b.imageKeys.filter((k: unknown) => typeof k === "string") : [];
  const [row] = await db.insert(propertiesTable).values({
    title,
    displayAddress: sanitize(b.displayAddress, 500),
    propertyType: sanitize(b.propertyType, 100),
    description: sanitize(b.description),
    status: b.status === "draft" ? "draft" : "published",
    featured: b.featured === true,
    sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : 0,
    imageKeys: JSON.stringify(imageKeys),
  }).returning();
  await addAuditLog("property_added", `Property "${title}" added`);
  res.status(201).json({ ...row, imageKeys });
});

router.get("/admin/properties/:id", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const [row] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found." }); return; }
  res.json({ ...row, imageKeys: row.imageKeys ? JSON.parse(row.imageKeys) : [] });
});

router.put("/admin/properties/:id", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const b = req.body ?? {};
  const imageKeys = Array.isArray(b.imageKeys) ? b.imageKeys.filter((k: unknown) => typeof k === "string") : undefined;
  const updateData: Partial<typeof propertiesTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (b.title !== undefined) updateData.title = sanitize(b.title, 500) ?? "";
  if (b.displayAddress !== undefined) updateData.displayAddress = sanitize(b.displayAddress, 500);
  if (b.propertyType !== undefined) updateData.propertyType = sanitize(b.propertyType, 100);
  if (b.description !== undefined) updateData.description = sanitize(b.description);
  if (b.status !== undefined) updateData.status = b.status === "draft" ? "draft" : "published";
  if (b.featured !== undefined) updateData.featured = b.featured === true;
  if (b.sortOrder !== undefined) updateData.sortOrder = typeof b.sortOrder === "number" ? b.sortOrder : 0;
  if (imageKeys !== undefined) updateData.imageKeys = JSON.stringify(imageKeys);
  const [row] = await db.update(propertiesTable).set(updateData).where(eq(propertiesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found." }); return; }
  await addAuditLog("property_updated", `Property #${id} updated`);
  res.json({ ...row, imageKeys: row.imageKeys ? JSON.parse(row.imageKeys) : [] });
});

router.delete("/admin/properties/:id", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const [row] = await db.delete(propertiesTable).where(eq(propertiesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found." }); return; }
  await addAuditLog("property_removed", `Property #${id} "${row.title}" removed`);
  res.json({ success: true });
});

// ─── FAQs ──────────────────────────────────────────────────────────────────

router.get("/admin/faqs", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const rows = await db.select().from(faqsTable).orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt));
  res.json(rows);
});

router.post("/admin/faqs", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const b = req.body ?? {};
  const question = sanitize(b.question, 1000);
  const answer = sanitize(b.answer, 10000);
  if (!question) { res.status(400).json({ error: "Question is required." }); return; }
  if (!answer) { res.status(400).json({ error: "Answer is required." }); return; }
  const [row] = await db.insert(faqsTable).values({
    question, answer,
    published: b.published !== false,
    sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : 0,
  }).returning();
  await addAuditLog("faq_added", `FAQ added: "${question.slice(0, 60)}"`);
  res.status(201).json(row);
});

router.put("/admin/faqs/:id", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const b = req.body ?? {};
  const update: Partial<typeof faqsTable.$inferInsert> = { updatedAt: new Date() };
  if (b.question !== undefined) update.question = sanitize(b.question, 1000) ?? "";
  if (b.answer !== undefined) update.answer = sanitize(b.answer, 10000) ?? "";
  if (b.published !== undefined) update.published = b.published === true;
  if (b.sortOrder !== undefined) update.sortOrder = typeof b.sortOrder === "number" ? b.sortOrder : 0;
  const [row] = await db.update(faqsTable).set(update).where(eq(faqsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found." }); return; }
  await addAuditLog("faq_updated", `FAQ #${id} updated`);
  res.json(row);
});

router.delete("/admin/faqs/:id", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const [row] = await db.delete(faqsTable).where(eq(faqsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found." }); return; }
  await addAuditLog("faq_deleted", `FAQ #${id} deleted`);
  res.json({ success: true });
});

// Bulk reorder
router.post("/admin/faqs/reorder", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const { order } = req.body ?? {};
  if (!Array.isArray(order)) { res.status(400).json({ error: "order must be an array of ids." }); return; }
  await Promise.all(
    (order as number[]).map((id, idx) =>
      db.update(faqsTable).set({ sortOrder: idx, updatedAt: new Date() }).where(eq(faqsTable.id, id))
    )
  );
  res.json({ success: true });
});

// ─── SITE SETTINGS ─────────────────────────────────────────────────────────

const SAFE_SETTING_KEYS = new Set([
  "company_name", "contact_name", "contact_phone", "contact_email",
  "instagram_url", "facebook_url", "linkedin_url", "twitter_url",
  "notification_email", "main_cta_text", "address", "tagline",
  "about_text",
]);

router.get("/admin/site-settings", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const rows = await db.select().from(siteSettingsTable);
  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

router.put("/admin/site-settings", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const updates = req.body ?? {};
  const saved: string[] = [];
  for (const [key, val] of Object.entries(updates)) {
    if (!SAFE_SETTING_KEYS.has(key)) continue;
    const value = sanitize(val, 2000);
    if (value === null) continue;
    await db.insert(siteSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value, updatedAt: new Date() } });
    saved.push(key);
  }
  await addAuditLog("settings_updated", `Updated: ${saved.join(", ")}`);
  res.json({ success: true, updated: saved });
});

// ─── PAGE CONTENT ──────────────────────────────────────────────────────────

const VALID_PAGES = ["home", "sell", "how-it-works", "why-us", "properties", "faq", "contact", "footer"];

router.get("/admin/page-content/:page", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const page = req.params["page"] ?? "";
  if (!VALID_PAGES.includes(page)) { res.status(400).json({ error: "Invalid page." }); return; }
  const [row] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, `page_content:${page}`));
  res.json(row ? JSON.parse(row.value) : {});
});

router.put("/admin/page-content/:page", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const page = req.params["page"] ?? "";
  if (!VALID_PAGES.includes(page)) { res.status(400).json({ error: "Invalid page." }); return; }
  const content = req.body ?? {};
  // Sanitize all string values recursively (no HTML allowed, plain text only)
  const clean = sanitizeObject(content, 0);
  const value = JSON.stringify(clean);
  await db.insert(siteSettingsTable)
    .values({ key: `page_content:${page}`, value })
    .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value, updatedAt: new Date() } });
  await addAuditLog("content_updated", `Page content updated: ${page}`);
  res.json({ success: true });
});

function sanitizeObject(obj: unknown, depth: number): unknown {
  if (depth > 5) return null;
  if (typeof obj === "string") return obj.trim().slice(0, 5000);
  if (typeof obj === "boolean" || typeof obj === "number") return obj;
  if (Array.isArray(obj)) return obj.slice(0, 50).map(v => sanitizeObject(v, depth + 1));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof k === "string" && k.length < 100) {
        result[k] = sanitizeObject(v, depth + 1);
      }
    }
    return result;
  }
  return null;
}

// ─── AUDIT LOG ─────────────────────────────────────────────────────────────

router.get("/admin/audit-log", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10)));
  const offset = (page - 1) * limit;
  const rows = await db.select().from(auditLogTable).orderBy(desc(auditLogTable.createdAt)).limit(limit).offset(offset);
  res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

// ─── INQUIRY NOTES ─────────────────────────────────────────────────────────

router.get("/admin/inquiries/:id/notes", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const notes = await db.select().from(inquiryNotesTable).where(eq(inquiryNotesTable.inquiryId, id)).orderBy(asc(inquiryNotesTable.createdAt));
  res.json(notes.map(n => ({ ...n, createdAt: n.createdAt.toISOString() })));
});

router.post("/admin/inquiries/:id/notes", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const note = sanitize(req.body?.note, 10000);
  if (!note || note.length < 1) { res.status(400).json({ error: "Note text is required." }); return; }
  // Verify inquiry exists
  const [inquiry] = await db.select({ id: inquiriesTable.id, inquiryNumber: inquiriesTable.inquiryNumber }).from(inquiriesTable).where(eq(inquiriesTable.id, id));
  if (!inquiry) { res.status(404).json({ error: "Inquiry not found." }); return; }
  const [row] = await db.insert(inquiryNotesTable).values({ inquiryId: id, note }).returning();
  await addAuditLog("note_added", `Note added to inquiry #${inquiry.inquiryNumber}`);
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

// ─── CHANGE PASSWORD ────────────────────────────────────────────────────────

router.post("/admin/change-password", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || typeof currentPassword !== "string") {
    res.status(400).json({ error: "Current password is required." }); return;
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4) {
    res.status(400).json({ error: "New password must be at least 4 characters." }); return;
  }

  // Get existing hash if any
  const [hashRow] = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, "password_hash"));
  const storedHash = hashRow?.value ?? null;

  if (!checkAdminPassword(currentPassword, storedHash)) {
    await new Promise<void>(r => setTimeout(r, 500));
    res.status(401).json({ error: "Current password is incorrect." }); return;
  }

  const newHash = hashPassword(newPassword);
  await db.insert(adminConfigTable)
    .values({ key: "password_hash", value: newHash })
    .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: newHash, updatedAt: new Date() } });

  await addAuditLog("password_changed", "Admin password changed");
  req.log.info("Admin password changed");
  res.json({ success: true });
});

// ─── PHOTOS ─────────────────────────────────────────────────────────────────

router.get("/admin/inquiry-photos/:id", async (req, res): Promise<void> => {
  if (!isAuthenticated(req)) { res.status(401).json({ error: "Not authenticated." }); return; }
  const id = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID." }); return; }
  const photos = await db.select().from(propertyPhotosTable).where(eq(propertyPhotosTable.inquiryId, id));
  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";
  res.json(photos.map(p => ({
    ...p,
    url: R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${p.objectKey}` : null,
    uploadedAt: p.uploadedAt.toISOString(),
  })));
});

export default router;
