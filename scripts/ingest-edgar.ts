/**
 * Amber Scalable SEC EDGAR XBRL Ingestion Pipeline (Phase 3)
 *
 * Pulls the official SEC EDGAR master ticker directory (`company_tickers_exchange.json`),
 * merges curated flagship metadata, and ingests multi-year 10-K XBRL financials for
 * `UNIVERSE_LIMIT` public companies (default: 125; scale up to 500–5,000 via env var).
 *
 * Writes compact normalized artifacts:
 *   - src/data/generated/companies.json
 *   - src/data/generated/search-index.json
 *
 * Usage:
 *   pnpm ingest:edgar                    # Ingest top 125 SEC-verified companies
 *   UNIVERSE_LIMIT=500 pnpm ingest:edgar # Scale to 500 companies
 */

import fs from "node:fs";
import path from "node:path";
import { PILOT_TICKERS } from "../src/data/pilot-tickers.ts";
import {
  type AnnualFinancials,
  type CompanySnapshot,
  type FilingDiffItem,
  computeAnnualMetrics,
  computeEnterpriseValue,
  computeGroundedDefaultDcf,
  computeNetDilutionCagr,
  solveReverseDcf,
} from "../src/lib/finance.ts";

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "AmberFinance research@amber.example";
const UNIVERSE_LIMIT = Number(process.env.UNIVERSE_LIMIT ?? "125");

interface CuratedMeta {
  ticker: string;
  sector: string;
  tagline: string;
  fallbackPrice?: number;
}

const CURATED_META: Record<string, CuratedMeta> = {
  PLTR: { ticker: "PLTR", sector: "Cloud & Software", tagline: "High-margin FCF inflection vs. persistent SBC & share count expansion", fallbackPrice: 143.49 },
  NVDA: { ticker: "NVDA", sector: "Semiconductors", tagline: "Extraordinary cash conversion with rising hyperscaler concentration", fallbackPrice: 125.53 },
  MSFT: { ticker: "MSFT", sector: "Cloud & Software", tagline: "AI datacenter CapEx surge compressing near-term FCF conversion", fallbackPrice: 484.52 },
  SNOW: { ticker: "SNOW", sector: "Cloud & Software", tagline: "Classic SBC-to-FCF gap: strong headline cash flow vs. negative True FCF", fallbackPrice: 254.82 },
  SHOP: { ticker: "SHOP", sector: "Cloud & Software", tagline: "Post-logistics operating leverage with disciplined SBC compression", fallbackPrice: 123.72 },
  COST: { ticker: "COST", sector: "Consumer & Retail", tagline: "Ultra-clean cash flow and minimal SBC; stress-test the 50x+ valuation", fallbackPrice: 1102.15 },
  AAPL: { ticker: "AAPL", sector: "Consumer & Retail", tagline: "Massive buyback engine offsetting modest SBC with steady share retirement", fallbackPrice: 342.56 },
  GOOGL: { ticker: "GOOGL", sector: "Media & Telecom", tagline: "Heavy AI CapEx cycle paired with $20B+ annual SBC and aggressive buybacks", fallbackPrice: 265.29 },
  AMZN: { ticker: "AMZN", sector: "Consumer & Retail", tagline: "AWS operating leverage vs. massive logistics & AI infrastructure CapEx", fallbackPrice: 246.82 },
  META: { ticker: "META", sector: "Media & Telecom", tagline: "Year-of-efficiency FCF surge funding record AI datacenter buildout", fallbackPrice: 560.84 },
  ORCL: { ticker: "ORCL", sector: "Cloud & Software", tagline: "OCI backlog acceleration driving a sharp step-up in CapEx intensity", fallbackPrice: 101.19 },
  AMD: { ticker: "AMD", sector: "Semiconductors", tagline: "Datacenter GPU ramp vs. rising R&D equity compensation", fallbackPrice: 424.39 },
  AVGO: { ticker: "AVGO", sector: "Semiconductors", tagline: "VMware integration and custom AI ASICs driving elite FCF margins", fallbackPrice: 304.41 },
  CRWD: { ticker: "CRWD", sector: "Cloud & Software", tagline: "Best-in-class headline FCF margin weighed against steep SBC expense", fallbackPrice: 229.44 },
  DDOG: { ticker: "DDOG", sector: "Cloud & Software", tagline: "Strong GAAP profitability inflection while SBC remains a major FCF drag", fallbackPrice: 142.8 },
  NET: { ticker: "NET", sector: "Cloud & Software", tagline: "Edge infrastructure scale-up with high SBC relative to reported FCF", fallbackPrice: 274.96 },
  PANW: { ticker: "PANW", sector: "Cloud & Software", tagline: "Platformization billings shift paired with $1B+ annual SBC", fallbackPrice: 192.0 },
  NOW: { ticker: "NOW", sector: "Cloud & Software", tagline: "Durable 20%+ compounder with steady SBC compression toward True FCF", fallbackPrice: 985.0 },
  CRM: { ticker: "CRM", sector: "Cloud & Software", tagline: "Activist-era margin discipline turning massive FCF into net share reduction", fallbackPrice: 180.62 },
  ADBE: { ticker: "ADBE", sector: "Cloud & Software", tagline: "High-margin recurring cash flow funding consistent share count shrinkage", fallbackPrice: 448.2 },
  V: { ticker: "V", sector: "Fintech & Data", tagline: "Gold-standard 55%+ True FCF margin tollbooth with relentless buybacks", fallbackPrice: 401.87 },
  MA: { ticker: "MA", sector: "Fintech & Data", tagline: "Elite capital efficiency, minimal SBC, and consistent share reduction", fallbackPrice: 625.59 },
  NFLX: { ticker: "NFLX", sector: "Media & Telecom", tagline: "Post-password-sharing FCF breakout with minimal SBC dilution", fallbackPrice: 968.0 },
  UBER: { ticker: "UBER", sector: "Consumer & Retail", tagline: "From cash burn to multi-billion True FCF with moderating SBC", fallbackPrice: 76.8 },
  ABNB: { ticker: "ABNB", sector: "Consumer & Retail", tagline: "Negative working capital float boosting FCF vs. ~12% SBC burden", fallbackPrice: 142.4 },
  TSLA: { ticker: "TSLA", sector: "Consumer & Retail", tagline: "Heavy AI/factory CapEx vs. ambitious Reverse DCF growth expectations", fallbackPrice: 345.82 },
  FICO: { ticker: "FICO", sector: "Fintech & Data", tagline: "Pricing power & buybacks driving one of the cleanest FCF profiles in S&P 500", fallbackPrice: 1845.0 },
  JPM: { ticker: "JPM", sector: "Fintech & Data", tagline: "Fortress balance sheet and scale economics driving consistent share retirement", fallbackPrice: 308.4 },
  GS: { ticker: "GS", sector: "Fintech & Data", tagline: "Global investment banking and trading powerhouse with disciplined buybacks", fallbackPrice: 624.5 },
  MS: { ticker: "MS", sector: "Fintech & Data", tagline: "Wealth management fee durability paired with capital-markets operating leverage", fallbackPrice: 138.2 },
  BAC: { ticker: "BAC", sector: "Fintech & Data", tagline: "Scale consumer deposit franchise generating durable net interest earnings", fallbackPrice: 48.9 },
  WFC: { ticker: "WFC", sector: "Fintech & Data", tagline: "Aggressive net share count reduction powered by excess capital return", fallbackPrice: 79.4 },
  BX: { ticker: "BX", sector: "Fintech & Data", tagline: "Fee-related earnings compounder across private credit, real estate, and infrastructure", fallbackPrice: 184.6 },
  KKR: { ticker: "KKR", sector: "Fintech & Data", tagline: "Alternative asset management scale paired with insurance float compounding", fallbackPrice: 152.3 },
  XOM: { ticker: "XOM", sector: "Energy & Utilities", tagline: "Permian and Guyana upstream scale funding $30B+ annual shareholder distributions", fallbackPrice: 119.8 },
};

// Explicit ordinary-shares-per-ADR multipliers for 20-F foreign ADR issuers
export const ADR_SHARE_RATIO: Record<string, number> = {
  LTM: 2000,
  BABA: 8,
  AMX: 20,
  ONC: 13,
  SHEL: 2,
  PDD: 4,
  CX: 10,
  CHT: 10,
  BHP: 2,
  NTES: 5,
  DEO: 4,
  HTHT: 10,
  UMC: 5,
  ASX: 2,
  EMBJ: 4,
  GMAB: 0.1,
};

// Multi-class or ADR fallback diluted shares (in millions) when standard single-class XBRL tags omit converted share classes
export const FALLBACK_SHARES_MILLIONS: Record<string, number> = {
  V: 1985,
  BP: 2680,
  WMG: 521,
  RYAN: 265,
  STZ: 182,
  COKE: 87,
  ERIE: 52,
};

// Override SEC directory shell CIKs where historical 10-K filings live on the operating registrant CIK
const CIK_OVERRIDES: Record<string, string> = {
  XOM: "0000034088",
};

// Priority tickers guaranteed to be included first regardless of SEC directory order
const PRIORITY_TICKERS = [
  "PLTR", "NVDA", "MSFT", "SNOW", "SHOP", "COST", "AAPL", "GOOGL", "AMZN", "META",
  "ORCL", "AMD", "AVGO", "QCOM", "TXN", "ANET", "CRWD", "DDOG", "NET", "PANW",
  "NOW", "CRM", "ADBE", "INTU", "WDAY", "MDB", "ZS", "NFLX", "UBER", "ABNB",
  "V", "MA", "PYPL", "TSLA", "WMT", "HD", "LLY", "UNH", "VRSK", "FICO",
  "APP", "COIN", "HOOD", "TTD", "TEAM", "HUBS", "VEEV", "FTNT", "KLAC", "LRCX",
  "AMAT", "SNPS", "CDNS", "MU", "INTC", "IBM", "CSCO", "ACN", "SPGI", "MCO",
  "MSCI", "ISRG", "TMO", "DHR", "ABT", "JNJ", "MRK", "ABBV", "AMGN", "GILD",
  "PG", "KO", "PEP", "MCD", "SBUX", "NKE", "CMG", "BKNG", "LOW", "TJX",
  "CAT", "DE", "GE", "HON", "UNP", "UPS", "ETN", "WM", "RSG", "CTAS",
  "XOM", "CVX", "COP", "LIN", "SHW", "DIS", "CMCSA", "TMUS", "VZ", "T",
  "DUOL", "DASH", "RBLX", "SPOT", "OKTA", "DOCU", "TWLO", "GTLB", "CFLT", "IOT",
  "MELI", "NU", "AXP", "BLK", "BX", "KKR", "JPM", "GS", "MS", "BRK.B",
  "ORLY", "AZO", "ADSK", "PAYX", "ADP",
  "ARM", "RDDT", "SOFI", "TOST", "AFRM", "DKNG", "CAVA", "ELF", "HIMS", "ONON",
  "AXON", "VST", "CEG", "GEV", "MSTR", "SMCI", "MRVL", "U", "ROKU", "PINS",
  "SNAP", "ESTC", "BILL", "MNDY", "CELH", "LULU", "DECK", "PODD", "DXCM", "REGN",
  "VRTX", "CRSP", "FI", "FIS", "GPN", "XYZ", "ROST", "TGT", "DG", "DLTR",
];

interface SecDirectoryResponse {
  fields: string[]; // ["cik", "name", "ticker", "exchange"]
  data: Array<[number, string, string, string | null]>;
}

interface XbrlFactUnit {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
}

interface CompanyFactsResponse {
  entityName: string;
  facts?: {
    "us-gaap"?: Record<string, { units?: Record<string, XbrlFactUnit[]> }>;
    "ifrs-full"?: Record<string, { units?: Record<string, XbrlFactUnit[]> }>;
    "dei"?: Record<string, { units?: Record<string, XbrlFactUnit[]> }>;
  };
}

interface DirectoryCandidate {
  ticker: string;
  cik: string;
  name: string;
  exchange: "NASDAQ" | "NYSE";
}

async function fetchSecJson<T>(url: string, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": SEC_USER_AGENT,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
          continue;
        }
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Failed fetching ${url}`);
}

export function cleanCompanyName(raw: string): string {
  // Strip SEC state/country suffixes like "/DE/", "/ DE", "/ Ma", and trailing slashes
  let cleaned = raw
    .replace(/\s*\/[A-Za-z]{2,5}\/?$/i, "")
    .replace(/\/+$/g, "")
    .trim();

  // Fix mixed ALL-CAPS words (3+ uppercase letters) unless known acronym
  const ACRONYMS = new Set([
    "AMD", "ARM", "ASML", "AT&T", "BHP", "BILL", "CAE", "CBRE", "CDW", "CF",
    "CG", "CNH", "CRH", "CSX", "CVS", "DHR", "DTE", "EOG", "EPAM", "EQT",
    "ESAB", "FTI", "GAP", "GE", "GM", "GXO", "HCA", "HP", "IBM", "ICF",
    "IDXX", "IHG", "II", "IQV", "ITT", "JBL", "JBS", "JCI", "JLL", "JNJ",
    "JPM", "KB", "KBR", "KDP", "KKR", "KLA", "LKQ", "LPL", "LVMH", "LYB",
    "MGM", "MKS", "MPLX", "MSA", "MSC", "MSCI", "MTD", "NVIDIA", "NVR", "NXP", "OKTA", "ON",
    "PBF", "PG&E", "PTC", "PVH", "QGEN", "QXO", "RBC", "RELX", "RH", "RPM",
    "RTX", "S&P", "SAP", "SBA", "SEI", "SK", "SLB", "SM", "SS&C", "STERIS", "STM",
    "TC", "TD", "TE", "TFX", "TJX", "TKO", "TSMC", "UGI", "UPS", "US",
    "USA", "VF", "VFC", "WEC", "WEX", "WP", "WPP", "WRB", "XPO", "YUM",
    "ZTO", "LLC", "LP", "PLC", "SA", "NV", "SE", "AG", "INC", "CORP", "CO", "LTD",
  ]);

  cleaned = cleaned
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^A-Za-z&]/g, "");
      if (bare.length >= 3 && bare === bare.toUpperCase() && !ACRONYMS.has(bare)) {
        return word.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      }
      return word;
    })
    .join(" ");

  return cleaned
    .replace(/^Amazon Com Inc\.?$/i, "Amazon.com, Inc.")
    .replace(/^Mcdonalds Corp\.?$/i, "McDonald's Corp.")
    .replace(/^Unitedhealth Group Inc\.?$/i, "UnitedHealth Group Inc.")
    .replace(/^Paypal Holdings,? Inc\.?$/i, "PayPal Holdings, Inc.")
    .replace(/^Mastercard Inc\.?$/i, "Mastercard Inc.")
    .replace(/^Jpmorgan Chase & Co\.?$/i, "JPMorgan Chase & Co.")
    .replace(/\bSab De Cv\b/gi, "S.A.B. de C.V.")
    .replace(/\bLlc\b/g, "LLC")
    .replace(/\bLp\b/g, "LP")
    .replace(/\bPlc\b/g, "PLC")
    .replace(/\bCorp\b\.?/g, "Corp.")
    .replace(/\bInc\b\.?/g, "Inc.")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeShareCountToMillions(
  rawShares: number,
  ticker: string
): number {
  const ratio = ADR_SHARE_RATIO[ticker] ?? 1;
  if (!Number.isFinite(rawShares) || rawShares <= 0) {
    return FALLBACK_SHARES_MILLIONS[ticker] ?? 100;
  }
  let millions: number;
  if (rawShares < 15_000) {
    // Already reported in millions (e.g. MCD 715.2)
    millions = rawShares;
  } else if (rawShares < 1_000_000) {
    // Reported in thousands (e.g. TEM 181,311)
    millions = rawShares / 1_000;
  } else {
    // Raw shares
    millions = rawShares / 1_000_000;
  }
  return Math.max(1, Math.round(millions / ratio));
}

/**
 * Retroactively normalizes pre-split share counts in older 10-K years when
 * a forward split (e.g. NVDA 10:1, AVGO 10:1, NOW 5:1, CMG 50:1) or reverse
 * split occurred and earlier comparative filings remained unadjusted.
 */
function normalizeStockSplits(annuals: AnnualFinancials[]): AnnualFinancials[] {
  const out = annuals.map((a) => ({ ...a }));
  for (let i = out.length - 2; i >= 0; i--) {
    const prev = out[i].dilutedShares;
    const next = out[i + 1].dilutedShares;
    if (prev <= 0 || next <= 0) continue;

    const ratio = next / prev;
    if (ratio >= 1.85) {
      // Forward split (e.g. 2:1, 3:1, 4:1, 5:1, 10:1, 20:1, 50:1)
      const factor = Math.round(ratio);
      for (let j = 0; j <= i; j++) {
        out[j].dilutedShares = Math.round(out[j].dilutedShares * factor);
      }
    } else if (ratio <= 0.55) {
      // Reverse split (e.g. 1:2, 1:5, 1:10)
      const invFactor = Math.round(1 / ratio);
      for (let j = 0; j <= i; j++) {
        out[j].dilutedShares = Math.max(
          1,
          Math.round(out[j].dilutedShares / invFactor)
        );
      }
    }
  }
  return out;
}

function daysBetween(start: string, end: string): number {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return (e - s) / (1000 * 60 * 60 * 24);
}

function extractAnnualSeries(
  facts: CompanyFactsResponse,
  tagCandidates: string[],
  unit: "USD" | "shares",
  requireDuration = true
): Map<string, { val: number; end: string; filed: string; accn: string }> {
  const gaap = facts.facts?.["us-gaap"];
  const ifrs = facts.facts?.["ifrs-full"];
  const dei = facts.facts?.["dei"];
  const merged = new Map<
    string,
    { val: number; end: string; filed: string; accn: string; priority: number }
  >();

  if (!gaap && !ifrs && !dei) return new Map();

  const annualForms = new Set([
    "10-K",
    "10-K/A",
    "20-F",
    "20-F/A",
    "40-F",
    "40-F/A",
  ]);

  tagCandidates.forEach((tag, priority) => {
    const entries =
      gaap?.[tag]?.units?.[unit] ??
      ifrs?.[tag]?.units?.[unit] ??
      dei?.[tag]?.units?.[unit] ??
      [];
    if (!entries.length) return;

    for (const e of entries) {
      if (!annualForms.has(e.form)) continue;

      if (requireDuration) {
        if (!e.start) continue;
        const days = daysBetween(e.start, e.end);
        if (days < 330 || days > 400) continue;
      }

      const endYear = Number(e.end.slice(0, 4));
      const key = String(endYear);

      const existing = merged.get(key);
      if (
        !existing ||
        priority < existing.priority ||
        (priority === existing.priority && e.filed > existing.filed)
      ) {
        merged.set(key, {
          val: e.val,
          end: e.end,
          filed: e.filed,
          accn: e.accn,
          priority,
        });
      }
    }
  });

  const out = new Map<
    string,
    { val: number; end: string; filed: string; accn: string }
  >();
  for (const [k, v] of merged.entries()) {
    out.set(k, { val: v.val, end: v.end, filed: v.filed, accn: v.accn });
  }
  return out;
}

function extractLatestInstant(
  facts: CompanyFactsResponse,
  tagCandidates: string[],
  unit: "USD" | "shares"
): number {
  const gaap = facts.facts?.["us-gaap"];
  const ifrs = facts.facts?.["ifrs-full"];
  const dei = facts.facts?.["dei"];

  for (const tag of tagCandidates) {
    const entries =
      gaap?.[tag]?.units?.[unit] ??
      ifrs?.[tag]?.units?.[unit] ??
      dei?.[tag]?.units?.[unit] ??
      [];
    if (!entries.length) continue;

    const sorted = [...entries]
      .filter(
        (e) =>
          (e.form === "10-K" ||
            e.form === "10-Q" ||
            e.form === "20-F" ||
            e.form === "40-F") &&
          e.end >= "2023-01-01"
      )
      .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed));

    if (sorted.length > 0 && Number.isFinite(sorted[0].val)) {
      return sorted[0].val;
    }
  }
  return 0;
}

/**
 * Extracts the latest 10-Q YTD duration ending AFTER `latestFyEnd` along with
 * its matching prior-year comparative YTD period (~365d earlier, same span).
 * Enables exact TTM = Latest FY + Current YTD 10-Q - Prior YTD 10-Q.
 */
function extractLatest10QYtdPair(
  facts: CompanyFactsResponse,
  tagCandidates: string[],
  unit: "USD" | "shares",
  latestFyEnd: string
): {
  currentVal: number;
  priorVal: number;
  end: string;
  filed: string;
  accn: string;
} | null {
  const gaap = facts.facts?.["us-gaap"];
  if (!gaap) return null;

  for (const tag of tagCandidates) {
    const entries = gaap[tag]?.units?.[unit];
    if (!entries?.length) continue;

    const tenQs = entries.filter(
      (e) =>
        (e.form === "10-Q" || e.form === "10-Q/A") &&
        e.start &&
        e.end > latestFyEnd
    );
    if (!tenQs.length) continue;

    // Pick the most recent 10-Q end date, preferring the YTD cumulative span (longest duration)
    tenQs.sort(
      (a, b) =>
        b.end.localeCompare(a.end) ||
        daysBetween(b.start!, b.end) - daysBetween(a.start!, a.end) ||
        b.filed.localeCompare(a.filed)
    );
    const cur = tenQs[0];
    const curSpan = daysBetween(cur.start!, cur.end);
    if (curSpan < 70 || curSpan > 300) continue;

    // Find matching prior-year comparative YTD entry (~350–380 days earlier, similar span)
    const priorCandidates = entries.filter((e) => {
      if (!e.start) return false;
      const span = daysBetween(e.start, e.end);
      if (Math.abs(span - curSpan) > 15) return false;
      const endDelta = daysBetween(e.end, cur.end);
      return endDelta >= 345 && endDelta <= 385;
    });

    if (priorCandidates.length > 0) {
      priorCandidates.sort((a, b) => b.filed.localeCompare(a.filed));
      return {
        currentVal: cur.val,
        priorVal: priorCandidates[0].val,
        end: cur.end,
        filed: cur.filed,
        accn: cur.accn,
      };
    }
  }

  return null;
}

const EXCLUDED_FINANCIAL_ENTITY_RE =
  /\b(bancorp|bancshares|bank|banking|insurance|insurer|reit|realty|property trust|properties|jpmorgan|citigroup|wells fargo|goldman sachs|morgan stanley|chubb|allstate|travelers|metlife|prudential|aflac|progressive corp|berkshire hathaway|keycorp|cme group|brookfield|vici|public storage|prologis|equinix|digital realty|simon property|american tower|crown castle|welltower|extra space|avalonbay|equity residential|blackrock|blackstone|kkr|apollo|charles schwab|capital one|discover financial|us bancorp|pnc financial|truist|state street|northern trust|regions financial|fifth third|huntington|m&t bank|citizens financial|synchrony|ally financial|hartford|arch capital|markel|cincinnati financial|principal financial|lincoln national|loews|marsh & mclennan|aon|arthur j|brown & brown|willis towers)\b/i;

const ALLOWLISTED_FINTECH = new Set([
  "V",
  "MA",
  "PYPL",
  "SPGI",
  "MCO",
  "MSCI",
  "FICO",
  "VRSK",
  "INTU",
  "COIN",
  "HOOD",
  "JPM",
  "GS",
  "MS",
  "BAC",
  "WFC",
  "AXP",
  "BX",
  "KKR",
]);

const BANK_EARNINGS_OCF_TICKERS = new Set(["JPM", "GS", "MS", "BAC", "WFC"]);

export function inferSector(name: string, ticker = ""): string {
  const meta = CURATED_META[ticker];
  if (meta?.sector) return meta.sector;
  const n = `${ticker} ${name}`.toLowerCase();
  if (/semiconductor|micro|nvidia|broadcom|qualcomm|analog|applied mat|lam research|kla|synopsys|cadence|intel|sandisk|western digital|micron|marvell|monolithic|nxp|on semi|texas instruments|arista|arm holdings|asml|taiwan semi|united micro|ase technology|skyworks|qorvo|entegris|ambarella|credo|astera|sitime|nova ltd|tower semi|lattice|silicon lab|cirrus|macom|coherent|ontu|teradyne|amkor|axcelis|ONTO/.test(n)) return "Semiconductors";
  if (/software|cloud|data|cyber|security|crowdstrike|palo alto|zscaler|okta|workday|servicenow|salesforce|adobe|intuit|autodesk|atlassian|hubspot|mongodb|confluent|gitlab|snowflake|palantir|datadog|cloudflare|fortinet|applovin|trade desk|veeva|docusign|twilio|samsara|duolingo|roblox|spotify|oracle|microsoft|shopify|cisco|ibm|international business machines|check point|elastic|monday\.com|jfrog|rubrik|nutanix|bill holdings|guidewire|manhattan assoc|ansys|bentley|dynatrace|ui path|procore|AppFolio|sentinelone|cyberark|qualys|tenable|rapid7|box|dropbox|zoom|ringcentral|five9|smartsheet|freshworks|klaviyo|braze|git|hashicorp|c3\.ai|tempus ai|accenture|cognizant|gartner|epamsystems|globant|infosys|wipro|genpact/.test(n)) return "Cloud & Software";
  if (/pharma|therapeutics|biotech|lilly|health|medical|surgical|abbott|amgen|gilead|merck|abbvie|johnson & johnson|danaher|thermo|pfizer|bristol|vertex|regeneron|stryker|medtronic|boston scientific|edwards|hca|unitedhealth|elevance|cigna|cvs|mckesson|cencora|cardinal|humana|agilent|iqvia|dexcom|intuitive|idxx|zoetis|astrazeneca|sanofi|novartis|novo nordisk|gsk|teva|genmab|beone|moderna|biontech|alcon|resmed|illumina|waters|mettler|steris|hologic|align|insulet|coopercos|teleflex|zimmer|baxter|bd |becton|labcorp|quest diag|icon plc|charles river|exact sciences|natera|guardant|insmed|halozyme|neurocrine|alnylam|biomarin|incyte|royalty pharma|jazz pharma|Roivant|crispr|tg therapeutics|glaukos|encompass|tenet|universal health|davita|molina|centene|hims/.test(n)) return "Healthcare";
  if (/visa|mastercard|paypal|sp global|s&p global|moody|msci|fico|fair isaac|coinbase|robinhood|verisk|fiserv|fidelity national|paychex|automatic data|global payments|block, inc|mercado|jpmorgan|goldman sachs|morgan stanley|bank of america|wells fargo|american express|blackstone|kkr|blackrock|apollo|ares |blue owl|carlyle|tpg |invesco|franklin res|t\. rowe|sei invest|interactive brokers|charles schwab|lpl financial|cboe|nasdaq|intercontinental exchange|cme group|tradeweb|marketaxess|factset|morningstar|broadridge|jack henry|shift4|toast|affirm|sofi|nu holdings|erie indemnity|ryan specialty|everest group/.test(n)) return "Fintech & Data";
  if (/retail|costco|walmart|home depot|lowe|tjx|autozone|o'reilly|starbucks|mcdonald|chipotle|nike|procter|coca-cola|coca cola|pepsi|altria|philip morris|mondelez|colgate|kimberly|general mills|hershey|monster bev|target|ross stores|dollar|kroger|amazon|booking|airbnb|uber|doordash|marriott|hilton|hyatt|intercontinental hotels|H world|trip\.com|expedia|royal caribbean|carnival|norwegian cruise|yum!|domino|restaurant brands|darden|texas roadhouse|wingstop|cava|shake shack|dutch bros|lululemon|deckers|on holding|skechers|crocs|tapestry|ralph lauren|pvh|vf corp|levi|burlington|aberCrombie|gap|bath & body|ulta|e\.l\.f\.|estee lauder|coty|constellation brands|diageo|anheuser|molson|brown-forman|boston beer|keurig|kraft heinz|campbell|conagra|jm smucker|mccormick|hormel|tyson|jbs|sysco|us foods|performance food|sprouts|albertsons|casey's|tractor supply|best buy|dick's|williams-sonoma|RH |wayfair|etsy|ebay|chewy|carvana|carmax|autonation|penske|lithia|tesla|rivian|lucid|ferrari|general motors|ford motor|toyota|honda|stellantis|harley|polaris|draftkings|flutter|wynn|las vegas sands|mgm resorts|caesars|churchill downs|mattel|hasbro|peloton|garmin|apple|dell tech|hp inc|logitech|sonos/.test(n)) return "Consumer & Retail";
  if (/energy|petroleum|oil|gas|pipeline|midstream|exxon|chevron|conocophillips|eog |eqt |schlumberger|slb|halliburton|baker hughes|technipfmc|phillips 66|marathon|valero|pbf energy|hf sinclair|occidental|devon|diamondback|coterra|ovintiv|APA |permian|chord|matador|range res|antero|chesapeake|expand energy|texas pacific land|williams cos|kinder morgan|oneok|targa|cheniere|mplx|plains all|western midstream|enterprise prod|energy transfer|enbridge|tc energy|hess|shell|bp plc|totalenergies|equinor|petrobras|suncor|canadian natural|cenovus|imperial oil|cameco|nextera|duke energy|southern co|dominion|constellation energy|vistra|ge vernova|nrg energy|talen|pg&e|edison|exelon|sempra|american electric|xcel|consolidated edison|public service|wec energy|dte energy|entergy|firstenergy|ppl corp|ameren|cms energy|centerpoint|atmos|nisource|evergy|allient|pinnacle west|aes corp|brookfield renewable|clearway|ormad|first solar|enphase|american water|essential utilities/.test(n)) return "Energy & Utilities";
  if (/media|telecom|communications|netflix|disney|comcast|t-mobile|verizon|at&t|charter|liberty|warner|fox |paramount|new york times|news corp|omnigroup|interpublic|wpp|live nation|tko group|electronic arts|take-two|unity|alphabet|meta platforms|pinterest|snap|reddit|roku|zillow|coStar|iac|match group|bumble|yandex|baidu|netease|tencent|chunghwa|america movil|vodafone|telefonica|BCE|rogers|telus|fubo|sirius/.test(n)) return "Media & Telecom";
  return "Industrials & Materials";
}

function buildAutoTagline(
  trueFcfMargin: number,
  sbcPctRevenue: number,
  dilutionCagr: number
): string {
  if (trueFcfMargin < 0 && sbcPctRevenue > 15) {
    return `High SBC load (${sbcPctRevenue.toFixed(1)}% of rev) turns headline FCF into negative True FCF`;
  }
  if (trueFcfMargin >= 25 && sbcPctRevenue < 5) {
    return `Elite ${trueFcfMargin.toFixed(1)}% True FCF margin with minimal SBC drag (${sbcPctRevenue.toFixed(1)}%)`;
  }
  if (dilutionCagr < -1.5) {
    return `Consistent share count reduction (${dilutionCagr.toFixed(1)}%/yr) amplifying per-share FCF`;
  }
  if (sbcPctRevenue >= 12) {
    return `Elevated SBC (${sbcPctRevenue.toFixed(1)}% of rev) creates a wide gap vs. reported FCF`;
  }
  return `SEC-verified ${trueFcfMargin.toFixed(1)}% True FCF margin and ${sbcPctRevenue.toFixed(1)}% SBC intensity`;
}

function generateDeterministicDiffs(
  company: Omit<CompanySnapshot, "filingDiffs">
): FilingDiffItem[] {
  const series = computeAnnualMetrics(company.annuals);
  const latest = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const dilutionCagr = computeNetDilutionCagr(company.annuals);

  const sbcMateriality: FilingDiffItem["materiality"] =
    latest.sbcPctReportedFcf >= 35 || latest.trueFcf < 0
      ? "High"
      : latest.sbcPctReportedFcf >= 15
        ? "Medium"
        : "Watch";

  const capAllocMateriality: FilingDiffItem["materiality"] =
    Math.abs(dilutionCagr) >= 2.0 ? "High" : "Watch";

  return [
    {
      id: `${company.ticker.toLowerCase()}-xbrl-sbc`,
      filingType: "10-K",
      filingDate: company.lastFiling.date,
      accessionNumber: company.lastFiling.accessionNumber,
      section: "XBRL Cash Flow Statement: SBC Reconciliation",
      category: "Executive Comp",
      materiality: sbcMateriality,
      headline:
        latest.trueFcf < 0
          ? `SBC ($${(latest.sbc / 1000).toFixed(2)}B) exceeded Reported FCF, leaving True FCF negative`
          : `SBC consumed ${latest.sbcPctReportedFcf.toFixed(1)}% of Reported FCF (${latest.sbcPctRevenue.toFixed(1)}% of revenue)`,
      summary: `In ${latest.fiscalYear}, ${company.name} generated $${(latest.reportedFcf / 1000).toFixed(2)}B in Reported FCF against $${(latest.sbc / 1000).toFixed(2)}B in Stock-Based Compensation, yielding $${(latest.trueFcf / 1000).toFixed(2)}B in True FCF (${latest.trueFcfMargin.toFixed(1)}% margin).`,
      priorExcerpt: prev
        ? `${prev.fiscalYear} SEC 10-K: Reported FCF $${(prev.reportedFcf / 1000).toFixed(2)}B | SBC $${(prev.sbc / 1000).toFixed(2)}B (${prev.sbcPctRevenue.toFixed(1)}% of rev) | True FCF $${(prev.trueFcf / 1000).toFixed(2)}B.`
        : "Prior fiscal year baseline unavailable in XBRL window.",
      currentExcerpt: `${latest.fiscalYear} SEC 10-K: Reported FCF $${(latest.reportedFcf / 1000).toFixed(2)}B | SBC $${(latest.sbc / 1000).toFixed(2)}B (${latest.sbcPctRevenue.toFixed(1)}% of rev) | True FCF $${(latest.trueFcf / 1000).toFixed(2)}B.`,
      signalNote:
        latest.sbcPctRevenue > 12
          ? "High SBC intensity materially widens the gap between headline FCF and owner earnings."
          : "Disciplined SBC load keeps True FCF closely aligned with reported cash flow.",
    },
    {
      id: `${company.ticker.toLowerCase()}-xbrl-dilution`,
      filingType: "10-K",
      filingDate: company.lastFiling.date,
      accessionNumber: company.lastFiling.accessionNumber,
      section: "XBRL Equity & Cash Flow: Dilution vs. Buybacks",
      category: "Capital Allocation",
      materiality: capAllocMateriality,
      headline:
        dilutionCagr < -0.5
          ? `Share count shrank ${Math.abs(dilutionCagr).toFixed(1)}%/yr over ${company.annuals.length - 1} years`
          : dilutionCagr > 0.8
            ? `Diluted shares expanded +${dilutionCagr.toFixed(1)}%/yr despite cash generation`
            : `Diluted share count held flat (${dilutionCagr >= 0 ? "+" : ""}${dilutionCagr.toFixed(1)}%/yr)`,
      summary: `Weighted-average diluted shares moved from ${company.annuals[0].dilutedShares.toLocaleString()}M in ${company.annuals[0].fiscalYear} to ${latest.dilutedShares.toLocaleString()}M in ${latest.fiscalYear}, with $${(latest.buybacks / 1000).toFixed(2)}B deployed into share repurchases in the latest fiscal year.`,
      priorExcerpt: `${company.annuals[0].fiscalYear} 10-K: ${company.annuals[0].dilutedShares.toLocaleString()}M diluted shares | CapEx $${(company.annuals[0].capex / 1000).toFixed(2)}B.`,
      currentExcerpt: `${latest.fiscalYear} 10-K: ${latest.dilutedShares.toLocaleString()}M diluted shares | CapEx $${(latest.capex / 1000).toFixed(2)}B | Buybacks $${(latest.buybacks / 1000).toFixed(2)}B.`,
      signalNote:
        dilutionCagr < -0.5
          ? "Net share retirement provides a durable per-share FCF compounding tailwind."
          : dilutionCagr > 1.5
            ? "Persistent net dilution acts as a recurring tax on per-share intrinsic value."
            : "Buybacks roughly neutralize ongoing employee equity issuance.",
    },
  ];
}

async function resolveCandidates(): Promise<DirectoryCandidate[]> {
  console.log("[amber-ingest] Fetching official SEC EDGAR ticker directory...");
  const dir = await fetchSecJson<SecDirectoryResponse>(
    "https://www.sec.gov/files/company_tickers_exchange.json"
  );

  const byTicker = new Map<string, DirectoryCandidate>();
  const orderedAll: DirectoryCandidate[] = [];

  for (const [cikNum, rawName, rawTicker, rawExch] of dir.data) {
    if (!rawTicker || !rawExch) continue;
    if (rawExch !== "Nasdaq" && rawExch !== "NYSE") continue;
    const ticker = rawTicker.toUpperCase();
    // Skip preferred shares, warrants, units
    if (/[-/]|W$|U$|R$/.test(ticker) && !ticker.includes(".")) continue;
    if (byTicker.has(ticker)) continue;

    // Skip pure banks/insurers/REITs where GAAP OCF mixes customer deposits & loans
    if (
      !ALLOWLISTED_FINTECH.has(ticker) &&
      EXCLUDED_FINANCIAL_ENTITY_RE.test(rawName)
    ) {
      continue;
    }

    const candidate: DirectoryCandidate = {
      ticker,
      cik: CIK_OVERRIDES[ticker] ?? String(cikNum).padStart(10, "0"),
      name: cleanCompanyName(rawName),
      exchange: rawExch === "NYSE" ? "NYSE" : "NASDAQ",
    };
    byTicker.set(ticker, candidate);
    orderedAll.push(candidate);
  }

  const selected: DirectoryCandidate[] = [];
  const seen = new Set<string>();

  for (const t of PRIORITY_TICKERS) {
    const found = byTicker.get(t);
    if (found && !seen.has(found.ticker)) {
      selected.push(found);
      seen.add(found.ticker);
    }
  }

  for (const c of orderedAll) {
    if (selected.length >= UNIVERSE_LIMIT) break;
    if (!seen.has(c.ticker)) {
      selected.push(c);
      seen.add(c.ticker);
    }
  }

  return selected.slice(0, UNIVERSE_LIMIT);
}

export async function ingestCandidate(
  candidate: DirectoryCandidate,
  curatedMap: Map<string, CompanySnapshot>,
  existingMap: Map<string, CompanySnapshot>
): Promise<CompanySnapshot | null> {
  const curated = curatedMap.get(candidate.ticker);
  const existing = existingMap.get(candidate.ticker);
  const meta = CURATED_META[candidate.ticker];
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${candidate.cik}.json`;

  try {
    const facts = await fetchSecJson<CompanyFactsResponse>(url);

    const revMap = extractAnnualSeries(
      facts,
      [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "RevenuesNetOfInterestExpense",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "RegulatedAndUnregulatedOperatingRevenue",
        "OperatingRevenues",
        "Revenue",
      ],
      "USD"
    );
    const ocfMap = extractAnnualSeries(
      facts,
      [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        "CashFlowsFromUsedInOperatingActivities",
      ],
      "USD"
    );
    const capexMap = extractAnnualSeries(
      facts,
      [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireOtherPropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
        "PaymentsToAcquireOtherProductiveAssets",
        "PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets",
        "PaymentsToAcquireOilAndGasPropertyAndEquipment",
        "PaymentsToExploreAndDevelopOilAndGasProperties",
        "PaymentsToAcquireMachineryAndEquipment",
        "PaymentsForCapitalImprovements",
        "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
      ],
      "USD"
    );
    const sbcMap = extractAnnualSeries(
      facts,
      [
        "ShareBasedCompensation",
        "AllocatedShareBasedCompensationExpense",
        "ExpenseFromSharebasedPaymentTransactionsInWhichGoodsOrServicesReceivedDidNotQualifyForRecognitionAsAssets",
      ],
      "USD"
    );
    const buybackMap = extractAnnualSeries(
      facts,
      [
        "PaymentsForRepurchaseOfCommonStock",
        "PaymentsForRepurchaseOfEquity",
        "PurchaseOfTreasuryShares",
      ],
      "USD"
    );
    const sharesMap = extractAnnualSeries(
      facts,
      [
        "WeightedAverageNumberOfDilutedSharesOutstanding",
        "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
        "AdjustedWeightedAverageShares",
        "WeightedAverageShares",
        "WeightedAverageLimitedPartnershipUnitsOutstandingDiluted",
        "WeightedAverageNumberOfLimitedPartnershipAndGeneralPartnershipUnitOutstandingBasicAndDiluted",
        "WeightedAverageLimitedPartnershipUnitsOutstanding",
      ],
      "shares"
    );
    const instantSharesAnnualMap = extractAnnualSeries(
      facts,
      [
        "CommonStockSharesOutstanding",
        "EntityCommonStockSharesOutstanding",
        "NumberOfSharesOutstanding",
        "LimitedPartnersCapitalAccountUnitsOutstanding",
      ],
      "shares",
      false
    );
    const grossProfitMap = extractAnnualSeries(
      facts,
      ["GrossProfit"],
      "USD"
    );
    const rdMap = extractAnnualSeries(
      facts,
      [
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
      ],
      "USD"
    );
    const sgaMap = extractAnnualSeries(
      facts,
      [
        "SellingGeneralAndAdministrativeExpense",
        "GeneralAndAdministrativeExpense",
      ],
      "USD"
    );
    const opIncMap = extractAnnualSeries(
      facts,
      ["OperatingIncomeLoss"],
      "USD"
    );
    const netIncMap = extractAnnualSeries(
      facts,
      ["NetIncomeLoss"],
      "USD"
    );
    const equityMap = extractAnnualSeries(
      facts,
      ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
      "USD",
      false
    );
    const annualCashMap = extractAnnualSeries(
      facts,
      [
        "CashCashEquivalentsAndShortTermInvestments",
        "CashAndCashEquivalentsAtCarryingValue",
      ],
      "USD",
      false
    );
    const annualDebtMap = extractAnnualSeries(
      facts,
      [
        "LongTermDebtAndCapitalLeaseObligations",
        "DebtAndCapitalLeaseObligations",
        "LongTermDebt",
        "LongTermDebtNoncurrent",
      ],
      "USD",
      false
    );

    const years = [...revMap.keys()]
      .filter((y) => ocfMap.has(y))
      .sort()
      .slice(-5);

    if (years.length < 3) {
      if (curated) return curated;
      return null;
    }

    // Only accept recent (>=2024) instant share counts so stale 2010 DEI tags never overwrite modern diluted shares
    const gaapShares =
      facts.facts?.["us-gaap"]?.["WeightedAverageNumberOfDilutedSharesOutstanding"]?.units?.shares
        ?.filter((e) => (e.form === "10-Q" || e.form === "10-K") && e.end >= "2024-01-01")
        ?.sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))?.[0]?.val ?? 0;

    const recentDeiShares =
      facts.facts?.["dei"]?.["EntityCommonStockSharesOutstanding"]?.units?.shares
        ?.filter((e) => e.end >= "2024-01-01" && e.val > 0)
        ?.sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))?.[0]?.val ?? 0;

    const latestSharesInstant =
      gaapShares > 0
        ? gaapShares
        : recentDeiShares > 0
          ? recentDeiShares
          : extractLatestInstant(
              facts,
              [
                "CommonStockSharesOutstanding",
                "NumberOfSharesOutstanding",
                "LimitedPartnersCapitalAccountUnitsOutstanding",
              ],
              "shares"
            );

    const isBankEarningsOcf = BANK_EARNINGS_OCF_TICKERS.has(candidate.ticker);

    const annuals: AnnualFinancials[] = years.map((yr) => {
      const rev = (revMap.get(yr)?.val ?? 0) / 1e6;
      const rawOcf = (ocfMap.get(yr)?.val ?? 0) / 1e6;
      const capex = Math.abs(capexMap.get(yr)?.val ?? 0) / 1e6;
      const sbc = Math.abs(sbcMap.get(yr)?.val ?? 0) / 1e6;
      const buybacks = Math.abs(buybackMap.get(yr)?.val ?? 0) / 1e6;
      const rawShares =
        sharesMap.get(yr)?.val ??
        instantSharesAnnualMap.get(yr)?.val ??
        (latestSharesInstant > 0 ? latestSharesInstant : 0);

      const gpVal = grossProfitMap.get(yr)?.val;
      const rdVal = rdMap.get(yr)?.val;
      const sgaVal = sgaMap.get(yr)?.val;
      const opVal = opIncMap.get(yr)?.val;
      const niVal = netIncMap.get(yr)?.val;
      const eqVal = equityMap.get(yr)?.val;
      const cashYrVal = annualCashMap.get(yr)?.val;
      const debtYrVal = annualDebtMap.get(yr)?.val;
      const periodEndDate = revMap.get(yr)?.end ?? ocfMap.get(yr)?.end ?? null;

      // For bank holding companies where GAAP OCF mixes customer loan/trading inventory changes,
      // normalize operating cash flow to Distributable Cash Earnings (Net Income + SBC + CapEx).
      const ocf =
        isBankEarningsOcf && niVal !== undefined
          ? niVal / 1e6 + sbc + capex
          : rawOcf;

      return {
        fiscalYear: `FY${yr.slice(2)}`,
        revenue: Math.round(rev),
        operatingCashFlow: Math.round(ocf),
        capex: Math.round(capex),
        sbc: Math.round(sbc),
        buybacks: Math.round(buybacks),
        dilutedShares: normalizeShareCountToMillions(rawShares, candidate.ticker),
        grossProfit: gpVal !== undefined ? Math.round(gpVal / 1e6) : null,
        rdExpense: rdVal !== undefined ? Math.round(Math.abs(rdVal) / 1e6) : null,
        sgaExpense: sgaVal !== undefined ? Math.round(Math.abs(sgaVal) / 1e6) : null,
        operatingIncome: opVal !== undefined ? Math.round(opVal / 1e6) : null,
        netIncome: niVal !== undefined ? Math.round(niVal / 1e6) : null,
        stockholdersEquity: eqVal !== undefined ? Math.round(eqVal / 1e6) : null,
        periodEndDate,
        cashAndEquiv: cashYrVal !== undefined ? Math.round(cashYrVal / 1e6) : null,
        totalDebt: debtYrVal !== undefined ? Math.round(debtYrVal / 1e6) : null,
      };
    });

    const latestAnnual = annuals[annuals.length - 1];
    if (latestAnnual.revenue <= 0) return curated ?? null;

    const latestYearKey = years[years.length - 1];
    const latestMeta = revMap.get(latestYearKey) ?? ocfMap.get(latestYearKey)!;

    // Reject stale USD filings where the latest annual period ended prior to 2023
    if (latestMeta.end < "2023-01-01") {
      return curated ?? null;
    }

    // Attempt to compute Trailing Twelve Months (TTM) from newer 10-Q filings
    let lastFilingType: "10-K" | "10-Q" = "10-K";
    let lastFilingDate = latestMeta.filed;
    let lastFilingPeriodEnd = latestMeta.end;
    let lastFilingAccession = latestMeta.accn;

    const revQ = extractLatest10QYtdPair(
      facts,
      [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
      ],
      "USD",
      latestMeta.end
    );
    const ocfQ = extractLatest10QYtdPair(
      facts,
      [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
      ],
      "USD",
      latestMeta.end
    );

    if (revQ && ocfQ && revQ.end === ocfQ.end) {
      const capexQ = extractLatest10QYtdPair(
        facts,
        [
          "PaymentsToAcquirePropertyPlantAndEquipment",
          "PaymentsToAcquireOtherPropertyPlantAndEquipment",
          "PaymentsToAcquireProductiveAssets",
          "PaymentsToAcquireOtherProductiveAssets",
          "PaymentsToExploreAndDevelopOilAndGasProperties",
        ],
        "USD",
        latestMeta.end
      );
      const sbcQ = extractLatest10QYtdPair(
        facts,
        ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
        "USD",
        latestMeta.end
      );
      const buybackQ = extractLatest10QYtdPair(
        facts,
        ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"],
        "USD",
        latestMeta.end
      );

      const ttmRev = Math.round(
        latestAnnual.revenue + (revQ.currentVal - revQ.priorVal) / 1e6
      );
      const ttmOcf = Math.round(
        latestAnnual.operatingCashFlow + (ocfQ.currentVal - ocfQ.priorVal) / 1e6
      );
      const ttmCapex = Math.max(
        0,
        Math.round(
          latestAnnual.capex +
            (capexQ ? (Math.abs(capexQ.currentVal) - Math.abs(capexQ.priorVal)) / 1e6 : 0)
        )
      );
      const ttmSbc = Math.max(
        0,
        Math.round(
          latestAnnual.sbc +
            (sbcQ ? (Math.abs(sbcQ.currentVal) - Math.abs(sbcQ.priorVal)) / 1e6 : 0)
        )
      );
      const ttmBuybacks = Math.max(
        0,
        Math.round(
          latestAnnual.buybacks +
            (buybackQ
              ? (Math.abs(buybackQ.currentVal) - Math.abs(buybackQ.priorVal)) / 1e6
              : 0)
        )
      );

      if (ttmRev > 0 && !isBankEarningsOcf) {
        annuals.push({
          fiscalYear: "TTM",
          revenue: ttmRev,
          operatingCashFlow: ttmOcf,
          capex: ttmCapex,
          sbc: ttmSbc,
          buybacks: ttmBuybacks,
          dilutedShares:
            latestSharesInstant > 0
              ? normalizeShareCountToMillions(latestSharesInstant, candidate.ticker)
              : latestAnnual.dilutedShares,
        });
        lastFilingType = "10-Q";
        lastFilingDate = revQ.filed;
        lastFilingPeriodEnd = revQ.end;
        lastFilingAccession = revQ.accn;
      }
    }

    // Avoid double-counting short-term investments when using the combined cash+ST-investments tag
    const cashOnly = extractLatestInstant(
      facts,
      ["CashAndCashEquivalentsAtCarryingValue"],
      "USD"
    );
    const cashCombined = extractLatestInstant(
      facts,
      ["CashCashEquivalentsAndShortTermInvestments"],
      "USD"
    );
    const stInvestments = extractLatestInstant(
      facts,
      ["MarketableSecuritiesCurrent", "ShortTermInvestments"],
      "USD"
    );
    const cashRaw =
      cashCombined > 0
        ? Math.max(cashCombined, cashOnly + stInvestments)
        : cashOnly + stInvestments;

    // Avoid double-counting current debt when using a combined total-debt tag
    const longTermNonCurrent = extractLatestInstant(
      facts,
      ["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
      "USD"
    );
    const totalDebtCombined = extractLatestInstant(
      facts,
      ["DebtAndCapitalLeaseObligations", "LongTermDebt"],
      "USD"
    );
    const currentDebt = extractLatestInstant(
      facts,
      ["LongTermDebtCurrent", "ShortTermBorrowings", "DebtCurrent"],
      "USD"
    );
    const debtRaw =
      longTermNonCurrent > 0
        ? longTermNonCurrent + currentDebt
        : totalDebtCombined > 0
          ? totalDebtCombined
          : currentDebt;

function extractSingleQuarterMap(
  facts: CompanyFactsResponse,
  tags: string[],
  unit: "USD" | "shares"
): Map<string, number> {
  const out = new Map<string, number>();
  const outFiled = new Map<string, string>();
  const gaap = facts.facts?.["us-gaap"];
  if (!gaap) return out;

  for (const tag of tags) {
    const entries = gaap[tag]?.units?.[unit];
    if (!entries) continue;

    // 1. Collect standalone ~90-day quarterly facts directly, preferring most recently filed (handles 10-Q/A)
    for (const e of entries) {
      if ((e.form !== "10-Q" && e.form !== "10-Q/A") || !e.start || !e.end) continue;
      const days =
        (Date.parse(e.end) - Date.parse(e.start)) / (1000 * 60 * 60 * 24);
      if (days >= 70 && days <= 110 && Number.isFinite(e.val)) {
        const prevFiled = outFiled.get(e.end);
        if (!prevFiled || e.filed > prevFiled) {
          out.set(e.end, e.val);
          outFiled.set(e.end, e.filed);
        }
      }
    }

    // 2. For cash-flow items reported only as YTD cumulative (e.g. 6M/9M), differencing consecutive YTDs yields standalone quarters
    if (out.size < 4) {
      const ytdByStart = new Map<string, Array<{ end: string; days: number; val: number }>>();
      for (const e of entries) {
        if ((e.form !== "10-Q" && e.form !== "10-Q/A") || !e.start || !e.end) continue;
        const days =
          (Date.parse(e.end) - Date.parse(e.start)) / (1000 * 60 * 60 * 24);
        if (days >= 70 && days <= 300 && Number.isFinite(e.val)) {
          const list = ytdByStart.get(e.start) ?? [];
          if (!list.some((x) => x.end === e.end)) {
            list.push({ end: e.end, days, val: e.val });
          }
          ytdByStart.set(e.start, list);
        }
      }
      for (const list of ytdByStart.values()) {
        list.sort((a, b) => a.days - b.days);
        for (let i = 0; i < list.length; i++) {
          const cur = list[i];
          if (out.has(cur.end)) continue;
          if (cur.days <= 110) {
            out.set(cur.end, cur.val);
          } else if (i > 0 && cur.days - list[i - 1].days >= 65 && cur.days - list[i - 1].days <= 115) {
            out.set(cur.end, cur.val - list[i - 1].val);
          }
        }
      }
    }
    if (out.size >= 6) break;
  }
  return out;
}

function formatQuarterLabel(isoEnd: string): string {
  const yr = isoEnd.slice(2, 4);
  const mo = Number(isoEnd.slice(5, 7));
  const q = Math.min(4, Math.max(1, Math.ceil(mo / 3)));
  return `${yr}Q${q}`;
}

function extractQuarterlySeries(
  facts: CompanyFactsResponse,
  fallbackShares: number,
  ticker: string
): AnnualFinancials[] {
  const revMap = extractSingleQuarterMap(
    facts,
    [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
      "SalesRevenueNet",
      "RevenueFromContractWithCustomerIncludingAssessedTax",
    ],
    "USD"
  );
  if (revMap.size < 4) return [];

  const ocfMap = extractSingleQuarterMap(
    facts,
    [
      "NetCashProvidedByUsedInOperatingActivities",
      "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
    "USD"
  );
  const capexMap = extractSingleQuarterMap(
    facts,
    [
      "PaymentsToAcquirePropertyPlantAndEquipment",
      "PaymentsToAcquireProductiveAssets",
      "CapitalExpendituresIncurredButNotYetPaid",
    ],
    "USD"
  );
  const sbcMap = extractSingleQuarterMap(
    facts,
    ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
    "USD"
  );
  const buybackMap = extractSingleQuarterMap(
    facts,
    ["PaymentsForRepurchaseOfCommonStock"],
    "USD"
  );
  const shareMap = extractSingleQuarterMap(
    facts,
    ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    "shares"
  );

  const endDates = [...revMap.keys()]
    .filter((d) => (revMap.get(d) ?? 0) > 0 && ocfMap.has(d))
    .sort()
    .slice(-8);

  if (endDates.length < 4) return [];

  const rawQuarters: AnnualFinancials[] = endDates.map((d) => ({
    fiscalYear: formatQuarterLabel(d),
    revenue: Math.round((revMap.get(d) ?? 0) / 1e6),
    operatingCashFlow: Math.round((ocfMap.get(d) ?? 0) / 1e6),
    capex: Math.round(Math.abs(capexMap.get(d) ?? 0) / 1e6),
    sbc: Math.round(Math.abs(sbcMap.get(d) ?? 0) / 1e6),
    buybacks: Math.round(Math.abs(buybackMap.get(d) ?? 0) / 1e6),
    dilutedShares: shareMap.has(d)
      ? normalizeShareCountToMillions(shareMap.get(d) ?? 0, ticker)
      : fallbackShares,
  }));

  return normalizeStockSplits(rawQuarters);
}

    // Normalize stock splits retroactively so Dilution (4Y) is never distorted by 5:1 / 10:1 / 50:1 splits
    const normalizedAnnuals = normalizeStockSplits(annuals);

    const computed = computeAnnualMetrics(normalizedAnnuals);
    const latestComputed = computed[computed.length - 1];

    // Strict XBRL sanity guardrail: reject anomalous unit mismatches unless curated
    if (
      !curated &&
      (latestComputed.revenue < 200 ||
        latestComputed.trueFcfMargin > 80 ||
        latestComputed.trueFcfMargin < -120 ||
        latestComputed.sbcPctRevenue > 90)
    ) {
      return null;
    }

    const dilutionCagr = computeNetDilutionCagr(normalizedAnnuals);

    // Never invent a synthetic $100 price; leave 0 for sync-prices.ts to populate
    const price = existing?.price ?? meta?.fallbackPrice ?? 0;
    const marketCap = price > 0 ? Math.round(price * latestComputed.dilutedShares) : 0;

    const defaultDcf =
      curated?.defaultDcf ?? computeGroundedDefaultDcf(normalizedAnnuals);

    const baseSnapshot: Omit<CompanySnapshot, "filingDiffs"> = {
      ticker: candidate.ticker,
      cik: candidate.cik,
      name: cleanCompanyName(curated?.name ?? candidate.name),
      exchange: candidate.exchange,
      sector: meta?.sector ?? inferSector(candidate.name, candidate.ticker),
      tagline:
        meta?.tagline ??
        curated?.tagline ??
        buildAutoTagline(
          latestComputed.trueFcfMargin,
          latestComputed.sbcPctRevenue,
          dilutionCagr
        ),
      price,
      marketCap,
      cashAndEquiv: Math.round(cashRaw / 1e6),
      totalDebt: Math.round(debtRaw / 1e6),
      lastFiling: {
        type: lastFilingType,
        date: lastFilingDate,
        periodEnd: lastFilingPeriodEnd,
        accessionNumber: lastFilingAccession,
      },
      annuals: normalizedAnnuals,
      quarterlyFinancials: extractQuarterlySeries(
        facts,
        latestComputed.dilutedShares,
        candidate.ticker
      ),
      defaultDcf,
    };

    // Preserve any existing text-diffs or curated diffs, supplemented with XBRL diffs
    const preservedTextDiffs = (existing?.filingDiffs ?? []).filter(
      (d) => d.id.includes("-10k-diff-") || d.id.includes("-llm-")
    );
    const baseDiffs = curated?.filingDiffs ?? generateDeterministicDiffs(baseSnapshot);
    const seenIds = new Set(preservedTextDiffs.map((d) => d.id));
    const filingDiffs = [
      ...preservedTextDiffs,
      ...baseDiffs.filter((d) => !seenIds.has(d.id)),
    ];

    return {
      ...baseSnapshot,
      filingDiffs,
    };
  } catch {
    return curated ?? null;
  }
}

async function run() {
  const outDir = path.resolve(process.cwd(), "src/data/generated");
  fs.mkdirSync(outDir, { recursive: true });
  const companiesPath = path.join(outDir, "companies.json");

  const existingList: CompanySnapshot[] = fs.existsSync(companiesPath)
    ? (JSON.parse(fs.readFileSync(companiesPath, "utf8")) as CompanySnapshot[])
    : [];
  const existingMap = new Map(existingList.map((c) => [c.ticker, c]));
  const curatedMap = new Map(PILOT_TICKERS.map((c) => [c.ticker, c]));

  const candidates = await resolveCandidates();
  console.log(
    `[amber-ingest] Ingesting live SEC EDGAR 10-K XBRL for ${candidates.length} candidates...`
  );

  const companies: CompanySnapshot[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const snap = await ingestCandidate(c, curatedMap, existingMap);
    if (snap) {
      companies.push(snap);
      if (companies.length % 20 === 0 || i === candidates.length - 1) {
        console.log(
          `[amber-ingest] Progress: ${i + 1}/${candidates.length} checked | ${companies.length} SEC-verified companies`
        );
      }
    }
    // Respect SEC EDGAR fair-access limit (<10 req/sec)
    await new Promise((r) => setTimeout(r, 140));
  }

  // Guarantee every flagship pilot ticker (e.g. PLTR, SNOW, SHOP) is present even if directory lookup missed it
  const presentTickers = new Set(companies.map((c) => c.ticker));
  for (const pilot of PILOT_TICKERS) {
    if (!presentTickers.has(pilot.ticker)) {
      companies.push(pilot);
    }
  }

  const searchIndex = companies.map((c) => {
    const computed = computeAnnualMetrics(c.annuals);
    const latest = computed[computed.length - 1];
    const ev = computeEnterpriseValue(c);
    const dilution = computeNetDilutionCagr(c.annuals);
    const dcf = solveReverseDcf({
      enterpriseValue: ev,
      baseRevenue: latest.revenue,
      waccPct: c.defaultDcf.wacc,
      terminalMultiple: c.defaultDcf.terminalMultiple,
      targetTrueFcfMarginPct: Math.max(
        1.5,
        c.defaultDcf.targetFcfMargin - c.defaultDcf.sbcDragPct
      ),
      currentTrueFcfMarginPct: latest.trueFcfMargin,
    });

    return {
      ticker: c.ticker,
      name: c.name,
      exchange: c.exchange,
      sector: c.sector,
      marketCap: c.marketCap,
      revenue: latest.revenue,
      reportedFcf: latest.reportedFcf,
      sbc: latest.sbc,
      trueFcf: latest.trueFcf,
      trueFcfMargin: Number(latest.trueFcfMargin.toFixed(1)),
      sbcPctRevenue: Number(latest.sbcPctRevenue.toFixed(1)),
      sbcPctReportedFcf: Number(latest.sbcPctReportedFcf.toFixed(1)),
      netDilutionCagr: Number(dilution.toFixed(2)),
      impliedCagr: Number(dcf.impliedRevenueCagrPct.toFixed(1)),
      lastFilingDate: c.lastFiling.date,
    };
  });

  fs.writeFileSync(companiesPath, JSON.stringify(companies, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outDir, "search-index.json"),
    JSON.stringify(searchIndex, null, 2) + "\n"
  );

  console.log(
    `[amber-ingest] ✓ Wrote ${companies.length} SEC-verified companies to src/data/generated/.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
