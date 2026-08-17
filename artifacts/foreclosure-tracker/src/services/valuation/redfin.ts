/**
 * Redfin valuation provider — redfin-com-data.p.rapidapi.com
 *
 * Flow:
 *   1. GET /properties/auto-complete?query=<full address>
 *      → rows[0].url  (Redfin-relative path, e.g. /NJ/Absecon/23-Oyster-Bay-Rd-08201/...)
 *   2. GET /property/detail?url=<url>
 *      → data.aboveTheFold.addressSectionInfo.priceInfo
 *         when priceInfo.label === "Redfin Estimate"  → priceInfo.amount
 *
 * City normalization: strips common NJ township suffixes before retrying,
 * matching the same strategy used by the Zillow provider.
 */

export type RedfinStatus = "SUCCESS" | "NOT_FOUND" | "NOT_CONFIGURED" | "ERROR";

export interface RedfinResult {
  estimate: number | null;
  status: RedfinStatus;
  rateLimited?: boolean;  // true when a 429 was received — do NOT write ERROR to DB
  source: "REDFIN";
  propertyUrl: string | null;
  fetchedAt: Date;
}

const notFound = (): RedfinResult => ({
  estimate: null, status: "NOT_FOUND", source: "REDFIN", propertyUrl: null, fetchedAt: new Date(),
});
const error = (): RedfinResult => ({
  estimate: null, status: "ERROR", source: "REDFIN", propertyUrl: null, fetchedAt: new Date(),
});
const rateLimited = (): RedfinResult => ({
  estimate: null, status: "ERROR", rateLimited: true, source: "REDFIN", propertyUrl: null, fetchedAt: new Date(),
});

export async function fetchRedfinEstimate(
  street: string,
  city: string,
  state: string,
  zip: string,
): Promise<RedfinResult> {
  const apiKey = process.env["REDFIN_RAPIDAPI_KEY"];
  const host   = process.env["REDFIN_RAPIDAPI_HOST"];

  if (!apiKey || !host) {
    return { estimate: null, status: "NOT_CONFIGURED", source: "REDFIN", propertyUrl: null, fetchedAt: new Date() };
  }

  const headers = {
    "X-RapidAPI-Key":  apiKey,
    "X-RapidAPI-Host": host,
    "Accept":          "application/json",
  };

  // Build cascading address candidates with progressive simplification
  const noParens     = city.replace(/\s*\([^)]*\)\s*/g, "").trim();
  const strippedCity = noParens.replace(/\s+(Township|Twp|Borough|Boro|City|Village|Town)$/i, "").trim();
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of [city, noParens, strippedCity]) {
    const q = `${street}, ${c}, ${state} ${zip}`;
    if (!seen.has(q)) { seen.add(q); candidates.push(q); }
  }
  const shortQ = `${street}, ${state} ${zip}`;
  if (!seen.has(shortQ)) candidates.push(shortQ);

  try {
    // ── Step 1: address → Redfin URL ─────────────────────────────────────────
    let redfinUrl: string | null = null;

    for (const query of candidates) {
      const acResp = await fetch(
        `https://${host}/properties/auto-complete?query=${encodeURIComponent(query)}`,
        { headers },
      );

      if (!acResp.ok) {
        if (acResp.status === 429) { console.warn("[redfin] rate limit hit"); return rateLimited(); }
        continue;
      }

      const acBody = await acResp.json() as Record<string, unknown>;
      if (!acBody["status"]) continue;

      const dataArr = acBody["data"] as Array<{ rows?: Array<{ url?: string }> }> | undefined;
      const rows = dataArr?.[0]?.rows;
      const url = rows?.[0]?.url;
      if (url) { redfinUrl = url; break; }
    }

    if (!redfinUrl) {
      console.warn(`[redfin] No autocomplete match for "${street}, ${city}, ${state} ${zip}"`);
      return notFound();
    }

    // Brief pause between the two calls to stay within per-second rate limits
    await new Promise((r) => setTimeout(r, 1200));

    // ── Step 2: URL → property detail ────────────────────────────────────────
    const detailResp = await fetch(
      `https://${host}/property/detail?url=${encodeURIComponent(redfinUrl)}`,
      { headers },
    );

    if (!detailResp.ok) {
      console.warn(`[redfin] /property/detail HTTP ${detailResp.status} for "${redfinUrl}"`);
      return detailResp.status === 429 ? rateLimited() : notFound();
    }

    const detailBody = await detailResp.json() as Record<string, unknown>;
    if (!detailBody["status"]) {
      console.warn(`[redfin] /property/detail returned status=false for "${redfinUrl}"`);
      return notFound();
    }

    const data         = detailBody["data"] as Record<string, unknown> | undefined;
    const aboveTheFold = data?.["aboveTheFold"] as Record<string, unknown> | undefined;
    const addrInfo     = aboveTheFold?.["addressSectionInfo"] as Record<string, unknown> | undefined;
    const priceInfo    = addrInfo?.["priceInfo"] as { label?: string; amount?: number } | undefined;

    // Only accept the field that Redfin itself labels "Redfin Estimate"
    const estimate = priceInfo?.label === "Redfin Estimate" && typeof priceInfo.amount === "number"
      ? priceInfo.amount
      : null;

    const propertyUrl = typeof addrInfo?.["url"] === "string"
      ? `https://www.redfin.com${addrInfo["url"] as string}`
      : null;

    if (estimate === null) {
      console.warn(`[redfin] No Redfin Estimate field for "${redfinUrl}" (priceInfo.label="${priceInfo?.label}")`);
      return { ...notFound(), propertyUrl };
    }

    console.log(`[redfin] ✅ ${street}, ${city} → ${redfinUrl} estimate=$${estimate.toLocaleString()}`);
    return { estimate, status: "SUCCESS", source: "REDFIN", propertyUrl, fetchedAt: new Date() };

  } catch (err) {
    console.error("[redfin] Unexpected error:", err);
    return error();
  }
}

/**
 * Build a Redfin property search URL for manual lookup.
 */
export function buildRedfinSearchUrl(street: string, city: string, state: string, zip: string): string {
  const q = encodeURIComponent(`${street}, ${city}, ${state} ${zip}`);
  return `https://www.redfin.com/search#q=${q}`;
}
