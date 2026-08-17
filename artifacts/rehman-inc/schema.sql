-- ============================================================
-- Rehman INC — Cloudflare D1 Database Schema
-- ============================================================
-- Apply with:
--   wrangler d1 execute rehman-inc-db --remote --file=schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_number TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  status TEXT NOT NULL DEFAULT 'new',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_contact TEXT NOT NULL,
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
  contact_consent INTEGER NOT NULL DEFAULT 0,
  source TEXT DEFAULT 'website',
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
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  display_address TEXT,
  property_type TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  featured INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  image_keys TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS inquiry_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS admin_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- ── Foreclosure Tracker ───────────────────────────────────────────────────────
-- Apply to production with:
--   wrangler d1 execute rehman-inc-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS foreclosures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sheriff_number TEXT UNIQUE NOT NULL,
  county TEXT NOT NULL DEFAULT 'Atlantic',
  court_case_number TEXT,
  current_sale_date TEXT,
  original_sale_date TEXT,
  plaintiff TEXT,
  defendant TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  attorney TEXT,
  approx_judgment REAL,
  upset_amount REAL,
  priors_liens_taxes TEXT,
  tax_lot TEXT,
  block TEXT,
  nearest_cross_street TEXT,
  occupancy_status TEXT,
  property_notes TEXT,
  detail_url TEXT,
  google_maps_url TEXT,
  zillow_url TEXT,
  foreclosure_type TEXT DEFAULT 'unknown',
  classification_confidence TEXT,
  classification_evidence TEXT,
  deal_rating TEXT DEFAULT 'UNKNOWN',
  deal_score REAL,
  estimated_spread REAL,
  discount_percent REAL,
  equity_multiple REAL,
  deal_warnings TEXT DEFAULT '[]',
  zillow_estimate REAL,
  zillow_status TEXT DEFAULT 'NOT_CONFIGURED',
  zillow_fetched_at TEXT,
  zillow_property_url TEXT,
  redfin_estimate REAL,
  redfin_status TEXT DEFAULT 'NOT_CONFIGURED',
  redfin_fetched_at TEXT,
  redfin_property_url TEXT,
  market_value_used REAL,
  market_value_source TEXT DEFAULT 'NONE',
  valuation_updated_at TEXT,
  status_history TEXT DEFAULT '[]',
  permanently_excluded INTEGER DEFAULT 0,
  is_removed INTEGER DEFAULT 0,
  first_seen TEXT,
  last_seen TEXT,
  last_updated TEXT
);

CREATE INDEX IF NOT EXISTS idx_fc_county ON foreclosures(county);
CREATE INDEX IF NOT EXISTS idx_fc_upset ON foreclosures(upset_amount);
CREATE INDEX IF NOT EXISTS idx_fc_sale_date ON foreclosures(current_sale_date);
CREATE INDEX IF NOT EXISTS idx_fc_rating ON foreclosures(deal_rating);
CREATE INDEX IF NOT EXISTS idx_fc_market ON foreclosures(market_value_used);
CREATE INDEX IF NOT EXISTS idx_fc_discount ON foreclosures(discount_percent);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_email ON inquiries(email);
CREATE INDEX IF NOT EXISTS idx_inquiries_inquiry_number ON inquiries(inquiry_number);
CREATE INDEX IF NOT EXISTS idx_property_photos_inquiry_id ON property_photos(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_notes_inquiry_id ON inquiry_notes(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_sort ON properties(sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_faqs_sort ON faqs(sort_order, created_at);
