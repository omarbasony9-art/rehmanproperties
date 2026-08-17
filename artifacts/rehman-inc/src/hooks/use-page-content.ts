/**
 * usePageContent — per-page CMS content from D1.
 * Returns the D1 record merged with hardcoded defaults so pages never go blank.
 * staleTime: 60s — changes from admin appear within 60s, or instantly on next navigation.
 */
import { useQuery } from "@tanstack/react-query";

const BASE = "/api";

/** Hardcoded defaults — identical to the current hardcoded page text.
 *  These seed the fallback when D1 is missing or empty for a page. */
export const PAGE_DEFAULTS: Record<string, Record<string, string>> = {
  home: {
    heroEyebrow: "Direct Real Estate Investments",
    heroHeadline: "Sell Your House for Cash.",
    heroSubheadline: "Skip the Repairs. Skip the Stress.",
    heroCta: "GET MY CASH OFFER",
    heroBody:
      "Sell your property as-is and see if Rehman INC can provide a straightforward, no-obligation offer.",
    heroImage: "",
    whyUsTitle: "A Simpler Way to Sell Your Property",
    whyUsSubtitle: "",
    howItWorksTitle: "How It Works",
    howItWorksSubtitle:
      "Our process is designed to be transparent, efficient, and entirely built around your needs.",
    situationsTitle: "Whatever The Situation, Let's Talk.",
    situationsSubtitle:
      "We work with property owners navigating a variety of circumstances.",
    finalCtaTitle: "Ready To Talk About Your Property?",
    finalCtaSubtitle:
      "Enter your property address below to start the process. No pressure, no obligations.",
    finalCtaButton: "GET STARTED",
  },
  sell: {
    heroEyebrow: "Sell Directly",
    heroHeadline: "Sell Your Property Without the Traditional Hassle.",
    heroSubtext:
      "Tell us about your property and see whether Rehman INC is the right fit for your situation.",
    formTitle: "Start Your Inquiry",
    formSubtitle:
      "It takes just a few minutes to provide the details we need to begin our review.",
  },
  "how-it-works": {
    heroEyebrow: "The Process",
    heroHeadline: "A Straightforward Way to Sell.",
    heroSubtext:
      "From the first property details to the final conversation, we keep the process clear and direct.",
    step1Title: "Tell us about your property",
    step1Body:
      "Submit your address and answer a few initial questions about the property's condition and your current situation.",
    step2Title: "Rehman INC reviews the property",
    step2Body:
      "Our team evaluates the property's location, current condition, market factors, and required repairs.",
    step3Title: "Discuss an offer if the property is a fit",
    step3Body:
      "If the property aligns with our criteria, we'll have a straightforward conversation about a cash offer with no obligation.",
  },
  "why-us": {
    heroEyebrow: "Why Rehman INC",
    heroHeadline: "Real Estate. Direct Conversations. Clear Decisions.",
    heroSubtext:
      "We provide property owners with an alternative to the traditional listing process.",
    intro:
      "Rehman INC works directly with property owners who prioritize simplicity, speed, and certainty over the traditional listing process. Our clients come from all walks of life and find themselves in various situations.",
  },
  contact: {
    heroEyebrow: "Contact Rehman INC",
    heroHeadline: "Let's Talk About Your Property.",
    heroSubtext:
      "Have a property you're considering selling? Send us the details and we'll get in touch.",
    intro: "",
  },
  privacy: {
    pageTitle:   "Privacy Policy",
    lastUpdated: "October 2026",
    disclaimer:  "This page describes our privacy practices and is for informational purposes only. It does not constitute legal advice.",
  },
  terms: {
    pageTitle:   "Terms of Service",
    lastUpdated: "October 2026",
    disclaimer:  "This page is for informational purposes only and does not constitute legal, tax, or financial advice.",
  },
  faq: {
    heroEyebrow: "Common Questions",
    heroHeadline: "Questions About Selling? Start Here.",
    heroSubtext:
      "Learn more about the Rehman INC process and what to expect when you contact us.",
  },
  properties: {
    heroEyebrow: "Our Portfolio",
    heroHeadline: "Real Estate We Acquire and Manage.",
    heroSubtext:
      "Explore the types of properties that fit the Rehman INC investment strategy.",
  },
  footer: {
    tagline:
      "We provide straightforward, no-obligation cash offers for properties in any condition. Skip the repairs, showings, and uncertainty of a traditional sale.",
    copyright: "",
    disclaimer: "Rehman INC does not provide legal, tax, or financial advice.",
  },
};

async function fetchPageContent(page: string): Promise<Record<string, string>> {
  const defaults = PAGE_DEFAULTS[page] ?? {};
  try {
    const res = await fetch(`${BASE}/site/page-content/${page}`);
    if (!res.ok) return defaults;
    const data = (await res.json()) as Record<string, unknown>;
    // Merge: defaults fill any missing key; non-empty DB values win
    const result: Record<string, string> = { ...defaults };
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" && v.trim()) result[k] = v;
    }
    return result;
  } catch {
    return defaults;
  }
}

/** Hook — returns a fully-populated content map (never undefined or empty). */
export function usePageContent(page: string): Record<string, string> {
  const { data } = useQuery({
    queryKey: ["page-content", page],
    queryFn: () => fetchPageContent(page),
    staleTime: 0,
    gcTime: 5 * 60_000,
  });
  return data ?? (PAGE_DEFAULTS[page] ?? {});
}
