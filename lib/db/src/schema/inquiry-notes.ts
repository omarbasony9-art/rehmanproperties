import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { inquiriesTable } from "./inquiries";

export const inquiryNotesTable = pgTable("inquiry_notes", {
  id: serial("id").primaryKey(),
  inquiryId: integer("inquiry_id")
    .notNull()
    .references(() => inquiriesTable.id),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InquiryNote = typeof inquiryNotesTable.$inferSelect;
