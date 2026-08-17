/**
 * Smart refresh — scrape CivilView, diff against stored records,
 * only re-fetch detail pages when necessary.
 *
 * Max 3 concurrent HTTP requests.
 * 200ms delay between each request to avoid hammering the server.
 */

import pLimit from "p-limit";
import { query } from "./db.js";
import { fetchListPage, fetchDetailPage, type DetailedListing } from "./scraper.js";
import { classify } from "./classifier.js";
import { scoreDeal, computeWarnings } from "./deals.js";
import { lookupValuation } from "./valuation.js";

const limit = pLimit(3);
const DELAY_MS = 200;
const RECHECK_HOURS = 24;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface StoredStub {
  sheriffNumber: string;
  currentSaleDate: string | null;
  lastDetailCheck: Date | null;
  isRemoved: boolean;
}

interface RefreshResult {
  numberFound: number;
  numberNew: number;
  numberUpdated: number;
  numberFailed: number;
  majorDealsFound: number;
  error: string | null;
}

export async function runRefresh(): Promise<RefreshResult> {
  const result: RefreshResult = {
    numberFound: 0,
    numberNew: 0,
    numberUpdated: 0,
    numberFailed: 0,
    majorDealsFound: 0,
    error: null,
  };

  // 1. Fetch the listing page
  let stubs;
  try {
    stubs = await fetchListPage();
  } catch (err) {
    result.error = `Failed to fetch list page: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[refresh]", result.error);
    return result;
  }

  result.numberFound = stubs.length;
  console.log(`[refresh] Found ${stubs.length} listings on CivilView`);

  // 2. Load existing records for diffing
  const existing = await query<StoredStub>(
    `SELECT sheriff_number as "sheriffNumber",
            current_sale_date as "currentSaleDate",
            last_detail_check as "lastDetailCheck",
            is_removed as "isRemoved"
     FROM foreclosures`,
  );

  const existingMap = new Map<string, StoredStub>(
    existing.map((r) => [r.sheriffNumber, r]),
  );
  const activeInListing = new Set(stubs.map((s) => s.sheriffNumber));

  // Mark removed properties
  for (const stored of existing) {
    if (!activeInListing.has(stored.sheriffNumber) && !stored.isRemoved) {
      await query(
        `UPDATE foreclosures SET is_removed=TRUE, last_changed=NOW() WHERE sheriff_number=$1`,
        [stored.sheriffNumber],
      );
      console.log(`[refresh] Marked ${stored.sheriffNumber} as removed`);
    }
  }

  // 3. Process each listing with concurrency limit
  const tasks = stubs.map((stub) =>
    limit(async () => {
      await sleep(DELAY_MS);
      const stored = existingMap.get(stub.sheriffNumber);
      const needsDetailFetch = shouldFetchDetail(stub, stored);

      try {
        if (needsDetailFetch) {
          const detail = await fetchDetailPage(stub.detailUrl);
          if (!detail) {
            result.numberFailed++;
            return;
          }

          const isNew = !stored;
          await upsertForeclosure(detail, isNew);

          // Property valuation (respects 7-day cache internally)
          if (detail.address && detail.city && detail.state && detail.zipCode) {
            const val = await lookupValuation(
              detail.sheriffNumber,
              detail.address,
              detail.city,
              detail.state,
              detail.zipCode,
            );

            // Re-score deal with valuation data
            const metrics = scoreDeal(detail.upsetAmount, val?.estimatedMarketValue ?? null);
            const warnings = computeWarnings({
              priorsLiensTaxes: detail.priorsLiensTaxes,
              upsetAmount: detail.upsetAmount,
              estimatedMarketValue: val?.estimatedMarketValue ?? null,
              occupancyStatus: detail.occupancyStatus,
              propertyValuationAvailable: !!val,
            });

            await query(
              `UPDATE foreclosures SET
                deal_rating=$1, deal_score=$2, estimated_spread=$3,
                discount_percent=$4, equity_multiple=$5, deal_warnings=$6,
                last_updated=NOW()
               WHERE sheriff_number=$7`,
              [
                metrics.dealRating,
                metrics.dealScore,
                metrics.estimatedSpread,
                metrics.discountPercent,
                metrics.equityMultiple,
                warnings,
                detail.sheriffNumber,
              ],
            );

            if (
              metrics.dealRating === "EXTREME" ||
              metrics.dealRating === "MAJOR" ||
              metrics.dealRating === "STRONG"
            ) {
              result.majorDealsFound++;
            }
          }

          if (isNew) result.numberNew++;
          else result.numberUpdated++;
        } else {
          // Just update last_seen
          await query(
            `UPDATE foreclosures SET last_seen=NOW() WHERE sheriff_number=$1`,
            [stub.sheriffNumber],
          );
        }
      } catch (err) {
        console.error(`[refresh] Error processing ${stub.sheriffNumber}:`, err);
        result.numberFailed++;
      }
    }),
  );

  await Promise.all(tasks);
  return result;
}

function shouldFetchDetail(
  stub: { sheriffNumber: string; saleDate: string | null },
  stored: StoredStub | undefined,
): boolean {
  // New listing
  if (!stored) return true;
  // Sale date changed
  if (stub.saleDate && stored.currentSaleDate !== stub.saleDate) return true;
  // Not checked in 24 hours
  if (!stored.lastDetailCheck) return true;
  const hoursSinceCheck =
    (Date.now() - stored.lastDetailCheck.getTime()) / 3_600_000;
  if (hoursSinceCheck >= RECHECK_HOURS) return true;
  return false;
}

async function upsertForeclosure(
  d: DetailedListing,
  isNew: boolean,
): Promise<void> {
  const classif = classify(d.plaintiff, d.defendant, d.priorsLiensTaxes, d.propertyNotes);
  const metrics = scoreDeal(d.upsetAmount, null); // initial score before valuation

  const now = new Date().toISOString();

  if (isNew) {
    await query(
      `INSERT INTO foreclosures (
         sheriff_number, court_case_number, current_sale_date, original_sale_date,
         plaintiff, defendant, address, city, state, zip_code, attorney,
         approx_judgment, upset_amount, priors_liens_taxes, tax_lot, block,
         nearest_cross_street, occupancy_status, property_notes,
         detail_url, google_maps_url, zillow_url,
         foreclosure_type, classification_confidence, classification_evidence,
         deal_rating, deal_score, estimated_spread, discount_percent, equity_multiple,
         first_seen, last_seen, last_changed, last_detail_check, last_updated
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
         $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,NOW(),NOW(),NOW(),NOW(),NOW()
       )
       ON CONFLICT (sheriff_number) DO NOTHING`,
      [
        d.sheriffNumber, d.courtCaseNumber, d.currentSaleDate, d.originalSaleDate,
        d.plaintiff, d.defendant, d.address, d.city, d.state, d.zipCode, d.attorney,
        d.approxJudgment, d.upsetAmount, d.priorsLiensTaxes, d.taxLot, d.block,
        d.nearestCrossStreet, d.occupancyStatus, d.propertyNotes,
        d.detailUrl, d.googleMapsUrl, d.zillowUrl,
        classif.foreclosureType, classif.classificationConfidence, classif.classificationEvidence,
        metrics.dealRating, metrics.dealScore, metrics.estimatedSpread,
        metrics.discountPercent, metrics.equityMultiple,
      ],
    );
  } else {
    await query(
      `UPDATE foreclosures SET
         court_case_number=$2, current_sale_date=$3, original_sale_date=$4,
         plaintiff=$5, defendant=$6, address=$7, city=$8, state=$9, zip_code=$10,
         attorney=$11, approx_judgment=$12, upset_amount=$13, priors_liens_taxes=$14,
         tax_lot=$15, block=$16, nearest_cross_street=$17, occupancy_status=$18,
         property_notes=$19, detail_url=$20, google_maps_url=$21, zillow_url=$22,
         foreclosure_type=$23, classification_confidence=$24, classification_evidence=$25,
         deal_rating=$26, deal_score=$27, estimated_spread=$28, discount_percent=$29,
         equity_multiple=$30, last_seen=NOW(), last_changed=NOW(),
         last_detail_check=NOW(), last_updated=NOW()
       WHERE sheriff_number=$1`,
      [
        d.sheriffNumber, d.courtCaseNumber, d.currentSaleDate, d.originalSaleDate,
        d.plaintiff, d.defendant, d.address, d.city, d.state, d.zipCode, d.attorney,
        d.approxJudgment, d.upsetAmount, d.priorsLiensTaxes, d.taxLot, d.block,
        d.nearestCrossStreet, d.occupancyStatus, d.propertyNotes,
        d.detailUrl, d.googleMapsUrl, d.zillowUrl,
        classif.foreclosureType, classif.classificationConfidence, classif.classificationEvidence,
        metrics.dealRating, metrics.dealScore, metrics.estimatedSpread,
        metrics.discountPercent, metrics.equityMultiple,
      ],
    );
  }

  // Update status history
  if (d.statusHistory.length) {
    // Delete & reinsert for simplicity (small dataset)
    await query(
      `DELETE FROM status_history WHERE sheriff_number=$1`,
      [d.sheriffNumber],
    );
    for (const entry of d.statusHistory) {
      await query(
        `INSERT INTO status_history (sheriff_number, event_date, event_description)
         VALUES ($1,$2,$3)`,
        [d.sheriffNumber, entry.eventDate, entry.eventDescription],
      );
    }
  }
}
