import { unstable_cache } from "next/cache";
import { cache } from "react";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  annualFinancials,
  companies,
  filingDiffs,
  insiderTrades,
} from "@/db/schema";
import type { InsiderTradeItem } from "@/components/InsiderRadar";
import insiderTradesJson from "@/data/generated/insider-trades.json";
import {
  ALL_COMPANIES,
  getCompany as getStaticCompany,
  getStaticSearchIndex,
  type SearchIndexEntry,
} from "@/data/universe";
import { reconcileFilingInputs } from "@/data/filing-supplements";
import { withValuationBusinessFacts } from "@/data/valuation-business-facts";
import { buildSearchIndexEntry, toPortfolioEntry, toSearchIndexEntry, type SearchIndexEntryWithBaseScenario } from "@/data/search-index";
import { buildCompareCompanyHistory, COMPARE_HISTORY_YEARS, type CompareCompanyHistory } from "@/lib/compare-history";
import { normalizeCompanyName } from "@/lib/company-name";
import { queryInsiderBuySummaries, queryMaterialEventSummaries } from "@/data/filing-summaries";
import { periodicFilingType, type CompanySnapshot, type FilingDiffItem } from "@/lib/finance";

export type { InsiderBuySummary, MaterialEventSummary } from "@/data/filing-summaries";

async function queryCompanyFromDb(
  ticker: string
): Promise<CompanySnapshot | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const [row] = await db
      .select()
      .from(companies)
      .where(eq(companies.ticker, ticker))
      .limit(1);

    if (!row) return null;

    const [annualRows, diffRows] = await Promise.all([
      db
        .select()
        .from(annualFinancials)
        .where(eq(annualFinancials.ticker, ticker))
        .orderBy(asc(annualFinancials.sortOrder)),
      db
        .select()
        .from(filingDiffs)
        .where(eq(filingDiffs.ticker, ticker))
        .orderBy(desc(filingDiffs.filingDate)),
    ]);

    if (annualRows.length === 0) return null;

    const snapshot: CompanySnapshot = {
      ticker: row.ticker,
      cik: row.cik,
      name: normalizeCompanyName(row.name),
      exchange: row.exchange === "NYSE" ? "NYSE" : "NASDAQ",
      sector: row.sector,
      businessFacts: row.businessFacts,
      tagline: row.tagline,
      price: row.price,
      priceAsOf: row.priceAsOf,
      marketCap: row.marketCap,
      cashAndEquiv: row.cashAndEquiv,
      totalDebt: row.totalDebt,
      lastFiling: {
        type: periodicFilingType(row.lastFilingType),
        date: row.lastFilingDate,
        periodEnd: row.lastFilingPeriodEnd,
        accessionNumber: row.lastFilingAccession,
      },
      annuals: annualRows.map((a) => ({
        fiscalYear: a.fiscalYear,
        revenue: a.revenue,
        operatingCashFlow: a.operatingCashFlow,
        capex: a.capex,
        sbc: a.sbc,
        buybacks: a.buybacks,
        dilutedShares: a.dilutedShares,
        grossProfit: a.grossProfit,
        rdExpense: a.rdExpense,
        sgaExpense: a.sgaExpense,
        operatingIncome: a.operatingIncome,
        netIncome: a.netIncome,
        stockholdersEquity: a.stockholdersEquity,
        depreciationAmortization: a.depreciationAmortization,
        goodwillIntangibles: a.goodwillIntangibles,
        dividendsPaid: a.dividendsPaid,
        periodEndDate: a.periodEndDate,
        cashAndEquiv: a.cashAndEquiv,
        totalDebt: a.totalDebt,
      })),
      priceHistory: row.priceHistory ?? undefined,
      quarterlyFinancials: row.quarterlyFinancials ?? undefined,
      defaultDcf: row.defaultDcf,
      filingDiffs: diffRows.map((d) => ({
        id: d.id,
        filingType: d.filingType as FilingDiffItem["filingType"],
        filingDate: d.filingDate,
        accessionNumber: d.accessionNumber,
        section: d.section,
        category: d.category as FilingDiffItem["category"],
        materiality: d.materiality as FilingDiffItem["materiality"],
        headline: d.headline,
        summary: d.summary,
        priorExcerpt: d.priorExcerpt,
        currentExcerpt: d.currentExcerpt,
        signalNote: d.signalNote,
      })),
    };
    return reconcileFilingInputs(withValuationBusinessFacts(snapshot));
  } catch (err) {
    console.warn(`[amber-repo] Neon query failed for ${ticker}, using static snapshot:`, err);
    return null;
  }
}

export async function getCompanySnapshot(
  rawTicker: string
): Promise<CompanySnapshot | undefined> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!process.env.DATABASE_URL) {
    return getStaticCompany(ticker);
  }

  const cachedFetch = unstable_cache(
    async () => {
      const res = await queryCompanyFromDb(ticker);
      if (!res) {
        // Throw so unstable_cache never caches transient DB misses for 1 hour
        throw new Error(`Company ${ticker} unavailable from DB`);
      }
      return res;
    },
    ["amber-company-v6", ticker],
    {
      revalidate: 3600,
      tags: ["companies", `ticker-${ticker}`],
    }
  );

  try {
    return await cachedFetch();
  } catch {
    return getStaticCompany(ticker);
  }
}

export async function getCompareHistory(tickers: readonly string[]): Promise<CompareCompanyHistory[]> {
  const db = getDb();
  const histories = await Promise.all(tickers.map(async (ticker) => {
    if (db) {
      const cachedFetch = unstable_cache(
        async () => {
          const rows = await db
            .select({
              company: {
                name: companies.name,
                sector: companies.sector,
                cik: companies.cik,
                businessFacts: companies.businessFacts,
                price: companies.price,
                priceAsOf: companies.priceAsOf,
                cashAndEquiv: companies.cashAndEquiv,
                totalDebt: companies.totalDebt,
              },
              lastFiling: { date: companies.lastFilingDate, periodEnd: companies.lastFilingPeriodEnd },
              annual: {
                fiscalYear: annualFinancials.fiscalYear,
                periodEndDate: annualFinancials.periodEndDate,
                revenue: annualFinancials.revenue,
                operatingCashFlow: annualFinancials.operatingCashFlow,
                capex: annualFinancials.capex,
                sbc: annualFinancials.sbc,
                buybacks: annualFinancials.buybacks,
                dilutedShares: annualFinancials.dilutedShares,
              },
            })
            .from(annualFinancials)
            .innerJoin(companies, eq(companies.ticker, annualFinancials.ticker))
            .where(and(eq(annualFinancials.ticker, ticker), ne(annualFinancials.fiscalYear, "TTM")))
            .orderBy(desc(annualFinancials.sortOrder), desc(annualFinancials.id))
            .limit(COMPARE_HISTORY_YEARS);
          if (rows.length === 0) throw new Error(`Comparison history unavailable for ${ticker}`);

          const { company, lastFiling } = rows[0];
          return buildCompareCompanyHistory(reconcileFilingInputs(withValuationBusinessFacts({
            ...company,
            ticker,
            name: normalizeCompanyName(company.name),
            lastFiling,
            annuals: rows.reverse().map(({ annual }) => annual),
          })));
        },
        ["amber-compare-history-v4", ticker],
        { revalidate: 3600, tags: ["companies", `ticker-${ticker}`] }
      );
      try {
        return await cachedFetch();
      } catch {
        // Keep static coverage available when a database snapshot is missing.
      }
    }

    const company = getStaticCompany(ticker);
    return company ? buildCompareCompanyHistory(company) : null;
  }));
  return histories.filter((history) => history !== null);
}

export async function getAllTickers(): Promise<string[]> {
  const db = getDb();
  if (!db) {
    return ALL_COMPANIES.map((c) => c.ticker);
  }

  try {
    const rows = await db
      .select({ ticker: companies.ticker })
      .from(companies)
      .where(eq(companies.isActive, true));
    if (rows.length > 0) {
      return rows.map((r) => r.ticker);
    }
  } catch {
    // Fallback to static universe
  }
  return ALL_COMPANIES.map((c) => c.ticker);
}

async function querySearchIndexFromDb(): Promise<SearchIndexEntryWithBaseScenario[] | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const [companyRows, annualRows] = await Promise.all([
      db
        .select({
          ticker: companies.ticker,
          cik: companies.cik,
          name: companies.name,
          exchange: companies.exchange,
          sector: companies.sector,
          businessFacts: companies.businessFacts,
          price: companies.price,
          priceAsOf: companies.priceAsOf,
          marketCap: companies.marketCap,
          cashAndEquiv: companies.cashAndEquiv,
          totalDebt: companies.totalDebt,
          defaultDcf: companies.defaultDcf,
          lastFilingDate: companies.lastFilingDate,
          lastFilingPeriodEnd: companies.lastFilingPeriodEnd,
        })
        .from(companies)
        .where(eq(companies.isActive, true)),
      db
        .select({
          ticker: annualFinancials.ticker,
          fiscalYear: annualFinancials.fiscalYear,
          periodEndDate: annualFinancials.periodEndDate,
          revenue: annualFinancials.revenue,
          operatingCashFlow: annualFinancials.operatingCashFlow,
          capex: annualFinancials.capex,
          sbc: annualFinancials.sbc,
          buybacks: annualFinancials.buybacks,
          dilutedShares: annualFinancials.dilutedShares,
          operatingIncome: annualFinancials.operatingIncome,
          netIncome: annualFinancials.netIncome,
          stockholdersEquity: annualFinancials.stockholdersEquity,
          depreciationAmortization: annualFinancials.depreciationAmortization,
          goodwillIntangibles: annualFinancials.goodwillIntangibles,
          dividendsPaid: annualFinancials.dividendsPaid,
          cashAndEquiv: annualFinancials.cashAndEquiv,
          totalDebt: annualFinancials.totalDebt,
        })
        .from(annualFinancials)
        .innerJoin(companies, eq(annualFinancials.ticker, companies.ticker))
        .where(eq(companies.isActive, true))
        .orderBy(asc(annualFinancials.sortOrder)),
    ]);

    if (companyRows.length === 0) return null;

    const annualsByTicker = new Map<string, typeof annualRows>();
    for (const row of annualRows) {
      const list = annualsByTicker.get(row.ticker) ?? [];
      list.push(row);
      annualsByTicker.set(row.ticker, list);
    }

    const index: SearchIndexEntryWithBaseScenario[] = [];
    for (const c of companyRows) {
      const annuals = annualsByTicker.get(c.ticker);
      if (!annuals || annuals.length === 0) continue;

      index.push(buildSearchIndexEntry({
        ...c,
        exchange: c.exchange === "NYSE" ? "NYSE" : "NASDAQ",
        annuals: annuals.map((a) => ({
          ...a,
          operatingIncome: a.operatingIncome ?? undefined,
          netIncome: a.netIncome ?? undefined,
        })),
        lastFiling: { date: c.lastFilingDate, periodEnd: c.lastFilingPeriodEnd },
      }));
    }

    return index.length > 0 ? index : null;
  } catch (err) {
    console.warn("[amber-repo] Neon search index failed, using static index:", err);
    return null;
  }
}

async function getSearchIndexWithBaseScenarios(): Promise<SearchIndexEntryWithBaseScenario[]> {
  if (!process.env.DATABASE_URL) {
    return getStaticSearchIndex();
  }

  const cachedFetch = unstable_cache(
    async () => {
      const res = await querySearchIndexFromDb();
      if (!res || res.length === 0) {
        throw new Error("Search index unavailable from DB");
      }
      return res;
    },
    ["amber-search-index-v9"],
    {
      revalidate: 3600,
      tags: ["companies"],
    }
  );

  try {
    return await cachedFetch();
  } catch {
    return getStaticSearchIndex();
  }
}

export const getSearchIndex = cache(async (): Promise<SearchIndexEntry[]> => {
  return (await getSearchIndexWithBaseScenarios()).map(toSearchIndexEntry);
});

export async function getPortfolioEntries() {
  return (await getSearchIndexWithBaseScenarios()).map(toPortfolioEntry);
}

const staticInsiderTrades: Record<string, InsiderTradeItem[]> =
  insiderTradesJson as Record<string, InsiderTradeItem[]>;
const COMPANY_INSIDER_LIMIT = 24;
const MARKET_INSIDER_LIMIT_PER_TYPE = 60;

function toInsiderTradeItem(row: typeof insiderTrades.$inferSelect): InsiderTradeItem {
  return {
    id: row.id,
    filingDate: row.filingDate,
    insiderName: row.insiderName,
    insiderTitle: row.insiderTitle,
    transactionType: row.transactionType === "Buy" ? "Buy" : "Sell",
    shares: row.shares,
    pricePerShare: row.pricePerShare,
    totalValue: row.totalValue,
    accessionNumber: row.accessionNumber,
  };
}

function newestInsiderTradesFirst(
  a: Pick<InsiderTradeItem, "filingDate">,
  b: Pick<InsiderTradeItem, "filingDate">
) {
  return b.filingDate.localeCompare(a.filingDate);
}

export async function getInsiderTrades(
  rawTicker: string
): Promise<InsiderTradeItem[]> {
  const ticker = rawTicker.trim().toUpperCase();
  const db = getDb();
  const getStaticTrades = () =>
    (staticInsiderTrades[ticker] ?? [])
      .toSorted(newestInsiderTradesFirst)
      .slice(0, COMPANY_INSIDER_LIMIT);

  if (!db) return getStaticTrades();

  const cachedFetch = unstable_cache(
    async () => {
      const rows = await db
        .select()
        .from(insiderTrades)
        .where(eq(insiderTrades.ticker, ticker))
        .orderBy(desc(insiderTrades.filingDate))
        .limit(COMPANY_INSIDER_LIMIT);
      return rows.map(toInsiderTradeItem);
    },
    ["amber-insider-trades-v3", ticker],
    { revalidate: 3600, tags: ["companies", `ticker-${ticker}`] }
  );

  try {
    return await cachedFetch();
  } catch {
    return getStaticTrades();
  }
}

export interface SectorBenchmark {
  sector: string;
  count: number;
  medianTrueFcfMargin: number;
  medianSbcPctRevenue: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function getSectorBenchmark(
  sector: string,
  index: SearchIndexEntry[]
): SectorBenchmark | null {
  const peers = index.filter((c) => c.sector === sector && !c.scenarioBasis.equityLensOnly);
  if (peers.length < 3) return null;

  return {
    sector,
    count: peers.length,
    medianTrueFcfMargin: Number(
      median(peers.map((p) => p.trueFcfMargin)).toFixed(1)
    ),
    medianSbcPctRevenue: Number(
      median(peers.map((p) => p.sbcPctRevenue)).toFixed(1)
    ),
  };
}

export interface MarketInsiderFeedItem extends InsiderTradeItem {
  ticker: string;
}

function getStaticMarketInsiders(): MarketInsiderFeedItem[] {
  const trades = Object.entries(staticInsiderTrades)
    .flatMap(([ticker, items]) => items.map((item) => ({ ...item, ticker })))
    .sort(newestInsiderTradesFirst);
  const buys = trades.filter((trade) => trade.transactionType === "Buy");
  const sells = trades.filter((trade) => trade.transactionType === "Sell");
  return [
    ...buys.slice(0, MARKET_INSIDER_LIMIT_PER_TYPE),
    ...sells.slice(0, MARKET_INSIDER_LIMIT_PER_TYPE),
  ].sort(newestInsiderTradesFirst);
}

export async function getRecentMarketInsiders(): Promise<
  MarketInsiderFeedItem[]
> {
  const db = getDb();
  if (!db) return getStaticMarketInsiders();

  const cachedFetch = unstable_cache(
    async () => {
      // Reserve room for purchases alongside higher-volume sales.
      const [buyRows, sellRows] = await Promise.all([
        db
          .select()
          .from(insiderTrades)
          .where(eq(insiderTrades.transactionType, "Buy"))
          .orderBy(desc(insiderTrades.filingDate))
          .limit(MARKET_INSIDER_LIMIT_PER_TYPE),
        db
          .select()
          .from(insiderTrades)
          .where(eq(insiderTrades.transactionType, "Sell"))
          .orderBy(desc(insiderTrades.filingDate))
          .limit(MARKET_INSIDER_LIMIT_PER_TYPE),
      ]);
      const rows = [...buyRows, ...sellRows].sort(newestInsiderTradesFirst);
      return rows.map((row) => ({
        ...toInsiderTradeItem(row),
        ticker: row.ticker,
      }));
    },
    ["amber-market-insiders-v3"],
    { revalidate: 3600, tags: ["companies"] }
  );

  try {
    return await cachedFetch();
  } catch {
    return getStaticMarketInsiders();
  }
}

export interface MarketFilingDiffItem {
  id: string;
  ticker: string;
  companyName: string;
  sector: string;
  filingType: string;
  filingDate: string;
  accessionNumber: string;
  section: string;
  category: string;
  materiality: "High" | "Medium" | "Watch";
  headline: string;
  summary: string;
  priorExcerpt: string;
  currentExcerpt: string;
  signalNote: string;
  source: string;
}

const filingMaterialityRank = { High: 0, Medium: 1, Watch: 2 };

function staticFilingDiffsForCompany(company: CompanySnapshot): MarketFilingDiffItem[] {
  return company.filingDiffs.map((diff) => ({
    ...diff,
    ticker: company.ticker,
    companyName: company.name,
    sector: company.sector,
    source: diff.section.toLowerCase().includes("item") ? "text-diff" : "xbrl",
  }));
}

function compareFilingDiffs(a: MarketFilingDiffItem, b: MarketFilingDiffItem): number {
  return b.filingDate.localeCompare(a.filingDate) ||
    filingMaterialityRank[a.materiality] - filingMaterialityRank[b.materiality] ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

let staticFilingDiffs: MarketFilingDiffItem[] | undefined;
let staticFilingDiffsById: Map<string, MarketFilingDiffItem> | undefined;

function getSortedStaticFilingDiffs(): MarketFilingDiffItem[] {
  return staticFilingDiffs ??= ALL_COMPANIES.flatMap(staticFilingDiffsForCompany).sort(compareFilingDiffs);
}

function selectMarketFilingDiffs(db: NonNullable<ReturnType<typeof getDb>>) {
  return db
    .select({
      id: filingDiffs.id,
      ticker: filingDiffs.ticker,
      companyName: companies.name,
      sector: companies.sector,
      filingType: filingDiffs.filingType,
      filingDate: filingDiffs.filingDate,
      accessionNumber: filingDiffs.accessionNumber,
      section: filingDiffs.section,
      category: filingDiffs.category,
      materiality: filingDiffs.materiality,
      headline: filingDiffs.headline,
      summary: filingDiffs.summary,
      priorExcerpt: filingDiffs.priorExcerpt,
      currentExcerpt: filingDiffs.currentExcerpt,
      signalNote: filingDiffs.signalNote,
      source: filingDiffs.source,
    })
    .from(filingDiffs)
    .innerJoin(companies, eq(filingDiffs.ticker, companies.ticker));
}

function toMarketFilingDiff(row: Omit<MarketFilingDiffItem, "materiality"> & { materiality: string }): MarketFilingDiffItem {
  return {
    ...row,
    companyName: normalizeCompanyName(row.companyName),
    materiality: row.materiality === "High" || row.materiality === "Medium" ? row.materiality : "Watch",
  };
}

const filingDiffOrder = [
  desc(filingDiffs.filingDate),
  sql`case ${filingDiffs.materiality} when 'High' then 0 when 'Medium' then 1 else 2 end`,
  asc(filingDiffs.id),
];

export async function getRecentFilingDiffs(limit = 160): Promise<MarketFilingDiffItem[]> {
  if (process.env.DATABASE_URL) {
    const cachedFetch = unstable_cache(
      async () => {
        const db = getDb();
        if (!db) throw new Error("DB unavailable");
        const rows = await selectMarketFilingDiffs(db).orderBy(...filingDiffOrder).limit(limit);
        if (rows.length === 0) throw new Error("No filing diffs returned from DB");
        return rows.map(toMarketFilingDiff);
      },
      ["amber-recent-filing-diffs-v2", String(limit)],
      { revalidate: 3600, tags: ["filings", "companies"] },
    );
    try {
      return await cachedFetch();
    } catch {
      // Keep the bundled filing feed available during database outages.
    }
  }
  return getSortedStaticFilingDiffs().slice(0, limit);
}

// The page and its metadata request the same, already decoded route parameter.
export const getFilingDiffById = cache(async (id: string): Promise<MarketFilingDiffItem | null> => {
  if (!id) return null;
  try {
    const db = getDb();
    if (db) {
      const [row] = await selectMarketFilingDiffs(db).where(eq(filingDiffs.id, id)).limit(1);
      if (row) return toMarketFilingDiff(row);
    }
  } catch {
    // Keep bundled permalinks available during database outages.
  }

  if (!staticFilingDiffsById) {
    staticFilingDiffsById = new Map();
    for (const company of ALL_COMPANIES) {
      for (const diff of staticFilingDiffsForCompany(company)) {
        const existing = staticFilingDiffsById.get(diff.id);
        if (!existing || compareFilingDiffs(diff, existing) < 0) staticFilingDiffsById.set(diff.id, diff);
      }
    }
  }
  return staticFilingDiffsById.get(id) ?? null;
});

export async function getFilingDiffsForTickers(tickers: string[], limit = 30): Promise<MarketFilingDiffItem[]> {
  const normalized = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))].sort();
  if (normalized.length === 0) return [];

  if (process.env.DATABASE_URL) {
    const cachedFetch = unstable_cache(
      async () => {
        const db = getDb();
        if (!db) throw new Error("DB unavailable");
        const rows = await selectMarketFilingDiffs(db)
          .where(inArray(filingDiffs.ticker, normalized))
          .orderBy(...filingDiffOrder)
          .limit(limit);
        if (rows.length === 0) throw new Error("No ticker filing diffs returned from DB");
        return rows.map(toMarketFilingDiff);
      },
      ["amber-ticker-filing-diffs-v2", normalized.join(","), String(limit)],
      { revalidate: 3600, tags: ["filings", "companies"] },
    );
    try {
      return await cachedFetch();
    } catch {
      // Use the bundled filings for these tickers when the live feed is unavailable.
    }
  }

  return normalized.flatMap((ticker) => {
    const company = getStaticCompany(ticker);
    return company ? staticFilingDiffsForCompany(company) : [];
  }).sort(compareFilingDiffs).slice(0, limit);
}

export async function getInsiderTradesForTickers(
  tickers: string[],
  limit = 40,
  onlyBuys = false,
): Promise<MarketInsiderFeedItem[]> {
  const normalized = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (normalized.length === 0) return [];

  const fallback = () => onlyBuys
    ? normalized.flatMap((ticker) => (staticInsiderTrades[ticker] ?? [])
        .filter((trade) => trade.transactionType === "Buy")
        .map((trade) => ({ ...trade, ticker })))
        .sort((a, b) => newestInsiderTradesFirst(a, b) || b.totalValue - a.totalValue || a.id.localeCompare(b.id))
        .slice(0, limit)
    : [];

  if (!process.env.DATABASE_URL) return fallback();

  const key = [...normalized].sort().join(",");
  const cachedFetch = unstable_cache(
    async () => {
      const db = getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(insiderTrades)
        .where(and(
          inArray(insiderTrades.ticker, normalized),
          onlyBuys ? eq(insiderTrades.transactionType, "Buy") : undefined,
        ))
        .orderBy(desc(insiderTrades.filingDate), desc(insiderTrades.totalValue), asc(insiderTrades.id))
        .limit(limit);

      return rows.map((row) => ({ ...toInsiderTradeItem(row), ticker: row.ticker }));
    },
    ["amber-ticker-insiders-v2", key, String(limit), String(onlyBuys)],
    { revalidate: 3600, tags: ["insiders"] }
  );

  try {
    return await cachedFetch();
  } catch {
    return fallback();
  }
}

export async function getInsiderBuySummaries() {
  const db = getDb();
  if (!db) return {};
  const cachedFetch = unstable_cache(
    () => queryInsiderBuySummaries(db, new Date()),
    ["amber-insider-buy-summaries-v2"],
    { revalidate: 3600, tags: ["insiders"] }
  );
  try {
    return await cachedFetch();
  } catch {
    return {};
  }
}

export async function getMaterialEventSummaries() {
  const db = getDb();
  if (!db) return {};
  const cachedFetch = unstable_cache(
    () => queryMaterialEventSummaries(db, new Date()),
    ["amber-material-event-summaries-v2"],
    { revalidate: 3600, tags: ["filings"] }
  );
  try {
    return await cachedFetch();
  } catch {
    return {};
  }
}

export async function getInsiderBuyTickers(): Promise<string[]> {
  const map = await getInsiderBuySummaries();
  return Object.keys(map);
}

export async function getMaterialEventTickers(): Promise<string[]> {
  const map = await getMaterialEventSummaries();
  return Object.keys(map);
}
