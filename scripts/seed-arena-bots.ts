/**
 * Seeds 6 transparent Thematic Strategy Bots into Neon Postgres `arena_portfolios`
 * so the Verified Portfolio Arena is alive, educational, and benchmarked on Day 1.
 *
 * Uses each ticker's real prior-year historical close (from `price_history`) when
 * available so bot YTD/All-Time performance reflects genuine market returns.
 *
 * Usage:
 *   set -a && source .env.local && set +a && node --experimental-strip-types scripts/seed-arena-bots.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { inArray, sql } from "drizzle-orm";
import { arenaPortfolios, arenaPositions, companies } from "../src/db/schema.ts";

interface BotSpec {
  id: string;
  handle: string;
  title: string;
  botTheme: string;
  thesis: string;
  lockedAt: Date;
  tickers: string[];
}

const BOTS: BotSpec[] = [
  {
    id: "bot-cash-machines",
    handle: "CashMachineBot",
    title: "Elite True FCF Margin Basket",
    botTheme: "Cash Machines",
    thesis: "Equal-weight basket of wide-moat businesses converting >30% of revenue into real cash after SBC.",
    lockedAt: new Date("2026-01-02T14:30:00Z"),
    tickers: ["V", "MA", "NVDA", "FICO", "AAPL"],
  },
  {
    id: "bot-buyback-cannibals",
    handle: "BuybackCannibalBot",
    title: "Relentless Share Retirees",
    botTheme: "Buyback Cannibals",
    thesis: "Companies consistently shrinking their diluted share count every year via self-funded buybacks.",
    lockedAt: new Date("2026-01-02T14:30:00Z"),
    tickers: ["AAPL", "V", "MA", "ORLY", "AZO"],
  },
  {
    id: "bot-ai-infrastructure",
    handle: "AIInfraBot",
    title: "AI Compute & Cloud Backbone",
    botTheme: "AI Infrastructure",
    thesis: "Core picks-and-shovels powering hyperscale AI training, networking, and enterprise cloud.",
    lockedAt: new Date("2026-01-02T14:30:00Z"),
    tickers: ["NVDA", "MSFT", "AVGO", "ANET", "ORCL"],
  },
  {
    id: "bot-high-sbc-saas",
    handle: "HighSbcGrowthBot",
    title: "High-SBC Cloud Software",
    botTheme: "Hidden Dilution",
    thesis: "High-growth cloud & cybersecurity leaders where stock-based compensation heavily trails headline FCF.",
    lockedAt: new Date("2026-01-02T14:30:00Z"),
    tickers: ["PLTR", "SNOW", "CRWD", "DDOG", "NET"],
  },
  {
    id: "bot-modest-expectations",
    handle: "ValueHawkBot",
    title: "Cash-Rich, Low Expectations",
    botTheme: "Modest Expectations",
    thesis: "Profitable, cash-generative franchises priced for single-digit long-term growth.",
    lockedAt: new Date("2026-01-02T14:30:00Z"),
    tickers: ["GOOGL", "HD", "UNH", "QCOM", "ADBE"],
  },
  {
    id: "bot-quality-compounders",
    handle: "CompounderBot",
    title: "All-Weather Quality Compounders",
    botTheme: "Quality Compounders",
    thesis: "Durable consumer & enterprise franchises with high ROIC and disciplined capital allocation.",
    lockedAt: new Date("2026-01-02T14:30:00Z"),
    tickers: ["COST", "MSFT", "V", "NFLX", "INTU"],
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
  const rows = await db
    .select({
      ticker: companies.ticker,
      price: companies.price,
      priceHistory: companies.priceHistory,
    })
    .from(companies)
    .where(inArray(companies.ticker, allTickers));

  const compMap = new Map(rows.map((r) => [r.ticker, r]));

  for (const bot of BOTS) {
    const validTickers = bot.tickers.filter((t) => compMap.has(t));
    if (validTickers.length < 3) continue;

    await db
      .insert(arenaPortfolios)
      .values({
        id: bot.id,
        handle: bot.handle,
        title: bot.title,
        thesis: bot.thesis,
        isBot: 1,
        botTheme: bot.botTheme,
        lockedAt: bot.lockedAt,
      })
      .onConflictDoUpdate({
        target: arenaPortfolios.id,
        set: {
          title: sql`excluded.title`,
          thesis: sql`excluded.thesis`,
          botTheme: sql`excluded.bot_theme`,
        },
      });

    const weight = Number((100 / validTickers.length).toFixed(2));
    for (const ticker of validTickers) {
      const c = compMap.get(ticker)!;
      // Use FY25/prior-year close from real priceHistory as 2026 YTD entry price when available
      const hist = c.priceHistory ?? [];
      const fy25 =
        hist.find((h) => h.fiscalYear === "FY25") ??
        (hist.length >= 2 ? hist[hist.length - 2] : null);
      const entryPrice = fy25?.price ?? c.price;

      await db
        .insert(arenaPositions)
        .values({
          id: `${bot.id}:${ticker}`,
          portfolioId: bot.id,
          ticker,
          weightPct: weight,
          entryPrice,
        })
        .onConflictDoUpdate({
          target: arenaPositions.id,
          set: {
            weightPct: sql`excluded.weight_pct`,
            entryPrice: sql`excluded.entry_price`,
          },
        });
    }
  }

  console.log(`[amber-arena] ✓ Seeded ${BOTS.length} Thematic Strategy Bots into Neon.`);
}

run();
