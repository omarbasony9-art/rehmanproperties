/**
 * Redfin valuation provider.
 *
 * Redfin does not provide an authorized public API.
 * This module handles:
 *   1. NOT_CONFIGURED status when no automated source is set up.
 *   2. Manual admin entry via PATCH /api/foreclosures/:id/valuation/redfin
 *      which sets redfinEstimate + redfinStatus = "SUCCESS" directly.
 *
 * If an authorized Redfin data source is configured later,
 * implement fetchRedfinEstimate() here with proper credentials.
 */

export type RedfinStatus = "SUCCESS" | "NOT_FOUND" | "NOT_CONFIGURED" | "ERROR";

export interface RedfinResult {
  estimate: number | null;
  status: RedfinStatus;
  source: "REDFIN";
  propertyUrl: string | null;
  fetchedAt: Date;
}

/**
 * Attempt an automated Redfin lookup.
 * Currently always returns NOT_CONFIGURED — Redfin has no public API.
 * Replace this body with an authorized API call when credentials are available.
 */
export async function fetchRedfinEstimate(
  _street: string,
  _city: string,
  _state: string,
  _zip: string,
): Promise<RedfinResult> {
  const apiKey = process.env["REDFIN_API_KEY"];
  if (!apiKey) {
    return {
      estimate:    null,
      status:      "NOT_CONFIGURED",
      source:      "REDFIN",
      propertyUrl: null,
      fetchedAt:   new Date(),
    };
  }

  // Placeholder: implement with authorized Redfin API when available.
  // Do NOT scrape Redfin.com web pages.
  return {
    estimate:    null,
    status:      "NOT_CONFIGURED",
    source:      "REDFIN",
    propertyUrl: null,
    fetchedAt:   new Date(),
  };
}

/**
 * Build a Redfin property search URL for manual lookup.
 * This is not an API call — it's a convenience link for the admin.
 */
export function buildRedfinSearchUrl(street: string, city: string, state: string, zip: string): string {
  const q = encodeURIComponent(`${street}, ${city}, ${state} ${zip}`);
  return `https://www.redfin.com/search?q=${q}`;
}
