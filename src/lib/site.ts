export const SITE_NAME = "Amber";

export const SITE_TAGLINE =
  "SEC filings, cash flow, valuation, and insider trades across 600+ public companies.";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://amberstocks.com";

export function extractSiteHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
}

export const SITE_HOST = extractSiteHost(SITE_URL);
