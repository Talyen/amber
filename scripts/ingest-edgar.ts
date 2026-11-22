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
  PLTR: { ticker: "PLTR", sector: "Enterprise AI & Defense", tagline: "High-margin FCF inflection vs. persistent SBC & share count expansion", fallbackPrice: 78.4 },
  NVDA: { ticker: "NVDA", sector: "Semiconductors", tagline: "Extraordinary cash conversion with rising hyperscaler concentration", fallbackPrice: 134.2 },
  MSFT: { ticker: "MSFT", sector: "Cloud & Software", tagline: "AI datacenter CapEx surge compressing near-term FCF conversion", fallbackPrice: 416.8 },
  SNOW: { ticker: "SNOW", sector: "Cloud Data", tagline: "Classic SBC-to-FCF gap: strong headline cash flow vs. negative True FCF", fallbackPrice: 168.5 },
  SHOP: { ticker: "SHOP", sector: "Commerce", tagline: "Post-logistics operating leverage with disciplined SBC compression", fallbackPrice: 109.6 },
  COST: { ticker: "COST", sector: "Retail", tagline: "Ultra-clean cash flow & minimal SBC — stress-test the 50x+ valuation", fallbackPrice: 964.5 },
  AAPL: { ticker: "AAPL", sector: "Consumer Hardware", tagline: "Massive buyback engine offsetting modest SBC with steady share retirement", fallbackPrice: 228.5 },
  GOOGL: { ticker: "GOOGL", sector: "Cloud & AI", tagline: "Heavy AI CapEx cycle paired with $20B+ annual SBC and aggressive buybacks", fallbackPrice: 176.4 },
  AMZN: { ticker: "AMZN", sector: "Cloud & Commerce", tagline: "AWS operating leverage vs. massive logistics & AI infrastructure CapEx", fallbackPrice: 208.2 },
  META: { ticker: "META", sector: "Social & AI", tagline: "Year-of-efficiency FCF surge funding record AI datacenter buildout", fallbackPrice: 612.0 },
  ORCL: { ticker: "ORCL", sector: "Cloud & Software", tagline: "OCI backlog acceleration driving a sharp step-up in CapEx intensity", fallbackPrice: 172.5 },
  AMD: { ticker: "AMD", sector: "Semiconductors", tagline: "Datacenter GPU ramp vs. rising R&D equity compensation", fallbackPrice: 118.4 },
  AVGO: { ticker: "AVGO", sector: "Semiconductors", tagline: "VMware integration and custom AI ASICs driving elite FCF margins", fallbackPrice: 224.0 },
  CRWD: { ticker: "CRWD", sector: "Cybersecurity", tagline: "Best-in-class headline FCF margin weighed against steep SBC expense", fallbackPrice: 382.0 },
  DDOG: { ticker: "DDOG", sector: "Cloud Observability", tagline: "Strong GAAP profitability inflection while SBC remains a major FCF drag", fallbackPrice: 142.8 },
  NET: { ticker: "NET", sector: "Edge & Security", tagline: "Edge infrastructure scale-up with high SBC relative to reported FCF", fallbackPrice: 138.4 },
  PANW: { ticker: "PANW", sector: "Cybersecurity", tagline: "Platformization billings shift paired with $1B+ annual SBC", fallbackPrice: 192.0 },
  NOW: { ticker: "NOW", sector: "Enterprise SaaS", tagline: "Durable 20%+ compounder with steady SBC compression toward True FCF", fallbackPrice: 985.0 },
  CRM: { ticker: "CRM", sector: "Enterprise SaaS", tagline: "Activist-era margin discipline turning massive FCF into net share reduction", fallbackPrice: 326.5 },
  ADBE: { ticker: "ADBE", sector: "Enterprise SaaS", tagline: "High-margin recurring cash flow funding consistent share count shrinkage", fallbackPrice: 448.2 },
  V: { ticker: "V", sector: "Payments", tagline: "Gold-standard 55%+ True FCF margin tollbooth with relentless buybacks", fallbackPrice: 342.6 },
  MA: { ticker: "MA", sector: "Payments", tagline: "Elite capital efficiency, minimal SBC, and consistent share reduction", fallbackPrice: 548.2 },
  NFLX: { ticker: "NFLX", sector: "Media & Streaming", tagline: "Post-password-sharing FCF breakout with minimal SBC dilution", fallbackPrice: 968.0 },
  UBER: { ticker: "UBER", sector: "Mobility & Delivery", tagline: "From cash burn to multi-billion True FCF with moderating SBC", fallbackPrice: 76.8 },
  ABNB: { ticker: "ABNB", sector: "Travel Marketplace", tagline: "Negative working capital float boosting FCF vs. ~12% SBC burden", fallbackPrice: 142.4 },
  TSLA: { ticker: "TSLA", sector: "EV & Autonomy", tagline: "Heavy AI/factory CapEx vs. ambitious Reverse DCF growth expectations", fallbackPrice: 348.0 },
  FICO: { ticker: "FICO", sector: "Data & Analytics", tagline: "Pricing power & buybacks driving one of the cleanest FCF profiles in S&P 500", fallbackPrice: 1845.0 },
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
    "dei"?: Record<string, { units?: Record<string, XbrlFactUnit[]> }>;
  };
}

interface DirectoryCandidate {
  ticker: string;
  cik: string;
  name: string;
  exchange: "NASDAQ" | "NYSE";
}

async function fetchSecJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

function cleanCompanyName(raw: string): string {
  // Turn "MICROSOFT CORP" -> "Microsoft Corp" while keeping normal casing if mixed
  if (raw !== raw.toUpperCase()) return raw;
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Inc|Corp|Co|Ltd|Llc|Lp|Plc)\b/g, (m) => m)
    .replace(/\s+\/\w+\/$/i, "")
    .trim();
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
  const merged = new Map<
    string,
    { val: number; end: string; filed: string; accn: string; priority: number }
  >();

  if (!gaap) return new Map();

  tagCandidates.forEach((tag, priority) => {
    const entries = gaap[tag]?.units?.[unit];
    if (!entries?.length) return;

    for (const e of entries) {
      if (e.form !== "10-K" && e.form !== "10-K/A") continue;

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
  const dei = facts.facts?.["dei"];

  for (const tag of tagCandidates) {
    const entries =
      gaap?.[tag]?.units?.[unit] ?? dei?.[tag]?.units?.[unit] ?? [];
    if (!entries.length) continue;

    const sorted = [...entries]
      .filter((e) => e.form === "10-K" || e.form === "10-Q")
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
  /\b(bancorp|bancshares|bank|banking|insurance|insurer|reit|realty|property trust|jpmorgan|citigroup|wells fargo|goldman sachs|morgan stanley|chubb|allstate|travelers|metlife|prudential|aflac|progressive corp|berkshire hathaway)\b/i;

function inferSector(name: string): string {
  const n = name.toLowerCase();
  if (/semiconductor|micro|nvidia|broadcom|qualcomm|analog|applied mat|lam research|kla|synopsys|cadence|intel/.test(n)) return "Semiconductors";
  if (/software|cloud|data|cyber|security|crowdstrike|palo alto|zscaler|okta|workday|servicenow|salesforce|adobe|intuit|autodesk|atlassian|hubspot|mongodb|confluent|gitlab|snowflake|palantir|datadog|cloudflare/.test(n)) return "Cloud & Software";
  if (/pharma|therapeutics|biotech|lilly|health|medical|surgical|abbott|amgen|gilead|merck|abbvie|johnson|danaher|thermo/.test(n)) return "Healthcare";
  if (/bank|capital|financial|visa|mastercard|paypal|american express|blackrock|morgan|goldman|coinbase|robinhood|sp global|moody|msci|fico|fair isaac/.test(n)) return "Financials & Payments";
  if (/retail|costco|walmart|home depot|lowe|tjx|autozone|o'reilly|starbucks|mcdonald|chipotle|nike|procter|coca-cola|pepsi/.test(n)) return "Consumer & Retail";
  if (/energy|exxon|chevron|conocophillips/.test(n)) return "Energy";
  if (/media|netflix|disney|comcast|spotify|roblox|t-mobile|verizon|at&t/.test(n)) return "Media & Telecom";
  return "Industrials & Services";
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
      section: "XBRL Cash Flow Statement — SBC Reconciliation",
      category: "Executive Comp",
      materiality: sbcMateriality,
      headline:
        latest.trueFcf < 0
          ? `SBC ($${(latest.sbc / 1000).toFixed(2)}B) exceeded Reported FCF, leaving True FCF negative`
          : `SBC consumed ${latest.sbcPctReportedFcf.toFixed(1)}% of Reported FCF (${latest.sbcPctRevenue.toFixed(1)}% of revenue)`,
      summary: `In ${latest.fiscalYear}, ${company.name} generated $${(latest.reportedFcf / 1000).toFixed(2)}B in Reported FCF against $${(latest.sbc / 1000).toFixed(2)}B in Stock-Based Compensation, yielding $${(latest.trueFcf / 1000).toFixed(2)}B in True FCF (${latest.trueFcfMargin.toFixed(1)}% margin).`,
      priorExcerpt: prev
        ? `${prev.fiscalYear} SEC 10-K: Reported FCF $${(prev.reportedFcf / 1000).toFixed(2)}B · SBC $${(prev.sbc / 1000).toFixed(2)}B (${prev.sbcPctRevenue.toFixed(1)}% of rev) · True FCF $${(prev.trueFcf / 1000).toFixed(2)}B.`
        : "Prior fiscal year baseline unavailable in XBRL window.",
      currentExcerpt: `${latest.fiscalYear} SEC 10-K: Reported FCF $${(latest.reportedFcf / 1000).toFixed(2)}B · SBC $${(latest.sbc / 1000).toFixed(2)}B (${latest.sbcPctRevenue.toFixed(1)}% of rev) · True FCF $${(latest.trueFcf / 1000).toFixed(2)}B.`,
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
      section: "XBRL Equity & Cash Flow — Dilution vs. Buybacks",
      category: "Capital Allocation",
      materiality: capAllocMateriality,
      headline:
        dilutionCagr < -0.5
          ? `Share count shrank ${Math.abs(dilutionCagr).toFixed(1)}%/yr over ${company.annuals.length - 1} years`
          : dilutionCagr > 0.8
            ? `Diluted shares expanded +${dilutionCagr.toFixed(1)}%/yr despite cash generation`
            : `Diluted share count held flat (${dilutionCagr >= 0 ? "+" : ""}${dilutionCagr.toFixed(1)}%/yr)`,
      summary: `Weighted-average diluted shares moved from ${company.annuals[0].dilutedShares.toLocaleString()}M in ${company.annuals[0].fiscalYear} to ${latest.dilutedShares.toLocaleString()}M in ${latest.fiscalYear}, with $${(latest.buybacks / 1000).toFixed(2)}B deployed into share repurchases in the latest fiscal year.`,
      priorExcerpt: `${company.annuals[0].fiscalYear} 10-K: ${company.annuals[0].dilutedShares.toLocaleString()}M diluted shares · CapEx $${(company.annuals[0].capex / 1000).toFixed(2)}B.`,
      currentExcerpt: `${latest.fiscalYear} 10-K: ${latest.dilutedShares.toLocaleString()}M diluted shares · CapEx $${(latest.capex / 1000).toFixed(2)}B · Buybacks $${(latest.buybacks / 1000).toFixed(2)}B.`,
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
    if (EXCLUDED_FINANCIAL_ENTITY_RE.test(rawName)) continue;

    const candidate: DirectoryCandidate = {
      ticker,
      cik: String(cikNum).padStart(10, "0"),
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

async function ingestCandidate(
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
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
      ],
      "USD"
    );
    const ocfMap = extractAnnualSeries(
      facts,
      [
        "NetCashProvidedByUsedInOperatingActivities",
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
      ],
      "USD"
    );
    const capexMap = extractAnnualSeries(
      facts,
      [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets",
      ],
      "USD"
    );
    const sbcMap = extractAnnualSeries(
      facts,
      ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
      "USD"
    );
    const buybackMap = extractAnnualSeries(
      facts,
      ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"],
      "USD"
    );
    const sharesMap = extractAnnualSeries(
      facts,
      [
        "WeightedAverageNumberOfDilutedSharesOutstanding",
        "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
      ],
      "shares"
    );

    const years = [...revMap.keys()]
      .filter((y) => ocfMap.has(y))
      .sort()
      .slice(-5);

    if (years.length < 3) {
      if (curated) return curated;
      return null;
    }

    const latestSharesInstant = extractLatestInstant(
      facts,
      ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding"],
      "shares"
    );

    const annuals: AnnualFinancials[] = years.map((yr) => {
      const rev = (revMap.get(yr)?.val ?? 0) / 1e6;
      const ocf = (ocfMap.get(yr)?.val ?? 0) / 1e6;
      const capex = Math.abs(capexMap.get(yr)?.val ?? 0) / 1e6;
      const sbc = Math.abs(sbcMap.get(yr)?.val ?? 0) / 1e6;
      const buybacks = Math.abs(buybackMap.get(yr)?.val ?? 0) / 1e6;
      const rawShares =
        sharesMap.get(yr)?.val ??
        (latestSharesInstant > 0 ? latestSharesInstant : 100_000_000);

      return {
        fiscalYear: `FY${yr.slice(2)}`,
        revenue: Math.round(rev),
        operatingCashFlow: Math.round(ocf),
        capex: Math.round(capex),
        sbc: Math.round(sbc),
        buybacks: Math.round(buybacks),
        dilutedShares: Math.max(1, Math.round(rawShares / 1e6)),
      };
    });

    const latestAnnual = annuals[annuals.length - 1];
    if (latestAnnual.revenue <= 0) return curated ?? null;

    const latestYearKey = years[years.length - 1];
    const latestMeta = revMap.get(latestYearKey) ?? ocfMap.get(latestYearKey)!;

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
          "PaymentsToAcquireProductiveAssets",
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

      if (ttmRev > 0) {
        annuals.push({
          fiscalYear: "TTM",
          revenue: ttmRev,
          operatingCashFlow: ttmOcf,
          capex: ttmCapex,
          sbc: ttmSbc,
          buybacks: ttmBuybacks,
          dilutedShares:
            latestSharesInstant > 0
              ? Math.max(1, Math.round(latestSharesInstant / 1e6))
              : latestAnnual.dilutedShares,
        });
        lastFilingType = "10-Q";
        lastFilingDate = revQ.filed;
        lastFilingPeriodEnd = revQ.end;
        lastFilingAccession = revQ.accn;
      }
    }

    const cashRaw =
      extractLatestInstant(
        facts,
        [
          "CashAndCashEquivalentsAtCarryingValue",
          "CashCashEquivalentsAndShortTermInvestments",
        ],
        "USD"
      ) +
      extractLatestInstant(
        facts,
        ["MarketableSecuritiesCurrent", "ShortTermInvestments"],
        "USD"
      );

    const debtRaw =
      extractLatestInstant(
        facts,
        ["LongTermDebtNoncurrent", "LongTermDebt"],
        "USD"
      ) +
      extractLatestInstant(
        facts,
        ["LongTermDebtCurrent", "ShortTermBorrowings", "DebtCurrent"],
        "USD"
      );

    const computed = computeAnnualMetrics(annuals);
    const latestComputed = computed[computed.length - 1];

    // XBRL sanity guardrail: reject anomalous unit mismatches unless curated
    if (
      !curated &&
      (latestComputed.trueFcfMargin > 85 ||
        latestComputed.trueFcfMargin < -180 ||
        latestComputed.sbcPctRevenue > 120)
    ) {
      return null;
    }

    const dilutionCagr = computeNetDilutionCagr(annuals);

    const price = existing?.price ?? meta?.fallbackPrice ?? 100;
    const marketCap = Math.round(price * latestComputed.dilutedShares);

    const defaultTargetFcf = Math.max(
      5,
      Math.min(50, Math.round(Math.max(latestComputed.reportedFcfMargin, 18)))
    );
    const defaultSbcDrag = Math.max(
      0.5,
      Math.min(18, Number((latestComputed.sbcPctRevenue * 0.65).toFixed(1)))
    );

    const baseSnapshot: Omit<CompanySnapshot, "filingDiffs"> = {
      ticker: candidate.ticker,
      cik: candidate.cik,
      name: curated?.name ?? candidate.name,
      exchange: candidate.exchange,
      sector: meta?.sector ?? curated?.sector ?? inferSector(candidate.name),
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
      annuals,
      defaultDcf: curated?.defaultDcf ?? {
        wacc: 9.5,
        terminalMultiple: 22,
        targetFcfMargin: defaultTargetFcf,
        sbcDragPct: defaultSbcDrag,
      },
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
          `[amber-ingest] Progress: ${i + 1}/${candidates.length} checked · ${companies.length} SEC-verified companies`
        );
      }
    }
    // Respect SEC EDGAR fair-access limit (<10 req/sec)
    await new Promise((r) => setTimeout(r, 140));
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

run();
