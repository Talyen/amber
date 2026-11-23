import { arenaPeriodBounds } from "./arena-period.ts";

type ArenaEquityEntry = {
  periodKey: string;
  lockedAt: string;
  lastRebalancedAt: string;
  isBot: boolean;
  rebalances: readonly unknown[];
};

export interface EquityCurvePoint {
  date: string;
  portfolioPct: number;
  spyPct: number;
}

export function arenaEquityWindow(entry: ArenaEquityEntry) {
  // Arena stores only the current holdings. The scorecard can still show the
  // recorded total return after a rebalance, including for older entries.
  if (entry.rebalances.length > 0 || (!entry.isBot && entry.lastRebalancedAt > entry.lockedAt)) {
    return null;
  }

  const bounds = arenaPeriodBounds(entry.periodKey);
  const lockedDay = Date.parse(entry.lockedAt.slice(0, 10) + "T00:00:00Z") / 1000;
  if (!bounds || !Number.isFinite(lockedDay) || lockedDay >= bounds.end) return null;
  return {
    start: Math.max(bounds.start, lockedDay),
    end: bounds.end,
    monthly: entry.periodKey.length === 7,
  };
}

export function buildArenaEquityCurve(
  positions: readonly { ticker: string; weightPct: number }[],
  series: ReadonlyMap<string, ReadonlyMap<string, number>>,
  window: NonNullable<ReturnType<typeof arenaEquityWindow>>
): EquityCurvePoint[] {
  const spy = series.get("SPY");
  const totalWeight = positions.reduce((sum, position) => sum + position.weightPct, 0);
  if (!spy || totalWeight <= 0) return [];

  const startDay = new Date(window.start * 1000).toISOString().slice(0, 10);
  const endDay = new Date(window.end * 1000).toISOString().slice(0, 10);
  const days = [...spy.keys()].filter((day) => day >= startDay && day < endDay).sort();
  if (days.length < 2) return [];

  const startPrices = positions.map((position) => ({
    ...position,
    prices: series.get(position.ticker),
    base: series.get(position.ticker)?.get(days[0]),
  }));
  const spyBase = spy.get(days[0])!;
  const points: EquityCurvePoint[] = [];
  for (const date of days) {
    let weightedReturn = 0;
    let coveredWeight = 0;
    for (const { base, prices, weightPct } of startPrices) {
      const price = prices?.get(date);
      if (!base || !price) continue;
      weightedReturn += weightPct * (price / base - 1);
      coveredWeight += weightPct;
    }
    if (coveredWeight > totalWeight / 2) {
      points.push({
        date,
        portfolioPct: Number((100 * weightedReturn / coveredWeight).toFixed(2)),
        spyPct: Number((100 * (spy.get(date)! / spyBase - 1)).toFixed(2)),
      });
    }
  }

  if (window.monthly || points.length < 2) return points;
  // Keep the entry-day baseline and the last available close in each later month.
  const entryMonth = points[0].date.slice(0, 7);
  const monthEnds = new Map<string, EquityCurvePoint>();
  for (const point of points) {
    const month = point.date.slice(0, 7);
    if (month > entryMonth) monthEnds.set(month, point);
  }
  return [points[0], ...monthEnds.values()].map((point) => ({
    ...point,
    date: point.date.slice(0, 7),
  }));
}
