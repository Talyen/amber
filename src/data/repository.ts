import { unstable_cache } from "next/cache";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  annualFinancials,
  arenaPortfolios,
  arenaPositions,
  arenaRebalances,
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
    async () => queryCompanyFromDb(ticker),
    ["amber-company-v3", ticker],
    {
      revalidate: 3600,
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
    ["amber-search-index-v3"],
    {
      revalidate: 3600,
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
          .limit(24);
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
    ["amber-insider-trades-v2", ticker],
    { revalidate: 3600, tags: ["companies", `ticker-${ticker}`] }
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
        // Fetch balanced recent Buys and Sells separately so high-volume executive sales never crowd out open-market purchases
        const [buyRows, sellRows] = await Promise.all([
          db
            .select()
            .from(insiderTrades)
            .where(eq(insiderTrades.transactionType, "Buy"))
            .orderBy(desc(insiderTrades.filingDate))
            .limit(60),
          db
            .select()
            .from(insiderTrades)
            .where(eq(insiderTrades.transactionType, "Sell"))
            .orderBy(desc(insiderTrades.filingDate))
            .limit(60),
        ]);
        const rows = [...buyRows, ...sellRows].sort((a, b) =>
          b.filingDate.localeCompare(a.filingDate)
        );
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
    ["amber-market-insiders-v2"],
    { revalidate: 3600, tags: ["companies"] }
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

export interface ArenaRebalanceItem {
  id: string;
  navAtRebalance: number;
  summary: string;
  createdAt: string;
}

export interface ArenaPortfolioView {
  id: string;
  handle: string;
  title: string;
  thesis: string;
  isBot: boolean;
  botTheme: string | null;
  avatarIcon: string;
  periodKey: string; // "2026-11" or "2025"
  isFinalized: boolean;
  lockedAt: string; // ISO date string
  lastRebalancedAt: string; // ISO date string
  nav: number;
  totalReturnPct: number;
  weightedTrueFcfMargin?: number;
  weightedSbcPct?: number;
  weightedImpliedCagr?: number;
  weightedDilutionCagr?: number;
  positions: ArenaPositionView[];
  rebalances: ArenaRebalanceItem[];
}

function computeArenaFundamentals(
  positions: ArenaPositionView[],
  indexByTicker: Map<string, SearchIndexEntry>
): {
  weightedTrueFcfMargin?: number;
  weightedSbcPct?: number;
  weightedImpliedCagr?: number;
  weightedDilutionCagr?: number;
} {
  let coveredW = 0;
  let wMargin = 0;
  let wSbc = 0;
  let wImplied = 0;
  let wDilution = 0;

  for (const p of positions) {
    const entry = indexByTicker.get(p.ticker);
    if (!entry) continue;
    const w = p.weightPct / 100;
    coveredW += w;
    wMargin += entry.trueFcfMargin * w;
    wSbc += entry.sbcPctRevenue * w;
    wImplied += entry.impliedCagr * w;
    wDilution += entry.netDilutionCagr * w;
  }

  if (coveredW < 0.5) return {};
  return {
    weightedTrueFcfMargin: Number((wMargin / coveredW).toFixed(1)),
    weightedSbcPct: Number((wSbc / coveredW).toFixed(1)),
    weightedImpliedCagr: Number((wImplied / coveredW).toFixed(1)),
    weightedDilutionCagr: Number((wDilution / coveredW).toFixed(2)),
  };
}

async function queryArenaLeaderboardFromDb(): Promise<ArenaPortfolioView[]> {
  const db = getDb();
  if (!db) return [];

  try {
    const [portRows, posRows, rebRows, compRows, searchIndex] = await Promise.all([
      db.select().from(arenaPortfolios).orderBy(desc(arenaPortfolios.lockedAt)),
      db.select().from(arenaPositions),
      db
        .select()
        .from(arenaRebalances)
        .orderBy(desc(arenaRebalances.createdAt)),
      db
        .select({
          ticker: companies.ticker,
          name: companies.name,
          price: companies.price,
        })
        .from(companies),
      getSearchIndex(),
    ]);

    const compMap = new Map(compRows.map((c) => [c.ticker, c]));
    const indexByTicker = new Map(searchIndex.map((e) => [e.ticker, e]));
    const posByPort = new Map<string, typeof posRows>();
    for (const p of posRows) {
      const list = posByPort.get(p.portfolioId) ?? [];
      list.push(p);
      posByPort.set(p.portfolioId, list);
    }

    const rebByPort = new Map<string, ArenaRebalanceItem[]>();
    for (const r of rebRows) {
      const list = rebByPort.get(r.portfolioId) ?? [];
      list.push({
        id: r.id,
        navAtRebalance: r.navAtRebalance,
        summary: r.summary,
        createdAt: r.createdAt.toISOString(),
      });
      rebByPort.set(r.portfolioId, list);
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

      const isoDate = port.lockedAt.toISOString();
      const lastRebalancedIso = (port.lastRebalancedAt ?? port.lockedAt).toISOString();
      const resolvedPeriodKey = port.periodKey ?? isoDate.slice(0, 7);
      const isFinalized = typeof port.finalReturnPct === "number";
      const nav = typeof port.nav === "number" && Number.isFinite(port.nav) ? port.nav : 100;
      const liveTotalReturn = nav * (1 + weightedReturn / 100) - 100;

      views.push({
        id: port.id,
        handle: port.handle,
        title: port.title,
        thesis: port.thesis,
        isBot: port.isBot === 1,
        botTheme: port.botTheme,
        avatarIcon: port.avatarIcon ?? "compass",
        periodKey: resolvedPeriodKey,
        isFinalized,
        lockedAt: isoDate,
        lastRebalancedAt: lastRebalancedIso,
        nav: Number(nav.toFixed(2)),
        totalReturnPct: Number(
          (isFinalized ? port.finalReturnPct! : liveTotalReturn).toFixed(2)
        ),
        ...computeArenaFundamentals(positions, indexByTicker),
        positions,
        rebalances: rebByPort.get(port.id) ?? [],
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
    ["amber-arena-leaderboard-v2"],
    { revalidate: 3600, tags: ["arena", "companies"] }
  );
  return await cachedFetch();
}

async function queryArenaPortfolioByIdFromDb(
  id: string
): Promise<ArenaPortfolioView | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const [port] = await db
      .select()
      .from(arenaPortfolios)
      .where(eq(arenaPortfolios.id, id))
      .limit(1);
    if (!port) return null;

    const [rawPositions, rebRows, searchIndex] = await Promise.all([
      db
        .select()
        .from(arenaPositions)
        .where(eq(arenaPositions.portfolioId, port.id)),
      db
        .select()
        .from(arenaRebalances)
        .where(eq(arenaRebalances.portfolioId, port.id))
        .orderBy(desc(arenaRebalances.createdAt)),
      getSearchIndex(),
    ]);

    const posTickers = [...new Set(rawPositions.map((p) => p.ticker))];
    const compRows =
      posTickers.length > 0
        ? await db
            .select({
              ticker: companies.ticker,
              name: companies.name,
              price: companies.price,
            })
            .from(companies)
            .where(inArray(companies.ticker, posTickers))
        : [];

    const compMap = new Map(compRows.map((c) => [c.ticker, c]));
    const indexByTicker = new Map(searchIndex.map((e) => [e.ticker, e]));
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

    const isoDate = port.lockedAt.toISOString();
    const lastRebalancedIso = (port.lastRebalancedAt ?? port.lockedAt).toISOString();
    const resolvedPeriodKey = port.periodKey ?? isoDate.slice(0, 7);
    const isFinalized = typeof port.finalReturnPct === "number";
    const nav =
      typeof port.nav === "number" && Number.isFinite(port.nav) ? port.nav : 100;
    const liveTotalReturn = nav * (1 + weightedReturn / 100) - 100;

    return {
      id: port.id,
      handle: port.handle,
      title: port.title,
      thesis: port.thesis,
      isBot: port.isBot === 1,
      botTheme: port.botTheme,
      avatarIcon: port.avatarIcon ?? "compass",
      periodKey: resolvedPeriodKey,
      isFinalized,
      lockedAt: isoDate,
      lastRebalancedAt: lastRebalancedIso,
      nav: Number(nav.toFixed(2)),
      totalReturnPct: Number(
        (isFinalized ? port.finalReturnPct! : liveTotalReturn).toFixed(2)
      ),
      ...computeArenaFundamentals(positions, indexByTicker),
      positions,
      rebalances: rebRows.map((r) => ({
        id: r.id,
        navAtRebalance: r.navAtRebalance,
        summary: r.summary,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (err) {
    console.warn(`[amber-repo] Arena portfolio ${id} lookup failed:`, err);
    return null;
  }
}

export async function getArenaPortfolioById(
  id: string
): Promise<ArenaPortfolioView | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const cachedFetch = unstable_cache(
    async () => queryArenaPortfolioByIdFromDb(id),
    ["amber-arena-portfolio-v2", id],
    { revalidate: 600, tags: ["arena", "companies"] }
  );
  return (await cachedFetch()) ?? undefined;
}

async function fetchSpyBenchmarks(): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=3y&interval=1mo",
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)" },
      }
    );
    if (!res.ok) return {};
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number };
          timestamp?: number[];
          indicators?: {
            adjclose?: Array<{ adjclose?: Array<number | null> }>;
            quote?: Array<{ close?: Array<number | null> }>;
          };
        }>;
      };
    };
    const r = json.chart?.result?.[0];
    if (!r) return {};
    const ts = r.timestamp ?? [];
    const closes =
      r.indicators?.adjclose?.[0]?.adjclose ??
      r.indicators?.quote?.[0]?.close ??
      [];
    const monthly: Record<string, number> = {};
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) continue;
      const d = new Date(ts[i] * 1000);
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      monthly[ym] = c;
    }
    const latestPrice =
      r.meta?.regularMarketPrice ??
      closes.filter((x): x is number => typeof x === "number").at(-1);
    if (!latestPrice) return {};

    const pct = (start?: number, end?: number) =>
      start && end && start > 0
        ? Number((((end - start) / start) * 100).toFixed(2))
        : undefined;

    // Dynamically compute SPY benchmarks for current year, prior year, and recent 6 months
    const out: Record<string, number> = {};
    const now = new Date();
    const curYear = now.getUTCFullYear();
    const curMonth = now.getUTCMonth() + 1; // 1..12

    const ymKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
    const prevYm = (y: number, m: number) => (m === 1 ? ymKey(y - 1, 12) : ymKey(y, m - 1));

    const curYtd = pct(monthly[ymKey(curYear - 1, 12)], latestPrice);
    if (typeof curYtd === "number") out[String(curYear)] = curYtd;

    const prevFullYr = pct(monthly[ymKey(curYear - 2, 12)], monthly[ymKey(curYear - 1, 12)]);
    if (typeof prevFullYr === "number") out[String(curYear - 1)] = prevFullYr;

    for (let offset = 0; offset < 6; offset++) {
      const d = new Date(Date.UTC(curYear, curMonth - 1 - offset, 1));
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const key = ymKey(y, m);
      const startPrice = monthly[prevYm(y, m)];
      const endPrice = offset === 0 ? latestPrice : monthly[key];
      const val = pct(startPrice, endPrice);
      if (typeof val === "number") out[key] = val;
    }

    return out;
  } catch {
    return {};
  }
}

export async function getSpyBenchmarks(): Promise<Record<string, number>> {
  const cachedFetch = unstable_cache(
    async () => fetchSpyBenchmarks(),
    ["amber-spy-benchmarks"],
    { revalidate: 3600, tags: ["arena"] }
  );
  return await cachedFetch();
}

export interface EquityCurvePoint {
  date: string; // e.g. "2026-01" or "2026-11-10"
  portfolioPct: number;
  spyPct: number;
}

async function fetchEquityCurveFromYahoo(
  positions: Array<{ ticker: string; weightPct: number }>,
  periodKey: string,
  lockedAtIso: string
): Promise<EquityCurvePoint[]> {
  try {
    const isMonthly = /^\d{4}-\d{2}$/.test(periodKey);
    const range = isMonthly ? "3mo" : "2y";
    const interval = isMonthly ? "1d" : "1mo";

    const tickers = [...new Set([...positions.map((p) => p.ticker), "SPY"])];
    const seriesByTicker = new Map<string, Map<string, number>>();

    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const sym = ticker.replace(/\./g, "-");
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`,
            { headers: { "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)" } }
          );
          if (!res.ok) return;
          const json = (await res.json()) as {
            chart?: {
              result?: Array<{
                timestamp?: number[];
                indicators?: {
                  adjclose?: Array<{ adjclose?: Array<number | null> }>;
                  quote?: Array<{ close?: Array<number | null> }>;
                };
              }>;
            };
          };
          const r = json.chart?.result?.[0];
          const ts = r?.timestamp ?? [];
          const closes =
            r?.indicators?.adjclose?.[0]?.adjclose ??
            r?.indicators?.quote?.[0]?.close ??
            [];
          const map = new Map<string, number>();
          for (let i = 0; i < ts.length; i++) {
            const c = closes[i];
            if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) continue;
            const d = new Date(ts[i] * 1000).toISOString();
            const key = isMonthly ? d.slice(0, 10) : d.slice(0, 7);
            map.set(key, c);
          }
          seriesByTicker.set(ticker, map);
        } catch {
          // Skip individual ticker fetch failure
        }
      })
    );

    const spyMap = seriesByTicker.get("SPY");
    if (!spyMap || spyMap.size < 2) return [];

    // Filter dates to the active period window
    const startCutoff = isMonthly
      ? `${periodKey}-01`
      : periodKey === "2025"
        ? "2025-01"
        : lockedAtIso.slice(0, 7);
    const endCutoff =
      periodKey === "2025"
        ? "2025-12"
        : isMonthly
          ? `${periodKey}-31`
          : "2099-12";

    const dates = [...spyMap.keys()]
      .filter((d) => d >= startCutoff && d <= endCutoff)
      .sort();

    if (dates.length < 2) return [];

    const spyBase = spyMap.get(dates[0])!;
    const totalW = positions.reduce((s, p) => s + p.weightPct, 0) || 100;
    const basePrices = new Map<string, number>();
    for (const p of positions) {
      const m = seriesByTicker.get(p.ticker);
      const first = m?.get(dates[0]);
      if (first && first > 0) basePrices.set(p.ticker, first);
    }
    if (basePrices.size === 0) return [];

    const points: EquityCurvePoint[] = [];
    for (const d of dates) {
      const spyCur = spyMap.get(d);
      if (!spyCur) continue;
      const spyPct = ((spyCur - spyBase) / spyBase) * 100;

      let portPct = 0;
      let coveredW = 0;
      for (const p of positions) {
        const base = basePrices.get(p.ticker);
        const cur = seriesByTicker.get(p.ticker)?.get(d);
        if (base && cur) {
          portPct += ((cur - base) / base) * 100 * (p.weightPct / totalW);
          coveredW += p.weightPct / totalW;
        }
      }
      if (coveredW > 0.5) {
        points.push({
          date: d,
          portfolioPct: Number((portPct / coveredW).toFixed(2)),
          spyPct: Number(spyPct.toFixed(2)),
        });
      }
    }
    return points;
  } catch {
    return [];
  }
}

export async function getArenaEquityCurve(
  portfolio: ArenaPortfolioView
): Promise<EquityCurvePoint[]> {
  const key = `${portfolio.id}:${portfolio.periodKey}:${portfolio.positions.map((p) => p.ticker).join(",")}`;
  const cachedFetch = unstable_cache(
    async () =>
      fetchEquityCurveFromYahoo(
        portfolio.positions,
        portfolio.periodKey,
        portfolio.lockedAt
      ),
    ["amber-arena-curve", key],
    { revalidate: 3600, tags: ["arena"] }
  );
  return await cachedFetch();
}

export async function getArenaPortfoliosByHandle(
  rawHandle: string
): Promise<ArenaPortfolioView[]> {
  const normalized = rawHandle.trim().replace(/^@+/, "").toLowerCase();
  const all = await getArenaLeaderboard();
  return all.filter((p) => p.handle.toLowerCase() === normalized);
}
