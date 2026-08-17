/**
 * CivilView scraper — HTTP + Cheerio only (no Playwright/Puppeteer).
 *
 * Source: https://salesweb.civilview.com/Sales/SalesSearch?countyId=25
 */

import * as cheerio from "cheerio";
import { parseMoney, parseDate, latestDate, buildGoogleMapsUrl, buildZillowUrl } from "./parser.js";

const CIVILVIEW_BASE = "https://salesweb.civilview.com";
const LIST_URL = `${CIVILVIEW_BASE}/Sales/SalesSearch?countyId=25`;

const USER_AGENT =
  "Mozilla/5.0 (compatible; ForeclosureTracker/1.0; +https://github.com/your-org/foreclosure-tracker)";

const FETCH_OPTS: RequestInit = {
  headers: {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  },
};

export interface ListingStub {
  sheriffNumber: string;
  saleDate: string | null;
  plaintiff: string | null;
  defendant: string | null;
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

async function fetchHtml(url: string): Promise<string> {
  const resp = await fetch(url, FETCH_OPTS);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} fetching ${url}`);
  }
  return resp.text();
}

/**
 * Fetch the main listing page and return stubs for each sale.
 */
export async function fetchListPage(): Promise<ListingStub[]> {
  const html = await fetchHtml(LIST_URL);
  const $ = cheerio.load(html);
  const stubs: ListingStub[] = [];

  // CivilView renders a table with class "table" or "SalesSearchResults"
  // Rows have links to SaleDetails pages
  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (!cells.length) return; // header row

    // Find the detail link in any cell
    let detailHref: string | null = null;
    $(row).find("a[href]").each((_j, a) => {
      const href = $(a).attr("href") ?? "";
      if (href.includes("SaleDetails") || href.includes("saleId")) {
        detailHref = href.startsWith("http") ? href : `${CIVILVIEW_BASE}${href}`;
      }
    });

    if (!detailHref) return;

    // Extract sheriff number from the first linked cell or from the URL
    const sheriffRaw =
      $(cells.get(0)).text().trim() ||
      $(cells.get(1)).text().trim();

    if (!sheriffRaw) return;

    // Try to pick out sale date — commonly in column 2 or 3
    let saleDateRaw: string | null = null;
    cells.each((_k, td) => {
      const txt = $(td).text().trim();
      if (!saleDateRaw && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(txt)) {
        saleDateRaw = txt;
      }
    });

    const plaintiff =
      $(cells.get(3)).text().trim() ||
      $(cells.get(4)).text().trim() ||
      null;
    const defendant =
      $(cells.get(4)).text().trim() ||
      $(cells.get(5)).text().trim() ||
      null;

    stubs.push({
      sheriffNumber: sheriffRaw.toUpperCase().replace(/\s+/g, "-"),
      saleDate: parseDate(saleDateRaw),
      plaintiff: plaintiff || null,
      defendant: defendant || null,
      detailUrl: detailHref,
    });
  });

  return stubs;
}

/**
 * Scrape an individual CivilView sale detail page.
 */
export async function fetchDetailPage(detailUrl: string): Promise<DetailedListing | null> {
  let html: string;
  try {
    html = await fetchHtml(detailUrl);
  } catch (err) {
    console.error(`[scraper] Failed to fetch detail page ${detailUrl}:`, err);
    return null;
  }

  const $ = cheerio.load(html);

  // Helper: find value for a label in a definition list or table
  function findValue(label: RegExp): string | null {
    // Try <dt>/<dd> pattern
    let found: string | null = null;
    $("dt").each((_i, dt) => {
      if (label.test($(dt).text())) {
        found = $(dt).next("dd").text().trim() || null;
      }
    });
    if (found) return found;

    // Try table row with two cells: label | value
    $("tr").each((_i, tr) => {
      const tds = $(tr).find("td, th");
      if (tds.length >= 2 && label.test($(tds.get(0)).text())) {
        found = $(tds.get(1)).text().trim() || null;
      }
    });
    if (found) return found;

    // Try span/div with matching text nearby
    $("[class*='label'], [class*='Label'], strong, b").each((_i, el) => {
      if (label.test($(el).text())) {
        const next = $(el).next().text().trim() || $(el).parent().next().text().trim();
        if (next) found = next;
      }
    });

    return found;
  }

  // Extract status/adjournment history
  const statusHistory: StatusEntry[] = [];
  // Look for a table or list that contains adjournment history
  $("table").each((_i, table) => {
    const headers = $(table).find("th").map((_j, th) => $(th).text().toLowerCase()).get();
    if (
      headers.some((h) => h.includes("date") || h.includes("status") || h.includes("adjourn"))
    ) {
      $(table)
        .find("tr")
        .each((_j, tr) => {
          const tds = $(tr).find("td");
          if (tds.length < 2) return;
          const col0 = $(tds.get(0)).text().trim();
          const col1 = $(tds.get(1)).text().trim();
          if (!col0 && !col1) return;

          const eventDate = parseDate(col0) ?? parseDate(col1);
          const eventDesc = eventDate === parseDate(col0) ? col1 : col0;
          if (eventDesc) {
            statusHistory.push({ eventDate, eventDescription: eventDesc });
          }
        });
    }
  });

  // Also scan for adjournment text anywhere in the page
  if (!statusHistory.length) {
    $("*").each((_i, el) => {
      const txt = $(el).text();
      const adjMatch = txt.match(/(?:Adjourn(?:ed)?|Scheduled|Postponed)[^$\n\r]*/gi);
      if (adjMatch) {
        for (const match of adjMatch) {
          const dateMatch = match.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
          statusHistory.push({
            eventDate: dateMatch ? parseDate(dateMatch[1]) : null,
            eventDescription: match.trim(),
          });
        }
      }
    });
  }

  // Deduplicate status history entries
  const seen = new Set<string>();
  const uniqueHistory: StatusEntry[] = [];
  for (const entry of statusHistory) {
    const key = `${entry.eventDate}|${entry.eventDescription}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueHistory.push(entry);
    }
  }

  // Current sale date = latest date in status history, falling back to any date on the page
  const historyDates = uniqueHistory.map((e) => e.eventDate);
  const currentSaleDate = latestDate(historyDates) ??
    parseDate(findValue(/current\s*sale\s*date|sale\s*date/i)) ??
    parseDate(findValue(/scheduled\s*date/i));

  const originalSaleDate =
    parseDate(findValue(/original\s*(sale\s*)?date|originally\s*scheduled/i)) ??
    // First date in history is typically the original
    (uniqueHistory[0]?.eventDate ?? null);

  // Parse address fields
  const addressRaw = findValue(/property\s*address|address/i) ?? "";
  const cityRaw = findValue(/city/i);
  const stateRaw = findValue(/state/i);
  const zipRaw = findValue(/zip|postal/i);

  // Try to parse "123 Main St, City, NJ 08401" from address raw
  let address = addressRaw;
  let city = cityRaw;
  let state = stateRaw;
  let zip = zipRaw;

  if (!city && addressRaw) {
    const parts = addressRaw.split(/,\s*/);
    if (parts.length >= 3) {
      address = parts[0]!.trim();
      city = parts[1]!.trim();
      const stateZip = parts[2]!.trim().split(/\s+/);
      state = stateZip[0] ?? null;
      zip = stateZip[1] ?? null;
    }
  }

  // Extract sheriff number from page title or heading
  const sheriffRaw =
    findValue(/sheriff\s*(#|number|no\.?)/i) ??
    $("h1,h2,h3").text().match(/[Ff]-?\d{5,}/)?.[0] ??
    "";

  const sheriffNumber = sheriffRaw.toUpperCase().replace(/\s+/g, "");

  const addr = address?.trim() ?? "";
  const cty = city?.trim() ?? "";
  const st = state?.trim() ?? "NJ";
  const zp = zip?.trim() ?? "";

  return {
    sheriffNumber,
    courtCaseNumber: findValue(/court\s*case|docket/i),
    currentSaleDate,
    originalSaleDate,
    plaintiff: findValue(/plaintiff/i),
    defendant: findValue(/defendant/i),
    address: addr || null,
    city: cty || null,
    state: st || null,
    zipCode: zp || null,
    attorney: findValue(/attorney/i),
    approxJudgment: parseMoney(findValue(/approx(?:imate)?\s*(judgment|judgement)/i)),
    upsetAmount: parseMoney(findValue(/upset\s*amount/i)),
    priorsLiensTaxes: findValue(/priors|liens|taxes|prior\s*lien/i),
    taxLot: findValue(/tax\s*lot/i),
    block: findValue(/\bblock\b/i),
    nearestCrossStreet: findValue(/cross\s*street|nearest/i),
    occupancyStatus: findValue(/occupancy|occupied/i),
    propertyNotes: findValue(/notes?|comments?/i),
    statusHistory: uniqueHistory,
    detailUrl,
    googleMapsUrl: buildGoogleMapsUrl(addr, cty, st, zp),
    zillowUrl: buildZillowUrl(addr, cty, st, zp),
  };
}
