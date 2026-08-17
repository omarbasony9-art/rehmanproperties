import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseMoney,
  parseDate,
  latestDate,
  buildGoogleMapsUrl,
  buildZillowUrl,
} from "../src/parser.js";

describe("parseMoney", () => {
  test("parses dollar sign with commas", () => {
    assert.equal(parseMoney("$443,768.96"), 443768.96);
  });

  test("parses plain number string", () => {
    assert.equal(parseMoney("280000"), 280000);
  });

  test("parses with leading/trailing spaces", () => {
    assert.equal(parseMoney("  $1,000.00  "), 1000);
  });

  test("returns null for N/A", () => {
    assert.equal(parseMoney("N/A"), null);
  });

  test("returns null for dash", () => {
    assert.equal(parseMoney("-"), null);
  });

  test("returns null for null input", () => {
    assert.equal(parseMoney(null), null);
  });

  test("returns null for empty string", () => {
    assert.equal(parseMoney(""), null);
  });

  test("parses $413,562.20 (example from spec)", () => {
    assert.equal(parseMoney("$413,562.20"), 413562.2);
  });

  test("parses $443,768.96 (upset amount from spec)", () => {
    assert.equal(parseMoney("$443,768.96"), 443768.96);
  });

  // The spec example: upset 443768.96 > 280000 so it should NOT pass maxUpset=280000
  test("upset amount exceeds 280000 filter", () => {
    const upset = parseMoney("$443,768.96")!;
    assert.equal(upset > 280000, true);
  });
});

describe("parseDate", () => {
  test("parses M/D/YYYY format", () => {
    assert.equal(parseDate("9/10/2026"), "2026-09-10");
  });

  test("parses MM/DD/YYYY format", () => {
    assert.equal(parseDate("07/16/2026"), "2026-07-16");
  });

  test("parses M/DD/YYYY format", () => {
    assert.equal(parseDate("8/13/2026"), "2026-08-13");
  });

  test("parses long month format", () => {
    assert.equal(parseDate("September 10, 2026"), "2026-09-10");
  });

  test("returns null for invalid input", () => {
    assert.equal(parseDate("not a date"), null);
  });

  test("returns null for null input", () => {
    assert.equal(parseDate(null), null);
  });

  test("returns null for empty string", () => {
    assert.equal(parseDate(""), null);
  });
});

describe("latestDate", () => {
  test("returns the latest date from a list", () => {
    // Spec example: scheduled 7/16, adjourned to 8/13, adjourned to 9/10
    // currentSaleDate should be 9/10/2026
    const dates = [
      parseDate("7/16/2026"),
      parseDate("8/13/2026"),
      parseDate("9/10/2026"),
    ];
    assert.equal(latestDate(dates), "2026-09-10");
  });

  test("returns null for empty list", () => {
    assert.equal(latestDate([]), null);
  });

  test("handles nulls in list", () => {
    assert.equal(latestDate([null, "2026-09-10", null]), "2026-09-10");
  });
});

describe("buildGoogleMapsUrl", () => {
  test("builds a valid maps URL", () => {
    const url = buildGoogleMapsUrl(
      "1135 Mays Landing Somers Point Road",
      "Egg Harbor Township",
      "NJ",
      "08234",
    );
    assert.ok(url.startsWith("https://www.google.com/maps/search/"));
    assert.ok(url.includes("1135"));
  });
});

describe("buildZillowUrl", () => {
  test("builds a valid Zillow URL", () => {
    const url = buildZillowUrl(
      "1135 Mays Landing Somers Point Road",
      "Egg Harbor Township",
      "NJ",
      "08234",
    );
    assert.ok(url.startsWith("https://www.zillow.com/homes/"));
  });
});
