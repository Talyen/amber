import { and, desc, eq, gte } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { filingDiffs, insiderTrades } from "../db/schema.ts";
import {
  filingCutoffDate,
  INSIDER_BUY_LOOKBACK_DAYS,
  MATERIAL_EVENT_LOOKBACK_DAYS,
} from "../lib/filing-lookback.ts";

export interface InsiderBuySummary {
  ticker: string;
  totalBuyValue: number;
  buyCount: number;
  latestBuyer: string;
  latestTitle: string;
  latestDate: string;
}

export interface MaterialEventSummary {
  ticker: string;
  headline: string;
  section: string;
  category: string;
  filingDate: string;
  eventCount: number;
}

export async function queryInsiderBuySummaries(db: Pick<NeonHttpDatabase, "select">, now: Date) {
  const rows = await db
    .select({
      ticker: insiderTrades.ticker,
      totalValue: insiderTrades.totalValue,
      insiderName: insiderTrades.insiderName,
      insiderTitle: insiderTrades.insiderTitle,
      filingDate: insiderTrades.filingDate,
    })
    .from(insiderTrades)
    .where(and(
      eq(insiderTrades.transactionType, "Buy"),
      gte(insiderTrades.filingDate, filingCutoffDate(now, INSIDER_BUY_LOOKBACK_DAYS)),
    ))
    .orderBy(desc(insiderTrades.filingDate), desc(insiderTrades.totalValue));

  const map: Record<string, InsiderBuySummary> = {};
  for (const r of rows) {
    const existing = map[r.ticker];
    if (!existing) {
      map[r.ticker] = {
        ticker: r.ticker,
        totalBuyValue: r.totalValue,
        buyCount: 1,
        latestBuyer: r.insiderName,
        latestTitle: r.insiderTitle,
        latestDate: r.filingDate,
      };
    } else {
      existing.totalBuyValue += r.totalValue;
      existing.buyCount += 1;
    }
  }
  return map;
}

export async function queryMaterialEventSummaries(db: Pick<NeonHttpDatabase, "select">, now: Date) {
  const rows = await db
    .select({
      ticker: filingDiffs.ticker,
      headline: filingDiffs.headline,
      section: filingDiffs.section,
      category: filingDiffs.category,
      filingDate: filingDiffs.filingDate,
    })
    .from(filingDiffs)
    .where(and(
      eq(filingDiffs.filingType, "8-K"),
      gte(filingDiffs.filingDate, filingCutoffDate(now, MATERIAL_EVENT_LOOKBACK_DAYS)),
    ))
    .orderBy(desc(filingDiffs.filingDate));

  const map: Record<string, MaterialEventSummary> = {};
  for (const r of rows) {
    const existing = map[r.ticker];
    if (!existing) {
      map[r.ticker] = {
        ticker: r.ticker,
        headline: r.headline.replace(/\s*\(Item[^)]*\)\s*$/i, ""),
        section: r.section,
        category: r.category,
        filingDate: r.filingDate,
        eventCount: 1,
      };
    } else {
      existing.eventCount += 1;
    }
  }
  return map;
}
