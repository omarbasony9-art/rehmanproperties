---
name: Redfin redfin-com-data RapidAPI endpoints
description: Confirmed endpoint paths and response field for Redfin Estimate via redfin-com-data.p.rapidapi.com
---

## Working endpoints (redfin-com-data.p.rapidapi.com)

Two-step flow (file: `artifacts/foreclosure-tracker/src/services/valuation/redfin.ts`):

1. `GET /properties/auto-complete?query=<full address>`
   → `data[0].rows[0].url` (Redfin-relative path, e.g. `/NJ/Absecon/23-Oyster-Bay-Rd-08201/unit-C/home/100444915`)
   → `data[0].rows[0].propertyId` (numeric string)

2. `GET /property/detail?url=<encoded-redfin-relative-url>`
   → `data.aboveTheFold.addressSectionInfo.priceInfo`
     - ONLY use when `priceInfo.label === "Redfin Estimate"`
     - `priceInfo.amount` is the Redfin Estimate (integer dollars)
   → `data.aboveTheFold.addressSectionInfo.url` for the property path (prepend `https://www.redfin.com`)

## Critical rules

- **Never** use `priceInfo.amount` when `label` is anything other than "Redfin Estimate" — it could be Last Sold Price, List Price, etc.
- `avmInfo.predictedValue` is also present but `priceInfo.amount` is the canonical Redfin Estimate.
- `valueEstimate.value` (on the `?placement=omdp` key) is a different estimate; use `priceInfo` instead.
- Rate limit is low (BASIC plan) — use 500ms delay between bulk calls.
- DO NOT use the "Search rent" endpoint per user instruction.

## Other endpoints found to exist (but not needed for this flow)
- `/properties/details?url=<url>` — same response as `/property/detail?url=<url>`
- `/property/search?location=<location>` — returns suggestions but `data` is null for specific addresses

## City normalization
Same cascading strategy as Zillow: strip "Township/Twp/Borough/Boro/City/Village/Town" suffix and retry, then fall back to street+state+zip.

## Test result (confirmed working)
- Sheriff: F-26000911, 23 C Oyster Bay Road, Absecon, NJ 08201
- Matched: 23 Oyster Bay Rd Unit C, Absecon, NJ (propertyId: 100444915)
- Redfin Estimate: $177,302 (field: `data.aboveTheFold.addressSectionInfo.priceInfo.amount`, label: "Redfin Estimate")
- Zillow Estimate: $159,800 → marketValueUsed = $159,800 (conservative min)
- Spread: $149,800, Discount: 93.7%, Score: 100, Rating: EXTREME
