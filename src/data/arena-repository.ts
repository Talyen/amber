import { unstable_cache } from "next/cache";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { arenaPortfolios, arenaPositions, arenaRebalances, companies } from "@/db/schema";
import { getSearchIndex } from "@/data/repository";
import type { SearchIndexEntry } from "@/data/search-index";
import { arenaEquityWindow, buildArenaEquityCurve } from "@/lib/arena-equity";

export type { EquityCurvePoint } from "@/lib/arena-equity";

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

function toArenaRebalanceItem(row: typeof arenaRebalances.$inferSelect): ArenaRebalanceItem {
  return {
    id: row.id,
    navAtRebalance: row.navAtRebalance,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildArenaPortfolioView(
  port: typeof arenaPortfolios.$inferSelect,
  rawPositions: Array<typeof arenaPositions.$inferSelect>,
  rebalances: ArenaRebalanceItem[],
  compMap: ReadonlyMap<string, { name: string; price: number }>,
  indexByTicker: Map<string, SearchIndexEntry>
): ArenaPortfolioView {
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
      weightPct: p.weightPct,
      entryPrice: p.entryPrice,
      currentPrice,
      returnPct: Number(ret.toFixed(2)),
    };
  });

  positions.sort((a, b) => b.weightPct - a.weightPct);

  const isoDate = port.lockedAt.toISOString();
  const lastRebalancedIso = (port.lastRebalancedAt ?? port.lockedAt).toISOString();
  const resolvedPeriodKey = port.periodKey ?? isoDate.slice(0, 7);
  const finalReturnPct = port.finalReturnPct;
  const isFinalized = typeof finalReturnPct === "number";
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
      (isFinalized ? finalReturnPct : liveTotalReturn).toFixed(2)
    ),
    ...computeArenaFundamentals(positions, indexByTicker),
    positions,
    rebalances,
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
      list.push(toArenaRebalanceItem(r));
      rebByPort.set(r.portfolioId, list);
    }

    const views: ArenaPortfolioView[] = [];
    for (const port of portRows) {
      const rawPositions = posByPort.get(port.id) ?? [];
      if (rawPositions.length === 0) continue;

      views.push(buildArenaPortfolioView(
        port,
        rawPositions,
        rebByPort.get(port.id) ?? [],
        compMap,
        indexByTicker
      ));
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
    ["amber-arena-leaderboard-v3"],
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
    return buildArenaPortfolioView(
      port,
      rawPositions,
      rebRows.map(toArenaRebalanceItem),
      compMap,
      indexByTicker
    );
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
    ["amber-arena-portfolio-v3", id],
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

async function fetchEquityCurveFromYahoo(
  positions: Array<{ ticker: string; weightPct: number }>,
  { start, end, monthly }: NonNullable<ReturnType<typeof arenaEquityWindow>>
) {
  try {
    const query = new URLSearchParams({
      period1: String(start),
      period2: String(end),
      interval: "1d",
    });
    const tickers = [...new Set([...positions.map((p) => p.ticker), "SPY"])];
    const seriesByTicker = new Map<string, Map<string, number>>();

    await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const sym = ticker.replace(/\./g, "-");
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?${query}`,
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
            const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
            map.set(date, c);
          }
          seriesByTicker.set(ticker, map);
        } catch {
          // Skip individual ticker fetch failure
        }
      })
    );

    return buildArenaEquityCurve(positions, seriesByTicker, { start, end, monthly });
  } catch {
    return [];
  }
}

export async function getArenaEquityCurve(portfolio: ArenaPortfolioView) {
  const window = arenaEquityWindow(portfolio);
  if (!window) return [];

  const cachedFetch = unstable_cache(
    fetchEquityCurveFromYahoo,
    ["amber-arena-curve-v2", portfolio.id],
    { revalidate: 3600, tags: ["arena"] }
  );
  const positions = portfolio.positions.map(({ ticker, weightPct }) => ({ ticker, weightPct }));
  return await cachedFetch(positions, window);
}

export async function getArenaPortfoliosByHandle(
  rawHandle: string
): Promise<ArenaPortfolioView[]> {
  const normalized = rawHandle.trim().replace(/^@+/, "").toLowerCase();
  const all = await getArenaLeaderboard();
  return all.filter((p) => p.handle.toLowerCase() === normalized);
}
