---
name: Permanently excluded properties
description: How Fairway Lane timeshares and vacant lots are hidden permanently from the tracker, surviving scraper re-imports.
---

# Permanently Excluded Properties

## The Rule
`permanently_excluded BOOLEAN DEFAULT FALSE` column on the `foreclosures` table. When TRUE:
- Hidden from all API routes (`AND permanently_excluded IS NOT TRUE` in every base query)
- Hidden from valuation bulk refresh queries
- NOT re-activated by the scraper — the upsert UPDATE does not include `permanently_excluded` in its SET clause, so the value survives scraper runs

## Currently Excluded (17 properties)
- 15 Fairway Lane timeshare units (Unit 1610–1639 Timeshare Estate No. X) — lien foreclosures on fractional timeshare interests; Zillow/Redfin/RentCast cannot value them; no real market
- F-26000940: 200 West Haines Avenue, Linwood — vacant lot (tax foreclosure)
- F-26000812: 624 Norfolk Avenue, Egg Harbor City — vacant lot (tax foreclosure)

## Restoration
```sql
UPDATE foreclosures SET permanently_excluded=FALSE, is_removed=FALSE WHERE sheriff_number='...';
```

**Why:** Scraper sets `is_removed=FALSE` for any property still in the CivilView list on every refresh run. Without `permanently_excluded`, deleted timeshares would return on the next scraper run. The `is_removed` flag alone is not sufficient for permanent exclusion.

**How to apply:** Any new timeshare or land-only property should be marked `permanently_excluded=TRUE` immediately after discovery. The scraper's `StoredStub` now reads `permanently_excluded` to skip the is_removed=TRUE toggle for these properties.
