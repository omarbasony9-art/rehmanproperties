/**
 * Deterministic foreclosure type classification.
 * NO AI. NO LLM. Rules only.
 */

export type ForeclosureType =
  | "mortgage_foreclosure"
  | "tax_foreclosure"
  | "lien_foreclosure"
  | "unknown";

export type ClassificationConfidence = "high" | "medium" | "low";

export interface ClassificationResult {
  foreclosureType: ForeclosureType;
  classificationConfidence: ClassificationConfidence;
  classificationEvidence: string;
}

interface Rule {
  type: ForeclosureType;
  confidence: ClassificationConfidence;
  patterns: RegExp[];
  label: string;
}

// Rules are checked in order — first match wins.
// Tax foreclosures require STRONG language (holding a tax sale certificate).
// Do NOT classify as tax_foreclosure merely because taxes are mentioned.
const RULES: Rule[] = [
  {
    type: "tax_foreclosure",
    confidence: "high",
    label: "Tax Sale Certificate language",
    patterns: [
      /tax\s+sale\s+certificate/i,
      /foreclosure\s+of\s+tax\s+sale\s+certificate/i,
      /holder\s+of\s+tax\s+sale\s+certificate/i,
      /tax\s+certificate\s+foreclosure/i,
      /assignee\s+for\s+the\s+\d{4}\s+exchange/i,   // e.g. "1031 Exchange Specialists"
    ],
  },
  {
    type: "lien_foreclosure",
    confidence: "high",
    label: "Condominium / HOA / lien language",
    patterns: [
      /condominium\s+association/i,
      /homeowners?\s+association/i,
      /\bHOA\b/,
      /assessment\s+lien/i,
      /condominium\s+lien/i,
      /mechanic.?s?\s+lien/i,
      /judgment\s+lien/i,
      /municipal\s+lien/i,
    ],
  },
  {
    type: "lien_foreclosure",
    confidence: "medium",
    label: "Lien-holder plaintiff",
    patterns: [
      /lien\s+holder/i,
      /lienholder/i,
    ],
  },
  {
    type: "mortgage_foreclosure",
    confidence: "high",
    label: "Mortgage foreclosure language",
    patterns: [
      /\bmortgage\s+foreclosure\b/i,
      /\bmortgagee\b/i,
      /\bmortgagor\b/i,
      /\bmortgage\s+debt\b/i,
    ],
  },
  {
    type: "mortgage_foreclosure",
    confidence: "medium",
    label: "Bank or lender plaintiff",
    patterns: [
      /\bbank\b/i,
      /\bN\.?A\.?\b/,               // National Association
      /\bmortgage\b/i,
      /\blender\b/i,
      /\bcredit\s+union\b/i,
      /\bfederal\s+savings\b/i,
      /\bfannie\s+mae\b/i,
      /\bfreddie\s+mac\b/i,
      /\bhud\b/i,
      /\bsecurities\b/i,
      /\bfinancial\b.*\b(corp|inc|llc)\b/i,
    ],
  },
];

/**
 * Classify a foreclosure from free-text fields (plaintiff, defendant, case title, notes).
 * Checks all provided text fields and returns the highest-confidence match.
 */
export function classify(
  ...textFields: (string | null | undefined)[]
): ClassificationResult {
  const combined = textFields
    .filter(Boolean)
    .join(" ");

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(combined)) {
        return {
          foreclosureType: rule.type,
          classificationConfidence: rule.confidence,
          classificationEvidence: `Matched rule "${rule.label}" on pattern: ${pattern.toString()}`,
        };
      }
    }
  }

  return {
    foreclosureType: "unknown",
    classificationConfidence: "low",
    classificationEvidence: "No deterministic rule matched.",
  };
}
