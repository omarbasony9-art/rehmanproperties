/**
 * Foreclosure Tracker — Cloudflare D1 / Workers port.
 *
 * Ported from the Node.js/Express/PostgreSQL tracker.
 * Uses only Web Platform APIs (fetch, crypto) — no Node.js builtins.
 * HTML parsing uses regex + string splitting instead of cheerio.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FcEnv {
  ZILLOW_RAPIDAPI_KEY?: string;
  ZILLOW_RAPIDAPI_HOST?: string;
  REDFIN_RAPIDAPI_KEY?: string;
  REDFIN_RAPIDAPI_HOST?: string;
}

interface ListingStub {
  sheriffNumber: string;
  propertyId: string;
  saleDate: string | null;
  plaintiff: string | null;
  defendant: string | null;
  address: string | null;
  detailUrl: string;
}

interface StatusEntry {
  eventDate: string | null;
  eventDescription: string;
}

interface DetailedListing {
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

interface ValuationResult {
  estimate: number | null;
  status: string;
  rateLimited?: boolean;
  source: "ZILLOW" | "REDFIN";
  propertyUrl: string | null;
  fetchedAt: Date;
}

export interface SyncSummary {
  county: string;
  stubsFound: number;
  detailsFetched: number;
  upserted: number;
  valuated: number;
  errors: number;
  durationMs: number;
  // Safe diagnostics — never includes key values
  zillowConfigured: boolean;
  redfinConfigured: boolean;
  rentcastConfigured: boolean;
  /** Listings that passed the needsValuation check (eligible by address + upset threshold + cache) */
  needsValuationCount: number;
  /** How many times fetchZillowEstimate was actually invoked */
  zillowAttempts: number;
  /** Estimates returned with a non-null dollar value */
  zillowSuccesses: number;
  /** Invocations that returned estimate=null (NOT_CONFIGURED, NOT_FOUND, ERROR, rate-limited) */
  zillowFailures: number;
}

export interface ListingRow {
  sheriffNumber: string;
  county: string;
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
  foreclosureType: string;
  dealRating: string;
  dealScore: number | null;
  estimatedSpread: number | null;
  discountPercent: number | null;
  equityMultiple: number | null;
  dealWarnings: string[];
  zillowEstimate: number | null;
  zillowStatus: string;
  zillowPropertyUrl: string | null;
  redfinEstimate: number | null;
  redfinStatus: string;
  redfinPropertyUrl: string | null;
  estimatedMarketValue: number | null;
  marketValueSource: string;
  statusHistory: StatusEntry[];
  detailUrl: string | null;
  googleMapsUrl: string | null;
  zillowUrl: string | null;
  firstSeen: string | null;
  lastUpdated: string | null;
  isNew: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CIVILVIEW_BASE = "https://salesweb.civilview.com";

const COUNTY_IDS: Record<string, number> = {
  atlantic: 25,
  "cape-may": 52,
};

const COUNTY_NAMES: Record<string, string> = {
  atlantic: "Atlantic",
  "cape-may": "Cape May",
};

export const VALID_COUNTIES = Object.keys(COUNTY_IDS);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DELAY_MS = 300;
const VALUATION_UPSET_THRESHOLD = 280_000;
/**
 * Skip re-valuation when Zillow was last fetched successfully within this window.
 * Matches the Preview backend's ZILLOW_CACHE_DAYS = 7 in src/valuation.ts.
 */
const VALUATION_CACHE_DAYS = 7;

// ─── Parser utilities ────────────────────────────────────────────────────────

function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned || cleaned === "N/A" || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  if (isNaN(n) || n < 0) return null;
  return n;
}

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const monthNames: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const longMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (longMatch) {
    const [, monthStr, day, year] = longMatch;
    const monthNum = monthNames[monthStr!.toLowerCase()];
    if (monthNum) return `${year}-${monthNum}-${day!.padStart(2, "0")}`;
  }
  return null;
}

function latestDate(dates: (string | null)[]): string | null {
  const valid = dates.filter(Boolean) as string[];
  if (!valid.length) return null;
  return valid.sort().at(-1) ?? null;
}

function buildGoogleMapsUrl(address: string, city: string, state: string, zip: string): string {
  const q = encodeURIComponent(`${address}, ${city}, ${state} ${zip}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function buildZillowUrl(address: string, city: string, state: string, zip: string): string {
  const q = encodeURIComponent(`${address} ${city} ${state} ${zip}`);
  return `https://www.zillow.com/homes/${q}_rb/`;
}

// ─── HTML parsing (no cheerio — pure Web APIs only) ──────────────────────────

/** Strip HTML tags and decode common entities */
function innerText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract name=value pairs from Set-Cookie headers */
function extractSetCookies(headers: Headers): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h = headers as any;
  if (typeof h.getSetCookie === "function") {
    const all: string[] = h.getSetCookie() as string[];
    return all.map((s: string) => s.split(";")[0]).filter(Boolean).join("; ");
  }
  const raw = headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((s) => s.trim().split(";")[0])
    .filter(Boolean)
    .join("; ");
}

/** Parse CivilView list page table rows */
function parseListRows(html: string): ListingStub[] {
  const stubs: ListingStub[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRe.exec(html)) !== null) {
    const rowHtml = trMatch[1] ?? "";
    const cells: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRe.exec(rowHtml)) !== null) {
      cells.push(tdMatch[1] ?? "");
    }
    if (cells.length < 6) continue;

    const linkMatch = cells[0].match(/href="([^"]*SaleDetails[^"]*)"/i);
    if (!linkMatch) continue;

    const sheriffRaw = innerText(cells[1] ?? "").trim();
    if (!sheriffRaw.toUpperCase().startsWith("F-")) continue;

    const detailHref = linkMatch[1]!;
    const detailUrl = detailHref.startsWith("http") ? detailHref : `${CIVILVIEW_BASE}${detailHref}`;
    const pidMatch = detailHref.match(/PropertyId=(\d+)/i);

    stubs.push({
      sheriffNumber: sheriffRaw.toUpperCase().replace(/\s+/g, ""),
      propertyId: pidMatch?.[1] ?? "",
      saleDate: parseDate(innerText(cells[2] ?? "").trim()),
      plaintiff: innerText(cells[3] ?? "").trim() || null,
      defendant: innerText(cells[4] ?? "").trim() || null,
      address: innerText(cells[5] ?? "").trim() || null,
      detailUrl,
    });
  }
  return stubs;
}

/**
 * Parse a .sale-detail-value or .sale-detail-label div from a block of HTML.
 * Returns the text content and raw HTML of the first match.
 */
function findDivByClass(html: string, className: string): { text: string; raw: string } | null {
  const re = new RegExp(
    `class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</div>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return null;
  return { text: innerText(m[1] ?? ""), raw: m[1] ?? "" };
}

/**
 * Parse CivilView detail page fields.
 * Returns a map of label (lowercased) → text value.
 * Special keys: __html_address (raw HTML of address .sale-detail-value for <br> parsing).
 */
function parseDetailFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};

  // Split on each occurrence of a .sale-detail-item opening div.
  // Each segment (after the first) begins with a sale-detail-item and contains
  // exactly one label/value pair.
  const parts = html.split(/(?=<div[^>]+class="[^"]*sale-detail-item[^"]*")/i);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]!;
    const labelResult = findDivByClass(part, "sale-detail-label");
    const valueResult = findDivByClass(part, "sale-detail-value");

    if (!labelResult) continue;
    const label = labelResult.text.toLowerCase().trim();
    if (!label) continue;

    const valueText = valueResult?.text ?? "";
    const valueRaw = valueResult?.raw ?? "";

    fields[label] = valueText;
    // Keep raw HTML for address field (needs <br> → pipe parsing)
    if (/address/i.test(label)) {
      fields["__html_address"] = valueRaw;
    }
    if (/description/i.test(label)) {
      fields["__description"] = valueText;
    }
  }

  // ── Fallback: <dt>/<dd> pairs ──────────────────────────────────────────────
  if (Object.keys(fields).length === 0) {
    const dtRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
    let m;
    while ((m = dtRe.exec(html)) !== null) {
      const label = innerText(m[1] ?? "").toLowerCase().trim();
      const value = innerText(m[2] ?? "").trim();
      if (label) fields[label] = value;
    }
  }

  return fields;
}

/** Lookup a field from the parsed field map using a regex pattern against keys */
function findValue(fields: Record<string, string>, pattern: RegExp): string | null {
  for (const [key, val] of Object.entries(fields)) {
    if (pattern.test(key)) return val || null;
  }
  return null;
}

/**
 * Parse the address from the .sale-detail-value HTML for the address field.
 * CivilView uses <br/> to separate "Street Address<br/>City State ZIP".
 * Cape May condos add a third segment: "Street<br/>Unit<br/>City State ZIP".
 */
function parseAddressHtml(html: string): {
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
} {
  const withPipe = html.replace(/<br\s*\/?>/gi, "|");
  const text = innerText(withPipe);
  const parts = text.split("|").map((s) => s.trim()).filter(Boolean);

  if (parts.length === 0) return { streetAddress: null, city: null, state: null, zipCode: null };

  const cityStateZip = parts[parts.length - 1]!;
  const streetAddress = parts.length > 1 ? parts.slice(0, -1).join(" ").trim() : null;

  const zipMatch = cityStateZip.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
  const zipCode = zipMatch?.[1] ?? null;
  const withoutZip = zipCode ? cityStateZip.slice(0, -zipCode.length).trim() : cityStateZip;

  const stateMatch = withoutZip.match(/\s+([A-Z]{2})\s*$/);
  const state = stateMatch?.[1] ?? null;
  const city = state ? withoutZip.slice(0, -state.length).trim() || null : withoutZip || null;

  return { streetAddress, city, state, zipCode };
}

/** Extract upset amount from a free-text Description field (Cape May style) */
function extractUpsetFromDescription(text: string): number | null {
  const upsetMatch = text.match(/UPSET\s+AMOUNT\s*:?\s*\$?([\d,]+(?:\.\d{1,2})?)/i);
  if (upsetMatch?.[1]) {
    const n = parseFloat(upsetMatch[1].replace(/,/g, ""));
    if (!isNaN(n) && n > 0) return n;
  }
  const bidMatch = text.match(/MINIMUM\s+BID\s*:?\s*\$?([\d,]+(?:\.\d{1,2})?)/i);
  if (bidMatch?.[1]) {
    const n = parseFloat(bidMatch[1].replace(/,/g, ""));
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

/** Parse status history tables from the detail page HTML */
function parseStatusHistory(html: string): StatusEntry[] {
  const entries: StatusEntry[] = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRe.exec(html)) !== null) {
    const tableHtml = tableMatch[1] ?? "";
    // Check if this table has date/status headers
    const headerText = tableHtml.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_, t) => innerText(t) + "|").toLowerCase();
    if (!headerText.includes("date") && !headerText.includes("status")) continue;

    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRe.exec(tableHtml)) !== null) {
      const rowHtml = trMatch[1] ?? "";
      const cells: string[] = [];
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let tdMatch;
      while ((tdMatch = tdRe.exec(rowHtml)) !== null) {
        cells.push(innerText(tdMatch[1] ?? "").trim());
      }
      if (cells.length < 2) continue;

      const col0 = cells[0]!;
      const col1 = cells[1]!;
      if (!col0 && !col1) continue;

      const eventDate = parseDate(col1) ?? parseDate(col0);
      const eventDescription = parseDate(col0) ? col1 : col0;
      if (eventDescription) entries.push({ eventDate, eventDescription });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = `${e.eventDate}|${e.eventDescription}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── CivilView scraping ──────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const COMMON_HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
};

export async function fetchListPage(countySlug: string): Promise<{ stubs: ListingStub[]; cookies: string }> {
  const countyId = COUNTY_IDS[countySlug];
  if (!countyId) throw new Error(`Unknown county slug: ${countySlug}`);

  const url = `${CIVILVIEW_BASE}/Sales/SalesSearch?countyId=${countyId}`;
  const resp = await fetch(url, { headers: COMMON_HEADERS, redirect: "follow" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching list page for ${countySlug}`);

  const cookies = extractSetCookies(resp.headers);
  const html = await resp.text();
  const stubs = parseListRows(html);
  console.log(`[foreclosures] ${countySlug} list: ${stubs.length} stubs, cookies=${cookies ? "yes" : "no"}`);
  return { stubs, cookies };
}

export async function fetchDetailPage(detailUrl: string, cookies: string, countySlug: string): Promise<DetailedListing | null> {
  const countyId = COUNTY_IDS[countySlug];
  const referer = `${CIVILVIEW_BASE}/Sales/SalesSearch?countyId=${countyId}`;

  let html: string;
  try {
    const resp = await fetch(detailUrl, {
      headers: { ...COMMON_HEADERS, "Cookie": cookies, "Referer": referer },
      redirect: "follow",
    });
    if (!resp.ok) {
      console.warn(`[foreclosures] detail HTTP ${resp.status} for ${detailUrl}`);
      return null;
    }
    // Detect session redirect back to home
    if (resp.url && resp.url.endsWith("/") && !detailUrl.endsWith("/")) {
      console.warn(`[foreclosures] detail page redirected to root (session expired): ${detailUrl}`);
      return null;
    }
    html = await resp.text();
  } catch (err) {
    console.error(`[foreclosures] detail fetch error for ${detailUrl}:`, err);
    return null;
  }

  const fields = parseDetailFields(html);
  const statusHistory = parseStatusHistory(html);

  // ── Address ────────────────────────────────────────────────────────────────
  const addressHtml = fields["__html_address"] ?? "";
  const { streetAddress, city, state, zipCode } = addressHtml
    ? parseAddressHtml(addressHtml)
    : { streetAddress: null, city: null, state: null, zipCode: null };

  // ── Key fields ─────────────────────────────────────────────────────────────
  const sheriffRaw =
    findValue(fields, /sheriff\s*(#|number|no\.?)/i) ??
    html.match(/[Ff]-?\d{5,}/)?.[0] ?? "";
  const sheriffNumber = sheriffRaw.toUpperCase().replace(/\s+/g, "");

  const currentSaleDate =
    latestDate(statusHistory.map((e) => e.eventDate)) ??
    parseDate(findValue(fields, /sales?\s*date/i));

  const originalSaleDate =
    parseDate(findValue(fields, /original\s*(sale\s*)?date|originally\s*scheduled/i)) ??
    statusHistory[statusHistory.length - 1]?.eventDate ??
    null;

  // Upset amount: structured label → Description text → Minimum Bid label
  const upsetAmount = (() => {
    const fromLabel = parseMoney(findValue(fields, /upset\s*amount/i));
    if (fromLabel != null) return fromLabel;
    const descText = fields["__description"] ?? "";
    const fromDesc = extractUpsetFromDescription(descText);
    if (fromDesc != null) return fromDesc;
    return parseMoney(findValue(fields, /minimum\s*bid/i));
  })();

  const addr = (streetAddress ?? "").trim();
  const cty = (city ?? "").trim();
  const st = (state ?? "NJ").trim();
  const zp = (zipCode ?? "").trim();

  return {
    sheriffNumber,
    courtCaseNumber: findValue(fields, /court\s*case|docket/i),
    currentSaleDate,
    originalSaleDate,
    plaintiff: findValue(fields, /plaintiff/i),
    defendant: findValue(fields, /defendant/i),
    address: addr || null,
    city: cty || null,
    state: st || null,
    zipCode: zp || null,
    attorney: findValue(fields, /attorney/i),
    approxJudgment: parseMoney(findValue(fields, /approx(?:imate)?\.?\s*(judgment|judgement)/i)),
    upsetAmount,
    priorsLiensTaxes: findValue(fields, /\bpriors?\b/i),
    taxLot: findValue(fields, /tax\s*lot/i),
    block: findValue(fields, /\bblock\b/i),
    nearestCrossStreet: findValue(fields, /cross\s*street|nearest/i),
    occupancyStatus: findValue(fields, /occupancy|occupied/i),
    propertyNotes: findValue(fields, /property\s*note|notes?|comments?/i),
    statusHistory,
    detailUrl,
    googleMapsUrl: buildGoogleMapsUrl(addr, cty, st, zp),
    zillowUrl: buildZillowUrl(addr, cty, st, zp),
  };
}

// ─── Valuation: Zillow ───────────────────────────────────────────────────────

const PRESERVE_CITY_NAMES = new Set([
  "ocean city", "sea isle city", "cape may city", "cape may court house",
  "jersey city", "atlantic city", "new york city",
]);

function buildAddressCandidates(street: string, city: string, state: string, zip: string): string[] {
  const noParens = city.replace(/\s*\([^)]*\)\s*/g, "").trim();
  const strippedCity = PRESERVE_CITY_NAMES.has(noParens.toLowerCase())
    ? noParens
    : noParens.replace(/\s+(Township|Twp|Borough|Boro|City|Village|Town)$/i, "").trim();
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of [city, noParens, strippedCity]) {
    const q = `${street}, ${c}, ${state} ${zip}`;
    if (!seen.has(q)) { seen.add(q); candidates.push(q); }
  }
  const shortQ = `${street}, ${state} ${zip}`;
  if (!seen.has(shortQ)) candidates.push(shortQ);
  return candidates;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) || n <= 0 ? null : n;
}

async function fetchZillowEstimate(
  street: string, city: string, state: string, zip: string,
  env: FcEnv,
): Promise<ValuationResult> {
  const apiKey = env.ZILLOW_RAPIDAPI_KEY;
  if (!apiKey) return { estimate: null, status: "NOT_CONFIGURED", source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };

  const host = env.ZILLOW_RAPIDAPI_HOST ?? "private-zillow.p.rapidapi.com";
  const headers = { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": host, "Accept": "application/json" };
  const candidates = buildAddressCandidates(street, city, state, zip);

  try {
    let zpid: string | number | undefined;
    for (const query of candidates) {
      const acResp = await fetch(`https://${host}/autocomplete?query=${encodeURIComponent(query)}`, { headers });
      if (!acResp.ok) {
        if (acResp.status === 429) return { estimate: null, status: "ERROR", rateLimited: true, source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };
        continue;
      }
      const acBody = await acResp.json() as Record<string, unknown>;
      const results = acBody["results"] as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(results) || results.length === 0) continue;
      const meta = (results[0] as Record<string, unknown>)["metaData"] as Record<string, unknown> | undefined;
      const candidate = meta?.["zpid"] as string | number | undefined;
      if (candidate) { zpid = candidate; break; }
    }

    if (!zpid) return { estimate: null, status: "NOT_FOUND", source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };

    const detailResp = await fetch(`https://${host}/byzpid?zpid=${zpid}`, { headers });
    if (!detailResp.ok) return { estimate: null, status: "ERROR", source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };

    const detail = await detailResp.json() as Record<string, unknown>;
    const MIN_HOME_VALUE = 50_000;
    const rawZestimate = numOrNull(detail["zestimate"]);
    const rawPrice = numOrNull(detail["Price"]);
    const zestimate = rawZestimate ?? (rawPrice != null && rawPrice >= MIN_HOME_VALUE ? rawPrice : null);
    if (zestimate == null) return { estimate: null, status: "NOT_FOUND", source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };

    const rawUrl = detail["PropertyZillowURL"];
    const propertyUrl = typeof rawUrl === "string" && rawUrl.startsWith("http") ? rawUrl : null;
    return { estimate: zestimate, status: "SUCCESS", source: "ZILLOW", propertyUrl, fetchedAt: new Date() };
  } catch (err) {
    console.error("[foreclosures/zillow] error:", err);
    return { estimate: null, status: "ERROR", source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };
  }
}

// ─── Valuation: Redfin ───────────────────────────────────────────────────────

async function fetchRedfinEstimate(
  street: string, city: string, state: string, zip: string,
  env: FcEnv,
): Promise<ValuationResult> {
  const apiKey = env.REDFIN_RAPIDAPI_KEY;
  const host = env.REDFIN_RAPIDAPI_HOST;
  if (!apiKey || !host) return { estimate: null, status: "NOT_CONFIGURED", source: "REDFIN", propertyUrl: null, fetchedAt: new Date() };

  const headers = { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": host, "Accept": "application/json" };
  const candidates = buildAddressCandidates(street, city, state, zip);

  try {
    let redfinUrl: string | null = null;
    for (const query of candidates) {
      const acResp = await fetch(`https://${host}/properties/auto-complete?query=${encodeURIComponent(query)}`, { headers });
      if (!acResp.ok) {
        if (acResp.status === 429) return { estimate: null, status: "ERROR", rateLimited: true, source: "REDFIN", propertyUrl: null, fetchedAt: new Date() };
        continue;
      }
      const acBody = await acResp.json() as Record<string, unknown>;
      if (!acBody["status"]) continue;
      const dataArr = acBody["data"] as Array<{ rows?: Array<{ url?: string }> }> | undefined;
      const url = dataArr?.[0]?.rows?.[0]?.url;
      if (url) { redfinUrl = url; break; }
    }
    if (!redfinUrl) return { estimate: null, status: "NOT_FOUND", source: "REDFIN", propertyUrl: null, fetchedAt: new Date() };

    await sleep(1200);

    const detailResp = await fetch(`https://${host}/property/detail?url=${encodeURIComponent(redfinUrl)}`, { headers });
    if (!detailResp.ok) return { estimate: null, status: detailResp.status === 429 ? "ERROR" : "NOT_FOUND", source: "REDFIN", propertyUrl: null, fetchedAt: new Date() };

    const detailBody = await detailResp.json() as Record<string, unknown>;
    if (!detailBody["status"]) return { estimate: null, status: "NOT_FOUND", source: "REDFIN", propertyUrl: null, fetchedAt: new Date() };

    const data = detailBody["data"] as Record<string, unknown> | undefined;
    const aboveTheFold = data?.["aboveTheFold"] as Record<string, unknown> | undefined;
    const addrInfo = aboveTheFold?.["addressSectionInfo"] as Record<string, unknown> | undefined;
    const priceInfo = addrInfo?.["priceInfo"] as { label?: string; amount?: number } | undefined;

    const estimate = priceInfo?.label === "Redfin Estimate" && typeof priceInfo.amount === "number" ? priceInfo.amount : null;
    const rawPropUrl = typeof addrInfo?.["url"] === "string" ? `https://www.redfin.com${addrInfo["url"] as string}` : null;

    if (estimate === null) return { estimate: null, status: "NOT_FOUND", source: "REDFIN", propertyUrl: rawPropUrl, fetchedAt: new Date() };
    return { estimate, status: "SUCCESS", source: "REDFIN", propertyUrl: rawPropUrl, fetchedAt: new Date() };
  } catch (err) {
    console.error("[foreclosures/redfin] error:", err);
    return { estimate: null, status: "ERROR", source: "REDFIN", propertyUrl: null, fetchedAt: new Date() };
  }
}

// ─── Classification ───────────────────────────────────────────────────────────

const CLASSIFICATION_RULES: Array<{
  type: string; confidence: string; label: string; patterns: RegExp[];
}> = [
  {
    type: "tax_foreclosure", confidence: "high", label: "Tax-collector plaintiff",
    patterns: [/tax\s+collector/i, /township\s+of/i, /city\s+of\s+\w+\s+v\./i, /municipality\s+of/i, /\bcity\b.*\bv\.\b/i],
  },
  {
    type: "tax_foreclosure", confidence: "medium", label: "Tax lien language",
    patterns: [/in\s+rem\b/i, /tax\s+lien\s+cert/i, /\btax\s+sale\b/i, /delinquent\s+taxes/i],
  },
  {
    type: "lien_foreclosure", confidence: "high", label: "HOA/lien plaintiff",
    patterns: [/condominium\s+association/i, /homeowners?\s+association/i, /\bHOA\b/, /assessment\s+lien/i, /condominium\s+lien/i, /mechanic.?s?\s+lien/i, /judgment\s+lien/i, /municipal\s+lien/i],
  },
  {
    type: "lien_foreclosure", confidence: "medium", label: "Lien-holder plaintiff",
    patterns: [/lien\s+holder/i, /lienholder/i],
  },
  {
    type: "mortgage_foreclosure", confidence: "high", label: "Mortgage foreclosure language",
    patterns: [/\bmortgage\s+foreclosure\b/i, /\bmortgagee\b/i, /\bmortgagor\b/i, /\bmortgage\s+debt\b/i],
  },
  {
    type: "mortgage_foreclosure", confidence: "medium", label: "Bank or lender plaintiff",
    patterns: [/\bbank\b/i, /\bN\.?A\.?\b/, /\bmortgage\b/i, /\blender\b/i, /\bcredit\s+union\b/i, /\bfederal\s+savings\b/i, /\bfannie\s+mae\b/i, /\bfreddie\s+mac\b/i, /\bhud\b/i, /\bsecurities\b/i, /\bfinancial\b.*\b(corp|inc|llc)\b/i],
  },
];

function classify(plaintiff: string | null, defendant: string | null): { foreclosureType: string; confidence: string; evidence: string } {
  const combined = [plaintiff, defendant].filter(Boolean).join(" ");
  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(combined)) {
        return { foreclosureType: rule.type, confidence: rule.confidence, evidence: `Matched rule "${rule.label}"` };
      }
    }
  }
  return { foreclosureType: "unknown", confidence: "low", evidence: "No rule matched" };
}

// ─── Deal scoring ─────────────────────────────────────────────────────────────

function scoreDeal(
  upsetAmount: number | null,
  marketValueUsed: number | null,
  zillowEstimate: number | null,
  redfinEstimate: number | null,
): { dealRating: string; dealScore: number | null; estimatedSpread: number | null; discountPercent: number | null; equityMultiple: number | null } {
  if (!upsetAmount || !marketValueUsed || marketValueUsed <= 0) {
    return { dealRating: "UNKNOWN", dealScore: null, estimatedSpread: null, discountPercent: null, equityMultiple: null };
  }
  const spread = marketValueUsed - upsetAmount;
  const discount = (spread / marketValueUsed) * 100;
  const multiple = marketValueUsed / upsetAmount;

  let rating = "NORMAL";
  if (discount >= 40 && spread >= 100_000) rating = "EXTREME";
  else if (discount >= 30 && spread >= 75_000) rating = "MAJOR";
  else if (discount >= 20 && spread >= 50_000) rating = "STRONG";

  const discountScore = Math.min(50, Math.max(0, discount));
  const spreadScore = Math.min(30, Math.max(0, (spread / 150_000) * 30));
  let upsetScore = 0;
  if (upsetAmount <= 100_000) upsetScore = 10;
  else if (upsetAmount <= 150_000) upsetScore = 8;
  else if (upsetAmount <= 200_000) upsetScore = 6;
  else if (upsetAmount <= 250_000) upsetScore = 4;
  else if (upsetAmount <= 280_000) upsetScore = 2;
  const valConfidence = (zillowEstimate != null && redfinEstimate != null) ? 10 : (zillowEstimate != null || redfinEstimate != null) ? 6 : 0;
  const dealScore = Math.min(100, Math.round(discountScore + spreadScore + upsetScore + valConfidence));

  return {
    dealRating: rating,
    dealScore,
    estimatedSpread: Math.round(spread * 100) / 100,
    discountPercent: Math.round(discount * 10) / 10,
    equityMultiple: Math.round(multiple * 100) / 100,
  };
}

function computeWarnings(opts: {
  upsetAmount: number | null;
  zillowEstimate: number | null;
  zillowStatus: string | null;
  zillowFetchedAt: Date | null;
  redfinEstimate: number | null;
  redfinStatus: string | null;
  marketValueUsed: number | null;
  priorsLiensTaxes: string | null;
  occupancyStatus: string | null;
}): string[] {
  const warnings = new Set<string>();
  const priors = (opts.priorsLiensTaxes ?? "").toLowerCase();

  if (!opts.upsetAmount) { warnings.add("MISSING_UPSET_AMOUNT"); warnings.add("UPSET_NOT_FOUND"); }
  if (!opts.marketValueUsed) warnings.add("MARKET_VALUE_UNKNOWN");
  if (opts.zillowStatus && opts.zillowStatus !== "SUCCESS" && opts.zillowStatus !== "NOT_CONFIGURED") {
    warnings.add("NO_ZILLOW_ESTIMATE"); warnings.add("ZILLOW_NO_MATCH");
  }
  if (opts.redfinStatus && opts.redfinStatus !== "SUCCESS" && opts.redfinStatus !== "NOT_CONFIGURED") {
    warnings.add("NO_REDFIN_ESTIMATE"); warnings.add("REDFIN_NO_MATCH");
  }
  if (opts.zillowStatus === "SUCCESS" && opts.zillowFetchedAt) {
    const ageDays = (Date.now() - opts.zillowFetchedAt.getTime()) / 86_400_000;
    if (ageDays > 7) warnings.add("VALUATION_STALE");
  }
  if (opts.zillowEstimate != null && opts.redfinEstimate != null) {
    const diff = Math.abs(opts.zillowEstimate - opts.redfinEstimate);
    const pct = diff / Math.min(opts.zillowEstimate, opts.redfinEstimate);
    if (pct > 0.15) warnings.add("VALUATIONS_DIFFER_SIGNIFICANTLY");
  }
  if (opts.marketValueUsed != null && opts.upsetAmount != null && opts.marketValueUsed < opts.upsetAmount) {
    warnings.add("NEGATIVE_SPREAD");
  }
  if (/tax\s+lien|tax\s+sale\s+cert/i.test(priors)) warnings.add("TAX_LIEN");
  if (/municipal\s+lien|municipality/i.test(priors)) warnings.add("MUNICIPAL_LIEN");
  if (/hoa|homeowner|condominium\s+assoc/i.test(priors)) warnings.add("HOA_LIEN");
  if (/prior\s+mortgage|prior\s+lien|second\s+lien|third\s+lien/i.test(priors)) warnings.add("KNOWN_PRIOR_LIEN");
  if (/owner\s*occupied/i.test(opts.occupancyStatus ?? "")) warnings.add("OWNER_OCCUPIED");

  return [...warnings];
}

// ─── D1 schema init ──────────────────────────────────────────────────────────

/**
 * All columns that must exist in the foreclosures table.
 * Entries are [column_name, sqlite_type_and_default].
 * These are used both in CREATE TABLE and in the ALTER TABLE forward migration.
 * NOTE: "id" and "sheriff_number" are excluded from ALTER TABLE because they are
 * the primary/unique key and cannot be added with ADD COLUMN to a non-empty table.
 */
const FC_COLUMNS_AFTER_PK: ReadonlyArray<[string, string]> = [
  ["county",                    "TEXT NOT NULL DEFAULT 'Atlantic'"],
  ["court_case_number",         "TEXT"],
  ["current_sale_date",         "TEXT"],
  ["original_sale_date",        "TEXT"],
  ["plaintiff",                 "TEXT"],
  ["defendant",                 "TEXT"],
  ["address",                   "TEXT"],
  ["city",                      "TEXT"],
  ["state",                     "TEXT"],
  ["zip_code",                  "TEXT"],
  ["attorney",                  "TEXT"],
  ["approx_judgment",           "REAL"],
  ["upset_amount",              "REAL"],
  ["priors_liens_taxes",        "TEXT"],
  ["tax_lot",                   "TEXT"],
  ["block",                     "TEXT"],
  ["nearest_cross_street",      "TEXT"],
  ["occupancy_status",          "TEXT"],
  ["property_notes",            "TEXT"],
  ["detail_url",                "TEXT"],
  ["google_maps_url",           "TEXT"],
  ["zillow_url",                "TEXT"],
  ["foreclosure_type",          "TEXT DEFAULT 'unknown'"],
  ["classification_confidence", "TEXT"],
  ["classification_evidence",   "TEXT"],
  ["deal_rating",               "TEXT DEFAULT 'UNKNOWN'"],
  ["deal_score",                "REAL"],
  ["estimated_spread",          "REAL"],
  ["discount_percent",          "REAL"],
  ["equity_multiple",           "REAL"],
  ["deal_warnings",             "TEXT DEFAULT '[]'"],
  ["zillow_estimate",           "REAL"],
  ["zillow_status",             "TEXT DEFAULT 'NOT_CONFIGURED'"],
  ["zillow_fetched_at",         "TEXT"],
  ["zillow_property_url",       "TEXT"],
  ["redfin_estimate",           "REAL"],
  ["redfin_status",             "TEXT DEFAULT 'NOT_CONFIGURED'"],
  ["redfin_fetched_at",         "TEXT"],
  ["redfin_property_url",       "TEXT"],
  ["market_value_used",         "REAL"],
  ["market_value_source",       "TEXT DEFAULT 'NONE'"],
  ["valuation_updated_at",      "TEXT"],
  ["status_history",            "TEXT DEFAULT '[]'"],
  ["permanently_excluded",      "INTEGER DEFAULT 0"],
  ["is_removed",                "INTEGER DEFAULT 0"],
  ["first_seen",                "TEXT"],
  ["last_seen",                 "TEXT"],
  ["last_updated",              "TEXT"],
];

const FC_INDEXES: ReadonlyArray<[string, string]> = [
  ["idx_fc_county",    "county"],
  ["idx_fc_upset",     "upset_amount"],
  ["idx_fc_sale_date", "current_sale_date"],
  ["idx_fc_rating",    "deal_rating"],
  ["idx_fc_market",    "market_value_used"],
  ["idx_fc_discount",  "discount_percent"],
];

/**
 * Idempotent schema migration for the foreclosures table.
 *
 * Safe to call on every request. Works correctly whether the table:
 *   (a) does not exist yet            — creates it with full schema
 *   (b) is already up to date         — PRAGMA confirms nothing is missing, no-op
 *   (c) was created by an older build — ALTER TABLE ADD COLUMN adds missing columns
 *
 * Why not db.batch() for DDL?  D1 runs batches inside a single transaction.
 * SQLite DDL (CREATE INDEX) on an existing table inside a transaction can fail
 * when the statement depends on columns that exist only after a preceding
 * CREATE TABLE in the same batch.  Running statements individually isolates
 * failures to the statement that actually failed.
 */
export async function ensureForeclosuresTable(db: D1Database): Promise<void> {
  // ── 1. Create table with full schema if it does not exist yet ──────────────
  await db.prepare(`CREATE TABLE IF NOT EXISTS foreclosures (
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
  )`).run();

  // ── 2. Discover which columns already exist ────────────────────────────────
  // PRAGMA table_info returns one row per column with at least a "name" field.
  const pragma = await db.prepare("PRAGMA table_info(foreclosures)")
    .all<{ name: string }>();
  const existing = new Set((pragma.results ?? []).map((r) => r.name));

  // ── 3. Forward migration: add any columns that are missing ─────────────────
  // ALTER TABLE ADD COLUMN is safe on non-empty tables as long as we do NOT
  // add NOT NULL without a DEFAULT, or add PRIMARY KEY / UNIQUE constraints.
  for (const [col, def] of FC_COLUMNS_AFTER_PK) {
    if (!existing.has(col)) {
      // Strip NOT NULL from the definition — SQLite ALTER TABLE ADD COLUMN
      // does not allow NOT NULL unless there is a DEFAULT.
      // All columns here either have a DEFAULT or are nullable, so this is safe.
      const safeDef = def.replace(/\bNOT NULL\b/gi, "").trim();
      try {
        await db.prepare(`ALTER TABLE foreclosures ADD COLUMN ${col} ${safeDef}`).run();
      } catch {
        // Race condition (another request added the column first) — safe to ignore.
      }
    }
  }

  // ── 4. Create indexes individually — do NOT use db.batch() for DDL ────────
  // CREATE INDEX IF NOT EXISTS is idempotent; each failure is isolated.
  for (const [name, col] of FC_INDEXES) {
    try {
      await db.prepare(`CREATE INDEX IF NOT EXISTS ${name} ON foreclosures(${col})`).run();
    } catch {
      // If the column still doesn't exist on an old table the index creation
      // fails silently — queries still work via full scan on that column.
    }
  }
}

// ─── D1 upsert ───────────────────────────────────────────────────────────────

/** Existing D1 row data needed for valuation merging and first_seen preservation */
interface ExistingValuation {
  first_seen: string | null;
  zillow_estimate: number | null;
  zillow_status: string | null;
  zillow_fetched_at: string | null;
  zillow_property_url: string | null;
  redfin_estimate: number | null;
  redfin_status: string | null;
  redfin_fetched_at: string | null;
  redfin_property_url: string | null;
}

/**
 * Merge a fresh valuation result with the existing row's stored valuation.
 * Rules:
 *   - If newResult is undefined (valuation not run this sync): preserve all existing data.
 *   - If newResult.rateLimited is true (HTTP 429): preserve existing to avoid writing ERROR.
 *   - Otherwise: use the new result (SUCCESS, NOT_FOUND, ERROR, NOT_CONFIGURED).
 */
function mergeValuation(
  newResult: ValuationResult | undefined,
  existing: { estimate: number | null; status: string | null; fetchedAt: string | null; url: string | null },
): { estimate: number | null; status: string; fetchedAt: string | null; url: string | null } {
  if (!newResult || newResult.rateLimited) {
    // Not run or rate-limited — preserve existing
    return {
      estimate: existing.estimate,
      status: existing.status ?? "NOT_CONFIGURED",
      fetchedAt: existing.fetchedAt,
      url: existing.url,
    };
  }
  return {
    estimate: newResult.estimate,
    status: newResult.status,
    fetchedAt: newResult.fetchedAt.toISOString(),
    url: newResult.propertyUrl,
  };
}

async function upsertForeclosure(
  db: D1Database,
  county: string,
  detail: DetailedListing,
  newValuation: { zillow: ValuationResult; redfin?: ValuationResult } | null,
  /** Existing row data fetched before this call — avoids an extra DB round-trip */
  existingRow: ExistingValuation | null,
): Promise<void> {
  const now = new Date().toISOString();
  const firstSeen = existingRow?.first_seen ?? now;
  const isUpdate = existingRow != null;

  // Merge valuation: new result takes priority unless rate-limited or not run
  const zMerged = mergeValuation(
    newValuation?.zillow,
    {
      estimate: existingRow?.zillow_estimate ?? null,
      status: existingRow?.zillow_status ?? null,
      fetchedAt: existingRow?.zillow_fetched_at ?? null,
      url: existingRow?.zillow_property_url ?? null,
    },
  );
  const rMerged = mergeValuation(
    newValuation?.redfin,
    {
      estimate: existingRow?.redfin_estimate ?? null,
      status: existingRow?.redfin_status ?? null,
      fetchedAt: existingRow?.redfin_fetched_at ?? null,
      url: existingRow?.redfin_property_url ?? null,
    },
  );

  // Market value: compute from the best available (merged) estimates
  const z = zMerged.estimate;
  const r = rMerged.estimate;
  let marketValueUsed: number | null = null;
  let marketValueSource = "NONE";
  if (z != null && r != null) {
    marketValueUsed = Math.round((z + r) / 2);
    marketValueSource = "AVERAGE";
  } else if (z != null) {
    marketValueUsed = z;
    marketValueSource = "ZILLOW";
  } else if (r != null) {
    marketValueUsed = r;
    marketValueSource = "REDFIN";
  }

  const classResult = classify(detail.plaintiff, detail.defendant);
  const dealMetrics = scoreDeal(detail.upsetAmount, marketValueUsed, z, r);
  const warnings = computeWarnings({
    upsetAmount: detail.upsetAmount,
    zillowEstimate: z,
    zillowStatus: zMerged.status,
    zillowFetchedAt: zMerged.fetchedAt ? new Date(zMerged.fetchedAt) : null,
    redfinEstimate: r,
    redfinStatus: rMerged.status,
    marketValueUsed,
    priorsLiensTaxes: detail.priorsLiensTaxes,
    occupancyStatus: detail.occupancyStatus,
  });

  // Only update valuation_updated_at when new data was actually written.
  // redfin may be undefined (not fetched during sync — on-demand only, like Preview).
  const valUpdatedAt = (
    newValuation &&
    !newValuation.zillow.rateLimited &&
    (newValuation.redfin == null || !newValuation.redfin.rateLimited)
  )
    ? now
    : existingRow ? undefined : null; // undefined = preserve in UPDATE, null = set null on INSERT

  if (isUpdate) {
    await db.prepare(`UPDATE foreclosures SET
        county=?, court_case_number=?, current_sale_date=?, original_sale_date=?,
        plaintiff=?, defendant=?, address=?, city=?, state=?, zip_code=?,
        attorney=?, approx_judgment=?, upset_amount=?, priors_liens_taxes=?,
        tax_lot=?, block=?, nearest_cross_street=?, occupancy_status=?, property_notes=?,
        detail_url=?, google_maps_url=?, zillow_url=?,
        foreclosure_type=?, classification_confidence=?, classification_evidence=?,
        deal_rating=?, deal_score=?, estimated_spread=?, discount_percent=?, equity_multiple=?,
        deal_warnings=?, zillow_estimate=?, zillow_status=?, zillow_fetched_at=?,
        zillow_property_url=?, redfin_estimate=?, redfin_status=?, redfin_fetched_at=?,
        redfin_property_url=?, market_value_used=?, market_value_source=?,
        status_history=?, first_seen=?, last_seen=?, last_updated=?, is_removed=0
        WHERE sheriff_number=?`)
      .bind(
        county, detail.courtCaseNumber, detail.currentSaleDate, detail.originalSaleDate,
        detail.plaintiff, detail.defendant, detail.address, detail.city, detail.state, detail.zipCode,
        detail.attorney, detail.approxJudgment, detail.upsetAmount, detail.priorsLiensTaxes,
        detail.taxLot, detail.block, detail.nearestCrossStreet, detail.occupancyStatus, detail.propertyNotes,
        detail.detailUrl, detail.googleMapsUrl, detail.zillowUrl,
        classResult.foreclosureType, classResult.confidence, classResult.evidence,
        dealMetrics.dealRating, dealMetrics.dealScore, dealMetrics.estimatedSpread,
        dealMetrics.discountPercent, dealMetrics.equityMultiple,
        JSON.stringify(warnings),
        zMerged.estimate, zMerged.status, zMerged.fetchedAt, zMerged.url,
        rMerged.estimate, rMerged.status, rMerged.fetchedAt, rMerged.url,
        marketValueUsed, marketValueSource,
        JSON.stringify(detail.statusHistory),
        firstSeen, now, now,
        detail.sheriffNumber,
      ).run();
  } else {
    await db.prepare(`INSERT INTO foreclosures (
        sheriff_number, county, court_case_number, current_sale_date, original_sale_date,
        plaintiff, defendant, address, city, state, zip_code,
        attorney, approx_judgment, upset_amount, priors_liens_taxes,
        tax_lot, block, nearest_cross_street, occupancy_status, property_notes,
        detail_url, google_maps_url, zillow_url,
        foreclosure_type, classification_confidence, classification_evidence,
        deal_rating, deal_score, estimated_spread, discount_percent, equity_multiple,
        deal_warnings, zillow_estimate, zillow_status, zillow_fetched_at,
        zillow_property_url, redfin_estimate, redfin_status, redfin_fetched_at,
        redfin_property_url, market_value_used, market_value_source, valuation_updated_at,
        status_history, first_seen, last_seen, last_updated
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(
        detail.sheriffNumber, county, detail.courtCaseNumber, detail.currentSaleDate, detail.originalSaleDate,
        detail.plaintiff, detail.defendant, detail.address, detail.city, detail.state, detail.zipCode,
        detail.attorney, detail.approxJudgment, detail.upsetAmount, detail.priorsLiensTaxes,
        detail.taxLot, detail.block, detail.nearestCrossStreet, detail.occupancyStatus, detail.propertyNotes,
        detail.detailUrl, detail.googleMapsUrl, detail.zillowUrl,
        classResult.foreclosureType, classResult.confidence, classResult.evidence,
        dealMetrics.dealRating, dealMetrics.dealScore, dealMetrics.estimatedSpread,
        dealMetrics.discountPercent, dealMetrics.equityMultiple,
        JSON.stringify(warnings),
        zMerged.estimate, zMerged.status ?? "NOT_CONFIGURED", zMerged.fetchedAt, zMerged.url,
        rMerged.estimate, rMerged.status ?? "NOT_CONFIGURED", rMerged.fetchedAt, rMerged.url,
        marketValueUsed, marketValueSource, valUpdatedAt ?? null,
        JSON.stringify(detail.statusHistory),
        firstSeen, now, now,
      ).run();
  }
}

// ─── Main sync function ──────────────────────────────────────────────────────

/**
 * Maximum detail-page fetches per sync invocation.
 * Stubs beyond this cap get a lightweight stub-only upsert so they appear
 * in the listings table immediately; a subsequent sync will fetch their details.
 * Oldest-updated records are prioritised, so repeated syncs make steady forward
 * progress across the full listing set.
 */
const MAX_DETAIL_PAGES = 15;

/**
 * Hard wall-time budget per sync invocation.
 * Cloudflare Workers enforce a 30 s CPU limit. Valuation-heavy records consume
 * ~2 s each (DELAY_MS scrape delay + 500 ms pre-valuation sleep + Redfin's
 * 1.2 s pause + actual network time). At SYNC_BUDGET_MS we stop processing
 * new detail pages and stub-upsert the remainder so the function always returns
 * cleanly — Workers kills invocations that exceed the limit mid-execution.
 */
const SYNC_BUDGET_MS = 20_000;

export async function runSync(countySlug: string, db: D1Database, env: FcEnv): Promise<SyncSummary> {
  const start = Date.now();
  const countyName = COUNTY_NAMES[countySlug] ?? countySlug;

  if (!COUNTY_IDS[countySlug]) throw new Error(`Unknown county: ${countySlug}`);

  // ── 1. Fetch full listing stubs from CivilView ──────────────────────────────
  const { stubs, cookies } = await fetchListPage(countySlug);
  const now = new Date().toISOString();

  // ── 2. Query all existing rows for this county ──────────────────────────────
  const existingResult = await db.prepare(
    `SELECT sheriff_number, first_seen, last_updated,
     zillow_estimate, zillow_status, zillow_fetched_at, zillow_property_url,
     redfin_estimate, redfin_status, redfin_fetched_at, redfin_property_url
     FROM foreclosures WHERE county = ? AND permanently_excluded = 0`,
  ).bind(countyName).all<ExistingValuation & { sheriff_number: string; last_updated: string | null }>();

  const existingMap = new Map(
    (existingResult.results ?? []).map((r) => [r.sheriff_number, r]),
  );

  // ── 3. Reconcile: mark listings no longer on CivilView as removed ───────────
  const currentSet = new Set(stubs.map((s) => s.sheriffNumber));
  const toRemove: string[] = [];
  for (const [sheriff] of existingMap) {
    if (!currentSet.has(sheriff)) toRemove.push(sheriff);
  }
  // D1 doesn't support IN with large parameter lists in a single statement;
  // process in chunks of 50.
  for (let i = 0; i < toRemove.length; i += 50) {
    const chunk = toRemove.slice(i, i + 50);
    const ph = chunk.map(() => "?").join(",");
    await db.prepare(
      `UPDATE foreclosures SET is_removed=1, last_updated=? WHERE sheriff_number IN (${ph})`,
    ).bind(now, ...chunk).run();
  }
  console.log(`[foreclosures] ${countySlug}: ${toRemove.length} removed, ${stubs.length} active`);

  // ── 4. Prioritise stubs: new listings first, then oldest-updated ────────────
  // This guarantees each invocation processes a different slice of the list,
  // so repeated syncs converge across ALL stubs — not just the first 40.
  const sortedStubs = [...stubs].sort((a, b) => {
    const ae = existingMap.get(a.sheriffNumber);
    const be = existingMap.get(b.sheriffNumber);
    if (!ae && be) return -1;   // a is new — comes first
    if (ae && !be) return 1;    // b is new — comes first
    if (!ae && !be) return 0;   // both new — preserve list order
    // Both exist: oldest last_updated first
    const ad = ae!.last_updated ?? "1970-01-01T00:00:00Z";
    const bd = be!.last_updated ?? "1970-01-01T00:00:00Z";
    return ad.localeCompare(bd);
  });

  const toDetail = sortedStubs.slice(0, MAX_DETAIL_PAGES);
  const stubOnly = sortedStubs.slice(MAX_DETAIL_PAGES);

  // ── 5. Stub-only upsert for listings beyond the cap ─────────────────────────
  // INSERT OR IGNORE so we never clobber an existing fully-detailed row.
  // For existing rows, just touch last_seen + clear is_removed.
  for (const stub of stubOnly) {
    const ex = existingMap.get(stub.sheriffNumber);
    if (ex) {
      await db.prepare(
        "UPDATE foreclosures SET last_seen=?, is_removed=0 WHERE sheriff_number=?",
      ).bind(now, stub.sheriffNumber).run();
    } else {
      await db.prepare(
        `INSERT OR IGNORE INTO foreclosures
         (sheriff_number, county, current_sale_date, plaintiff, defendant, address,
          deal_warnings, status_history, first_seen, last_seen, last_updated)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        stub.sheriffNumber, countyName, stub.saleDate, stub.plaintiff,
        stub.defendant, stub.address, "[]", "[]", now, now, now,
      ).run();
    }
  }

  // ── 6. Full detail-page fetch + valuation + upsert ─────────────────────────
  let detailsFetched = 0;
  let upserted = 0;
  let valuated = 0;
  let errors = 0;
  // Diagnostic counters — safe booleans/numbers, no key values ever exposed
  let needsValuationCount = 0;
  let zillowAttempts = 0;
  let zillowSuccesses = 0;
  let zillowFailures = 0;

  for (let di = 0; di < toDetail.length; di++) {
    const stub = toDetail[di]!;

    // ── Hard budget stop ──────────────────────────────────────────────────────
    // If we are approaching the Workers wall-time limit, stub-upsert everything
    // remaining so the invocation returns cleanly instead of being killed.
    if (Date.now() - start > SYNC_BUDGET_MS) {
      console.log(`[foreclosures] budget exhausted at detail ${di}/${toDetail.length}; stub-upserting remainder`);
      for (const rem of toDetail.slice(di)) {
        const ex = existingMap.get(rem.sheriffNumber);
        if (ex) {
          await db.prepare("UPDATE foreclosures SET last_seen=?, is_removed=0 WHERE sheriff_number=?")
            .bind(now, rem.sheriffNumber).run();
        } else {
          await db.prepare(
            `INSERT OR IGNORE INTO foreclosures
             (sheriff_number, county, current_sale_date, plaintiff, defendant, address,
              deal_warnings, status_history, first_seen, last_seen, last_updated)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          ).bind(rem.sheriffNumber, countyName, rem.saleDate, rem.plaintiff,
            rem.defendant, rem.address, "[]", "[]", now, now, now).run();
        }
      }
      break;
    }

    await sleep(DELAY_MS);

    const existingRow = existingMap.get(stub.sheriffNumber) ?? null;

    const detail = await fetchDetailPage(stub.detailUrl, cookies, countySlug);
    if (!detail) {
      errors++;
      // Update last_updated (not just last_seen) so this stub is deprioritised
      // in the priority sort next sync and does not permanently occupy a slot.
      if (existingRow) {
        await db.prepare("UPDATE foreclosures SET last_seen=?, last_updated=? WHERE sheriff_number=?")
          .bind(now, now, stub.sheriffNumber).run();
      } else {
        // Insert stub so it exists in DB with current last_updated
        await db.prepare(
          `INSERT OR IGNORE INTO foreclosures
           (sheriff_number, county, current_sale_date, plaintiff, defendant, address,
            deal_warnings, status_history, first_seen, last_seen, last_updated)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(stub.sheriffNumber, countyName, stub.saleDate, stub.plaintiff,
          stub.defendant, stub.address, "[]", "[]", now, now, now).run();
      }
      continue;
    }
    detailsFetched++;

    // Valuations — mirrors Preview's lookupValuation() 7-day cache (src/valuation.ts:74-87).
    // Only Zillow is fetched automatically during sync; Redfin is on-demand only
    // (same as Preview: refresh.ts never calls lookupRedfinValuation).
    // Existing Redfin data is preserved via mergeValuation(undefined, existing).
    let newValuation: { zillow: ValuationResult; redfin?: ValuationResult } | null = null;

    const cacheThresholdMs = Date.now() - VALUATION_CACHE_DAYS * 86_400_000;
    const recentlyValuated =
      existingRow?.zillow_fetched_at != null &&
      existingRow.zillow_status === "SUCCESS" &&
      new Date(existingRow.zillow_fetched_at).getTime() > cacheThresholdMs;

    const needsValuation =
      !recentlyValuated &&
      detail.address && detail.city &&
      detail.upsetAmount != null && detail.upsetAmount <= VALUATION_UPSET_THRESHOLD;

    if (needsValuation && detail.address && detail.city) {
      needsValuationCount++;
      await sleep(500);
      zillowAttempts++;
      const zillow = await fetchZillowEstimate(
        detail.address, detail.city, detail.state ?? "NJ", detail.zipCode ?? "", env,
      );
      // Redfin is intentionally NOT called during sync — on-demand only via
      // POST /api/foreclosures/listings/:sheriff/valuate (matches Preview behavior).
      newValuation = { zillow };
      if (zillow.estimate != null) {
        valuated++;
        zillowSuccesses++;
      } else {
        zillowFailures++;
        console.log(
          `[foreclosures] Zillow ${zillow.status} for ${detail.sheriffNumber} ` +
          `(keyPresent=${Boolean(env.ZILLOW_RAPIDAPI_KEY)})`,
        );
      }
    }

    try {
      await upsertForeclosure(db, countyName, detail, newValuation, existingRow);
      upserted++;
    } catch (err) {
      console.error(`[foreclosures] upsert error for ${detail.sheriffNumber}:`, err);
      errors++;
    }
  }

  return {
    county: countyName,
    stubsFound: stubs.length,
    detailsFetched,
    upserted,
    valuated,
    errors,
    durationMs: Date.now() - start,
    // Safe diagnostics — values are booleans/counts, never secret values
    zillowConfigured:   Boolean(env.ZILLOW_RAPIDAPI_KEY),
    redfinConfigured:   Boolean(env.REDFIN_RAPIDAPI_KEY),
    rentcastConfigured: Boolean((env as Record<string, unknown>).RENTCAST_API_KEY),
    needsValuationCount,
    zillowAttempts,
    zillowSuccesses,
    zillowFailures,
  };
}

// ─── Listings query ──────────────────────────────────────────────────────────

export interface ListingsParams {
  county?: string;      // filter by county name (case-insensitive)
  search?: string;      // full-text search
  deal?: string;        // deal_rating filter
  type?: string;        // foreclosure_type filter
  upsetMax?: number;    // upset_amount <= N
  sort?: string;        // column name whitelist
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

const SORT_WHITELIST = new Set([
  "deal_score", "deal_rating", "sheriff_number", "current_sale_date",
  "upset_amount", "market_value_used", "estimated_spread", "discount_percent",
  "foreclosure_type", "county", "last_updated", "first_seen",
]);

export async function queryListings(db: D1Database, params: ListingsParams): Promise<{ rows: ListingRow[]; total: number }> {
  const conditions: string[] = ["permanently_excluded = 0", "is_removed = 0"];
  const bindings: (string | number | null)[] = [];

  if (params.county && params.county !== "All") {
    conditions.push("lower(county) = lower(?)");
    bindings.push(params.county);
  }
  if (params.deal) {
    conditions.push("deal_rating = ?");
    bindings.push(params.deal);
  }
  if (params.type) {
    conditions.push("foreclosure_type = ?");
    bindings.push(params.type);
  }
  if (params.upsetMax != null) {
    conditions.push("upset_amount IS NOT NULL AND upset_amount <= ?");
    bindings.push(params.upsetMax);
  }
  if (params.search) {
    const q = `%${params.search}%`;
    conditions.push("(plaintiff LIKE ? OR defendant LIKE ? OR address LIKE ? OR sheriff_number LIKE ?)");
    bindings.push(q, q, q, q);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const sortCol = SORT_WHITELIST.has(params.sort ?? "") ? params.sort! : "deal_score";
  const order = params.order === "asc" ? "ASC" : "DESC";
  const nulls = order === "DESC" ? "NULLS LAST" : "NULLS FIRST";
  const limit = Math.min(params.limit ?? 200, 500);
  const offset = params.offset ?? 0;

  const [countResult, rowsResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM foreclosures ${where}`).bind(...bindings).first<{ total: number }>(),
    db.prepare(`SELECT * FROM foreclosures ${where} ORDER BY ${sortCol} ${order} ${nulls} LIMIT ? OFFSET ?`)
      .bind(...bindings, limit, offset)
      .all<Record<string, unknown>>(),
  ]);

  const total = countResult?.total ?? 0;
  const rows = (rowsResult.results ?? []).map(formatRow);

  return { rows, total };
}

export async function queryStats(db: D1Database): Promise<{
  atlantic: number; capeMay: number; extreme: number; major: number; strong: number;
  under280: number; lastUpdated: string | null;
}> {
  const result = await db.prepare(`
    SELECT
      SUM(CASE WHEN lower(county)='atlantic' AND permanently_excluded=0 AND is_removed=0 THEN 1 ELSE 0 END) as atlantic,
      SUM(CASE WHEN lower(county)='cape may' AND permanently_excluded=0 AND is_removed=0 THEN 1 ELSE 0 END) as cape_may,
      SUM(CASE WHEN deal_rating='EXTREME' AND permanently_excluded=0 AND is_removed=0 THEN 1 ELSE 0 END) as extreme,
      SUM(CASE WHEN deal_rating='MAJOR' AND permanently_excluded=0 AND is_removed=0 THEN 1 ELSE 0 END) as major,
      SUM(CASE WHEN deal_rating='STRONG' AND permanently_excluded=0 AND is_removed=0 THEN 1 ELSE 0 END) as strong,
      SUM(CASE WHEN upset_amount IS NOT NULL AND upset_amount <= 280000 AND permanently_excluded=0 AND is_removed=0 THEN 1 ELSE 0 END) as under280,
      MAX(last_updated) as last_updated
    FROM foreclosures
  `).first<{ atlantic: number; cape_may: number; extreme: number; major: number; strong: number; under280: number; last_updated: string | null }>();

  return {
    atlantic: result?.atlantic ?? 0,
    capeMay: result?.cape_may ?? 0,
    extreme: result?.extreme ?? 0,
    major: result?.major ?? 0,
    strong: result?.strong ?? 0,
    under280: result?.under280 ?? 0,
    lastUpdated: result?.last_updated ?? null,
  };
}

export async function getForeclosureBySherifffNumber(db: D1Database, sheriff: string): Promise<ListingRow | null> {
  const row = await db.prepare("SELECT * FROM foreclosures WHERE sheriff_number = ?")
    .bind(sheriff).first<Record<string, unknown>>();
  return row ? formatRow(row) : null;
}

// ─── Per-listing admin actions ────────────────────────────────────────────────

interface DbRow {
  address: string | null; city: string | null; state: string | null; zip_code: string | null;
  upset_amount: number | null; plaintiff: string | null; defendant: string | null;
  zillow_estimate: number | null; zillow_status: string | null;
  zillow_fetched_at: string | null; zillow_property_url: string | null;
  redfin_estimate: number | null; redfin_status: string | null;
  redfin_fetched_at: string | null; redfin_property_url: string | null;
  market_value_used: number | null; market_value_source: string | null;
  priors_liens_taxes: string | null; occupancy_status: string | null;
}

/** Re-run Zillow + Redfin valuation for a single listing and update deal metrics. */
export async function valuateListing(db: D1Database, sheriff: string, env: FcEnv): Promise<{ outcome: string }> {
  const row = await db.prepare("SELECT * FROM foreclosures WHERE sheriff_number = ?")
    .bind(sheriff).first<DbRow>();
  if (!row) return { outcome: "NOT_FOUND" };
  if (!row.address || !row.city) return { outcome: "NO_ADDRESS" };

  const [zillow, redfin] = await Promise.all([
    fetchZillowEstimate(row.address, row.city, row.state ?? "NJ", row.zip_code ?? "", env),
    fetchRedfinEstimate(row.address, row.city, row.state ?? "NJ", row.zip_code ?? "", env),
  ]);

  const zM = mergeValuation(zillow, { estimate: row.zillow_estimate, status: row.zillow_status, fetchedAt: row.zillow_fetched_at, url: row.zillow_property_url });
  const rM = mergeValuation(redfin, { estimate: row.redfin_estimate, status: row.redfin_status, fetchedAt: row.redfin_fetched_at, url: row.redfin_property_url });

  let mv: number | null = null; let mvSrc = "NONE";
  if (zM.estimate != null && rM.estimate != null) { mv = Math.round((zM.estimate + rM.estimate) / 2); mvSrc = "AVERAGE"; }
  else if (zM.estimate != null) { mv = zM.estimate; mvSrc = "ZILLOW"; }
  else if (rM.estimate != null) { mv = rM.estimate; mvSrc = "REDFIN"; }

  const m = scoreDeal(row.upset_amount, mv, zM.estimate, rM.estimate);
  const now = new Date().toISOString();

  await db.prepare(`UPDATE foreclosures SET
    zillow_estimate=?, zillow_status=?, zillow_fetched_at=?, zillow_property_url=?,
    redfin_estimate=?, redfin_status=?, redfin_fetched_at=?, redfin_property_url=?,
    market_value_used=?, market_value_source=?, valuation_updated_at=?,
    deal_rating=?, deal_score=?, estimated_spread=?, discount_percent=?, equity_multiple=?,
    last_updated=? WHERE sheriff_number=?`)
    .bind(zM.estimate, zM.status, zM.fetchedAt, zM.url, rM.estimate, rM.status, rM.fetchedAt, rM.url,
      mv, mvSrc, now, m.dealRating, m.dealScore, m.estimatedSpread, m.discountPercent, m.equityMultiple,
      now, sheriff).run();

  return { outcome: `${zillow.status}/${redfin.status}` };
}

/** Recompute classification, deal scoring and warnings from existing stored valuations. */
export async function recalculateListing(db: D1Database, sheriff: string): Promise<{ outcome: string }> {
  const row = await db.prepare("SELECT * FROM foreclosures WHERE sheriff_number = ?")
    .bind(sheriff).first<DbRow>();
  if (!row) return { outcome: "NOT_FOUND" };

  const z = row.zillow_estimate;
  const r = row.redfin_estimate;
  const mv = row.market_value_used;
  const m = scoreDeal(row.upset_amount, mv, z, r);
  const cls = classify(row.plaintiff, row.defendant);
  const warns = computeWarnings({
    upsetAmount: row.upset_amount, zillowEstimate: z, zillowStatus: row.zillow_status,
    zillowFetchedAt: row.zillow_fetched_at ? new Date(row.zillow_fetched_at) : null,
    redfinEstimate: r, redfinStatus: row.redfin_status, marketValueUsed: mv,
    priorsLiensTaxes: row.priors_liens_taxes, occupancyStatus: row.occupancy_status,
  });

  await db.prepare(`UPDATE foreclosures SET
    foreclosure_type=?, classification_confidence=?, classification_evidence=?,
    deal_rating=?, deal_score=?, estimated_spread=?, discount_percent=?, equity_multiple=?,
    deal_warnings=?, last_updated=? WHERE sheriff_number=?`)
    .bind(cls.foreclosureType, cls.confidence, cls.evidence,
      m.dealRating, m.dealScore, m.estimatedSpread, m.discountPercent, m.equityMultiple,
      JSON.stringify(warns), new Date().toISOString(), sheriff).run();

  return { outcome: "RECALCULATED" };
}

/** Manually set a Redfin estimate and recompute deal metrics. */
export async function updateRedfinEstimate(db: D1Database, sheriff: string, estimate: number): Promise<{ outcome: string }> {
  const row = await db.prepare("SELECT upset_amount, zillow_estimate, priors_liens_taxes, occupancy_status, zillow_status, zillow_fetched_at FROM foreclosures WHERE sheriff_number = ?")
    .bind(sheriff).first<Pick<DbRow, "upset_amount" | "zillow_estimate" | "priors_liens_taxes" | "occupancy_status" | "zillow_status" | "zillow_fetched_at">>();
  if (!row) return { outcome: "NOT_FOUND" };

  const z = row.zillow_estimate;
  let mv: number | null = null; let mvSrc = "NONE";
  if (z != null && estimate != null) { mv = Math.round((z + estimate) / 2); mvSrc = "AVERAGE"; }
  else if (z != null) { mv = z; mvSrc = "ZILLOW"; }
  else { mv = estimate; mvSrc = "REDFIN"; }

  const m = scoreDeal(row.upset_amount, mv, z, estimate);
  const now = new Date().toISOString();

  await db.prepare(`UPDATE foreclosures SET
    redfin_estimate=?, redfin_status=?, redfin_fetched_at=?,
    market_value_used=?, market_value_source=?, valuation_updated_at=?,
    deal_rating=?, deal_score=?, estimated_spread=?, discount_percent=?, equity_multiple=?,
    last_updated=? WHERE sheriff_number=?`)
    .bind(estimate, "SUCCESS", now, mv, mvSrc, now,
      m.dealRating, m.dealScore, m.estimatedSpread, m.discountPercent, m.equityMultiple,
      now, sheriff).run();

  return { outcome: "UPDATED" };
}

// ─── Row formatter ────────────────────────────────────────────────────────────

function safeNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function safeStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function formatRow(row: Record<string, unknown>): ListingRow {
  let statusHistory: StatusEntry[] = [];
  try { statusHistory = JSON.parse(String(row["status_history"] ?? "[]")); } catch { /* ok */ }
  let dealWarnings: string[] = [];
  try { dealWarnings = JSON.parse(String(row["deal_warnings"] ?? "[]")); } catch { /* ok */ }

  const lastUpdated = safeStr(row["last_updated"]);
  const firstSeen = safeStr(row["first_seen"]);
  const isNew = firstSeen != null && lastUpdated != null &&
    new Date(firstSeen).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;

  return {
    sheriffNumber: String(row["sheriff_number"] ?? ""),
    county: safeStr(row["county"]) ?? "Atlantic",
    courtCaseNumber: safeStr(row["court_case_number"]),
    currentSaleDate: safeStr(row["current_sale_date"]),
    originalSaleDate: safeStr(row["original_sale_date"]),
    plaintiff: safeStr(row["plaintiff"]),
    defendant: safeStr(row["defendant"]),
    address: safeStr(row["address"]),
    city: safeStr(row["city"]),
    state: safeStr(row["state"]),
    zipCode: safeStr(row["zip_code"]),
    attorney: safeStr(row["attorney"]),
    approxJudgment: safeNum(row["approx_judgment"]),
    upsetAmount: safeNum(row["upset_amount"]),
    priorsLiensTaxes: safeStr(row["priors_liens_taxes"]),
    taxLot: safeStr(row["tax_lot"]),
    block: safeStr(row["block"]),
    nearestCrossStreet: safeStr(row["nearest_cross_street"]),
    occupancyStatus: safeStr(row["occupancy_status"]),
    propertyNotes: safeStr(row["property_notes"]),
    foreclosureType: safeStr(row["foreclosure_type"]) ?? "unknown",
    dealRating: safeStr(row["deal_rating"]) ?? "UNKNOWN",
    dealScore: safeNum(row["deal_score"]),
    estimatedSpread: safeNum(row["estimated_spread"]),
    discountPercent: safeNum(row["discount_percent"]),
    equityMultiple: safeNum(row["equity_multiple"]),
    dealWarnings,
    zillowEstimate: safeNum(row["zillow_estimate"]),
    zillowStatus: safeStr(row["zillow_status"]) ?? "NOT_CONFIGURED",
    zillowPropertyUrl: safeStr(row["zillow_property_url"]),
    redfinEstimate: safeNum(row["redfin_estimate"]),
    redfinStatus: safeStr(row["redfin_status"]) ?? "NOT_CONFIGURED",
    redfinPropertyUrl: safeStr(row["redfin_property_url"]),
    estimatedMarketValue: safeNum(row["market_value_used"]),
    marketValueSource: safeStr(row["market_value_source"]) ?? "NONE",
    statusHistory,
    detailUrl: safeStr(row["detail_url"]),
    googleMapsUrl: safeStr(row["google_maps_url"]),
    zillowUrl: safeStr(row["zillow_url"]),
    firstSeen,
    lastUpdated,
    isNew,
  };
}
