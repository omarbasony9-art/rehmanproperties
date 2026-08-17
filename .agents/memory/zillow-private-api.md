---
name: Zillow private-zillow RapidAPI endpoints
description: Correct endpoint paths and city normalization for private-zillow.p.rapidapi.com
---

## Working endpoints (private-zillow.p.rapidapi.com)

Two-step flow (file: `artifacts/foreclosure-tracker/src/services/valuation/zillow.ts`):

1. `GET /autocomplete?query=<full address>` → `results[0].metaData.zpid`
2. `GET /byzpid?zpid=<zpid>` → `body.zestimate` (may be null), `body.PropertyZillowURL` (full URL, no prefix needed)

**Why:** The old host target was `zillow-com1.p.rapidapi.com` with endpoints `/propertyExtendedSearch` and `/property` — none of these exist on `private-zillow.p.rapidapi.com`. The only endpoints confirmed working are `/autocomplete` and `/byzpid`.

**How to apply:** Any Zillow fetch uses these two endpoints in sequence. The Zestimate is in `body.zestimate` (numeric or null). `body.Price` is the listing price — never use it as the Zestimate.

## City normalization — cascading query strategy

CivilView stores cities like "Galloway Township" but Zillow autocomplete needs "Galloway". Code tries 3 address candidates in order:

1. `<street>, <city>, <state> <zip>` (as stored in DB)
2. `<street>, <city with Township/Twp/Borough/Boro/City/Village/Town suffix stripped>, <state> <zip>`
3. `<street>, <state> <zip>` (zip-only fallback)

**Why:** Atlantic County NJ has many "Township" cities (Galloway Twp, Hamilton Twp, etc.) that Zillow autocomplete won't match by official township name.

## Test result (confirmed working)

- Sheriff: F-26000809, 800 Blue Teal Dr, Galloway Township NJ 08205
- ZPID: 37808309
- Zestimate: $599,800 → spread $324,047, discount 54.0%, score 88, rating EXTREME
