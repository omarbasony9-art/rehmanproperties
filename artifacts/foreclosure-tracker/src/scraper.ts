/**
 * CivilView scraper — HTTP + Cheerio only (no Playwright/Puppeteer).
 *
 * Source: https://salesweb.civilview.com/Sales/SalesSearch?countyId=25
 *
 * IMPORTANT: Detail pages require ASP.NET session cookies that are set by the
 * list page response.  `fetchListPage()` captures those cookies and stores them
 * in `_sessionCookies`; all subsequent `fetchDetailPage()` calls send them
 * automatically.
 */

import * as cheerio from "cheerio";
import { parseMoney, parseDate, latestDate, buildGoogleMapsUrl, buildZillowUrl } from "./parser.js";

const CIVILVIEW_BASE = "https://salesweb.civilview.com";
const LIST_URL = `${CIVILVIEW_BASE}/Sales/SalesSearch?countyId=25`;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Session cookies captured from the list-page response.
// Detail pages return HTTP 302 without a valid session.
let _sessionCookies = "";

// ─── HTTP helpers ──────────────────────────────────────────────────────────

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    ...extra,
  };
}

/**
 * Extract name=value pairs from Set-Cookie headers.
 * Works in Node 18+ via `Headers.getSetCookie()` with a raw-header fallback.
 */
function extractSetCookies(headers: Headers): string {
  // Node 18.14+ — preferred path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = headers as any;
  if (typeof h.getSetCookie === "function") {
    const all: string[] = h.getSetCookie() as string[];
    return all.map((s: string) => s.split(";")[0]).filter(Boolean).join("; ");
  }
  // Fallback: raw header string (older Node)
  const raw = headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((s) => s.trim().split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function fetchHtml(url: string, opts: { cookies?: string; referer?: string } = {}): Promise<string> {
  const extra: Record<string, string> = {};
  if (opts.cookies) extra["Cookie"] = opts.cookies;
  if (opts.referer) extra["Referer"] = opts.referer;

  const resp = await fetch(url, { headers: buildHeaders(extra), redirect: "follow" });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} fetching ${url}`);
  }
  // If we ended up at the home page the session redirect happened
  if (resp.url && resp.url.endsWith("/") && !url.endsWith("/")) {
    throw new Error(`Redirected to root — detail page inaccessible (session required)`);
  }
  return resp.text();
}

// ─── Public interfaces ─────────────────────────────────────────────────────

export interface ListingStub {
  sheriffNumber: string;
  propertyId: string;
  saleDate: string | null;
  plaintiff: string | null;
  defendant: string | null;
  /** Full address string from the list page (e.g. "123 Main St City NJ 08401") */
  address: string | null;
  detailUrl: string;
}

export interface StatusEntry {
  eventDate: string | null;
  eventDescription: string;
}

export interface DetailedListing {
  sheriffNumber: string;
  courtCaseNumber: string | null;
  currentSaleDate: string | null;
  originalSaleDate: string | null;
  plaintiff: string | null;
  defendant: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  attorney: string | null;
  approxJudgment: number | null;
  upsetAmount: number | null;
  priorsLiensTaxes: string | null;
  taxLot: string | null;
  block: string | null;
  nearestCrossStreet: string | null;
  occupancyStatus: string | null;
  propertyNotes: string | null;
  statusHistory: StatusEntry[];
  detailUrl: string;
  googleMapsUrl: string;
  zillowUrl: string;
}

// ─── List page ─────────────────────────────────────────────────────────────

/**
 * Fetch the CivilView search results page and return stubs for each listing.
 * Also captures session cookies for use by `fetchDetailPage()`.
 *
 * Column layout (confirmed from live HTML 2026-08-17):
 *   0  "View Details" link  ← contains SaleDetails href + PropertyId
 *   1  Sheriff #            ← e.g. F-26000646
 *   2  Sales Date           ← e.g. 9/10/2026
 *   3  Plaintiff            ← may be truncated with "..."
 *   4  Defendant            ← may be truncated with "..."
 *   5  Address              ← full address string
 */
export async function fetchListPage(): Promise<ListingStub[]> {
  // Capture session cookies from the list-page response
  const extra: Record<string, string> = {};
  const resp = await fetch(LIST_URL, { headers: buildHeaders(extra), redirect: "follow" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching list page`);

  // Store session cookies for detail-page fetches
  _sessionCookies = extractSetCookies(resp.headers);

  const html = await resp.text();
  const $ = cheerio.load(html);
  const stubs: ListingStub[] = [];

  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (!cells.length) return; // header row

    // Column 0: the "View Details" link cell
    const linkCell = $(cells.get(0));
    const detailHref = linkCell.find("a[href*='SaleDetails']").attr("href") ?? "";
    if (!detailHref) return;

    const detailUrl = detailHref.startsWith("http")
      ? detailHref
      : `${CIVILVIEW_BASE}${detailHref}`;

    // Extract PropertyId from URL
    const pidMatch = detailHref.match(/PropertyId=(\d+)/i);
    const propertyId = pidMatch?.[1] ?? "";

    // Column 1: Sheriff #
    const sheriffRaw = $(cells.get(1)).text().trim();
    if (!sheriffRaw || !sheriffRaw.toUpperCase().startsWith("F-")) return;

    // Column 2: Sale Date
    const saleDateRaw = $(cells.get(2)).text().trim();

    // Column 3: Plaintiff (may be truncated)
    const plaintiff = $(cells.get(3)).text().trim() || null;

    // Column 4: Defendant (may be truncated)
    const defendant = $(cells.get(4)).text().trim() || null;

    // Column 5: Full address
    const address = $(cells.get(5)).text().trim() || null;

    stubs.push({
      sheriffNumber: sheriffRaw.toUpperCase().replace(/\s+/g, ""),
      propertyId,
      saleDate: parseDate(saleDateRaw),
      plaintiff: plaintiff || null,
      defendant: defendant || null,
      address,
      detailUrl,
    });
  });

  console.log(
    `[scraper] List page: ${stubs.length} stubs, ` +
    `cookies captured: ${_sessionCookies ? "yes" : "no"}`,
  );
  return stubs;
}

// ─── Detail page ───────────────────────────────────────────────────────────

/**
 * CivilView detail pages use a custom `.sale-detail-label` / `.sale-detail-value`
 * CSS class pair for every field.  The legacy `dt/dd` and generic table patterns
 * do not appear on these pages.
 *
 * Uses `for...of` over `.toArray()` to avoid Cheerio `.each()` callback return-type
 * issues with TypeScript strict mode.
 */
function makeValueFinder($: ReturnType<typeof cheerio.load>) {
  return function findValue(label: RegExp): string | null {
    // Primary: .sale-detail-item divs (CivilView's actual markup)
    for (const item of $(".sale-detail-item").toArray()) {
      const labelText = $(item).find(".sale-detail-label").text();
      if (label.test(labelText)) {
        const val = $(item).find(".sale-detail-value").text().trim().replace(/\s+/g, " ");
        return val || null;
      }
    }

    // Fallback: <dt>/<dd>
    for (const dt of $("dt").toArray()) {
      if (label.test($(dt).text())) {
        return $(dt).next("dd").text().trim() || null;
      }
    }

    // Fallback: table row with two cells
    for (const tr of $("tr").toArray()) {
      const tds = $(tr).find("td, th");
      if (tds.length >= 2 && label.test($(tds.get(0)).text())) {
        return $(tds.get(1)).text().trim() || null;
      }
    }

    return null;
  };
}

/**
 * Parse the address value HTML from the .sale-detail-value element.
 * CivilView wraps addresses in a Google Maps link:
 *   <a href="...maps...">123 Main St<br/>City NJ 08401</a>
 *
 * Returns { streetAddress, city, state, zipCode }.
 */
function parseAddressHtml(
  $: ReturnType<typeof cheerio.load>,
  valueEl: ReturnType<typeof $>,
): { streetAddress: string | null; city: string | null; state: string | null; zipCode: string | null } {
  // Replace <br> tags with a pipe delimiter, then get text
  const html = valueEl.html() ?? "";
  const withPipe = html.replace(/<br\s*\/?>/gi, "|");
  const parts = cheerio
    .load(withPipe)("body")
    .text()
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  // parts[0] = street address, parts[1] = "City State Zip"
  const streetAddress = parts[0] ?? null;
  const cityStateZip = parts[1] ?? "";

  // Parse "Egg Harbor Township NJ 08234"
  const zipMatch = cityStateZip.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
  const zipCode = zipMatch?.[1] ?? null;
  const withoutZip = zipCode ? cityStateZip.slice(0, -zipCode.length).trim() : cityStateZip;

  // "Egg Harbor Township NJ" → state = last word, city = rest
  const stateMatch = withoutZip.match(/\s+([A-Z]{2})\s*$/);
  const state = stateMatch?.[1] ?? null;
  const city = state ? withoutZip.slice(0, -state.length).trim() || null : withoutZip || null;

  return { streetAddress, city, state, zipCode };
}

export async function fetchDetailPage(detailUrl: string): Promise<DetailedListing | null> {
  let html: string;
  try {
    html = await fetchHtml(detailUrl, {
      cookies: _sessionCookies,
      referer: LIST_URL,
    });
  } catch (err) {
    console.error(`[scraper] Failed to fetch detail page ${detailUrl}:`, err);
    return null;
  }

  const $ = cheerio.load(html);
  const findValue = makeValueFinder($);

  // ── Address ──────────────────────────────────────────────────────────────
  // Use for...of to avoid TypeScript strict-mode issues with mutation inside
  // .each() closures (type narrowing breaks on let variables assigned in closures).
  const addrResult = { streetAddress: null as string | null, city: null as string | null, state: null as string | null, zipCode: null as string | null };
  for (const item of $(".sale-detail-item").toArray()) {
    if (/address/i.test($(item).find(".sale-detail-label").text())) {
      const parsed = parseAddressHtml($, $(item).find(".sale-detail-value"));
      addrResult.streetAddress = parsed.streetAddress;
      addrResult.city = parsed.city;
      addrResult.state = parsed.state;
      addrResult.zipCode = parsed.zipCode;
      break;
    }
  }
  const streetAddress = addrResult.streetAddress;
  const city = addrResult.city;
  const state = addrResult.state;
  const zipCode = addrResult.zipCode;

  // ── Status / adjournment history ─────────────────────────────────────────
  const statusHistory: StatusEntry[] = [];
  for (const table of $("table").toArray()) {
    const headers = $(table).find("th").map((_j, th) => $(th).text().toLowerCase()).get();
    if (!headers.some((h) => h.includes("date") || h.includes("status"))) continue;

    for (const tr of $(table).find("tr").toArray()) {
      const tds = $(tr).find("td");
      if (tds.length < 2) continue; // header row uses <th>
      const col0 = $(tds.get(0)).text().trim();
      const col1 = $(tds.get(1)).text().trim();
      if (!col0 && !col1) continue;

      // col0 = event description, col1 = date
      const eventDate = parseDate(col1) ?? parseDate(col0);
      const eventDescription = parseDate(col0) ? col1 : col0;
      if (eventDescription) {
        statusHistory.push({ eventDate, eventDescription });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueHistory: StatusEntry[] = [];
  for (const entry of statusHistory) {
    const key = `${entry.eventDate}|${entry.eventDescription}`;
    if (!seen.has(key)) { seen.add(key); uniqueHistory.push(entry); }
  }

  // ── Key fields ─────────────────────────────────────────────────────────
  const sheriffRaw =
    findValue(/sheriff\s*(#|number|no\.?)/i) ??
    $("h1,h2,h3").text().match(/[Ff]-?\d{5,}/)?.[0] ??
    "";
  const sheriffNumber = sheriffRaw.toUpperCase().replace(/\s+/g, "");

  // Current sale date = latest in history, or explicit field
  const currentSaleDate =
    latestDate(uniqueHistory.map((e) => e.eventDate)) ??
    parseDate(findValue(/sales?\s*date/i));

  const originalSaleDate =
    parseDate(findValue(/original\s*(sale\s*)?date|originally\s*scheduled/i)) ??
    uniqueHistory[uniqueHistory.length - 1]?.eventDate ??
    null;

  const addr = (streetAddress ?? "").trim();
  const cty  = (city ?? "").trim();
  const st   = (state ?? "NJ").trim();
  const zp   = (zipCode ?? "").trim();

  return {
    sheriffNumber,
    courtCaseNumber:   findValue(/court\s*case|docket/i),
    currentSaleDate,
    originalSaleDate,
    plaintiff:         findValue(/plaintiff/i),
    defendant:         findValue(/defendant/i),
    address:           addr || null,
    city:              cty || null,
    state:             st || null,
    zipCode:           zp || null,
    attorney:          findValue(/attorney/i),
    approxJudgment:    parseMoney(findValue(/approx(?:imate)?\.?\s*(judgment|judgement)/i)),
    upsetAmount:       parseMoney(findValue(/upset\s*amount/i)),
    priorsLiensTaxes:  findValue(/\bpriors?\b/i),
    taxLot:            findValue(/tax\s*lot/i),
    block:             findValue(/\bblock\b/i),
    nearestCrossStreet: findValue(/cross\s*street|nearest/i),
    occupancyStatus:   findValue(/occupancy|occupied/i),
    propertyNotes:     findValue(/property\s*note|notes?|comments?/i),
    statusHistory:     uniqueHistory,
    detailUrl,
    googleMapsUrl: buildGoogleMapsUrl(addr, cty, st, zp),
    zillowUrl:     buildZillowUrl(addr, cty, st, zp),
  };
}
