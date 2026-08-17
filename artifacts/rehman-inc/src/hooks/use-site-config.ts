/**
 * useSiteConfig — single source of truth for global site settings on the public website.
 * Reads from /api/site/settings (D1), falls back to safe defaults when unavailable.
 * staleTime: 60s — changes appear within 60s of an admin save, or instantly after navigation.
 */
import { useQuery } from "@tanstack/react-query";

const BASE = "/api";

export type SiteConfig = {
  company_name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  instagram_url: string;
  facebook_url: string;
  linkedin_url: string;
  twitter_url: string;
  main_cta_text: string;
  address: string;
  tagline: string;
};

export const SITE_CONFIG_DEFAULTS: SiteConfig = {
  company_name: "Rehman INC",
  contact_name: "Ali Rehman",
  contact_phone: "609-582-1061",
  contact_email: "Aliproperties91@gmail.com",
  instagram_url:
    "https://www.instagram.com/ali_monopoly/?utm_source=ig_web_button_share_sheet",
  facebook_url: "",
  linkedin_url: "",
  twitter_url: "",
  main_cta_text: "Get My Cash Offer",
  address: "",
  tagline: "",
};

async function fetchSiteConfig(): Promise<SiteConfig> {
  try {
    const res = await fetch(`${BASE}/site/settings`);
    if (!res.ok) return SITE_CONFIG_DEFAULTS;
    const data = (await res.json()) as Record<string, unknown>;
    const merged: SiteConfig = { ...SITE_CONFIG_DEFAULTS };
    for (const key of Object.keys(SITE_CONFIG_DEFAULTS) as (keyof SiteConfig)[]) {
      if (typeof data[key] === "string" && (data[key] as string).trim()) {
        merged[key] = data[key] as string;
      }
    }
    return merged;
  } catch {
    return SITE_CONFIG_DEFAULTS;
  }
}

/** Hook — always returns a fully-populated SiteConfig (never undefined). */
export function useSiteConfig(): SiteConfig {
  const { data } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
    staleTime: 0,
    gcTime: 5 * 60_000,
  });
  return data ?? SITE_CONFIG_DEFAULTS;
}

/** Extract @handle from an Instagram URL, or return the raw URL as-is. */
export function instagramHandle(url: string): string {
  if (!url) return "";
  const match = url.match(/instagram\.com\/([^/?#]+)/);
  return match ? `@${match[1]}` : url;
}

/** Format a phone number for use in href="tel:..." (strips non-digit chars). */
export function phoneHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 ? `tel:+1${digits}` : `tel:${phone}`;
}
