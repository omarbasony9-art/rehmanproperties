import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Stores admin configuration overrides (e.g. hashed password)
export const adminConfigTable = pgTable("admin_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
