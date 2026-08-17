/**
 * RentCast AVM (Automated Valuation Model) service.
 *
 * Uses the /v1/avm/value endpoint to get a market-value estimate.
 * RentCast is used as a THIRD source — primarily for properties where
 * Zillow and Redfin both return NOT_CONFIGURED / NOT_FOUND (garbled
 * addresses, condo units, etc).
 */

export type RentcastStatus = "SUCCESS" | "NOT_FOUND" | "NOT_CONFIGURED" | "ERROR";

export interface RentcastResult {
  estimate:    number | null;
  status:      RentcastStatus;
  source:      "RENTCAST";
  fetchedAt:   Date;
}

interface RentcastAVMResponse {
  price?:           number;
  priceRangeLow?:   number;
  priceRangeHigh?:  number;
}

/** Strip parenthetical municipality suffixes, same convention as Zillow/Redfin services */
function cleanCity(raw: string): string {
  return raw.replace(/\s*\([^)]+\)\s*/g, "").trim() || raw;
}

/**
 * Return true when CivilView dumped a unit number / a/k/a alias into the city
 * field, making the city value useless for geocoding.
 */
function isBadCity(city: string): boolean {
  const lower = city.toLowerCase().trim();
  return (
    /^unit\s/i.test(lower) ||
    /^#/.test(lower) ||
    /a\/k\/a/i.test(lower) ||
    lower === ""
  );
}

export async function fetchRentcastEstimate(
  address: string,
  city:    string,
  state:   string,
  zip:     string | null | undefined,
): Promise<RentcastResult> {
  const apiKey = process.env["RENTCAST_API_KEY"];
  if (!apiKey) return notConfigured();

  // Build params: if city is garbled or zip is missing, use address + state only
  // (RentCast geocodes by full street address when city/zip are absent)
  const badCity = !city || isBadCity(city);
  const hasZip  = zip && zip.trim() !== "";

  const params = new URLSearchParams({ address, state });
  if (!badCity) params.set("city", cleanCity(city));
  if (hasZip)   params.set("zipCode", zip!.trim());

  try {
    const resp = await fetch(`https://api.rentcast.io/v1/avm/value?${params}`, {
      headers: { "X-Api-Key": apiKey },
    });

    if (resp.status === 404) return notFound();
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.warn(`[rentcast] HTTP ${resp.status} for ${address}, ${city}:`, body.slice(0, 200));
      return error();
    }

    const data = (await resp.json()) as RentcastAVMResponse;
    if (!data.price || data.price <= 0) return notFound();

    return {
      estimate:  Math.round(data.price),
      status:    "SUCCESS",
      source:    "RENTCAST",
      fetchedAt: new Date(),
    };
  } catch (err) {
    console.error("[rentcast] fetch error:", err);
    return error();
  }
}

function notConfigured(): RentcastResult {
  return { estimate: null, status: "NOT_CONFIGURED", source: "RENTCAST", fetchedAt: new Date() };
}
function notFound(): RentcastResult {
  return { estimate: null, status: "NOT_FOUND",      source: "RENTCAST", fetchedAt: new Date() };
}
function error(): RentcastResult {
  return { estimate: null, status: "ERROR",           source: "RENTCAST", fetchedAt: new Date() };
}
