---
name: RentCast AVM integration
description: RentCast as a third valuation source; key quirks for garbled-city NJ properties and API behavior.
---

# RentCast AVM Integration

## Endpoint
`GET https://api.rentcast.io/v1/avm/value`
- Required: `address`, `state` (OR `zipCode`)
- Optional: `city`, `zipCode`
- Header: `X-Api-Key: $RENTCAST_API_KEY`

## Garbled-City Properties
CivilView sometimes puts unit numbers or "a/k/a" aliases into the `city` field (e.g., "Unit 36", "#B", "a/k/a 309 S. 1st Road"). These properties also have `zip_code = NULL`.

**Fix:** `isBadCity()` detects these patterns. When the city is bad or zip is null, the request is sent as `address + state` only — no city, no zipCode. RentCast geocodes the full street address and returns correct results.

**Why this works:** RentCast's geocoder can resolve NJ addresses by street name alone when state is provided. Tested: 109 Dunlin Lane (NJ only) → $470,000.

## Bulk Refresh Logic
- Targets properties where Zillow AND Redfin both lack SUCCESS estimates (unless `noThreshold=true` for all)
- The bulk loop guard only requires `address IS NOT NULL AND state IS NOT NULL` — NOT city or zip
- 500ms sleep between calls (RentCast is more lenient than Zillow/Redfin RapidAPI)
- No rate-limit stop logic needed (RentCast doesn't hard rate-limit like the RapidAPI providers)
- 7-day cache on SUCCESS results

## Market Value Source Labels
When RentCast contributes to the market value:
- `CONSERVATIVE_ALL` — Zillow + Redfin + RentCast all present → Math.min of all three
- `CONSERVATIVE_ZILLOW_RENTCAST` — Zillow + RentCast → Math.min
- `CONSERVATIVE_REDFIN_RENTCAST` — Redfin + RentCast → Math.min
- `RENTCAST` — only RentCast has an estimate

## Coverage Result
After adding RentCast: 68/68 active properties have market values (was ~35/68 before).
