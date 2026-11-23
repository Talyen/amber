import { unstable_cache } from "next/cache";
import { asc, desc, eq, inArray } from "drizzle-orm";
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
  SEARCH_INDEX,
  getCompany as getStaticCompany,
  type SearchIndexEntry,
} from "@/data/universe";
import { buildSearchIndexEntry } from "@/data/search-index";
import type { CompanySnapshot, FilingDiffItem } from "@/lib/finance";

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

    return {
      ticker: row.ticker,
      cik: row.cik,
      name: row.name,
      exchange: row.exchange === "NYSE" ? "NYSE" : "NASDAQ",
      sector: row.sector,
      tagline: row.tagline,
      price: row.price,
      marketCap: row.marketCap,
      cashAndEquiv: row.cashAndEquiv,
      totalDebt: row.totalDebt,
      lastFiling: {
        type: row.lastFilingType === "10-Q" ? "10-Q" : "10-K",
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
    ["amber-company-v3", ticker],
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

async function querySearchIndexFromDb(): Promise<SearchIndexEntry[] | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const [companyRows, annualRows] = await Promise.all([
      db.select().from(companies).where(eq(companies.isActive, true)),
      db
        .select()
        .from(annualFinancials)
        .orderBy(asc(annualFinancials.sortOrder)),
    ]);

    if (companyRows.length === 0) return null;

    const annualsByTicker = new Map<string, typeof annualRows>();
    for (const row of annualRows) {
      const list = annualsByTicker.get(row.ticker) ?? [];
      list.push(row);
      annualsByTicker.set(row.ticker, list);
    }

    const index: SearchIndexEntry[] = [];
    for (const c of companyRows) {
      const annuals = annualsByTicker.get(c.ticker);
      if (!annuals || annuals.length === 0) continue;

      index.push(buildSearchIndexEntry({
        ...c,
        exchange: c.exchange === "NYSE" ? "NYSE" : "NASDAQ",
        annuals,
        lastFiling: { date: c.lastFilingDate },
      }));
    }

    return index.length > 0 ? index : null;
  } catch (err) {
    console.warn("[amber-repo] Neon search index failed, using static index:", err);
    return null;
  }
}

export async function getSearchIndex(): Promise<SearchIndexEntry[]> {
  if (!process.env.DATABASE_URL) {
    return SEARCH_INDEX;
  }

  const cachedFetch = unstable_cache(
    async () => {
      const res = await querySearchIndexFromDb();
      if (!res || res.length === 0) {
        throw new Error("Search index unavailable from DB");
      }
      return res;
    },
    ["amber-search-index-v3"],
    {
      revalidate: 3600,
      tags: ["companies"],
    }
  );

  try {
    return await cachedFetch();
  } catch {
    return SEARCH_INDEX;
  }
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

export async function getSectorBenchmark(
  sector: string
): Promise<SectorBenchmark | null> {
  const index = await getSearchIndex();
  const peers = index.filter((c) => c.sector === sector);
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

function getStaticRecentFilingDiffs(limit: number): MarketFilingDiffItem[] {
  const items: MarketFilingDiffItem[] = [];
  for (const c of ALL_COMPANIES) {
    for (const d of c.filingDiffs) {
      items.push({
        id: d.id,
        ticker: c.ticker,
        companyName: c.name,
        sector: c.sector,
        filingType: d.filingType,
        filingDate: d.filingDate,
        accessionNumber: d.accessionNumber,
        section: d.section,
        category: d.category,
        materiality: d.materiality,
        headline: d.headline,
        summary: d.summary,
        priorExcerpt: d.priorExcerpt,
        currentExcerpt: d.currentExcerpt,
        signalNote: d.signalNote,
        source: d.section.toLowerCase().includes("item") ? "text-diff" : "xbrl",
      });
    }
  }
  const rank = { High: 0, Medium: 1, Watch: 2 };
  return items
    .sort(
      (a, b) =>
        b.filingDate.localeCompare(a.filingDate) ||
        rank[a.materiality] - rank[b.materiality]
    )
    .slice(0, limit);
}

export async function getRecentFilingDiffs(
  limit = 160
): Promise<MarketFilingDiffItem[]> {
  if (!process.env.DATABASE_URL) {
    return getStaticRecentFilingDiffs(limit);
  }

  const cachedFetch = unstable_cache(
    async () => {
      const db = getDb();
      if (!db) throw new Error("DB unavailable");

      const rows = await db
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
        .innerJoin(companies, eq(filingDiffs.ticker, companies.ticker))
        .orderBy(desc(filingDiffs.filingDate))
        .limit(limit);

      if (rows.length === 0) {
        throw new Error("No filing diffs returned from DB");
      }

      return rows.map((r) => ({
        ...r,
        materiality: (r.materiality === "High" || r.materiality === "Medium"
          ? r.materiality
          : "Watch") as MarketFilingDiffItem["materiality"],
      }));
    },
    ["amber-recent-filing-diffs-v1", String(limit)],
    { revalidate: 3600, tags: ["filings", "companies"] }
  );

  try {
    return await cachedFetch();
  } catch {
    return getStaticRecentFilingDiffs(limit);
  }
}

export async function getFilingDiffsForTickers(
  tickers: string[],
  limit = 30
): Promise<MarketFilingDiffItem[]> {
  const normalized = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (normalized.length === 0) return [];

  const staticFallback = () => {
    const set = new Set(normalized);
    return getStaticRecentFilingDiffs(500)
      .filter((d) => set.has(d.ticker))
      .slice(0, limit);
  };

  if (!process.env.DATABASE_URL) {
    return staticFallback();
  }

  const key = [...normalized].sort().join(",");
  const cachedFetch = unstable_cache(
    async () => {
      const db = getDb();
      if (!db) throw new Error("DB unavailable");

      const rows = await db
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
        .innerJoin(companies, eq(filingDiffs.ticker, companies.ticker))
        .where(inArray(filingDiffs.ticker, normalized))
        .orderBy(desc(filingDiffs.filingDate))
        .limit(limit);

      if (rows.length === 0) throw new Error("No trending diffs in DB");

      return rows.map((r) => ({
        ...r,
        materiality: (r.materiality === "High" || r.materiality === "Medium"
          ? r.materiality
          : "Watch") as MarketFilingDiffItem["materiality"],
      }));
    },
    ["amber-ticker-filing-diffs-v1", key, String(limit)],
    { revalidate: 900, tags: ["filings", "companies"] }
  );

  try {
    return await cachedFetch();
  } catch {
    return staticFallback();
  }
}

export async function getInsiderTradesForTickers(
  tickers: string[],
  limit = 40
): Promise<MarketInsiderFeedItem[]> {
  const normalized = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (normalized.length === 0 || !process.env.DATABASE_URL) return [];

  const key = [...normalized].sort().join(",");
  const cachedFetch = unstable_cache(
    async () => {
      const db = getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(insiderTrades)
        .where(inArray(insiderTrades.ticker, normalized))
        .orderBy(desc(insiderTrades.filingDate), desc(insiderTrades.totalValue))
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        ticker: r.ticker,
        filingDate: r.filingDate,
        insiderName: r.insiderName,
        insiderTitle: r.insiderTitle,
        transactionType: (r.transactionType === "Buy" ? "Buy" : "Sell") as "Buy" | "Sell",
        shares: r.shares,
        pricePerShare: r.pricePerShare,
        totalValue: r.totalValue,
        accessionNumber: r.accessionNumber,
      }));
    },
    ["amber-ticker-insiders-v1", key, String(limit)],
    { revalidate: 900, tags: ["insiders"] }
  );

  try {
    return await cachedFetch();
  } catch {
    return [];
  }
}
