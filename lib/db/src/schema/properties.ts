import {
  pgTable,
  text,
  serial,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

export const propertiesTable = pgTable("properties", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  displayAddress: text("display_address"),
  propertyType: text("property_type"),
  description: text("description"),
  status: text("status").notNull().default("published"), // published | draft
  featured: boolean("featured").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  imageKeys: text("image_keys"), // JSON array of R2 object keys
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Property = typeof propertiesTable.$inferSelect;
export type InsertProperty = typeof propertiesTable.$inferInsert;
