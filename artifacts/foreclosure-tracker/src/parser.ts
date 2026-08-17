/**
 * Pure parsing utilities — no side effects, no imports from other modules.
 * All functions are unit-testable in isolation.
 */

/**
 * Parse a money string such as "$443,768.96" or "443768.96" → number.
 * Returns null if the string cannot be parsed as a non-negative number.
 */
export function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned || cleaned === "N/A" || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  if (isNaN(n) || n < 0) return null;
  return n;
}

/**
 * Parse a date string such as "9/10/2026" or "September 10, 2026" → ISO date string "YYYY-MM-DD".
 * Returns null if unparseable.
 */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");

  // M/D/YYYY or MM/DD/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // "Month D, YYYY" or "Month DD, YYYY"
  const monthNames: Record<string, string> = {
    january: "01", february: "02", march: "03", april: "04",
    may: "05", june: "06", july: "07", august: "08",
    september: "09", october: "10", november: "11", december: "12",
  };
  const longMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (longMatch) {
    const [, monthStr, day, year] = longMatch;
    const monthNum = monthNames[monthStr!.toLowerCase()];
    if (monthNum) {
      return `${year}-${monthNum}-${day!.padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Given a list of ISO date strings, return the latest one.
 * Returns null if the list is empty.
 */
export function latestDate(dates: (string | null)[]): string | null {
  const valid = dates.filter(Boolean) as string[];
  if (!valid.length) return null;
  return valid.sort().at(-1) ?? null;
}

/**
 * Build a Google Maps search URL for an address.
 */
export function buildGoogleMapsUrl(
  address: string,
  city: string,
  state: string,
  zip: string,
): string {
  const q = encodeURIComponent(`${address}, ${city}, ${state} ${zip}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/**
 * Build a Zillow search URL for an address.
 */
export function buildZillowUrl(
  address: string,
  city: string,
  state: string,
  zip: string,
): string {
  const q = encodeURIComponent(`${address} ${city} ${state} ${zip}`);
  return `https://www.zillow.com/homes/${q}_rb/`;
}

/**
 * Normalize a sheriff number — strip extra whitespace, uppercase.
 */
export function normalizeSheriffNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "-");
}
