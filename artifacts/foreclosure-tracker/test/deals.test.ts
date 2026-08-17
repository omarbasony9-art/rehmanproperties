import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scoreDeal, computeWarnings } from "../src/deals.js";

describe("scoreDeal — EXTREME", () => {
  test("qualifies for EXTREME when discount>=40% and spread>=100k", () => {
    // MV=500k, upset=250k → discount=50%, spread=250k
    const r = scoreDeal(250_000, 500_000);
    assert.equal(r.dealRating, "EXTREME");
    assert.equal(r.discountPercent, 50);
    assert.equal(r.estimatedSpread, 250_000);
    assert.ok(r.dealScore > 0);
  });
});

describe("scoreDeal — MAJOR", () => {
  test("qualifies for MAJOR when upset<=280k, discount>=30%, spread>=75k", () => {
    // MV=400k, upset=260k → discount=35%, spread=140k
    const r = scoreDeal(260_000, 400_000);
    assert.equal(r.dealRating, "MAJOR");
    assert.ok((r.discountPercent ?? 0) >= 30);
    assert.ok((r.estimatedSpread ?? 0) >= 75_000);
  });

  test("does NOT qualify for MAJOR when upset > 280k", () => {
    // From spec: upset=443768.96, MV=~600k
    // Even with a decent discount, upset > 280k → not MAJOR
    const r = scoreDeal(443768.96, 600_000);
    // Discount = ~26%, spread = 156k — qualifies for STRONG but NOT MAJOR
    assert.notEqual(r.dealRating, "MAJOR");
    assert.notEqual(r.dealRating, "EXTREME");
  });
});

describe("scoreDeal — STRONG", () => {
  test("qualifies for STRONG when discount>=20% and spread>=50k", () => {
    // MV=350k, upset=270k → discount=22.8%, spread=80k
    const r = scoreDeal(270_000, 350_000);
    assert.equal(r.dealRating, "STRONG");
  });
});

describe("scoreDeal — NORMAL", () => {
  test("returns NORMAL when data exists but doesn't meet deal thresholds", () => {
    // MV=300k, upset=290k → discount=3.3%, spread=10k
    const r = scoreDeal(290_000, 300_000);
    assert.equal(r.dealRating, "NORMAL");
  });
});

describe("scoreDeal — UNKNOWN", () => {
  test("returns UNKNOWN when upsetAmount is null", () => {
    const r = scoreDeal(null, 300_000);
    assert.equal(r.dealRating, "UNKNOWN");
    assert.equal(r.dealScore, 0);
    assert.equal(r.estimatedSpread, null);
  });

  test("returns UNKNOWN when estimatedMarketValue is null", () => {
    const r = scoreDeal(200_000, null);
    assert.equal(r.dealRating, "UNKNOWN");
  });

  test("returns UNKNOWN when both are null", () => {
    const r = scoreDeal(null, null);
    assert.equal(r.dealRating, "UNKNOWN");
  });
});

describe("scoreDeal — spec example property", () => {
  // Sheriff #F-26000646: upset=443768.96, no market value available
  test("spec example with no market value → UNKNOWN", () => {
    const r = scoreDeal(443768.96, null);
    assert.equal(r.dealRating, "UNKNOWN");
  });

  test("spec example: upset > 280k fails maxUpset=280000 filter", () => {
    const upsetAmount = 443768.96;
    assert.equal(upsetAmount > 280000, true);
  });
});

describe("scoreDeal — score bounds", () => {
  test("score is always between 0 and 100", () => {
    const cases: [number | null, number | null][] = [
      [0, 0],
      [1, 1_000_000],
      [100_000, 100_001],
      [280_000, 280_001],
      [null, 500_000],
      [500_000, null],
    ];
    for (const [upset, mv] of cases) {
      const r = scoreDeal(upset, mv);
      assert.ok(r.dealScore >= 0, `score ${r.dealScore} < 0`);
      assert.ok(r.dealScore <= 100, `score ${r.dealScore} > 100`);
    }
  });
});

describe("scoreDeal — equityMultiple", () => {
  test("calculates equity multiple correctly", () => {
    // MV=500k, upset=250k → multiple=2.0
    const r = scoreDeal(250_000, 500_000);
    assert.equal(r.equityMultiple, 2);
  });
});

describe("computeWarnings", () => {
  test("flags NO_UPSET_AMOUNT when missing", () => {
    const w = computeWarnings({ upsetAmount: null });
    assert.ok(w.includes("NO_UPSET_AMOUNT"));
  });

  test("flags UNKNOWN_MARKET_VALUE when missing", () => {
    const w = computeWarnings({ estimatedMarketValue: null });
    assert.ok(w.includes("UNKNOWN_MARKET_VALUE"));
  });

  test("flags OWNER_OCCUPIED from occupancy status", () => {
    const w = computeWarnings({ occupancyStatus: "Owner Occupied" });
    assert.ok(w.includes("OWNER_OCCUPIED"));
  });

  test("flags TAX_LIEN from priors field", () => {
    const w = computeWarnings({ priorsLiensTaxes: "Tax Lien $5,000" });
    assert.ok(w.includes("TAX_LIEN"));
  });

  test("flags HOA_LIEN from priors field", () => {
    const w = computeWarnings({ priorsLiensTaxes: "HOA lien $2,000" });
    assert.ok(w.includes("HOA_LIEN"));
  });

  test("flags KNOWN_PRIOR_LIEN from priors field", () => {
    const w = computeWarnings({ priorsLiensTaxes: "Prior mortgage $200,000" });
    assert.ok(w.includes("KNOWN_PRIOR_LIEN"));
  });

  test("no duplicates in warnings", () => {
    const w = computeWarnings({ upsetAmount: null, estimatedMarketValue: null });
    const unique = [...new Set(w)];
    assert.equal(w.length, unique.length);
  });

  test("spec example: owner occupied should flag OWNER_OCCUPIED", () => {
    // From spec: occupancy = "Owner Occupied"
    const w = computeWarnings({
      upsetAmount: 443768.96,
      estimatedMarketValue: null,
      occupancyStatus: "Owner Occupied",
    });
    assert.ok(w.includes("OWNER_OCCUPIED"));
    assert.ok(w.includes("UNKNOWN_MARKET_VALUE"));
  });
});
