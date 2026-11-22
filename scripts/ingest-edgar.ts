/**
 * Amber Batch SEC EDGAR XBRL Ingestion Pipeline (Phase 1)
 *
 * Fetches multi-year 10-K financials directly from the official free SEC EDGAR
 * CompanyFacts API (data.sec.gov) for our coverage universe, normalizes them into
 * Amber's canonical CompanySnapshot schema, and writes compact static JSON artifacts:
 *   - src/data/generated/companies.json
 *   - src/data/generated/search-index.json
 *
 * Usage:
 *   SEC_USER_AGENT="AmberFinance research@amber.example" pnpm ingest:edgar
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

interface SeedTicker {
  ticker: string;
  cik: string;
  name: string;
  exchange: "NASDAQ" | "NYSE";
  sector: string;
  tagline: string;
  price: number; // Reference EOD share price ($) — replaced by nightly EOD batch in Phase 3
}

/**
 * Curated 40-company Phase 1 universe spanning AI/Semis, Enterprise SaaS,
 * Mega-Cap Tech, Fintech, Consumer Compounders, Healthcare, and Industrials.
 */
const UNIVERSE: SeedTicker[] = [
  // Flagship 6 Pilot Tickers (rich curated diffs preserved)
  { ticker: "PLTR", cik: "0001321655", name: "Palantir Technologies", exchange: "NASDAQ", sector: "Enterprise AI & Defense Software", tagline: "High-margin FCF inflection vs. persistent SBC & share count expansion", price: 78.4 },
  { ticker: "NVDA", cik: "0001045810", name: "NVIDIA Corporation", exchange: "NASDAQ", sector: "Semiconductors & AI Compute", tagline: "Extraordinary cash conversion with rising hyperscaler concentration", price: 134.2 },
  { ticker: "MSFT", cik: "0000789019", name: "Microsoft Corporation", exchange: "NASDAQ", sector: "Cloud Infrastructure & Software", tagline: "AI datacenter CapEx surge compressing near-term FCF conversion", price: 416.8 },
  { ticker: "SNOW", cik: "0001640147", name: "Snowflake Inc.", exchange: "NYSE", sector: "Cloud Data Platform", tagline: "Classic SBC-to-FCF gap: strong headline cash flow vs. negative True FCF", price: 168.5 },
  { ticker: "SHOP", cik: "0001594805", name: "Shopify Inc.", exchange: "NYSE", sector: "Commerce Infrastructure", tagline: "Post-logistics operating leverage with disciplined SBC compression", price: 109.6 },
  { ticker: "COST", cik: "0000909832", name: "Costco Wholesale", exchange: "NASDAQ", sector: "Membership Warehouse Retail", tagline: "Ultra-clean cash flow & minimal SBC — stress-test the 50x+ valuation", price: 964.5 },

  // Mega-Cap Tech & Cloud
  { ticker: "AAPL", cik: "0000320193", name: "Apple Inc.", exchange: "NASDAQ", sector: "Consumer Hardware & Services", tagline: "Massive buyback engine offsetting modest SBC with steady share retirement", price: 228.5 },
  { ticker: "GOOGL", cik: "0001652044", name: "Alphabet Inc.", exchange: "NASDAQ", sector: "Search, Cloud & AI", tagline: "Heavy AI CapEx cycle paired with $20B+ annual SBC and aggressive buybacks", price: 176.4 },
  { ticker: "AMZN", cik: "0001018724", name: "Amazon.com Inc.", exchange: "NASDAQ", sector: "Cloud & E-Commerce", tagline: "AWS operating leverage vs. massive logistics & AI infrastructure CapEx", price: 208.2 },
  { ticker: "META", cik: "0001326801", name: "Meta Platforms Inc.", exchange: "NASDAQ", sector: "Social & AI Infrastructure", tagline: "Year-of-efficiency FCF surge funding record AI datacenter buildout", price: 612.0 },
  { ticker: "ORCL", cik: "0001341439", name: "Oracle Corporation", exchange: "NYSE", sector: "Enterprise Database & Cloud", tagline: "OCI backlog acceleration driving a sharp step-up in CapEx intensity", price: 172.5 },

  // Semiconductors & Hardware
  { ticker: "AMD", cik: "0000002488", name: "Advanced Micro Devices", exchange: "NASDAQ", sector: "Semiconductors", tagline: "Datacenter GPU ramp vs. rising R&D equity compensation", price: 118.4 },
  { ticker: "AVGO", cik: "0001730168", name: "Broadcom Inc.", exchange: "NASDAQ", sector: "Semiconductors & Infrastructure Software", tagline: "VMware integration and custom AI ASICs driving elite FCF margins", price: 224.0 },
  { ticker: "QCOM", cik: "0000804328", name: "Qualcomm Inc.", exchange: "NASDAQ", sector: "Semiconductors", tagline: "High cash conversion semiconductor leader returning capital via buybacks", price: 164.2 },
  { ticker: "TXN", cik: "0000097476", name: "Texas Instruments", exchange: "NASDAQ", sector: "Analog Semiconductors", tagline: "Multi-year 300mm fab CapEx cycle temporarily depressing headline FCF", price: 192.6 },
  { ticker: "ANET", cik: "0001596532", name: "Arista Networks", exchange: "NYSE", sector: "AI & Cloud Networking", tagline: "Asset-light networking compounder with ultra-clean True FCF conversion", price: 108.5 },

  // High-SBC Enterprise SaaS & Cloud Security
  { ticker: "CRWD", cik: "0001535527", name: "CrowdStrike Holdings", exchange: "NASDAQ", sector: "Cybersecurity", tagline: "Best-in-class headline FCF margin weighed against steep SBC expense", price: 382.0 },
  { ticker: "DDOG", cik: "0001561550", name: "Datadog Inc.", exchange: "NASDAQ", sector: "Cloud Observability", tagline: "Strong GAAP profitability inflection while SBC remains a major FCF drag", price: 142.8 },
  { ticker: "NET", cik: "0001477333", name: "Cloudflare Inc.", exchange: "NYSE", sector: "Edge Network & Security", tagline: "Edge infrastructure scale-up with high SBC relative to reported FCF", price: 138.4 },
  { ticker: "PANW", cik: "0001327567", name: "Palo Alto Networks", exchange: "NASDAQ", sector: "Cybersecurity", tagline: "Platformization billings shift paired with $1B+ annual SBC", price: 192.0 },
  { ticker: "NOW", cik: "0001373715", name: "ServiceNow Inc.", exchange: "NYSE", sector: "Enterprise Workflow SaaS", tagline: "Durable 20%+ compounder with steady SBC compression toward True FCF", price: 985.0 },
  { ticker: "CRM", cik: "0001108524", name: "Salesforce Inc.", exchange: "NYSE", sector: "Enterprise CRM", tagline: "Activist-era margin discipline turning massive FCF into net share reduction", price: 326.5 },
  { ticker: "ADBE", cik: "0000796343", name: "Adobe Inc.", exchange: "NASDAQ", sector: "Creative & Document Software", tagline: "High-margin recurring cash flow funding consistent share count shrinkage", price: 448.2 },
  { ticker: "INTU", cik: "0000896878", name: "Intuit Inc.", exchange: "NASDAQ", sector: "Financial Software", tagline: "Small-business and tax moat with rising SBC offset by steady repurchases", price: 618.4 },
  { ticker: "WDAY", cik: "0001327811", name: "Workday Inc.", exchange: "NASDAQ", sector: "Enterprise HCM & Finance", tagline: "Mature enterprise SaaS where SBC still absorbs over half of reported FCF", price: 262.0 },
  { ticker: "MDB", cik: "0001441816", name: "MongoDB Inc.", exchange: "NASDAQ", sector: "Developer Data Platform", tagline: "Atlas consumption growth vs. heavy equity compensation drag", price: 248.5 },
  { ticker: "ZS", cik: "0001713683", name: "Zscaler Inc.", exchange: "NASDAQ", sector: "Zero-Trust Security", tagline: "Strong operating cash flow masked by high SBC-to-revenue intensity", price: 204.2 },

  // Consumer Tech, Fintech & Marketplaces
  { ticker: "NFLX", cik: "0001065280", name: "Netflix Inc.", exchange: "NASDAQ", sector: "Streaming & Media", tagline: "Post-password-sharing FCF breakout with minimal SBC dilution", price: 968.0 },
  { ticker: "UBER", cik: "0001543151", name: "Uber Technologies", exchange: "NYSE", sector: "Mobility & Delivery", tagline: "From cash burn to multi-billion True FCF with moderating SBC", price: 76.8 },
  { ticker: "ABNB", cik: "0001559720", name: "Airbnb Inc.", exchange: "NASDAQ", sector: "Travel Marketplace", tagline: "Negative working capital float boosting FCF vs. ~12% SBC burden", price: 142.4 },
  { ticker: "V", cik: "0001403161", name: "Visa Inc.", exchange: "NYSE", sector: "Payments Network", tagline: "Gold-standard 55%+ True FCF margin tollbooth with relentless buybacks", price: 342.6 },
  { ticker: "MA", cik: "0001141391", name: "Mastercard Inc.", exchange: "NYSE", sector: "Payments Network", tagline: "Elite capital efficiency, minimal SBC, and consistent share reduction", price: 548.2 },
  { ticker: "PYPL", cik: "0001633917", name: "PayPal Holdings", exchange: "NASDAQ", sector: "Digital Payments", tagline: "Aggressive buyback shrink vs. low-growth valuation stress test", price: 78.9 },
  { ticker: "TSLA", cik: "0001318605", name: "Tesla Inc.", exchange: "NASDAQ", sector: "EV, Energy & Autonomy", tagline: "Heavy AI/factory CapEx vs. ambitious Reverse DCF growth expectations", price: 348.0 },

  // High-Craft Compounders (Non-Tech Contrast)
  { ticker: "WMT", cik: "0000104169", name: "Walmart Inc.", exchange: "NYSE", sector: "Omnichannel Retail", tagline: "Scale retail & ad-margin inflection trading at a premium multiple", price: 96.4 },
  { ticker: "HD", cik: "0000354950", name: "The Home Depot", exchange: "NYSE", sector: "Home Improvement Retail", tagline: "Disciplined ROIC compounder with ultra-low SBC and steady cash returns", price: 408.2 },
  { ticker: "LLY", cik: "0000059478", name: "Eli Lilly and Company", exchange: "NYSE", sector: "Biopharmaceuticals", tagline: "GLP-1 capacity CapEx surge vs. steep market-implied 10Y growth", price: 862.0 },
  { ticker: "UNH", cik: "0000731766", name: "UnitedHealth Group", exchange: "NYSE", sector: "Managed Healthcare", tagline: "Massive cash generation with minimal equity dilution", price: 512.4 },
  { ticker: "VRSK", cik: "0001442145", name: "Verisk Analytics", exchange: "NASDAQ", sector: "Insurance Data & Analytics", tagline: "Proprietary data moat with clean True FCF and disciplined buybacks", price: 288.5 },
  { ticker: "FICO", cik: "0000814547", name: "Fair Isaac Corporation", exchange: "NYSE", sector: "Credit Scoring & Analytics", tagline: "Pricing power & buybacks driving one of the cleanest FCF profiles in S&P 500", price: 1_845.0 },
];

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

function daysBetween(start: string, end: string): number {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return (e - s) / (1000 * 60 * 60 * 24);
}

/**
 * Extracts annual 10-K duration series keyed by end-date year bucket (e.g. "2024").
 * Prefers the most recently filed comparative figure for each fiscal year.
 */
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
        // Full fiscal year is typically 350–380 days (52/53-week calendars)
        if (days < 330 || days > 400) continue;
      }

      // Bucket by fiscal year end date (if FY ends in Jan 2025, label FY25, else end year)
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

function generateDeterministicDiffs(
  company: Omit<CompanySnapshot, "filingDiffs">
): FilingDiffItem[] {
  const series = computeAnnualMetrics(company.annuals);
  const latest = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const dilutionCagr = computeNetDilutionCagr(company.annuals);

  const diffs: FilingDiffItem[] = [];

  // 1. SBC & True FCF Quality Signal
  const sbcMateriality: FilingDiffItem["materiality"] =
    latest.sbcPctReportedFcf >= 35 || latest.trueFcf < 0
      ? "High"
      : latest.sbcPctReportedFcf >= 15
        ? "Medium"
        : "Watch";

  diffs.push({
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
      ? `${prev.fiscalYear} SEC 10-K: Reported FCF $${(prev.reportedFcf / 1000).toFixed(2)}B · SBC $${(prev.sbc / 1000).toFixed(2)}B (${prev.sbcPctRevenue.toFixed(1)}% of revenue) · True FCF $${(prev.trueFcf / 1000).toFixed(2)}B.`
      : "Prior fiscal year baseline unavailable in XBRL window.",
    currentExcerpt: `${latest.fiscalYear} SEC 10-K: Reported FCF $${(latest.reportedFcf / 1000).toFixed(2)}B · SBC $${(latest.sbc / 1000).toFixed(2)}B (${latest.sbcPctRevenue.toFixed(1)}% of revenue) · True FCF $${(latest.trueFcf / 1000).toFixed(2)}B.`,
    signalNote:
      latest.sbcPctRevenue > 12
        ? "High SBC intensity materially widens the gap between headline FCF and owner earnings."
        : "Disciplined SBC load keeps True FCF closely aligned with reported cash flow.",
  });

  // 2. Capital Allocation & Share Count Signal
  const capAllocMateriality: FilingDiffItem["materiality"] =
    Math.abs(dilutionCagr) >= 2.0 ? "High" : "Watch";

  diffs.push({
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
  });

  return diffs;
}

async function ingestTicker(
  seed: SeedTicker,
  curatedMap: Map<string, CompanySnapshot>
): Promise<CompanySnapshot | null> {
  const curated = curatedMap.get(seed.ticker);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${seed.cik}.json`;

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
      [
        "ShareBasedCompensation",
        "AllocatedShareBasedCompensationExpense",
      ],
      "USD"
    );
    const buybackMap = extractAnnualSeries(
      facts,
      [
        "PaymentsForRepurchaseOfCommonStock",
        "PaymentsForRepurchaseOfEquity",
      ],
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

    // Find common fiscal years with Revenue & OCF (up to last 5 years)
    const years = [...revMap.keys()]
      .filter((y) => ocfMap.has(y))
      .sort()
      .slice(-5);

    if (years.length < 3) {
      if (curated) {
        console.log(
          `[amber-ingest] ${seed.ticker}: fewer than 3 XBRL years (likely IFRS/40-F), keeping curated snapshot.`
        );
        return curated;
      }
      console.warn(
        `[amber-ingest] ${seed.ticker}: skipped (only ${years.length} complete 10-K years found).`
      );
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

    const latestYearKey = years[years.length - 1];
    const latestMeta = revMap.get(latestYearKey) ?? ocfMap.get(latestYearKey)!;

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

    const latestAnnual = annuals[annuals.length - 1];
    const marketCap = Math.round(seed.price * latestAnnual.dilutedShares);

    // Sensible default DCF anchors grounded in actual margins
    const computed = computeAnnualMetrics(annuals);
    const latestComputed = computed[computed.length - 1];
    const defaultTargetFcf = Math.max(
      5,
      Math.min(50, Math.round(Math.max(latestComputed.reportedFcfMargin, 18)))
    );
    const defaultSbcDrag = Math.max(
      0.5,
      Math.min(18, Number((latestComputed.sbcPctRevenue * 0.65).toFixed(1)))
    );

    const baseSnapshot: Omit<CompanySnapshot, "filingDiffs"> = {
      ticker: seed.ticker,
      cik: seed.cik,
      name: seed.name,
      exchange: seed.exchange,
      sector: seed.sector,
      tagline: seed.tagline,
      price: seed.price,
      marketCap,
      cashAndEquiv: Math.round(cashRaw / 1e6),
      totalDebt: Math.round(debtRaw / 1e6),
      lastFiling: {
        type: "10-K",
        date: latestMeta.filed,
        periodEnd: latestMeta.end,
        accessionNumber: latestMeta.accn,
      },
      annuals,
      defaultDcf: curated?.defaultDcf ?? {
        wacc: 9.5,
        terminalMultiple: 22,
        targetFcfMargin: defaultTargetFcf,
        sbcDragPct: defaultSbcDrag,
      },
    };

    const filingDiffs =
      curated?.filingDiffs ?? generateDeterministicDiffs(baseSnapshot);

    console.log(
      `[amber-ingest] ✓ ${seed.ticker.padEnd(5)} | ${annuals.length} FYs (${annuals[0].fiscalYear}–${latestAnnual.fiscalYear}) | Rev $${(latestAnnual.revenue / 1000).toFixed(1)}B | True FCF $${(latestComputed.trueFcf / 1000).toFixed(2)}B`
    );

    return {
      ...baseSnapshot,
      filingDiffs,
    };
  } catch (err) {
    console.warn(`[amber-ingest] ! ${seed.ticker}: fetch error, fallback check`, err instanceof Error ? err.message : err);
    return curated ?? null;
  }
}

export interface SearchIndexEntry {
  ticker: string;
  name: string;
  exchange: "NASDAQ" | "NYSE";
  sector: string;
  marketCap: number;
  revenue: number;
  reportedFcf: number;
  sbc: number;
  trueFcf: number;
  trueFcfMargin: number;
  sbcPctRevenue: number;
  sbcPctReportedFcf: number;
  netDilutionCagr: number;
  impliedCagr: number;
  lastFilingDate: string;
}

async function run() {
  console.log(
    `[amber-ingest] Starting live SEC EDGAR XBRL sync for ${UNIVERSE.length} companies...`
  );

  const curatedMap = new Map(PILOT_TICKERS.map((c) => [c.ticker, c]));
  const companies: CompanySnapshot[] = [];

  for (const seed of UNIVERSE) {
    const snap = await ingestTicker(seed, curatedMap);
    if (snap) {
      companies.push(snap);
    }
    // Respect SEC EDGAR fair-access rate limit (<10 req/sec)
    await new Promise((r) => setTimeout(r, 180));
  }

  const searchIndex: SearchIndexEntry[] = companies.map((c) => {
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

  const outDir = path.resolve(process.cwd(), "src/data/generated");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "companies.json"),
    JSON.stringify(companies, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(outDir, "search-index.json"),
    JSON.stringify(searchIndex, null, 2) + "\n"
  );

  console.log(
    `\n[amber-ingest] Done! Wrote ${companies.length} SEC-verified companies to src/data/generated/.`
  );
}

run();
