---
name: Cape May CivilView scraper quirks
description: How Cape May County (countyId=52) differs from Atlantic County in CivilView HTML structure and data extraction.
---

## Upset Amount Location

Cape May **does not** use a structured "Upset Amount" label field.
Instead, the upset amount is embedded as free text inside the `Description` field value.

Two patterns found in the wild:
- `UPSET AMOUNT: $1,480,000.00`
- `MINIMUM BID $211,000.00`

Fallback hierarchy implemented in `fetchDetailPage`:
1. `findValue(/upset\s*amount/i)` — structured label (works for Atlantic)
2. `extractUpsetFromDescription(descText)` — regex extracts from Description free text
3. `findValue(/minimum\s*bid/i)` — structured "Minimum Bid" field

**Why:** Some Cape May properties use "UPSET AMOUNT:" in description text, others use "MINIMUM BID" (inside description AND as a structured field). About 4/28 had no recognizable upset pattern (unusual commercial/marina properties).

## Address Format — Multi-Part (Condos/Units)

Cape May addresses often have 3 `<br/>`-delimited parts instead of 2:
```
7203 ATLANTIC Avenue<br/>UNIT 306<br/>Wildwood Crest NJ 08260
```

Fix in `parseAddressHtml`: the **last** segment is always "City State ZIP"; all preceding segments are joined with a space to form the street address. This correctly produces:
- `address = "7203 ATLANTIC Avenue UNIT 306"`
- `city = "Wildwood Crest"`

**Why:** The old code assumed exactly 2 parts — `parts[0]` = street, `parts[1]` = cityStateZip. For 3-part addresses, the unit ended up as `city` and the real city was ignored.

## Field Label Differences vs Atlantic

| Atlantic label | Cape May label |
|---|---|
| `Address:` | `Property Address:` |
| `Tax Lot:` / `Block:` | `Parcel #:` (e.g. `LOT 1.02, BLOCK 94.02`) |
| `Upset Amount:` | (in Description free text) |
| (none) | `Minimum Bid:` |
| (none) | `Attorney Phone:` |

The regex `/address/i` correctly matches "Property Address:" so address extraction works.

## City Normalization (Zillow/Redfin)

Several Cape May cities end in words that the suffix-stripping normalization incorrectly removes:
- `Ocean City` → `Ocean` (WRONG — breaks Zillow/Redfin)
- `Sea Isle City` → `Sea Isle` (uncertain)

**Fix:** `PRESERVE_CITY_NAMES` set in both `zillow.ts` and `redfin.ts` skips suffix stripping for known cities:
```javascript
const PRESERVE_CITY_NAMES = new Set([
  "ocean city", "sea isle city", "cape may city", "cape may court house",
  "jersey city", "atlantic city", "new york city",
]);
```

## Valuation Results (2026-08-17 baseline)

- 28 properties scraped, 24/28 upset amounts extracted
- 27/28 RentCast AVM values obtained
- Zillow + Redfin rate-limited (429) on initial bulk run — will populate on next scheduled refresh
- 16 EXTREME + 2 MAJOR + 1 STRONG deals (from RentCast alone)
- 1 marina/commercial property (F-26000182) with garbled address — fails RentCast 400 gracefully

## How to Apply

When debugging Cape May data gaps:
1. Check `description` field in DB for UPSET AMOUNT / MINIMUM BID text
2. Check `city` field — if it contains "UNIT" or "APT", the address was corrupted (pre-fix)
3. Check `zillow_status` / `redfin_status` for rate limit errors vs real not-found
4. Trigger single-property re-scrape by clearing `last_detail_check` in DB and running county refresh
