import {
  getFilingDiffsForTickers,
  getInsiderBuyTickers,
  getInsiderTradesForTickers,
  getMaterialEventTickers,
  getRecentFilingDiffs,
  getRecentMarketInsiders,
} from "@/data/repository";
import type { LensFilterContext } from "@/lib/insights";

export async function getPublicLensContext(lens?: string): Promise<LensFilterContext | undefined> {
  if (lens === "insider-buys") {
    return { insiderBuyTickers: new Set(await getInsiderBuyTickers()) };
  }
  if (lens === "material-events") {
    return { materialEventTickers: new Set(await getMaterialEventTickers()) };
  }
}

export function isPublicSignalType(type: unknown): type is "all" | "diffs" | "insiders" {
  return type === "all" || type === "diffs" || type === "insiders";
}

export async function getPublicSignals({
  ticker, type, limit,
}: {
  ticker?: string;
  type: "all" | "diffs" | "insiders";
  limit: number;
}) {
  const [diffs, buys] = await Promise.all([
    type === "insiders" ? [] : ticker ? getFilingDiffsForTickers([ticker], limit) : getRecentFilingDiffs(limit),
    type === "diffs" ? [] : ticker
      ? getInsiderTradesForTickers([ticker], limit, true)
      : getRecentMarketInsiders().then((trades) => trades.filter((trade) => trade.transactionType === "Buy")),
  ]);
  return { diffs: diffs.slice(0, limit), buys: buys.slice(0, limit) };
}
