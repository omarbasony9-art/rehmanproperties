/**
 * Zillow valuation provider.
 *
 * Uses the approved RapidAPI Zillow wrapper (zillow-com1.p.rapidapi.com).
 * Configure with env vars:
 *   ZILLOW_RAPIDAPI_KEY  — your RapidAPI key
 *   ZILLOW_RAPIDAPI_HOST — defaults to "zillow-com1.p.rapidapi.com"
 *
 * If credentials are absent → status = "NOT_CONFIGURED", estimate = null.
 * Never invents values, never falls back to asking price or tax assessment.
 */

export type ZillowStatus = "SUCCESS" | "NOT_FOUND" | "NOT_CONFIGURED" | "ERROR";

export interface ZillowResult {
  estimate: number | null;
  status: ZillowStatus;
  source: "ZILLOW";
  propertyUrl: string | null;
  fetchedAt: Date;
}

export async function fetchZillowEstimate(
  street: string,
  city: string,
  state: string,
  zip: string,
): Promise<ZillowResult> {
  const apiKey = process.env["ZILLOW_RAPIDAPI_KEY"];
  if (!apiKey) {
    return notConfigured();
  }

  const host = process.env["ZILLOW_RAPIDAPI_HOST"] ?? "zillow-com1.p.rapidapi.com";
  const fullAddress = `${street}, ${city}, ${state} ${zip}`;

  try {
    // Step 1: search by address to get zpid
    const searchUrl = `https://${host}/propertyExtendedSearch?location=${encodeURIComponent(fullAddress)}&home_type=Houses`;
    const searchResp = await fetch(searchUrl, {
      headers: {
        "X-RapidAPI-Key":  apiKey,
        "X-RapidAPI-Host": host,
        Accept:            "application/json",
      },
    });

    if (!searchResp.ok) {
      console.warn(`[zillow] Search HTTP ${searchResp.status} for ${fullAddress}`);
      if (searchResp.status === 404) return notFound();
      return error();
    }

    const searchData = await searchResp.json() as Record<string, unknown>;
    const results = searchData["props"] as unknown[];
    if (!Array.isArray(results) || results.length === 0) {
      console.warn(`[zillow] No results for ${fullAddress}`);
      return notFound();
    }

    const firstResult = results[0] as Record<string, unknown>;
    const zpid = firstResult["zpid"] as string | number | undefined;
    if (!zpid) {
      return notFound();
    }

    // Step 2: get full property details with Zestimate
    const detailUrl = `https://${host}/property?zpid=${zpid}`;
    const detailResp = await fetch(detailUrl, {
      headers: {
        "X-RapidAPI-Key":  apiKey,
        "X-RapidAPI-Host": host,
        Accept:            "application/json",
      },
    });

    if (!detailResp.ok) {
      console.warn(`[zillow] Detail HTTP ${detailResp.status} for zpid=${zpid}`);
      return error();
    }

    const detail = await detailResp.json() as Record<string, unknown>;

    // Zestimate is in `zestimate` field
    const zestimate = numOrNull(detail["zestimate"]);
    if (zestimate == null) {
      // Property found but no Zestimate — count as NOT_FOUND
      console.warn(`[zillow] No Zestimate for zpid=${zpid} (${fullAddress})`);
      return notFound();
    }

    const propertyUrl = strOrNull(detail["hdpUrl"])
      ? `https://www.zillow.com${detail["hdpUrl"]}`
      : null;

    return {
      estimate:    zestimate,
      status:      "SUCCESS",
      source:      "ZILLOW",
      propertyUrl,
      fetchedAt:   new Date(),
    };
  } catch (err) {
    console.error("[zillow] Fetch error:", err);
    return error();
  }
}

function notConfigured(): ZillowResult {
  return { estimate: null, status: "NOT_CONFIGURED", source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };
}
function notFound(): ZillowResult {
  return { estimate: null, status: "NOT_FOUND", source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };
}
function error(): ZillowResult {
  return { estimate: null, status: "ERROR", source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) || n <= 0 ? null : n;
}
function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
