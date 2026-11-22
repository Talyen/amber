import { unstable_cache } from "next/cache";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  annualFinancials,
  arenaPortfolios,
  arenaPositions,
  companies,
  filingDiffs,
  insiderTrades,
} from "@/db/schema";
import type { InsiderTradeItem } from "@/components/InsiderRadar";
import {
  ALL_COMPANIES,
  SEARCH_INDEX,
  getCompany as getStaticCompany,
  type SearchIndexEntry,
} from "@/data/universe";
import {
  type CompanySnapshot,
  type FilingDiffItem,
  computeAnnualMetrics,
  computeEnterpriseValue,
  computeNetDilutionCagr,
  solveReverseDcf,
} from "@/lib/finance";

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
      })),
      priceHistory: row.priceHistory ?? undefined,
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
    async () => queryCompanyFromDb(ticker),
    ["amber-company", ticker],
    {
      revalidate: 86400,
      tags: ["companies", `ticker-${ticker}`],
    }
  );

  const fromDb = await cachedFetch();
  return fromDb ?? getStaticCompany(ticker);
}

export async function getAllTickers(): Promise<string[]> {
  const db = getDb();
  if (!db) {
    return ALL_COMPANIES.map((c) => c.ticker);
  }

  try {
    const rows = await db.select({ ticker: companies.ticker }).from(companies);
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
      db.select().from(companies),
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

      const computed = computeAnnualMetrics(annuals);
      const latest = computed[computed.length - 1];
      const ev = computeEnterpriseValue({
        marketCap: c.marketCap,
        totalDebt: c.totalDebt,
        cashAndEquiv: c.cashAndEquiv,
      } as CompanySnapshot);
      const dilution = computeNetDilutionCagr(annuals);
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

      index.push({
        ticker: c.ticker,
        name: c.name,
        exchange: c.exchange === "NYSE" ? "NYSE" : "NASDAQ",
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
        lastFilingDate: c.lastFilingDate,
      });
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
    async () => querySearchIndexFromDb(),
    ["amber-search-index"],
    {
      revalidate: 86400,
      tags: ["companies"],
    }
  );

  const fromDb = await cachedFetch();
  return fromDb ?? SEARCH_INDEX;
}

export async function getInsiderTrades(
  rawTicker: string
): Promise<InsiderTradeItem[]> {
  const ticker = rawTicker.trim().toUpperCase();
  const db = getDb();
  if (!db) return [];

  const cachedFetch = unstable_cache(
    async () => {
      try {
        const rows = await db
          .select()
          .from(insiderTrades)
          .where(eq(insiderTrades.ticker, ticker))
          .orderBy(desc(insiderTrades.filingDate))
          .limit(20);
        return rows.map((r) => ({
          id: r.id,
          filingDate: r.filingDate,
          insiderName: r.insiderName,
          insiderTitle: r.insiderTitle,
          transactionType: r.transactionType === "Buy" ? "Buy" : "Sell",
          shares: r.shares,
          pricePerShare: r.pricePerShare,
          totalValue: r.totalValue,
          accessionNumber: r.accessionNumber,
        })) as InsiderTradeItem[];
      } catch {
        return [];
      }
    },
    ["amber-insider-trades", ticker],
    { revalidate: 86400, tags: ["companies", `ticker-${ticker}`] }
  );

  return await cachedFetch();
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

export async function getRecentMarketInsiders(): Promise<
  MarketInsiderFeedItem[]
> {
  const db = getDb();
  if (!db) return [];

  const cachedFetch = unstable_cache(
    async () => {
      try {
        const rows = await db
          .select()
          .from(insiderTrades)
          .orderBy(desc(insiderTrades.filingDate))
          .limit(40);
        return rows.map((r) => ({
          id: r.id,
          ticker: r.ticker,
          filingDate: r.filingDate,
          insiderName: r.insiderName,
          insiderTitle: r.insiderTitle,
          transactionType: r.transactionType === "Buy" ? "Buy" : "Sell",
          shares: r.shares,
          pricePerShare: r.pricePerShare,
          totalValue: r.totalValue,
          accessionNumber: r.accessionNumber,
        })) as MarketInsiderFeedItem[];
      } catch {
        return [];
      }
    },
    ["amber-market-insiders"],
    { revalidate: 86400, tags: ["companies"] }
  );

  return await cachedFetch();
}

export interface ArenaPositionView {
  ticker: string;
  companyName: string;
  weightPct: number;
  entryPrice: number;
  currentPrice: number;
  returnPct: number;
}

export interface ArenaPortfolioView {
  id: string;
  handle: string;
  title: string;
  thesis: string;
  isBot: boolean;
  botTheme: string | null;
  lockedAt: string; // ISO date string
  totalReturnPct: number;
  positions: ArenaPositionView[];
}

async function queryArenaLeaderboardFromDb(): Promise<ArenaPortfolioView[]> {
  const db = getDb();
  if (!db) return [];

  try {
    const [portRows, posRows, compRows] = await Promise.all([
      db.select().from(arenaPortfolios).orderBy(desc(arenaPortfolios.lockedAt)),
      db.select().from(arenaPositions),
      db
        .select({
          ticker: companies.ticker,
          name: companies.name,
          price: companies.price,
        })
        .from(companies),
    ]);

    const compMap = new Map(compRows.map((c) => [c.ticker, c]));
    const posByPort = new Map<string, typeof posRows>();
    for (const p of posRows) {
      const list = posByPort.get(p.portfolioId) ?? [];
      list.push(p);
      posByPort.set(p.portfolioId, list);
    }

    const views: ArenaPortfolioView[] = [];
    for (const port of portRows) {
      const rawPositions = posByPort.get(port.id) ?? [];
      if (rawPositions.length === 0) continue;

      let weightedReturn = 0;
      const positions: ArenaPositionView[] = rawPositions.map((p) => {
        const live = compMap.get(p.ticker);
        const currentPrice = live?.price ?? p.entryPrice;
        const ret =
          p.entryPrice > 0
            ? ((currentPrice - p.entryPrice) / p.entryPrice) * 100
            : 0;
        weightedReturn += ret * (p.weightPct / 100);
        return {
          ticker: p.ticker,
          companyName: live?.name ?? p.ticker,
          weightPct: Number(p.weightPct.toFixed(1)),
          entryPrice: p.entryPrice,
          currentPrice,
          returnPct: Number(ret.toFixed(2)),
        };
      });

      positions.sort((a, b) => b.weightPct - a.weightPct);

      views.push({
        id: port.id,
        handle: port.handle,
        title: port.title,
        thesis: port.thesis,
        isBot: port.isBot === 1,
        botTheme: port.botTheme,
        lockedAt: port.lockedAt.toISOString(),
        totalReturnPct: Number(weightedReturn.toFixed(2)),
        positions,
      });
    }

    return views.sort((a, b) => b.totalReturnPct - a.totalReturnPct);
  } catch (err) {
    console.warn("[amber-repo] Arena query failed:", err);
    return [];
  }
}

export async function getArenaLeaderboard(): Promise<ArenaPortfolioView[]> {
  if (!process.env.DATABASE_URL) return [];
  const cachedFetch = unstable_cache(
    async () => queryArenaLeaderboardFromDb(),
    ["amber-arena-leaderboard"],
    { revalidate: 3600, tags: ["arena", "companies"] }
  );
  return await cachedFetch();
}

export async function getArenaPortfolioById(
  id: string
): Promise<ArenaPortfolioView | undefined> {
  const all = await getArenaLeaderboard();
  return all.find((p) => p.id === id);
}
