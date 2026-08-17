import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
} from "drizzle-orm/pg-core";

export const inquiriesTable = pgTable("inquiries", {
  id: serial("id").primaryKey(),
  inquiryNumber: text("inquiry_number").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  status: text("status").notNull().default("new"),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  preferredContact: text("preferred_contact"),
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
  notes: text("notes"), // admin internal notes
  contactConsent: boolean("contact_consent").notNull().default(false),
  source: text("source"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
});

export const propertyPhotosTable = pgTable("property_photos", {
  id: serial("id").primaryKey(),
  inquiryId: integer("inquiry_id")
    .notNull()
    .references(() => inquiriesTable.id),
  objectKey: text("object_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Inquiry = typeof inquiriesTable.$inferSelect;
export type InsertInquiry = typeof inquiriesTable.$inferInsert;
export type PropertyPhoto = typeof propertyPhotosTable.$inferSelect;
export type InsertPropertyPhoto = typeof propertyPhotosTable.$inferInsert;
