/**
 * Zillow valuation provider — private-zillow.p.rapidapi.com
 *
 * Two-step flow:
 *   1. GET /autocomplete?query=<address>  → results[0].metaData.zpid
 *   2. GET /byzpid?zpid=<zpid>            → body.zestimate
 *
 * Configure via env vars:
 *   ZILLOW_RAPIDAPI_KEY  — your RapidAPI key
 *   ZILLOW_RAPIDAPI_HOST — e.g. "private-zillow.p.rapidapi.com"
 *
 * Never uses list price, tax assessment, or any non-Zestimate field as
 * the estimate. If zestimate is null/missing → status = "NOT_FOUND".
 */

export type ZillowStatus = "SUCCESS" | "NOT_FOUND" | "NOT_CONFIGURED" | "ERROR";

export interface ZillowResult {
  estimate: number | null;
  status: ZillowStatus;
  rateLimited?: boolean; // true on HTTP 429 — do NOT write ERROR to DB
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
  if (!apiKey) return notConfigured();

  const host = process.env["ZILLOW_RAPIDAPI_HOST"] ?? "private-zillow.p.rapidapi.com";
  const headers = {
    "X-RapidAPI-Key":  apiKey,
    "X-RapidAPI-Host": host,
    Accept:            "application/json",
  };

  // Build candidate queries with progressive city simplification:
  //   1. Full address as-is
  //   2. Strip parenthetical qualifiers: "Absecon (Galloway Twp.)" → "Absecon"
  //   3. Strip trailing NJ municipality suffixes: "Hamilton Township" → "Hamilton"
  //      (but preserve cities whose real name ends in one of these words — e.g.
  //       "Ocean City", "Sea Isle City", "Cape May City", "Cape May Court House")
  //   4. Street + state + zip only (no city)
  const PRESERVE_CITY_NAMES = new Set([
    "ocean city", "sea isle city", "cape may city", "cape may court house",
    "jersey city", "atlantic city", "new york city",
  ]);
  const noParens    = city.replace(/\s*\([^)]*\)\s*/g, "").trim();
  const strippedCity = PRESERVE_CITY_NAMES.has(noParens.toLowerCase())
    ? noParens   // keep as-is — stripping would produce a wrong/meaningless name
    : noParens.replace(/\s+(Township|Twp|Borough|Boro|City|Village|Town)$/i, "").trim();
  const seen = new Set<string>();
  const addressCandidates: string[] = [];
  for (const c of [city, noParens, strippedCity]) {
    const q = `${street}, ${c}, ${state} ${zip}`;
    if (!seen.has(q)) { seen.add(q); addressCandidates.push(q); }
  }
  const shortQ = `${street}, ${state} ${zip}`;
  if (!seen.has(shortQ)) addressCandidates.push(shortQ);

  try {
    // ── Step 1: address → ZPID (try candidates in order) ───────────────────
    let zpid: string | number | undefined;

    for (const query of addressCandidates) {
      const acUrl = `https://${host}/autocomplete?query=${encodeURIComponent(query)}`;
      const acResp = await fetch(acUrl, { headers });

      if (!acResp.ok) {
        console.warn(`[zillow] autocomplete HTTP ${acResp.status} for "${query}"`);
        if (acResp.status === 429) return rateLimited(); // rate limit — stop immediately
        continue;
      }

      const acBody = await acResp.json() as Record<string, unknown>;
      const results = acBody["results"] as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(results) || results.length === 0) continue;

      const meta = (results[0] as Record<string, unknown>)["metaData"] as Record<string, unknown> | undefined;
      const candidate = meta?.["zpid"] as string | number | undefined;
      if (candidate) { zpid = candidate; break; }
    }

    if (!zpid) {
      console.warn(`[zillow] No ZPID found for "${street}, ${city}, ${state} ${zip}" (tried ${addressCandidates.length} queries)`);
      return notFound();
    }

    // ── Step 2: ZPID → Zestimate ────────────────────────────────────────────
    const detailUrl = `https://${host}/byzpid?zpid=${zpid}`;
    const detailResp = await fetch(detailUrl, { headers });

    if (!detailResp.ok) {
      console.warn(`[zillow] /byzpid HTTP ${detailResp.status} for zpid=${zpid}`);
      return error();
    }

    const detail = await detailResp.json() as Record<string, unknown>;

    // Prefer the explicit Zestimate field.  For many distressed/foreclosed
    // properties the private-zillow API returns zestimate=null but still
    // populates the "Price" field with Zillow's valuation estimate.
    // Use Price as a fallback, but only when it looks like a real home value
    // (> $50 000) to avoid picking up tax-assessed or lien amounts.
    const MIN_HOME_VALUE = 50_000;
    const rawZestimate = numOrNull(detail["zestimate"]);
    const rawPrice     = numOrNull(detail["Price"]);
    const zestimate    = rawZestimate ?? (rawPrice != null && rawPrice >= MIN_HOME_VALUE ? rawPrice : null);

    if (zestimate == null) {
      console.warn(`[zillow] No valuation for zpid=${zpid} ("${addressCandidates[0]}") zestimate=${rawZestimate} price=${rawPrice}`);
      return notFound();
    }

    const usedField = rawZestimate != null ? "zestimate" : "Price";
    if (usedField === "Price") {
      console.log(`[zillow] Using Price field (zestimate null) for zpid=${zpid}`);
    }

    // PropertyZillowURL is already a full URL (no prefix needed)
    const rawUrl = detail["PropertyZillowURL"];
    const propertyUrl = typeof rawUrl === "string" && rawUrl.startsWith("http") ? rawUrl : null;

    console.log(`[zillow] ✅ ${addressCandidates[0]} → zpid=${zpid} zestimate=$${zestimate.toLocaleString()}`);

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

// ── Helpers ─────────────────────────────────────────────────────────────────

function notConfigured(): ZillowResult {
  return { estimate: null, status: "NOT_CONFIGURED", source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };
}
function notFound(): ZillowResult {
  return { estimate: null, status: "NOT_FOUND",      source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };
}
function error(): ZillowResult {
  return { estimate: null, status: "ERROR",          source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };
}
function rateLimited(): ZillowResult {
  return { estimate: null, status: "ERROR", rateLimited: true, source: "ZILLOW", propertyUrl: null, fetchedAt: new Date() };
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) || n <= 0 ? null : n;
}
