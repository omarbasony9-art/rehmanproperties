/**
 * Safely extract an array from any API response shape.
 *
 * Handles:
 *   []                  — bare array (returned as-is)
 *   { items: [...] }    — keyed wrapper
 *   { deals: [...] }    — keyed wrapper
 *   { foreclosures: [...] } — keyed wrapper
 *   { results: [...] }  — keyed wrapper
 *   {}                  — empty object → []
 *   null / undefined    → []
 *   { error: "..." }    → []
 *
 * Pass additional keys to check before the defaults.
 */
export function normalizeArray<T>(
  data: unknown,
  keys: string[] = ["items", "deals", "foreclosures", "results"],
): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    for (const key of keys) {
      const val = (data as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as T[];
    }
  }
  return [];
}
