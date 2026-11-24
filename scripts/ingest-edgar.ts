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
 *   pnpm ingest:edgar                    # Check 125 candidates
 *   UNIVERSE_LIMIT=900 pnpm ingest:edgar # Match scheduled coverage
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FILING_SUPPLEMENTS } from "./filing-supplements.ts";
import { writeCompanyData } from "./write-company-data.ts";
import { PILOT_TICKERS } from "../src/data/pilot-tickers.ts";
import {
  type AnnualFinancials,
  type CompanySnapshot,
  type FilingDiffItem,
  computeAnnualMetrics,
  computeGroundedDefaultDcf,
  computeNetDilutionCagr,
  periodicFilingType,
} from "../src/lib/finance.ts";

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "AmberFinance research@amber.example";
const UNIVERSE_LIMIT = Number(process.env.UNIVERSE_LIMIT ?? "125");
const SEC_REQUEST_SPACING_MS = 140;
const DAY_MS = 86_400_000;

export type EdgarSnapshot = CompanySnapshot & {
  edgarFallback?: true;
  marketCapShares?: number; // Listed-share equivalents, in millions
  sic?: number;
};
type PeriodicFiling = CompanySnapshot["lastFiling"];

function fallbackSnapshot(existing?: EdgarSnapshot, curated?: CompanySnapshot): EdgarSnapshot | null {
  const snapshot = existing && (!curated || existing.lastFiling.date >= curated.lastFiling.date)
    ? existing
    : curated;
  return snapshot ? { ...snapshot, edgarFallback: true } : null;
}

interface CuratedMeta {
  ticker: string;
  sector: string;
  tagline: string;
}

const CURATED_META: Record<string, CuratedMeta> = {
  PLTR: { ticker: "PLTR", sector: "Cloud & Software", tagline: "High-margin FCF inflection vs. persistent SBC & share count expansion" },
  NVDA: { ticker: "NVDA", sector: "Semiconductors", tagline: "Extraordinary cash conversion with rising hyperscaler concentration" },
  MSFT: { ticker: "MSFT", sector: "Cloud & Software", tagline: "AI datacenter CapEx surge compressing near-term FCF conversion" },
  SNOW: { ticker: "SNOW", sector: "Cloud & Software", tagline: "Classic SBC-to-FCF gap: strong headline cash flow vs. negative True FCF" },
  SHOP: { ticker: "SHOP", sector: "Cloud & Software", tagline: "Post-logistics operating leverage with disciplined SBC compression" },
  COST: { ticker: "COST", sector: "Consumer & Retail", tagline: "Ultra-clean cash flow and minimal SBC; stress-test the 50x+ valuation" },
  AAPL: { ticker: "AAPL", sector: "Consumer & Retail", tagline: "Massive buyback engine offsetting modest SBC with steady share retirement" },
  GOOGL: { ticker: "GOOGL", sector: "Media & Telecom", tagline: "Heavy AI CapEx cycle paired with $20B+ annual SBC and aggressive buybacks" },
  AMZN: { ticker: "AMZN", sector: "Consumer & Retail", tagline: "AWS operating leverage vs. massive logistics & AI infrastructure CapEx" },
  META: { ticker: "META", sector: "Media & Telecom", tagline: "Year-of-efficiency FCF surge funding record AI datacenter buildout" },
  ORCL: { ticker: "ORCL", sector: "Cloud & Software", tagline: "OCI backlog acceleration driving a sharp step-up in CapEx intensity" },
  AMD: { ticker: "AMD", sector: "Semiconductors", tagline: "Datacenter GPU ramp vs. rising R&D equity compensation" },
  AVGO: { ticker: "AVGO", sector: "Semiconductors", tagline: "VMware integration and custom AI ASICs driving elite FCF margins" },
  CRWD: { ticker: "CRWD", sector: "Cloud & Software", tagline: "Best-in-class headline FCF margin weighed against steep SBC expense" },
  DDOG: { ticker: "DDOG", sector: "Cloud & Software", tagline: "Strong GAAP profitability inflection while SBC remains a major FCF drag" },
  NET: { ticker: "NET", sector: "Cloud & Software", tagline: "Edge infrastructure scale-up with high SBC relative to reported FCF" },
  PANW: { ticker: "PANW", sector: "Cloud & Software", tagline: "Platformization billings shift paired with $1B+ annual SBC" },
  NOW: { ticker: "NOW", sector: "Cloud & Software", tagline: "Durable 20%+ compounder with steady SBC compression toward True FCF" },
  CRM: { ticker: "CRM", sector: "Cloud & Software", tagline: "Activist-era margin discipline turning massive FCF into net share reduction" },
  ADBE: { ticker: "ADBE", sector: "Cloud & Software", tagline: "High-margin recurring cash flow funding consistent share count shrinkage" },
  V: { ticker: "V", sector: "Fintech & Data", tagline: "Gold-standard 55%+ True FCF margin tollbooth with relentless buybacks" },
  MA: { ticker: "MA", sector: "Fintech & Data", tagline: "Elite capital efficiency, minimal SBC, and consistent share reduction" },
  NFLX: { ticker: "NFLX", sector: "Media & Telecom", tagline: "Post-password-sharing FCF breakout with minimal SBC dilution" },
  UBER: { ticker: "UBER", sector: "Consumer & Retail", tagline: "From cash burn to multi-billion True FCF with moderating SBC" },
  ABNB: { ticker: "ABNB", sector: "Consumer & Retail", tagline: "Negative working capital float boosting FCF vs. ~12% SBC burden" },
  TSLA: { ticker: "TSLA", sector: "Consumer & Retail", tagline: "Heavy AI/factory CapEx vs. ambitious Reverse DCF growth expectations" },
  FICO: { ticker: "FICO", sector: "Fintech & Data", tagline: "Pricing power & buybacks driving one of the cleanest FCF profiles in S&P 500" },
  JPM: { ticker: "JPM", sector: "Fintech & Data", tagline: "Fortress balance sheet and scale economics driving consistent share retirement" },
  GS: { ticker: "GS", sector: "Fintech & Data", tagline: "Global investment banking and trading powerhouse with disciplined buybacks" },
  MS: { ticker: "MS", sector: "Fintech & Data", tagline: "Wealth management fee durability paired with capital-markets operating leverage" },
  BAC: { ticker: "BAC", sector: "Fintech & Data", tagline: "Scale consumer deposit franchise generating durable net interest earnings" },
  WFC: { ticker: "WFC", sector: "Fintech & Data", tagline: "Aggressive net share count reduction powered by excess capital return" },
  BX: { ticker: "BX", sector: "Fintech & Data", tagline: "Fee-related earnings compounder across private credit, real estate, and infrastructure" },
  KKR: { ticker: "KKR", sector: "Fintech & Data", tagline: "Alternative asset management scale paired with insurance float compounding" },
  XOM: { ticker: "XOM", sector: "Energy & Utilities", tagline: "Permian and Guyana upstream scale funding $30B+ annual shareholder distributions" },
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

// The successor files under the directory CIK. Keep annual history from the former registrant.
const PREDECESSOR_CIK: Record<string, string> = {
  "0002115436": "0000034088", // Exxon Mobil
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
  "VRTX", "CRSP", "FISV", "FIS", "GPN", "XYZ", "ROST", "TGT", "DG", "DLTR",
  "PWR", "EMR", "GLW", "ITW", "COR", "GWW", "MPWR", "PCAR", "ETR", "BKR", "CARR",
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

const REVENUE_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenuesNetOfInterestExpense",
  "SalesRevenueNet",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "RegulatedAndUnregulatedOperatingRevenue",
  "OperatingRevenues",
  "Revenue",
];
const OPERATING_CASH_FLOW_TAGS = [
  "NetCashProvidedByUsedInOperatingActivities",
  "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  "CashFlowsFromUsedInOperatingActivities",
];
const CAPEX_TAGS = [
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
];
const SBC_TAGS = [
  "ShareBasedCompensation",
  "AllocatedShareBasedCompensationExpense",
  "ExpenseFromSharebasedPaymentTransactionsInWhichGoodsOrServicesReceivedDidNotQualifyForRecognitionAsAssets",
];
const BUYBACK_TAGS = [
  "PaymentsForRepurchaseOfCommonStock",
  "PaymentsForRepurchaseOfEquity",
  "PurchaseOfTreasuryShares",
];

interface DirectoryCandidate {
  ticker: string;
  cik: string;
  name: string;
  exchange: "NASDAQ" | "NYSE";
}

async function fetchCompanyFacts(cik: string): Promise<CompanyFactsResponse> {
  const url = (id: string) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${id}.json`;
  const current = await fetchSecJson<CompanyFactsResponse>(url(cik));
  const predecessor = PREDECESSOR_CIK[cik];
  if (!predecessor) return current;

  await new Promise((resolve) => setTimeout(resolve, SEC_REQUEST_SPACING_MS));
  const previous = await fetchSecJson<CompanyFactsResponse>(url(predecessor));
  const facts = current.facts ??= {};
  for (const taxonomy of ["us-gaap", "ifrs-full", "dei"] as const) {
    for (const [tag, { units }] of Object.entries(previous.facts?.[taxonomy] ?? {})) {
      const tags = facts[taxonomy] ??= {};
      const combined = (tags[tag] ??= {}).units ??= {};
      for (const [unit, entries] of Object.entries(units ?? {})) {
        combined[unit] = [...(combined[unit] ?? []), ...entries];
      }
    }
  }
  return current;
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

async function fetchLatestPeriodicFiling(cik: string, fallback: PeriodicFiling) {
  // Submissions supplies filing metadata even when usable XBRL facts arrive later.
  await new Promise((resolve) => setTimeout(resolve, SEC_REQUEST_SPACING_MS));
  try {
    const { filings, sic } = await fetchSecJson<{ sic?: string; filings?: { recent?: SecRecentFilings } }>(
      `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`,
      1
    );
    const recent = filings?.recent;
    if (!recent) return { filing: fallback, sic: Number(sic) || undefined };

    let latest: PeriodicFiling | undefined;
    for (const [index, form] of recent.form.entries()) {
      if (!/^(10-[KQ]|20-F|40-F)(\/A)?$/.test(form)) continue;
      const date = recent.filingDate[index];
      const periodEnd = recent.reportDate[index];
      const accessionNumber = recent.accessionNumber[index];
      if (!date || !periodEnd || !accessionNumber) continue;
      if (latest && (periodEnd < latest.periodEnd || (periodEnd === latest.periodEnd && date <= latest.date))) continue;
      latest = { type: periodicFilingType(form), date, periodEnd, accessionNumber };
    }
    const filing = latest && (
      latest.periodEnd > fallback.periodEnd ||
      (latest.periodEnd === fallback.periodEnd && latest.date >= fallback.date)
    ) ? latest : fallback;
    return { filing, sic: Number(sic) || undefined };
  } catch {
    return { filing: fallback };
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
  ticker: string,
  decimals = 0
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
  return Math.max(10 ** -decimals, Number((millions / ratio).toFixed(decimals)));
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
  return (e - s) / DAY_MS;
}

function extractAnnualSeries(
  facts: CompanyFactsResponse,
  tagCandidates: string[],
  unit: "USD" | "shares",
  requireDuration = true
): Map<string, XbrlFactUnit> {
  const gaap = facts.facts?.["us-gaap"];
  const ifrs = facts.facts?.["ifrs-full"];
  const dei = facts.facts?.["dei"];
  const merged = new Map<string, XbrlFactUnit & { priority: number }>();

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

      const existing = merged.get(e.end);
      if (
        !existing ||
        priority < existing.priority ||
        (priority === existing.priority && e.filed > existing.filed)
      ) {
        merged.set(e.end, { ...e, priority });
      }
    }
  });

  return merged;
}

function instantSeries(
  facts: CompanyFactsResponse,
  tagCandidates: string[],
  unit: "USD" | "shares"
): Map<string, XbrlFactUnit> {
  const byEnd = new Map<string, XbrlFactUnit>();
  for (const tag of tagCandidates) {
    const byTag = new Map<string, XbrlFactUnit>();
    for (const taxonomy of ["us-gaap", "ifrs-full", "dei"] as const) {
      for (const entry of facts.facts?.[taxonomy]?.[tag]?.units?.[unit] ?? []) {
        if (entry.start || !/^(10-[KQ]|20-F|40-F)(\/A)?$/.test(entry.form) ||
            !Number.isFinite(entry.val) || entry.val < 0) continue;
        const saved = byTag.get(entry.end);
        if (!saved || entry.filed > saved.filed) byTag.set(entry.end, entry);
      }
    }
    for (const [end, entry] of byTag) {
      if (!byEnd.has(end)) byEnd.set(end, entry);
    }
  }
  return byEnd;
}

function balanceSheetByPeriod(facts: CompanyFactsResponse) {
  const series = (tags: string[]) => instantSeries(facts, tags, "USD");
  const combinedCash = series(["CashCashEquivalentsAndShortTermInvestments"]);
  const cash = series(["CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalents"]);
  const investments = series([
    "MarketableSecuritiesCurrent",
    "ShortTermInvestments",
    "ShortTermInvestmentsAndMarketableSecurities",
    "DebtSecuritiesCurrent",
    "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
  ]);
  const allDebt = series(["DebtAndCapitalLeaseObligations"]);
  const longTerm = series(["LongTermDebt"]);
  const noncurrent = series(["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations", "ConvertibleDebtNoncurrent"]);
  const due = series(["LongTermDebtCurrent", "ConvertibleDebtCurrent"]);
  const borrowings = series(["ShortTermBorrowings", "CommercialPaper"]);
  const current = series(["DebtCurrent"]);
  const cashPeriods = [...combinedCash.keys(), ...cash.keys()];
  const periods = cashPeriods.length > 0 ? cashPeriods : [
    ...allDebt.keys(), ...longTerm.keys(), ...noncurrent.keys(),
    ...due.keys(), ...borrowings.keys(), ...current.keys(),
  ];

  return {
    latestPeriod: periods.sort().at(-1),
    at(end: string) {
      const cashOnly = cash.get(end)?.val;
      const cashAndInvestments = combinedCash.get(end)?.val ??
        (cashOnly === undefined ? null : cashOnly + (investments.get(end)?.val ?? 0));
      const totalLongTerm = longTerm.get(end)?.val;
      const noncurrentDebt = noncurrent.get(end)?.val;
      const maturities = due.get(end)?.val;
      const shortTerm = borrowings.get(end)?.val;
      const totalCurrent = current.get(end)?.val;
      const currentDebt = Math.max(totalCurrent ?? 0, (maturities ?? 0) + (shortTerm ?? 0));
      const debt = allDebt.get(end)?.val ?? (totalLongTerm !== undefined
        ? totalLongTerm + Math.max(shortTerm ?? 0, currentDebt - (maturities ?? currentDebt))
        : noncurrentDebt !== undefined || totalCurrent !== undefined || maturities !== undefined || shortTerm !== undefined
          ? (noncurrentDebt ?? 0) + currentDebt
          : null);
      return {
        cashAndEquiv: cashAndInvestments === null ? null : Math.round(cashAndInvestments / 1e6),
        totalDebt: debt === null ? null : Math.round(debt / 1e6),
      };
    },
  };
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

  let best: YtdPair | null = null;
  for (const tag of tagCandidates) {
    const entries = gaap[tag]?.units?.USD;
    if (!entries?.length) continue;

    const candidates = entries.filter((fact): fact is XbrlFactUnit & { start: string } =>
      (fact.form === "10-Q" || fact.form === "10-Q/A") &&
      !!fact.start &&
      (window
        ? fact.start === window.start && fact.end === window.end
        : daysBetween(latestFyEnd, fact.start) === 1 &&
          daysBetween(fact.start, fact.end) >= 70 &&
          daysBetween(fact.start, fact.end) <= 300)
    ).sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed));
    for (const current of candidates) {
      if (best && current.end <= best.window.end) break;
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

      best = {
        window: { start: current.start, end: current.end, priorStart: prior.start, priorEnd: prior.end },
        currentVal: current.val,
        priorVal: prior.val,
        filing: { type: "10-Q", date: current.filed, periodEnd: current.end, accessionNumber: current.accn },
      };
      break;
    }
    if (best && window) break;
  }

  return best;
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

const BANK_TICKERS = new Set(["JPM", "GS", "MS", "BAC", "WFC"]);

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
  const fcfBurden = latest.sbcPctReportedFcf;

  const sbcMateriality: FilingDiffItem["materiality"] =
    (fcfBurden ?? 0) >= 35 || latest.trueFcf < 0
      ? "High"
      : (fcfBurden ?? 0) >= 15
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
        fcfBurden === null
          ? `SBC was ${latest.sbcPctRevenue.toFixed(1)}% of revenue during a period of nonpositive Reported FCF`
          : `SBC consumed ${fcfBurden.toFixed(1)}% of Reported FCF (${latest.sbcPctRevenue.toFixed(1)}% of revenue)`,
      summary: `In ${latest.fiscalYear}, ${company.name} generated $${(latest.reportedFcf / 1000).toFixed(2)}B in Reported FCF against $${(latest.sbc / 1000).toFixed(2)}B in Stock-Based Compensation, yielding $${(latest.trueFcf / 1000).toFixed(2)}B in True FCF (${latest.trueFcfMargin.toFixed(1)}% margin).`,
      priorExcerpt: prev
        ? `${prev.fiscalYear} SEC filing: Reported FCF $${(prev.reportedFcf / 1000).toFixed(2)}B | SBC $${(prev.sbc / 1000).toFixed(2)}B (${prev.sbcPctRevenue.toFixed(1)}% of rev) | True FCF $${(prev.trueFcf / 1000).toFixed(2)}B.`
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
      priorExcerpt: `${company.annuals[0].fiscalYear} SEC filing: ${company.annuals[0].dilutedShares.toLocaleString()}M diluted shares | CapEx $${(company.annuals[0].capex / 1000).toFixed(2)}B.`,
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

export function selectCoverageCandidates(
  directory: SecDirectoryResponse["data"],
  limit: number,
  existingTickers: string[] = []
): DirectoryCandidate[] {
  const byTicker = new Map<string, DirectoryCandidate>();

  for (const [cikNum, rawName, rawTicker, rawExch] of directory) {
    if (!rawTicker || !rawExch) continue;
    if (rawExch !== "Nasdaq" && rawExch !== "NYSE") continue;
    const ticker = rawTicker.toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,4}(\.[A-Z])?$/.test(ticker) || byTicker.has(ticker)) continue;
    if (
      /\b(?:ETF|acquisition corp(?:oration)?|special purpose acquisition)\b/i.test(rawName) ||
      !ALLOWLISTED_FINTECH.has(ticker) &&
      EXCLUDED_FINANCIAL_ENTITY_RE.test(rawName)
    ) {
      continue;
    }

    const candidate: DirectoryCandidate = {
      ticker,
      cik: String(cikNum).padStart(10, "0"),
      name: cleanCompanyName(rawName),
      exchange: rawExch === "NYSE" ? "NYSE" : "NASDAQ",
    };
    byTicker.set(ticker, candidate);
  }

  const selected: DirectoryCandidate[] = [];
  const seenIssuers = new Set<string>();
  for (const ticker of [...PRIORITY_TICKERS, ...existingTickers, ...byTicker.keys()]) {
    if (selected.length >= limit) break;
    const candidate = byTicker.get(ticker);
    if (!candidate || seenIssuers.has(candidate.cik)) continue;
    // The directory places the ordinary listing before its same-issuer units and warrants.
    selected.push(candidate);
    seenIssuers.add(candidate.cik);
  }

  return selected;
}

export function extractSingleQuarterMap(
  facts: CompanyFactsResponse,
  tags: string[],
  unit: "USD" | "shares"
): Map<string, number> {
  const quarters = new Map<string, number>();
  const gaap = facts.facts?.["us-gaap"];
  if (!gaap) return quarters;

  for (const tag of tags) {
    const entries = gaap[tag]?.units?.[unit] ?? [];
    const standalone = new Map<string, XbrlFactUnit>();
    const byStart = new Map<string, Map<string, XbrlFactUnit>>();

    for (const entry of entries) {
      if (!entry.start || !Number.isFinite(entry.val)) continue;
      const days = daysBetween(entry.start, entry.end);
      const isQuarterlyFiling = /^10-Q(\/A)?$/.test(entry.form);
      const isFullYear = /^10-K(\/A)?$/.test(entry.form) && days >= 330 && days <= 400;
      if (!isFullYear && !(isQuarterlyFiling && days >= 70 && days <= 300)) continue;

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
        const quarterDays = daysBetween(previous.end, current.end);
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
  const revMap = extractSingleQuarterMap(facts, REVENUE_TAGS, "USD");
  if (revMap.size < 4) return [];

  const ocfMap = extractSingleQuarterMap(facts, OPERATING_CASH_FLOW_TAGS, "USD");
  const capexMap = extractSingleQuarterMap(facts, CAPEX_TAGS, "USD");
  const sbcMap = extractSingleQuarterMap(facts, SBC_TAGS, "USD");
  const buybackMap = extractSingleQuarterMap(facts, BUYBACK_TAGS, "USD");
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

export function hasNewCoverageInputs(snapshot: EdgarSnapshot, now = Date.now()): boolean {
  const latestAnnual = snapshot.annuals.findLast((row) => row.fiscalYear !== "TTM");
  const sic = snapshot.sic;
  // Banks, insurers, REITs, and oil & gas producers require different financial inputs.
  if (!sic || (sic >= 6000 && sic < 6800) || sic === 1311) return false;
  if (snapshot.edgarFallback || !latestAnnual?.periodEndDate || snapshot.cashAndEquiv <= 0) return false;
  const age = now - Date.parse(latestAnnual.periodEndDate);
  return age >= 0 && age <= 550 * DAY_MS &&
    latestAnnual.capex > 0 && (snapshot.marketCapShares ?? 0) > 0;
}

export async function ingestCandidate(
  candidate: DirectoryCandidate,
  curatedMap: Map<string, CompanySnapshot>,
  existingMap: Map<string, EdgarSnapshot>
): Promise<EdgarSnapshot | null> {
  const curated = curatedMap.get(candidate.ticker);
  const existing = existingMap.get(candidate.ticker);
  const meta = CURATED_META[candidate.ticker];

  try {
    const facts = await fetchCompanyFacts(candidate.cik);
    const supplements = FILING_SUPPLEMENTS[candidate.cik];

    const revMap = extractAnnualSeries(facts, REVENUE_TAGS, "USD");
    const ocfMap = extractAnnualSeries(facts, OPERATING_CASH_FLOW_TAGS, "USD");
    const capexMap = extractAnnualSeries(facts, CAPEX_TAGS, "USD");
    const sbcMap = extractAnnualSeries(facts, SBC_TAGS, "USD");
    const buybackMap = extractAnnualSeries(facts, BUYBACK_TAGS, "USD");
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
    const balanceSheet = balanceSheetByPeriod(facts);
    const latestEndByYear = new Map(
      [...revMap.keys()].filter((end) => ocfMap.has(end)).sort()
        .map((end) => [end.slice(0, 4), end])
    );
    const periods = [...latestEndByYear.values()].slice(-5);
    if (periods.length < 3) return fallbackSnapshot(existing, curated);

    const reportedShares = instantSeries(
      facts,
      ADR_SHARE_RATIO[candidate.ticker]
        ? ["CommonStockSharesOutstanding", "NumberOfSharesOutstanding"]
        : ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding", "NumberOfSharesOutstanding"],
      "shares"
    );
    const latestAnnualEnd = periods[periods.length - 1];
    const latestReportedShares = [...reportedShares.values()]
      .filter((entry) => entry.end >= latestAnnualEnd && entry.val > 0)
      .sort((a, b) => b.end.localeCompare(a.end))[0];
    const latestDilutedShares = facts.facts?.["us-gaap"]?.WeightedAverageNumberOfDilutedSharesOutstanding?.units?.shares
      ?.filter((entry) => (entry.form === "10-Q" || entry.form === "10-K") &&
        entry.end >= latestAnnualEnd && entry.val > 0)
      .sort((a, b) => b.end.localeCompare(a.end) ||
        daysBetween(a.start ?? a.end, a.end) - daysBetween(b.start ?? b.end, b.end) ||
        b.filed.localeCompare(a.filed))[0];
    const latestShares = latestDilutedShares?.val ?? latestReportedShares?.val ?? 0;

    const annuals: AnnualFinancials[] = periods.map((end) => {
      const rev = (revMap.get(end)?.val ?? 0) / 1e6;
      const ocf = (ocfMap.get(end)?.val ?? 0) / 1e6;
      const supplement = supplements?.[end];
      const capex = supplement?.capex ?? Math.abs(capexMap.get(end)?.val ?? 0) / 1e6;
      const sbc = Math.abs(sbcMap.get(end)?.val ?? 0) / 1e6;
      const buybacks = Math.abs(buybackMap.get(end)?.val ?? 0) / 1e6;
      const rawShares =
        sharesMap.get(end)?.val ??
        instantSharesAnnualMap.get(end)?.val ??
        latestShares;

      const rawGpVal = grossProfitMap.get(end)?.val;
      const corVal = costOfRevMap.get(end)?.val;
      const gpVal =
        rawGpVal !== undefined
          ? rawGpVal
          : corVal !== undefined && revMap.get(end)?.val !== undefined
            ? revMap.get(end)!.val - Math.abs(corVal)
            : undefined;
      const rdVal = rdMap.get(end)?.val;
      const sgaVal = sgaMap.get(end)?.val;
      const opVal = opIncMap.get(end)?.val;
      const niVal = netIncMap.get(end)?.val;
      const eqVal = equityMap.get(end)?.val;
      const balance = balanceSheet.at(end);
      return {
        fiscalYear: `FY${end.slice(2, 4)}`,
        revenue: Math.round(rev),
        operatingCashFlow: Math.round(ocf),
        capex: Math.round(capex),
        sbc: Math.round(sbc),
        buybacks: Math.round(buybacks),
        dilutedShares: supplement?.dilutedShares ?? normalizeShareCountToMillions(rawShares, candidate.ticker),
        grossProfit: gpVal !== undefined ? Math.round(gpVal / 1e6) : null,
        rdExpense: rdVal !== undefined ? Math.round(Math.abs(rdVal) / 1e6) : null,
        sgaExpense: sgaVal !== undefined ? Math.round(Math.abs(sgaVal) / 1e6) : null,
        operatingIncome: opVal !== undefined ? Math.round(opVal / 1e6) : null,
        netIncome: niVal !== undefined ? Math.round(niVal / 1e6) : null,
        stockholdersEquity: eqVal !== undefined ? Math.round(eqVal / 1e6) : null,
        periodEndDate: end,
        cashAndEquiv: supplement?.cashAndEquiv ?? balance.cashAndEquiv,
        totalDebt: supplement?.totalDebt ?? balance.totalDebt,
      };
    });

    const latestAnnual = annuals[annuals.length - 1];
    if (latestAnnual.revenue <= 0) return fallbackSnapshot(existing, curated);

    const latestMeta = revMap.get(latestAnnualEnd)!;

    // Reject stale USD filings where the latest annual period ended prior to 2023
    if (latestMeta.end < "2023-01-01") {
      return fallbackSnapshot(existing, curated);
    }

    let financialFiling: PeriodicFiling = {
      type: periodicFilingType(latestMeta.form),
      date: latestMeta.filed,
      periodEnd: latestMeta.end,
      accessionNumber: latestMeta.accn,
    };

    const revQ = extract10QYtdPair(facts, REVENUE_TAGS, latestMeta.end);

    if (revQ) {
      const getQuarterPair = (tags: string[]) =>
        extract10QYtdPair(facts, tags, latestMeta.end, revQ.window);
      const ocfQ = getQuarterPair(OPERATING_CASH_FLOW_TAGS);
      const ttmRev = Math.round(
        latestAnnual.revenue + (revQ.currentVal - revQ.priorVal) / 1e6
      );

      if (ttmRev > 0 && ocfQ) {
        const capexQ = getQuarterPair(CAPEX_TAGS);
        const sbcQ = getQuarterPair(SBC_TAGS);
        const buybackQ = getQuarterPair(BUYBACK_TAGS);
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
            latestDilutedShares?.end === revQ.window.end
              ? normalizeShareCountToMillions(latestDilutedShares.val, candidate.ticker)
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

    const balancePeriod = balanceSheet.latestPeriod ?? latestAnnualEnd;
    const balance = balanceSheet.at(balancePeriod);
    const balanceSupplement = supplements?.[balancePeriod];

    // Normalize stock splits retroactively so Dilution (4Y) is never distorted by 5:1 / 10:1 / 50:1 splits
    const normalizedAnnuals = normalizeStockSplits(annuals);

    const computed = computeAnnualMetrics(normalizedAnnuals);
    const latestComputed = computed[computed.length - 1];

    // Strict XBRL sanity guardrail: reject anomalous unit mismatches unless curated
    if (
      !curated && !BANK_TICKERS.has(candidate.ticker) &&
      (latestComputed.revenue < 200 ||
        latestComputed.trueFcfMargin > 80 ||
        latestComputed.trueFcfMargin < -120 ||
        latestComputed.sbcPctRevenue > 90)
    ) {
      return null;
    }

    const dilutionCagr = computeNetDilutionCagr(normalizedAnnuals);

    // New companies require a successful price sync before seeding.
    const price = existing?.price ?? 0;
    const marketCapShares = supplements?.[latestAnnualEnd]?.marketCapShares ?? (latestReportedShares
      ? normalizeShareCountToMillions(latestReportedShares.val, candidate.ticker, 3)
      : undefined);
    const marketCap = price > 0 ? Math.round(price * (marketCapShares ?? latestComputed.dilutedShares)) : 0;

    const defaultDcf =
      curated?.defaultDcf ?? computeGroundedDefaultDcf(normalizedAnnuals);

    const { filing: lastFiling, sic } = await fetchLatestPeriodicFiling(candidate.cik, revQ?.filing ?? financialFiling);

    const baseSnapshot: Omit<EdgarSnapshot, "filingDiffs"> = {
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
      marketCapShares,
      sic,
      cashAndEquiv: balanceSupplement?.cashAndEquiv ?? balance.cashAndEquiv ?? 0,
      totalDebt: balanceSupplement?.totalDebt ?? balance.totalDebt ?? 0,
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
  if (!Number.isSafeInteger(UNIVERSE_LIMIT) || UNIVERSE_LIMIT <= 0) {
    throw new Error("UNIVERSE_LIMIT must be a positive integer.");
  }
  const outDir = path.resolve(process.cwd(), "src/data/generated");
  fs.mkdirSync(outDir, { recursive: true });
  const companiesPath = path.join(outDir, "companies.json");

  const existingList: EdgarSnapshot[] = fs.existsSync(companiesPath)
    ? (JSON.parse(fs.readFileSync(companiesPath, "utf8")) as EdgarSnapshot[])
    : [];
  const existingMap = new Map(existingList.map((c) => [c.ticker, c]));
  const curatedMap = new Map(PILOT_TICKERS.map((c) => [c.ticker, c]));

  console.log("[amber-ingest] Fetching official SEC EDGAR ticker directory...");
  const directory = await fetchSecJson<SecDirectoryResponse>("https://www.sec.gov/files/company_tickers_exchange.json");
  const candidates = selectCoverageCandidates(directory.data, UNIVERSE_LIMIT, [...existingMap.keys()]);
  console.log(
    `[amber-ingest] Ingesting live SEC EDGAR 10-K XBRL for ${candidates.length} candidates...`
  );

  const companies: EdgarSnapshot[] = [];
  let incompleteNewCoverage = 0;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const snap = await ingestCandidate(c, curatedMap, existingMap);
    if (snap) {
      if (existingMap.has(c.ticker) || curatedMap.has(c.ticker) || hasNewCoverageInputs(snap)) {
        companies.push(snap);
      } else {
        incompleteNewCoverage++;
      }
    }
    if ((i + 1) % 25 === 0 || i === candidates.length - 1) {
      console.log(
        `[amber-ingest] Progress: ${i + 1}/${candidates.length} checked | ${companies.length} snapshots`
      );
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

  writeCompanyData(outDir, companies);

  const universePath = process.env.AMBER_INGEST_UNIVERSE_PATH;
  if (universePath) {
    // Only a full directory selection can establish which tickers left the universe.
    const universe = candidates.length === UNIVERSE_LIMIT
      ? [...new Set([...candidates.map((candidate) => candidate.ticker), ...curatedMap.keys()])]
      : [];
    fs.writeFileSync(universePath, JSON.stringify(universe) + "\n");
  }

  console.log(
    `[amber-ingest] ✓ Wrote ${companies.length} snapshots to src/data/generated/. Skipped ${incompleteNewCoverage} potential additions with incomplete or stale inputs.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
