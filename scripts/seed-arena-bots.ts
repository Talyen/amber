/**
 * Seeds 6 transparent Thematic Strategy Bots into Neon Postgres across:
 *   - Live Yearly (2026 YTD)
 *   - Past Year Winner Archive (2025 Final)
 *   - Live Monthly (2026-11)
 *   - Past Month Winner Archives (2026-10 Final, 2026-09 Final)
 *
 * Uses real Yahoo Finance monthly closing prices so every historical and live
 * return reflects actual market performance.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, inArray, sql } from "drizzle-orm";
import { arenaPortfolios, arenaPositions, companies } from "../src/db/schema.ts";

interface BotTemplate {
  slug: string;
  handle: string;
  title: string;
  botTheme: string;
  avatarIcon: string;
  thesis: string;
  tickers: string[];
}

const BOTS: BotTemplate[] = [
  {
    slug: "cash-machines",
    handle: "tollbooth",
    title: "Tollbooth Capital",
    botTheme: "Cash Machines",
    avatarIcon: "vault",
    thesis: "Equal-weight basket of wide-moat tollbooth businesses converting >30% of revenue into real cash after SBC.",
    tickers: ["V", "MA", "NVDA", "FICO", "AAPL", "SPGI", "MCO"],
  },
  {
    slug: "buyback-cannibals",
    handle: "share_eater",
    title: "The Share Eater",
    botTheme: "Buybacks",
    avatarIcon: "flame",
    thesis: "Companies consistently shrinking their diluted share count every year via self-funded buybacks.",
    tickers: ["AAPL", "V", "MA", "ORLY", "AZO", "BKNG"],
  },
  {
    slug: "ai-infrastructure",
    handle: "gpu_baron",
    title: "Picks & Shovels",
    botTheme: "AI Infra",
    avatarIcon: "cpu",
    thesis: "Core picks-and-shovels powering hyperscale AI training, networking, semi equipment, and enterprise cloud.",
    tickers: ["NVDA", "MSFT", "AVGO", "ANET", "ORCL", "AMD", "AMAT"],
  },
  {
    slug: "high-sbc-saas",
    handle: "saas_rocket",
    title: "Cloud Rocket",
    botTheme: "Cloud Growth",
    avatarIcon: "rocket",
    thesis: "High-growth cloud & cybersecurity leaders where stock-based compensation heavily trails headline FCF.",
    tickers: ["PLTR", "SNOW", "CRWD", "DDOG", "NET", "PANW"],
  },
  {
    slug: "modest-expectations",
    handle: "margin_of_safety",
    title: "Cigar Butts & Moats",
    botTheme: "Value",
    avatarIcon: "compass",
    thesis: "Profitable, cash-generative franchises priced for single-digit long-term growth.",
    tickers: ["GOOGL", "HD", "UNH", "QCOM", "ADBE", "CMCSA"],
  },
  {
    slug: "quality-compounders",
    handle: "swan_fund",
    title: "Sleep Well at Night",
    botTheme: "Compounders",
    avatarIcon: "shield",
    thesis: "Durable consumer & enterprise franchises with high ROIC and disciplined capital allocation.",
    tickers: ["COST", "MSFT", "V", "NFLX", "INTU", "WMT", "LIN", "CTAS"],
  },
];

interface MonthlyMap {
  // key "YYYY-MM" -> month-end close
  [ym: string]: number;
}

async function fetchMonthlyCloses(ticker: string): Promise<MonthlyMap> {
  const symbol = ticker.replace(/\./g, "-");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1mo`;
  const out: MonthlyMap = {};
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AmberFinance/1.0)" },
    });
    if (!res.ok) return out;
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

    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) continue;
      const d = new Date(ts[i] * 1000);
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      out[ym] = Number(c.toFixed(2));
    }
  } catch {
    // Ignore transient errors
  }
  return out;
}

interface PeriodSpec {
  key: string; // e.g. "2026-11", "2026-10", "2026-09", "2026", "2025"
  idSuffix: string;
  lockedAt: Date;
  entryYm: string; // Month-end close used as entry price
  exitYm: string | null; // null = live (use current Neon price); non-null = finalized period
}

const PERIODS: PeriodSpec[] = [
  // Active 2026 Yearly (keeps existing bot IDs cleanly)
  {
    key: "2026",
    idSuffix: "",
    lockedAt: new Date("2026-01-02T14:30:00Z"),
    entryYm: "2025-12",
    exitYm: null,
  },
  // Past Year 2025 Final
  {
    key: "2025",
    idSuffix: "-2025",
    lockedAt: new Date("2025-01-02T14:30:00Z"),
    entryYm: "2024-12",
    exitYm: "2025-12",
  },
  // Active Current Month: Nov 2026
  {
    key: "2026-11",
    idSuffix: "-2026-11",
    lockedAt: new Date("2026-11-02T14:30:00Z"),
    entryYm: "2026-10",
    exitYm: null,
  },
  // Past Month: Oct 2026 Final
  {
    key: "2026-10",
    idSuffix: "-2026-10",
    lockedAt: new Date("2026-10-01T14:30:00Z"),
    entryYm: "2026-09",
    exitYm: "2026-10",
  },
  // Past Month: Sep 2026 Final
  {
    key: "2026-09",
    idSuffix: "-2026-09",
    lockedAt: new Date("2026-09-01T14:30:00Z"),
    entryYm: "2026-08",
    exitYm: "2026-09",
  },
];

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[amber-arena] DATABASE_URL not set; skipping bot seed.");
    return;
  }

  const db = drizzle(neon(url));
  const allTickers = [...new Set(BOTS.flatMap((b) => b.tickers))];
  const compRows = await db
    .select({ ticker: companies.ticker, price: companies.price })
    .from(companies)
    .where(inArray(companies.ticker, allTickers));
  const livePriceMap = new Map(compRows.map((r) => [r.ticker, r.price]));

  console.log(
    `[amber-arena] Fetching 3Y monthly closes for ${allTickers.length} bot tickers...`
  );
  const monthlyByTicker = new Map<string, MonthlyMap>();
  for (let i = 0; i < allTickers.length; i += 5) {
    const batch = allTickers.slice(i, i + 5);
    const results = await Promise.all(batch.map((t) => fetchMonthlyCloses(t)));
    batch.forEach((t, idx) => monthlyByTicker.set(t, results[idx]));
    await new Promise((r) => setTimeout(r, 200));
  }

  let seeded = 0;
  for (const period of PERIODS) {
    for (const bot of BOTS) {
      const validTickers = bot.tickers.filter((t) => livePriceMap.has(t));
      if (validTickers.length < 3) continue;

      const id = `bot-${bot.slug}${period.idSuffix}`;
      const weight = Number((100 / validTickers.length).toFixed(2));

      const posEntries = validTickers.map((ticker) => {
        const mMap = monthlyByTicker.get(ticker) ?? {};
        const live = livePriceMap.get(ticker)!;
        const entryPrice = mMap[period.entryYm] ?? live;
        const exitPrice = period.exitYm ? (mMap[period.exitYm] ?? live) : live;
        const ret =
          entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
        return { ticker, entryPrice, ret };
      });

      const finalReturnPct = period.exitYm
        ? Number(
            (
              posEntries.reduce((s, p) => s + p.ret, 0) / posEntries.length
            ).toFixed(2)
          )
        : null;

      await db
        .insert(arenaPortfolios)
        .values({
          id,
          handle: bot.handle,
          title: bot.title,
          thesis: bot.thesis,
          isBot: 1,
          botTheme: bot.botTheme,
          avatarIcon: bot.avatarIcon,
          periodKey: period.key,
          finalReturnPct,
          lockedAt: period.lockedAt,
        })
        .onConflictDoUpdate({
          target: arenaPortfolios.id,
          set: {
            handle: sql`excluded.handle`,
            title: sql`excluded.title`,
            thesis: sql`excluded.thesis`,
            botTheme: sql`excluded.bot_theme`,
            avatarIcon: sql`excluded.avatar_icon`,
            periodKey: sql`excluded.period_key`,
            finalReturnPct: sql`excluded.final_return_pct`,
            lockedAt: sql`excluded.locked_at`,
          },
        });

      await db
        .delete(arenaPositions)
        .where(eq(arenaPositions.portfolioId, id));

      for (const p of posEntries) {
        await db
          .insert(arenaPositions)
          .values({
            id: `${id}:${p.ticker}`,
            portfolioId: id,
            ticker: p.ticker,
            weightPct: weight,
            entryPrice: p.entryPrice,
          })
          .onConflictDoUpdate({
            target: arenaPositions.id,
            set: {
              weightPct: sql`excluded.weight_pct`,
              entryPrice: sql`excluded.entry_price`,
            },
          });
      }
      seeded++;
    }
  }

  console.log(
    `[amber-arena] ✓ Seeded ${seeded} bot entries across Monthly (Nov/Oct/Sep 2026) and Yearly (2026/2025) leaderboards.`
  );
}

run();
