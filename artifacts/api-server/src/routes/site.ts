// Public site data endpoints — no auth required, safe read-only data only
import { Router, type IRouter } from "express";
import { db, faqsTable, propertiesTable, siteSettingsTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /site/faqs — published FAQs in order
router.get("/site/faqs", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ id: faqsTable.id, question: faqsTable.question, answer: faqsTable.answer, sortOrder: faqsTable.sortOrder })
    .from(faqsTable)
    .where(eq(faqsTable.published, true))
    .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt));
  res.json(rows);
});

// GET /site/properties — published properties
router.get("/site/properties", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.status, "published"))
    .orderBy(asc(propertiesTable.sortOrder), desc(propertiesTable.createdAt));
  res.json(rows.map(r => ({ ...r, imageKeys: r.imageKeys ? JSON.parse(r.imageKeys) : [] })));
});

// GET /site/settings — safe public settings (contact info, social links)
const PUBLIC_KEYS = new Set([
  "company_name", "contact_name", "contact_phone", "contact_email",
  "instagram_url", "facebook_url", "linkedin_url", "twitter_url",
  "main_cta_text", "address", "tagline",
]);

router.get("/site/settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(siteSettingsTable);
  const settings: Record<string, string> = {};
  for (const row of rows) {
    if (PUBLIC_KEYS.has(row.key)) settings[row.key] = row.value;
  }
  res.json(settings);
});

// GET /site/page-content/:page
const VALID_PAGES = ["home", "sell", "how-it-works", "why-us", "properties", "faq", "contact", "footer"];

router.get("/site/page-content/:page", async (req, res): Promise<void> => {
  const page = req.params["page"] ?? "";
  if (!VALID_PAGES.includes(page)) { res.status(400).json({ error: "Invalid page." }); return; }
  const [row] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, `page_content:${page}`));
  res.json(row ? JSON.parse(row.value) : {});
});

export default router;
