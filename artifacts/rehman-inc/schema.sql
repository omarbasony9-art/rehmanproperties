-- ============================================================
-- Rehman INC — Cloudflare D1 Database Schema
-- ============================================================
-- Apply with: wrangler d1 execute rehman-inc-db --file=schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_number TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','appointment','offer_made','under_contract','closed','lost')),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_contact TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  property_type TEXT,
  bedrooms TEXT,
  bathrooms TEXT,
  square_footage TEXT,
  occupied TEXT,
  property_condition TEXT,
  repairs TEXT,
  selling_reason TEXT,
  selling_timeline TEXT,
  notes TEXT,
  contact_consent INTEGER NOT NULL DEFAULT 1,
  source TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT
);

CREATE TABLE IF NOT EXISTS property_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_inquiry_number ON inquiries(inquiry_number);
CREATE INDEX IF NOT EXISTS idx_property_photos_inquiry_id ON property_photos(inquiry_id);
