/**
 * Smart refresh — scrape CivilView, diff against stored records,
 * only re-fetch detail pages when necessary.
 *
 * Supports multiple counties:
 *   runRefresh("Atlantic")  — countyId=25 (default)
 *   runRefresh("Cape May")  — countyId=52
 *   runAllRefresh()         — both counties in sequence
 *
 * Valuation threshold: only properties with upsetAmount <= $280k are valued
 * automatically. Use POST /api/foreclosures/:id/valuation for others.
 */

import pLimit from "p-limit";
import { query } from "./db.js";
import { fetchListPage, fetchDetailPage, type ListingStub, type DetailedListing } from "./scraper.js";
import { classify } from "./classifier.js";
import { computeWarnings } from "./deals.js";
import { lookupValuation } from "./valuation.js";

const limit = pLimit(3);
const DELAY_MS = 200;
const RECHECK_HOURS = 24;
const VALUATION_UPSET_THRESHOLD = 280_000;

/** Map county name → CivilView countyId */
const COUNTY_IDS: Record<string, number> = {
  "Atlantic": 25,
  "Cape May": 52,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface StoredStub {
  permanentlyExcluded: boolean;
  sheriffNumber: string;
  county: string;
  currentSaleDate: string | null;
  lastDetailCheck: Date | null;
  isRemoved: boolean;
}

export interface RefreshResult {
  civilViewRowsFound: number;
  detailSucceeded: number;
  detailFailed: number;
  dbInserts: number;
  dbUpdates: number;
  totalActiveInDb: number;
  majorDealsFound: number;
  error: string | null;
  // Legacy aliases used by refresh_runs table columns
  numberFound: number;
  numberNew: number;
  numberUpdated: number;
  numberFailed: number;
}

/**
 * Refresh a single county's listings.
 *
 * @param county  "Atlantic" | "Cape May" (must be a key in COUNTY_IDS)
 */
export async function runRefresh(county = "Atlantic"): Promise<RefreshResult> {
  const countyId = COUNTY_IDS[county];
  if (countyId == null) {
    throw new Error(`Unknown county: "${county}". Valid values: ${Object.keys(COUNTY_IDS).join(", ")}`);
  }

  const result: RefreshResult = {
    civilViewRowsFound: 0,
    detailSucceeded:    0,
    detailFailed:       0,
    dbInserts:          0,
    dbUpdates:          0,
    totalActiveInDb:    0,
    majorDealsFound:    0,
    error:              null,
    numberFound:        0,
    numberNew:          0,
    numberUpdated:      0,
    numberFailed:       0,
  };

  let stubs: ListingStub[];
  try {
    stubs = await fetchListPage(countyId);
  } catch (err) {
    result.error = `Failed to fetch list page (${county}): ${err instanceof Error ? err.message : String(err)}`;
    console.error("[refresh]", result.error);
    return result;
  }

  result.civilViewRowsFound = stubs.length;
  result.numberFound        = stubs.length;
  console.log(`[refresh] ${county} — CivilView rows found: ${stubs.length}`);

  // Only load records for this county to keep the diff county-scoped
  const existing = await query<StoredStub>(
    `SELECT sheriff_number as "sheriffNumber",
            county,
            current_sale_date as "currentSaleDate",
            last_detail_check as "lastDetailCheck",
            is_removed as "isRemoved",
            COALESCE(permanently_excluded, FALSE) as "permanentlyExcluded"
     FROM foreclosures
     WHERE county = $1`,
    [county],
  );

  const existingMap  = new Map<string, StoredStub>(existing.map((r) => [r.sheriffNumber, r]));
  const activeInList = new Set(stubs.map((s) => s.sheriffNumber));

  // Mark removed properties for THIS county only (don't touch the other county's records)
  for (const stored of existing) {
    if (!activeInList.has(stored.sheriffNumber) && !stored.isRemoved && !stored.permanentlyExcluded) {
      await query(
        `UPDATE foreclosures SET is_removed=TRUE, last_changed=NOW()
         WHERE sheriff_number=$1 AND county=$2`,
        [stored.sheriffNumber, county],
      );
      console.log(`[refresh] Marked ${stored.sheriffNumber} (${county}) as removed`);
    }
  }

  const tasks = stubs.map((stub) =>
    limit(async () => {
      await sleep(DELAY_MS);
      const stored = existingMap.get(stub.sheriffNumber);
      const needsDetail = shouldFetchDetail(stub, stored);

      try {
        if (needsDetail) {
          const detail = await fetchDetailPage(stub.detailUrl, countyId);

          if (!detail || !detail.sheriffNumber) {
            console.warn(`[refresh] Detail failed for ${stub.sheriffNumber} (${county}) — saving stub`);
            await upsertStub(stub, !!stored, county);
            result.detailFailed++;
            result.numberFailed++;
            return;
          }

          const isNew = !stored;
          await upsertForeclosure(detail, isNew, county);

          if (isNew) { result.dbInserts++; result.numberNew++; }
          else        { result.dbUpdates++; result.numberUpdated++; }
          result.detailSucceeded++;

          // Only value qualifying properties automatically
          const upsetOk = detail.upsetAmount != null && detail.upsetAmount <= VALUATION_UPSET_THRESHOLD;
          if (upsetOk && detail.address && detail.city && detail.state && detail.zipCode) {
            try {
              const outcome = await lookupValuation(
                detail.sheriffNumber,
                detail.address,
                detail.city,
                detail.state,
                detail.zipCode,
              );
              if (outcome === "fetched") {
                // Check if it became a watchlist deal after scoring
                const [scored] = await query<{ deal_rating: string }>(
                  `SELECT deal_rating FROM foreclosures WHERE sheriff_number=$1 AND county=$2`,
                  [detail.sheriffNumber, county],
                );
                if (scored && ["EXTREME","MAJOR","STRONG"].includes(scored.deal_rating)) {
                  result.majorDealsFound++;
                }
              }
            } catch (valErr) {
              console.warn(`[refresh] Valuation error for ${detail.sheriffNumber}:`, valErr);
            }
          }
        } else {
          await query(
            `UPDATE foreclosures SET last_seen=NOW() WHERE sheriff_number=$1 AND county=$2`,
            [stub.sheriffNumber, county],
          );
          result.dbUpdates++;
          result.numberUpdated++;
        }
      } catch (err) {
        console.error(`[refresh] Error processing ${stub.sheriffNumber} (${county}):`, err);
        try { await upsertStub(stub, !!stored, county); } catch { /* ignore */ }
        result.detailFailed++;
        result.numberFailed++;
      }
    }),
  );

  await Promise.all(tasks);

  const [countRow] = await query<{ cnt: string }>(
    `SELECT COUNT(*) as cnt FROM foreclosures WHERE is_removed=FALSE`,
  );
  result.totalActiveInDb = parseInt(countRow?.cnt ?? "0");

  console.log(
    `[refresh] ${county} done — ` +
    `found:${result.civilViewRowsFound} ` +
    `detailOK:${result.detailSucceeded} ` +
    `detailFailed:${result.detailFailed} ` +
    `inserts:${result.dbInserts} ` +
    `updates:${result.dbUpdates} ` +
    `active:${result.totalActiveInDb} ` +
    `deals:${result.majorDealsFound}`,
  );
  return result;
}

/**
 * Refresh all known counties in sequence (Atlantic → Cape May).
 * Returns combined stats.
 */
export async function runAllRefresh(): Promise<RefreshResult> {
  const combined: RefreshResult = {
    civilViewRowsFound: 0, detailSucceeded: 0, detailFailed: 0,
    dbInserts: 0, dbUpdates: 0, totalActiveInDb: 0, majorDealsFound: 0,
    error: null, numberFound: 0, numberNew: 0, numberUpdated: 0, numberFailed: 0,
  };

  for (const county of Object.keys(COUNTY_IDS)) {
    const r = await runRefresh(county);
    combined.civilViewRowsFound += r.civilViewRowsFound;
    combined.detailSucceeded    += r.detailSucceeded;
    combined.detailFailed       += r.detailFailed;
    combined.dbInserts          += r.dbInserts;
    combined.dbUpdates          += r.dbUpdates;
    combined.totalActiveInDb     = r.totalActiveInDb; // final value = last run's count
    combined.majorDealsFound    += r.majorDealsFound;
    combined.numberFound        += r.numberFound;
    combined.numberNew          += r.numberNew;
    combined.numberUpdated      += r.numberUpdated;
    combined.numberFailed       += r.numberFailed;
    if (r.error) combined.error = (combined.error ? combined.error + "; " : "") + r.error;
  }

  return combined;
}

function shouldFetchDetail(
  stub: { sheriffNumber: string; saleDate: string | null },
  stored: StoredStub | undefined,
): boolean {
  if (!stored) return true;
  if (stub.saleDate && stored.currentSaleDate !== stub.saleDate) return true;
  if (!stored.lastDetailCheck) return true;
  const hoursSinceCheck = (Date.now() - stored.lastDetailCheck.getTime()) / 3_600_000;
  return hoursSinceCheck >= RECHECK_HOURS;
}

function parseAddressString(raw: string | null) {
  if (!raw) return { street: null, city: null, state: null, zip: null };
  const zipMatch = raw.match(/\b(\d{5}(?:-\d{4})?)\s*$/);
  const zip = zipMatch?.[1] ?? null;
  const withoutZip = zip ? raw.slice(0, -zip.length).trim() : raw;
  const stateMatch = withoutZip.match(/\s+([A-Z]{2})\s*$/);
  const state = stateMatch?.[1] ?? "NJ";
  const withoutState = state ? withoutZip.slice(0, -state.length).trim() : withoutZip;
  const streetMatch = withoutState.match(/^(\d+\s+\S.+?)(?=\s+(?:[A-Z][a-z]+\s+){2,})/);
  const street = streetMatch?.[1] ?? withoutState;
  const city   = streetMatch ? withoutState.slice(street.length).trim() || null : null;
  return { street: street || null, city, state, zip };
}

async function upsertStub(stub: ListingStub, exists: boolean, county: string): Promise<void> {
  if (exists) {
    await query(
      `UPDATE foreclosures SET
         current_sale_date=COALESCE($2, current_sale_date),
         last_seen=NOW(), detail_url=$3
       WHERE sheriff_number=$1 AND county=$4`,
      [stub.sheriffNumber, stub.saleDate, stub.detailUrl, county],
    );
  } else {
    const addr = parseAddressString(stub.address);
    await query(
      `INSERT INTO foreclosures (
         sheriff_number, county, current_sale_date, plaintiff, defendant,
         address, city, state, zip_code, detail_url,
         deal_rating, deal_warnings,
         first_seen, last_seen, last_changed, last_updated
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         'UNKNOWN','{}',
         NOW(),NOW(),NOW(),NOW()
       )
       ON CONFLICT (sheriff_number) DO NOTHING`,
      [
        stub.sheriffNumber, county, stub.saleDate, stub.plaintiff, stub.defendant,
        addr.street, addr.city, addr.state, addr.zip,
        stub.detailUrl,
      ],
    );
  }
}

async function upsertForeclosure(d: DetailedListing, isNew: boolean, county: string): Promise<void> {
  const classif = classify(d.plaintiff, d.defendant, d.priorsLiensTaxes, d.propertyNotes);

  // Initial warnings without market value — recalculateDeal() will update after valuation
  const warnings = computeWarnings({
    priorsLiensTaxes: d.priorsLiensTaxes,
    upsetAmount: d.upsetAmount,
    zillowStatus: null,
    redfinStatus: null,
    marketValueUsed: null,
    occupancyStatus: d.occupancyStatus,
  });

  if (isNew) {
    await query(
      `INSERT INTO foreclosures (
         sheriff_number, county, court_case_number, current_sale_date, original_sale_date,
         plaintiff, defendant, address, city, state, zip_code, attorney,
         approx_judgment, upset_amount, priors_liens_taxes, tax_lot, block,
         nearest_cross_street, occupancy_status, property_notes,
         detail_url, google_maps_url, zillow_url,
         foreclosure_type, classification_confidence, classification_evidence,
         deal_rating, deal_score, deal_warnings,
         first_seen, last_seen, last_changed, last_detail_check, last_updated
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,$22,$23,$24,$25,$26,
         'UNKNOWN',NULL,$27,
         NOW(),NOW(),NOW(),NOW(),NOW()
       )
       ON CONFLICT (sheriff_number) DO UPDATE SET
         county=EXCLUDED.county,
         court_case_number=$3, current_sale_date=$4, original_sale_date=$5,
         plaintiff=$6, defendant=$7, address=$8, city=$9, state=$10, zip_code=$11,
         attorney=$12, approx_judgment=$13, upset_amount=$14, priors_liens_taxes=$15,
         tax_lot=$16, block=$17, nearest_cross_street=$18, occupancy_status=$19,
         property_notes=$20, detail_url=$21, google_maps_url=$22, zillow_url=$23,
         foreclosure_type=$24, classification_confidence=$25, classification_evidence=$26,
         deal_warnings=$27,
         last_seen=NOW(), last_changed=NOW(), last_detail_check=NOW(), last_updated=NOW()`,
      [
        d.sheriffNumber, county, d.courtCaseNumber, d.currentSaleDate, d.originalSaleDate,
        d.plaintiff, d.defendant, d.address, d.city, d.state, d.zipCode, d.attorney,
        d.approxJudgment, d.upsetAmount, d.priorsLiensTaxes, d.taxLot, d.block,
        d.nearestCrossStreet, d.occupancyStatus, d.propertyNotes,
        d.detailUrl, d.googleMapsUrl, d.zillowUrl,
        classif.foreclosureType, classif.classificationConfidence, classif.classificationEvidence,
        warnings,
      ],
    );
  } else {
    await query(
      `UPDATE foreclosures SET
         county=$2,
         court_case_number=$3, current_sale_date=$4, original_sale_date=$5,
         plaintiff=$6, defendant=$7, address=$8, city=$9, state=$10, zip_code=$11,
         attorney=$12, approx_judgment=$13, upset_amount=$14, priors_liens_taxes=$15,
         tax_lot=$16, block=$17, nearest_cross_street=$18, occupancy_status=$19,
         property_notes=$20, detail_url=$21, google_maps_url=$22, zillow_url=$23,
         foreclosure_type=$24, classification_confidence=$25, classification_evidence=$26,
         deal_warnings=$27,
         last_seen=NOW(), last_changed=NOW(), last_detail_check=NOW(), last_updated=NOW()
       WHERE sheriff_number=$1`,
      [
        d.sheriffNumber, county, d.courtCaseNumber, d.currentSaleDate, d.originalSaleDate,
        d.plaintiff, d.defendant, d.address, d.city, d.state, d.zipCode, d.attorney,
        d.approxJudgment, d.upsetAmount, d.priorsLiensTaxes, d.taxLot, d.block,
        d.nearestCrossStreet, d.occupancyStatus, d.propertyNotes,
        d.detailUrl, d.googleMapsUrl, d.zillowUrl,
        classif.foreclosureType, classif.classificationConfidence, classif.classificationEvidence,
        warnings,
      ],
    );
  }

  // Status history
  if (d.statusHistory.length) {
    await query(`DELETE FROM status_history WHERE sheriff_number=$1`, [d.sheriffNumber]);
    for (const entry of d.statusHistory) {
      await query(
        `INSERT INTO status_history (sheriff_number, event_date, event_description) VALUES ($1,$2,$3)`,
        [d.sheriffNumber, entry.eventDate, entry.eventDescription],
      );
    }
  }
}
