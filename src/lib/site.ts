export const SITE_NAME = "Amber";

export const SITE_TAGLINE =
  "The independent reality check before you buy — SEC fine-print diffs, market-implied growth, and open-market insider moves.";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "")
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://amber-theta-three.vercel.app";
