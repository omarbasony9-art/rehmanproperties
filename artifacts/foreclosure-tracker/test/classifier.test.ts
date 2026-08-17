import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/classifier.js";

describe("classify — tax_foreclosure", () => {
  test("matches 'Tax Sale Certificate' language", () => {
    const result = classify("Holder of Tax Sale Certificate #123");
    assert.equal(result.foreclosureType, "tax_foreclosure");
    assert.equal(result.classificationConfidence, "high");
  });

  test("matches 'Foreclosure of Tax Sale Certificate'", () => {
    const result = classify("Foreclosure of Tax Sale Certificate");
    assert.equal(result.foreclosureType, "tax_foreclosure");
  });

  test("matches 1031 Exchange plaintiff (from spec example)", () => {
    // From the spec: plaintiff = "Joy St. James, Assignee for the 1031 Exchange Specialists, Inc"
    const result = classify(
      "Joy St. James, Assignee for the 1031 Exchange Specialists, Inc",
      "Jeffery Solano and Evolve Bank and Trust",
    );
    assert.equal(result.foreclosureType, "tax_foreclosure");
    assert.equal(result.classificationConfidence, "high");
  });

  test("does NOT classify as tax just because unpaid taxes mentioned", () => {
    // Mentioning taxes in priors/liens should NOT trigger tax_foreclosure
    const result = classify(
      "Wells Fargo Bank, N.A.",
      "John Doe",
      "unpaid property taxes, prior mortgage lien",
    );
    // Should be mortgage (bank plaintiff), NOT tax
    assert.notEqual(result.foreclosureType, "tax_foreclosure");
  });
});

describe("classify — lien_foreclosure", () => {
  test("matches 'Condominium Association'", () => {
    const result = classify("Ocean View Condominium Association");
    assert.equal(result.foreclosureType, "lien_foreclosure");
    assert.equal(result.classificationConfidence, "high");
  });

  test("matches 'Homeowners Association'", () => {
    const result = classify("Sunrise Homeowners Association");
    assert.equal(result.foreclosureType, "lien_foreclosure");
  });

  test("matches HOA acronym", () => {
    const result = classify("HOA Lien enforcement");
    assert.equal(result.foreclosureType, "lien_foreclosure");
  });

  test("matches mechanic's lien", () => {
    const result = classify("ABC Construction Co.", "mechanic's lien foreclosure");
    assert.equal(result.foreclosureType, "lien_foreclosure");
  });
});

describe("classify — mortgage_foreclosure", () => {
  test("matches 'mortgage foreclosure' language", () => {
    const result = classify("This is a mortgage foreclosure action");
    assert.equal(result.foreclosureType, "mortgage_foreclosure");
    assert.equal(result.classificationConfidence, "high");
  });

  test("matches bank plaintiff", () => {
    const result = classify("Wells Fargo Bank, N.A.", "John Smith");
    assert.equal(result.foreclosureType, "mortgage_foreclosure");
  });

  test("matches 'mortgagee'", () => {
    const result = classify("As mortgagee of record");
    assert.equal(result.foreclosureType, "mortgage_foreclosure");
    assert.equal(result.classificationConfidence, "high");
  });
});

describe("classify — unknown", () => {
  test("returns unknown when no rule matches", () => {
    const result = classify("Jane Doe", "John Doe");
    assert.equal(result.foreclosureType, "unknown");
    assert.equal(result.classificationConfidence, "low");
  });

  test("returns unknown for null/empty inputs", () => {
    const result = classify(null, undefined, "");
    assert.equal(result.foreclosureType, "unknown");
  });
});
