---
name: CivilView Scraper Structure
description: Critical implementation facts about scraping salesweb.civilview.com for Atlantic County sheriff sales
---

## Session cookies are mandatory

CivilView detail pages return HTTP 302 → `/` when accessed without a valid session.
The list-page fetch (`/Sales/SalesSearch?countyId=25`) sets three cookies:
- `ASP.NET_SessionId`
- `AWSALB`
- `AWSALBCORS`

The scraper captures these via `Headers.getSetCookie()` (Node 18.14+) during `fetchListPage()`
and stores them in a module-level `_sessionCookies` string. All `fetchDetailPage()` calls
send them automatically via `Cookie:` header.

**Why:** Without session cookies, detail pages silently 302-redirect and the scraper returns null — 
no error, no HTML, just an empty page that appears to succeed.

**How to apply:** Always call `fetchListPage()` first. The cookie state persists in the module 
until the next `fetchListPage()` call, so a single list fetch covers all detail fetches in one refresh.

## List page column layout (confirmed 2026-08-17)

URL: `https://salesweb.civilview.com/Sales/SalesSearch?countyId=25`

Table `<tr>` children `<td>` indices:
- `0` — "View Details" link (contains `href="/Sales/SaleDetails?PropertyId=NNNNNNNN"`)  
- `1` — Sheriff # (e.g. `F-26000646`)
- `2` — Sale Date (e.g. `9/10/2026`)
- `3` — Plaintiff (truncated with `...`)
- `4` — Defendant (truncated with `...`)
- `5` — Full address string

**Why:** Forgetting about column 0 (the link cell) caused the original scraper to read "View Details" 
as the sheriff number, collapsing all 86 records into one DB row named "VIEW-DETAILS".

## Detail page field structure

URL: `https://salesweb.civilview.com/Sales/SaleDetails?PropertyId=NNNNNNNN`

Fields use CSS class pairs — NOT `<dt>`/`<dd>` or table rows:
```html
<div class="sale-detail-item">
  <div class="sale-detail-label">Sheriff #:</div>
  <div class="sale-detail-value">F-26000646</div>
</div>
```

Cheerio selector to find a field value by label text:
```typescript
for (const item of $(".sale-detail-item").toArray()) {
  if (/sheriff/i.test($(item).find(".sale-detail-label").text())) {
    return $(item).find(".sale-detail-value").text().trim();
  }
}
```

Address field has a Google Maps link with `<br/>` separating street from city/state/zip:
```html
<a href="...maps...">123 Main St<br/>City NJ 08234</a>
```

Split on `<br>`, parse: line[0] = street, line[1] = "City State Zip".

## Status history table

The status adjournment table uses `<th>` headers "Status" and "Date":
- Row structure: `<td>Defendant Adjourned to</td><td>9/10/2026</td>`
- col0 = event description, col1 = date (ISO format via `parseDate()`)

## Known data quality issues (2026-08-17)

- 3/86 listings fail to reach the DB (detail + stub upsert both fail — likely NOT NULL violation on zip_code column)
- 18/83 listings have `upset_amount IS NULL` (detail parse returned null for that field; may be non-standard label text)
- `missingUpsetCount` is exposed by `GET /api/debug/scraper`
