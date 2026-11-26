/**
 * Deterministic FX normalization for non-USD 20-F / 40-F SEC EDGAR filers
 * (e.g., TSM in TWD, ASML/SAP in EUR, NVO in DKK, SONY in JPY).
 *
 * All Amber financials are normalized to USD so Screener, Compare, Portfolio Analyzer,
 * and Valuation Studio remain apples-to-apples across domestic and global issuers.
 */

export const SUPPORTED_REPORTING_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "JPY",
  "TWD",
  "DKK",
  "CHF",
  "SEK",
  "BRL",
  "CNY",
  "KRW",
  "AUD",
  "HKD",
] as const;

export type ReportingCurrency = (typeof SUPPORTED_REPORTING_CURRENCIES)[number];

/**
 * Fallback USD-per-1-unit-of-foreign-currency rates used when offline or when a
 * currency (like TWD) is not published by ECB/Frankfurter.
 */
export const DEFAULT_USD_PER_UNIT: Record<ReportingCurrency, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.72,
  JPY: 0.0066,
  TWD: 0.031,
  DKK: 0.145,
  CHF: 1.13,
  SEK: 0.094,
  BRL: 0.175,
  CNY: 0.138,
  KRW: 0.00072,
  AUD: 0.65,
  HKD: 0.128,
};

export type FxRateMap = Record<string, number>;

export async function fetchLiveFxRates(): Promise<FxRateMap> {
  const rates: FxRateMap = { ...DEFAULT_USD_PER_UNIT };
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return rates;
    const data = (await res.json()) as { rates?: Record<string, number> };
    if (data?.rates && typeof data.rates === "object") {
      for (const code of SUPPORTED_REPORTING_CURRENCIES) {
        if (code === "USD") continue;
        const perUsd = data.rates[code];
        if (typeof perUsd === "number" && Number.isFinite(perUsd) && perUsd > 0) {
          rates[code] = 1 / perUsd;
        }
      }
    }
  } catch {
    // Gracefully use baseline rates when offline or rate-limited
  }
  return rates;
}

interface MinimalFactEntry {
  form?: string;
}

interface MinimalCompanyFacts {
  facts?: {
    "us-gaap"?: Record<string, { units?: Record<string, MinimalFactEntry[]> }>;
    "ifrs-full"?: Record<string, { units?: Record<string, MinimalFactEntry[]> }>;
  };
}

const ANNUAL_FORM_RE = /^(10-K|20-F|40-F)(\/A)?$/;

export function detectReportingCurrency(
  facts: MinimalCompanyFacts,
  revenueTags: readonly string[]
): ReportingCurrency {
  const taxonomies = [facts.facts?.["us-gaap"], facts.facts?.["ifrs-full"]];
  const counts = new Map<ReportingCurrency, number>();

  for (const tax of taxonomies) {
    if (!tax) continue;
    for (const tag of revenueTags) {
      const units = tax[tag]?.units;
      if (!units) continue;
      for (const code of SUPPORTED_REPORTING_CURRENCIES) {
        const entries = units[code];
        if (!entries || entries.length === 0) continue;
        const annualCount = entries.filter(
          (e) => typeof e.form === "string" && ANNUAL_FORM_RE.test(e.form)
        ).length;
        if (annualCount > 0) {
          counts.set(code, (counts.get(code) ?? 0) + annualCount);
        }
      }
    }
  }

  // Always prefer USD when USD annual revenue facts exist
  if ((counts.get("USD") ?? 0) > 0) return "USD";

  let best: ReportingCurrency = "USD";
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

export function getUsdConversionRate(
  currency: string,
  fxRates: FxRateMap = DEFAULT_USD_PER_UNIT
): number {
  if (currency === "USD" || currency === "shares") return 1;
  const rate = fxRates[currency];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : 1;
}
