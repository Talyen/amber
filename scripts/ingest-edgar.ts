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
import { pathToFileURL } from "node:url";
import { buildSearchIndexEntry } from "../src/data/search-index.ts";
import { PILOT_TICKERS } from "../src/data/pilot-tickers.ts";
import {
  type AnnualFinancials,
  type CompanySnapshot,
  type FilingDiffItem,
  computeAnnualMetrics,
  computeGroundedDefaultDcf,
  computeNetDilutionCagr,
} from "../src/lib/finance.ts";

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "AmberFinance research@amber.example";
const UNIVERSE_LIMIT = Number(process.env.UNIVERSE_LIMIT ?? "125");
const SEC_REQUEST_SPACING_MS = 140;

export type EdgarSnapshot = CompanySnapshot & { edgarFallback?: true };
type PeriodicFiling = CompanySnapshot["lastFiling"];

function fallbackSnapshot(existing?: CompanySnapshot, curated?: CompanySnapshot): EdgarSnapshot | null {
  const snapshot = existing && (!curated || existing.lastFiling.date >= curated.lastFiling.date)
    ? existing
    : curated;
  return snapshot ? { ...snapshot, edgarFallback: true } : null;
}

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

interface SecRecentFilings {
  form: string[];
  filingDate: string[];
  reportDate: string[];
  accessionNumber: string[];
}

async function fetchLatestPeriodicFiling(cik: string, fallback: PeriodicFiling): Promise<PeriodicFiling> {
  // Submissions supplies filing metadata even when usable XBRL facts arrive later.
  await new Promise((resolve) => setTimeout(resolve, SEC_REQUEST_SPACING_MS));
  try {
    const { filings } = await fetchSecJson<{ filings?: { recent?: SecRecentFilings } }>(
      `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`,
      1
    );
    const recent = filings?.recent;
    if (!recent) return fallback;

    let latest: PeriodicFiling | undefined;
    for (const [index, form] of recent.form.entries()) {
      if (!/^(10-[KQ]|20-F|40-F)(\/A)?$/.test(form)) continue;
      const date = recent.filingDate[index];
      const periodEnd = recent.reportDate[index];
      const accessionNumber = recent.accessionNumber[index];
      if (!date || !periodEnd || !accessionNumber) continue;
      if (latest && (date < latest.date || (date === latest.date && periodEnd <= latest.periodEnd))) continue;
      latest = { type: form.startsWith("10-Q") ? "10-Q" : "10-K", date, periodEnd, accessionNumber };
    }
    return latest && (
      latest.date > fallback.date ||
      (latest.date === fallback.date && latest.periodEnd >= fallback.periodEnd)
    ) ? latest : fallback;
  } catch {
    return fallback;
  }
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

interface YtdWindow {
  start: string;
  end: string;
  priorStart: string;
  priorEnd: string;
}

interface YtdPair {
  window: YtdWindow;
  currentVal: number;
  priorVal: number;
  filing: PeriodicFiling;
}

/** TTM uses the latest FY plus the difference between matching YTD windows. */
function extract10QYtdPair(
  facts: CompanyFactsResponse,
  tagCandidates: string[],
  latestFyEnd: string,
  window?: YtdWindow
): YtdPair | null {
  const gaap = facts.facts?.["us-gaap"];
  if (!gaap) return null;

  for (const tag of tagCandidates) {
    const entries = gaap[tag]?.units?.USD;
    if (!entries?.length) continue;

    const current = entries.filter((fact): fact is XbrlFactUnit & { start: string } =>
      (fact.form === "10-Q" || fact.form === "10-Q/A") &&
      !!fact.start &&
      (window
        ? fact.start === window.start && fact.end === window.end
        : daysBetween(latestFyEnd, fact.start) === 1 &&
          daysBetween(fact.start, fact.end) >= 70 &&
          daysBetween(fact.start, fact.end) <= 300)
    ).sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0];
    if (!current) continue;

    const span = daysBetween(current.start, current.end);
    const prior = entries.filter((fact): fact is XbrlFactUnit & { start: string } => {
      if (!fact.start) return false;
      if (window) return fact.start === window.priorStart && fact.end === window.priorEnd;
      const endDelta = daysBetween(fact.end, current.end);
      return endDelta >= 345 && endDelta <= 385 &&
        Math.abs(daysBetween(fact.start, fact.end) - span) <= 15;
    }).sort((a, b) =>
      Number(b.accn === current.accn) - Number(a.accn === current.accn) ||
      b.filed.localeCompare(a.filed)
    )[0];
    if (!prior) continue;

    return {
      window: { start: current.start, end: current.end, priorStart: prior.start, priorEnd: prior.end },
      currentVal: current.val,
      priorVal: prior.val,
      filing: { type: "10-Q", date: current.filed, periodEnd: current.end, accessionNumber: current.accn },
    };
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
  if (/semiconductor|micro|nvidia|broadcom|qualcomm|analog|applied mat|lam research|kla|synopsys|cadence|intel|sandisk|western digital|micron|marvell|monolithic|nxp|on semi|texas instruments|arista|arm holdings|asml|taiwan semi|united micro|ase technology|skyworks|qorvo|entegris|ambarella|credo|astera|sitime|nova ltd|tower semi|lattice|silicon lab|cirrus|macom|coherent|ontu|teradyne|amkor|axcelis|lumentum|keysight|amphenol|te connectivity|seagate|super micro|smci|flex ltd|jabil/.test(n)) return "Semiconductors";
  if (/software|cloud|data|cyber|security|crowdstrike|palo alto|zscaler|okta|workday|servicenow|salesforce|adobe|intuit|autodesk|atlassian|hubspot|mongodb|confluent|gitlab|snowflake|palantir|datadog|cloudflare|fortinet|applovin|trade desk|veeva|docusign|twilio|samsara|duolingo|roblox|spotify|oracle|microsoft|shopify|cisco|ibm|international business machines|check point|elastic|monday\.com|jfrog|rubrik|nutanix|bill holdings|guidewire|manhattan assoc|ansys|bentley|dynatrace|ui path|procore|appfolio|sentinelone|cyberark|qualys|tenable|rapid7|box|dropbox|zoom|ringcentral|five9|smartsheet|freshworks|klaviyo|braze|git|hashicorp|c3\.ai|tempus ai|accenture|cognizant|gartner|epamsystems|globant|infosys|wipro|genpact|hewlett packard|motorola solutions|roper tech|axon enterprise|verisign|akamai|f5 inc|netapp|pure storage|zebra tech|trimble|tyler tech|ptc inc|fair isaac|go daddy|godaddy|wix\.com/.test(n)) return "Cloud & Software";
  if (/pharma|therapeutics|biotech|lilly|health|medical|surgical|abbott|amgen|gilead|merck|abbvie|johnson & johnson|danaher|thermo|pfizer|bristol|vertex|regeneron|stryker|medtronic|boston scientific|edwards|hca|unitedhealth|elevance|cigna|cvs|mckesson|cencora|cardinal|humana|agilent|iqvia|dexcom|intuitive|idxx|zoetis|astrazeneca|sanofi|novartis|novo nordisk|gsk|teva|genmab|beone|moderna|biontech|alcon|resmed|illumina|waters|mettler|steris|hologic|align|insulet|coopercos|teleflex|zimmer|baxter|bd |becton|labcorp|quest diag|icon plc|charles river|exact sciences|natera|guardant|insmed|halozyme|neurocrine|alnylam|biomarin|incyte|royalty pharma|jazz pharma|roivant|crispr|tg therapeutics|glaukos|encompass|tenet|universal health|davita|molina|centene|hims|medline|west pharma|revvity|bio-rad|bio-techne|henry schein|chemed|acadia health|penumbra|shockwave|masimo|globus medical|liva nova/.test(n)) return "Healthcare";
  if (/visa|mastercard|paypal|sp global|s&p global|moody|msci|fico|fair isaac|coinbase|robinhood|verisk|fiserv|fidelity national|paychex|automatic data|global payments|block, inc|mercado|jpmorgan|goldman sachs|morgan stanley|bank of america|wells fargo|american express|blackstone|kkr|blackrock|apollo|ares |blue owl|carlyle|tpg |invesco|franklin res|t\. rowe|sei invest|interactive brokers|charles schwab|lpl financial|cboe|nasdaq|intercontinental exchange|cme group|tradeweb|marketaxess|factset|morningstar|broadridge|jack henry|shift4|toast|affirm|sofi|nu holdings|erie indemnity|ryan specialty|everest group|ameriprise|thomson reuters|equifax|transunion|dun & bradstreet|wex inc|corpay|fleetcor|remitly|pagseguro|stoneco|dlocal|xp inc|stifel|raymond james|jefferies|evercore|lazard|houlihan|moelis|perella/.test(n)) return "Fintech & Data";
  if (/retail|costco|walmart|home depot|lowe|tjx|autozone|o'reilly|o reilly|starbucks|mcdonald|chipotle|nike|procter|coca-cola|coca cola|pepsi|altria|philip morris|mondelez|colgate|kimberly|general mills|hershey|monster bev|celsius|target|ross stores|dollar|kroger|amazon|alibaba|pdd holdings|jd\.com|coupang|booking|airbnb|uber|doordash|marriott|hilton|hyatt|intercontinental hotels|h world|trip\.com|expedia|royal caribbean|carnival|norwegian cruise|yum!|domino|restaurant brands|darden|texas roadhouse|wingstop|cava|shake shack|dutch bros|lululemon|deckers|on holding|skechers|crocs|tapestry|ralph lauren|pvh|vf corp|levi|burlington|abercrombie|gap|bath & body|ulta|e\.l\.f\.|estee lauder|coty|constellation brands|diageo|anheuser|molson|brown-forman|boston beer|keurig|kraft heinz|campbell|conagra|jm smucker|mccormick|hormel|tyson|jbs|sysco|us foods|performance food|sprouts|albertsons|casey's|tractor supply|best buy|dick's|williams-sonoma|rh |wayfair|etsy|ebay|chewy|carvana|carmax|autonation|penske|lithia|tesla|rivian|lucid|ferrari|general motors|ford motor|toyota|honda|stellantis|harley|polaris|draftkings|flutter|wynn|las vegas sands|mgm resorts|caesars|churchill downs|mattel|hasbro|peloton|garmin|apple|dell tech|hp inc|logitech|sonos|clorox|church & dwight|lamb weston|post holdings|bellring|simply good|freshpet|five below|ollie's|floor & decor|boot barn|academy sports|signet|pool corp|brunswick|thor ind|winnebago/.test(n)) return "Consumer & Retail";
  if (/energy|petroleum|oil|gas|pipeline|midstream|exxon|chevron|conocophillips|eog |eqt |schlumberger|slb|halliburton|baker hughes|technipfmc|phillips 66|marathon|valero|pbf energy|hf sinclair|occidental|devon|diamondback|coterra|ovintiv|apa |permian|chord|matador|range res|antero|chesapeake|expand energy|texas pacific land|williams cos|williams companies|kinder morgan|oneok|targa|cheniere|mplx|plains all|western midstream|enterprise prod|energy transfer|enbridge|tc energy|hess|shell|bp plc|totalenergies|equinor|petrobras|suncor|canadian natural|cenovus|imperial oil|cameco|nextera|duke energy|southern co|dominion|constellation energy|vistra|ge vernova|nrg energy|talen|pg&e|edison|exelon|sempra|american electric|xcel|consolidated edison|public service|wec energy|dte energy|entergy|firstenergy|ppl corp|ameren|cms energy|centerpoint|atmos|nisource|evergy|allient|alliant|pinnacle west|aes corp|brookfield renewable|clearway|ormad|ormat|first solar|enphase|american water|essential utilities|dt midstream|hess midstream|anteromidstream/.test(n)) return "Energy & Utilities";
  if (/media|telecom|communications|netflix|disney|comcast|t-mobile|verizon|at&t|charter|liberty|warner|fox |paramount|new york times|news corp|omnigroup|omnicom|interpublic|wpp|live nation|tko group|electronic arts|take-two|unity|alphabet|meta platforms|pinterest|snap|reddit|roku|zillow|costar|iac|match group|bumble|yandex|baidu|netease|tencent|chunghwa|america movil|vodafone|telefonica|bce|rogers|telus|fubo|sirius|nexstar|tegna|sinclair|gray television|sba comm|iridium|viasat|echo star|echostar/.test(n)) return "Media & Telecom";
  return "Industrials & Materials";
}

function buildAutoTagline(
  trueFcfMargin: number,
  sbcPctRevenue: number,
  dilutionCagr: number
): string {
  if (dilutionCagr < -1.5 && trueFcfMargin >= 15) {
    return `High-margin cash generator (${trueFcfMargin.toFixed(1)}% FCF margin) shrinking share count ${dilutionCagr.toFixed(1)}%/yr`;
  }
  if (trueFcfMargin >= 25) {
    return `Elite ${trueFcfMargin.toFixed(1)}% real cash margin backed by SEC EDGAR filings`;
  }
  if (trueFcfMargin < 0 && sbcPctRevenue > 15) {
    return `Headline cash flow turns negative after ${sbcPctRevenue.toFixed(1)}% stock-based compensation`;
  }
  if (dilutionCagr > 2.5) {
    return `Diluted share count expanding +${dilutionCagr.toFixed(1)}%/yr — growth must outrun dilution`;
  }
  if (dilutionCagr < -1.5) {
    return `Consistent buybacks shrinking diluted shares ${dilutionCagr.toFixed(1)}%/yr`;
  }
  return `SEC-verified ${trueFcfMargin.toFixed(1)}% real FCF margin and ${dilutionCagr >= 0 ? "+" : ""}${dilutionCagr.toFixed(1)}%/yr share count trend`;
}

function generateDeterministicDiffs(
  company: Omit<CompanySnapshot, "filingDiffs">,
  financialFiling: PeriodicFiling
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
      filingType: financialFiling.type,
      filingDate: financialFiling.date,
      accessionNumber: financialFiling.accessionNumber,
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
      currentExcerpt: `${latest.fiscalYear} SEC ${financialFiling.type}: Reported FCF $${(latest.reportedFcf / 1000).toFixed(2)}B | SBC $${(latest.sbc / 1000).toFixed(2)}B (${latest.sbcPctRevenue.toFixed(1)}% of rev) | True FCF $${(latest.trueFcf / 1000).toFixed(2)}B.`,
      signalNote:
        latest.sbcPctRevenue > 12
          ? "High SBC intensity materially widens the gap between headline FCF and owner earnings."
          : "Disciplined SBC load keeps True FCF closely aligned with reported cash flow.",
    },
    {
      id: `${company.ticker.toLowerCase()}-xbrl-dilution`,
      filingType: financialFiling.type,
      filingDate: financialFiling.date,
      accessionNumber: financialFiling.accessionNumber,
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

export function extractSingleQuarterMap(
  facts: CompanyFactsResponse,
  tags: string[],
  unit: "USD" | "shares"
): Map<string, number> {
  const quarters = new Map<string, number>();
  const gaap = facts.facts?.["us-gaap"];
  if (!gaap) return quarters;

  const dayMs = 86_400_000;
  for (const tag of tags) {
    const entries = gaap[tag]?.units?.[unit] ?? [];
    const standalone = new Map<string, XbrlFactUnit>();
    const byStart = new Map<string, Map<string, XbrlFactUnit>>();

    for (const entry of entries) {
      if ((entry.form !== "10-Q" && entry.form !== "10-Q/A") || !entry.start) continue;
      const days = (Date.parse(entry.end) - Date.parse(entry.start)) / dayMs;
      if (!Number.isFinite(entry.val) || !(days >= 70 && days <= 300)) continue;

      if (days <= 110) {
        const previous = standalone.get(entry.end);
        if (!previous || entry.filed > previous.filed) standalone.set(entry.end, entry);
      }

      // A YTD share count is a weighted average. Subtracting two averages
      // does not give a standalone quarter's diluted share count.
      if (unit === "shares") continue;
      const byEnd = byStart.get(entry.start) ?? new Map<string, XbrlFactUnit>();
      const previous = byEnd.get(entry.end);
      if (!previous || entry.filed > previous.filed) byEnd.set(entry.end, entry);
      byStart.set(entry.start, byEnd);
    }

    const forTag = new Map([...standalone].map(([end, entry]) => [end, entry.val]));
    for (const byEnd of byStart.values()) {
      const periods = [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end));
      for (let i = 1; i < periods.length; i++) {
        const previous = periods[i - 1];
        const current = periods[i];
        if (forTag.has(current.end)) continue;
        const quarterDays = (Date.parse(current.end) - Date.parse(previous.end)) / dayMs;
        if (quarterDays >= 65 && quarterDays <= 115) {
          forTag.set(current.end, current.val - previous.val);
        }
      }
    }

    // Tags are ordered by preference. An alternate tag can fill a gap.
    for (const [end, value] of forTag) {
      if (!quarters.has(end)) quarters.set(end, value);
    }
  }

  return quarters;
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

export async function ingestCandidate(
  candidate: DirectoryCandidate,
  curatedMap: Map<string, CompanySnapshot>,
  existingMap: Map<string, CompanySnapshot>
): Promise<EdgarSnapshot | null> {
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
    const costOfRevMap = extractAnnualSeries(
      facts,
      [
        "CostOfGoodsAndServicesSold",
        "CostOfRevenue",
        "CostOfGoodsSold",
        "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
      ],
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
      return curated ? fallbackSnapshot(existing, curated) : null;
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

      const rawGpVal = grossProfitMap.get(yr)?.val;
      const corVal = costOfRevMap.get(yr)?.val;
      const gpVal =
        rawGpVal !== undefined
          ? rawGpVal
          : corVal !== undefined && revMap.get(yr)?.val !== undefined
            ? revMap.get(yr)!.val - Math.abs(corVal)
            : undefined;
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
    if (latestAnnual.revenue <= 0) return curated ? fallbackSnapshot(existing, curated) : null;

    const latestYearKey = years[years.length - 1];
    const latestMeta = revMap.get(latestYearKey) ?? ocfMap.get(latestYearKey)!;

    // Reject stale USD filings where the latest annual period ended prior to 2023
    if (latestMeta.end < "2023-01-01") {
      return curated ? fallbackSnapshot(existing, curated) : null;
    }

    let financialFiling: PeriodicFiling = {
      type: "10-K",
      date: latestMeta.filed,
      periodEnd: latestMeta.end,
      accessionNumber: latestMeta.accn,
    };

    const revQ = extract10QYtdPair(
      facts,
      [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
      ],
      latestMeta.end
    );

    if (revQ && !isBankEarningsOcf) {
      const getQuarterPair = (tags: string[]) =>
        extract10QYtdPair(facts, tags, latestMeta.end, revQ.window);
      const ocfQ = getQuarterPair([
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
      ]);
      const ttmRev = Math.round(
        latestAnnual.revenue + (revQ.currentVal - revQ.priorVal) / 1e6
      );

      if (ttmRev > 0 && ocfQ) {
        const capexQ = getQuarterPair([
          "PaymentsToAcquirePropertyPlantAndEquipment",
          "PaymentsToAcquireOtherPropertyPlantAndEquipment",
          "PaymentsToAcquireProductiveAssets",
          "PaymentsToAcquireOilAndGasProperties",
          "PaymentsToExploreAndDevelopOilAndGasProperties",
        ]);
        const sbcQ = getQuarterPair(["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"]);
        const buybackQ = getQuarterPair(["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"]);
        const ttmOcf = Math.round(
          latestAnnual.operatingCashFlow + (ocfQ.currentVal - ocfQ.priorVal) / 1e6
        );
        // Keep the annual baseline when a cost has no matching YTD comparison.
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

        const gpQ = getQuarterPair(["GrossProfit"]);
        const corQ = getQuarterPair([
          "CostOfGoodsAndServicesSold",
          "CostOfRevenue",
          "CostOfGoodsSold",
          "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization",
        ]);
        const opIncQ = getQuarterPair(["OperatingIncomeLoss"]);
        const netIncQ = getQuarterPair(["NetIncomeLoss"]);
        const rdQ = getQuarterPair(["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"]);
        const sgaQ = getQuarterPair(["SellingGeneralAndAdministrativeExpense", "GeneralAndAdministrativeExpense"]);

        const ttmGp =
          latestAnnual.grossProfit != null
            ? gpQ
              ? Math.round(latestAnnual.grossProfit + (gpQ.currentVal - gpQ.priorVal) / 1e6)
              : corQ
                ? Math.round(
                    ttmRev -
                      (latestAnnual.revenue -
                        latestAnnual.grossProfit +
                        (Math.abs(corQ.currentVal) - Math.abs(corQ.priorVal)) / 1e6)
                  )
                : null
            : null;
        const ttmOpInc =
          latestAnnual.operatingIncome != null && opIncQ
            ? Math.round(latestAnnual.operatingIncome + (opIncQ.currentVal - opIncQ.priorVal) / 1e6)
            : null;
        const ttmNetInc =
          latestAnnual.netIncome != null && netIncQ
            ? Math.round(latestAnnual.netIncome + (netIncQ.currentVal - netIncQ.priorVal) / 1e6)
            : null;
        const ttmRd =
          latestAnnual.rdExpense != null && rdQ
            ? Math.max(0, Math.round(latestAnnual.rdExpense + (Math.abs(rdQ.currentVal) - Math.abs(rdQ.priorVal)) / 1e6))
            : null;
        const ttmSga =
          latestAnnual.sgaExpense != null && sgaQ
            ? Math.max(0, Math.round(latestAnnual.sgaExpense + (Math.abs(sgaQ.currentVal) - Math.abs(sgaQ.priorVal)) / 1e6))
            : null;

        annuals.push({
          fiscalYear: "TTM",
          periodEndDate: revQ.window.end,
          revenue: ttmRev,
          operatingCashFlow: ttmOcf,
          capex: ttmCapex,
          sbc: ttmSbc,
          buybacks: ttmBuybacks,
          dilutedShares:
            latestSharesInstant > 0
              ? normalizeShareCountToMillions(latestSharesInstant, candidate.ticker)
              : latestAnnual.dilutedShares,
          grossProfit: ttmGp,
          rdExpense: ttmRd,
          sgaExpense: ttmSga,
          operatingIncome: ttmOpInc,
          netIncome: ttmNetInc,
        });
        financialFiling = revQ.filing;
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

    const lastFiling = await fetchLatestPeriodicFiling(candidate.cik, revQ?.filing ?? financialFiling);

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
      lastFiling,
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
    const baseDiffs = curated?.filingDiffs ?? generateDeterministicDiffs(baseSnapshot, financialFiling);
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
    return fallbackSnapshot(existing, curated);
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

  const companies: EdgarSnapshot[] = [];
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
    await new Promise((r) => setTimeout(r, SEC_REQUEST_SPACING_MS));
  }

  // Guarantee every flagship pilot ticker (e.g. PLTR, SNOW, SHOP) is present even if directory lookup missed it
  const presentTickers = new Set(companies.map((c) => c.ticker));
  for (const pilot of PILOT_TICKERS) {
    if (!presentTickers.has(pilot.ticker)) {
      companies.push(fallbackSnapshot(existingMap.get(pilot.ticker), pilot)!);
    }
  }

  const searchIndex = companies.map(buildSearchIndexEntry);

  fs.writeFileSync(companiesPath, JSON.stringify(companies, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outDir, "search-index.json"),
    JSON.stringify(searchIndex, null, 2) + "\n"
  );

  const universePath = process.env.AMBER_INGEST_UNIVERSE_PATH;
  if (universePath) {
    // Only a full directory selection can establish which tickers left the universe.
    const universe = candidates.length === UNIVERSE_LIMIT
      ? [...new Set([...candidates.map((candidate) => candidate.ticker), ...curatedMap.keys()])]
      : [];
    fs.writeFileSync(universePath, JSON.stringify(universe) + "\n");
  }

  console.log(
    `[amber-ingest] ✓ Wrote ${companies.length} SEC-verified companies to src/data/generated/.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
