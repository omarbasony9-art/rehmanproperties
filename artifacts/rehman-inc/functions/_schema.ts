import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

const isoNow = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";

export const inquiriesTable = sqliteTable("inquiries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inquiryNumber: text("inquiry_number").notNull().unique(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  status: text("status").notNull().default("new"),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  preferredContact: text("preferred_contact").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  propertyType: text("property_type"),
  bedrooms: text("bedrooms"),
  bathrooms: text("bathrooms"),
  squareFootage: text("square_footage"),
  occupied: text("occupied"),
  propertyCondition: text("property_condition"),
  repairs: text("repairs"),
  sellingReason: text("selling_reason"),
  sellingTimeline: text("selling_timeline"),
  notes: text("notes"),
  source: text("source").default("website"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  contactConsent: integer("contact_consent", { mode: "boolean" }).notNull().default(false),
});

export const propertyPhotosTable = sqliteTable("property_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inquiryId: integer("inquiry_id").notNull(),
  objectKey: text("object_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type"),
  uploadedAt: text("uploaded_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const propertiesTable = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  displayAddress: text("display_address"),
  propertyType: text("property_type"),
  description: text("description"),
  status: text("status").notNull().default("published"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  imageKeys: text("image_keys"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const faqsTable = sqliteTable("faqs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  published: integer("published", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const siteSettingsTable = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const auditLogTable = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const inquiryNotesTable = sqliteTable("inquiry_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inquiryId: integer("inquiry_id").notNull(),
  note: text("note").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const adminConfigTable = sqliteTable("admin_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type Inquiry = typeof inquiriesTable.$inferSelect;
export type InsertInquiry = typeof inquiriesTable.$inferInsert;
