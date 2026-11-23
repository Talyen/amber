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

export function arenaPerformanceWindow(entry: ArenaEquityEntry) {
  const bounds = arenaPeriodBounds(entry.periodKey);
  const lockedDay = Date.parse(entry.lockedAt.slice(0, 10) + "T00:00:00Z") / 1000;
  if (!bounds || !Number.isFinite(lockedDay) || lockedDay >= bounds.end) return null;
  return {
    start: Math.max(bounds.start, lockedDay),
    end: bounds.end,
    monthly: entry.periodKey.length === 7,
    // Bot entry prices are seeded from adjusted month-end history.
    isBot: entry.isBot,
    // Arena only stores the current holdings, so a rebalance leaves no historical curve.
    includeHoldings: entry.rebalances.length === 0 &&
      (entry.isBot || entry.lastRebalancedAt <= entry.lockedAt),
  };
}

export function arenaBenchmark(
  spy: ReadonlyMap<string, number>,
  window: NonNullable<ReturnType<typeof arenaPerformanceWindow>>,
) {
  const startDay = new Date(window.start * 1000).toISOString().slice(0, 10);
  const endDay = new Date(window.end * 1000).toISOString().slice(0, 10);
  const tradingDays = [...spy.keys()].sort();
  const days = tradingDays.filter((day) => day >= startDay && day < endDay);
  // Entries use an already saved closing quote. Match it to the preceding trading close.
  const firstDay = tradingDays.findLast((day) => day < startDay);
  const lastDay = days.at(-1);
  if (!firstDay || !lastDay) return;
  const spyBase = spy.get(firstDay)!;
  const spyReturnOn = (day: string) => Number(((spy.get(day)! / spyBase - 1) * 100).toFixed(2));
  return { days, lastDay, spyReturnOn, spyReturn: spyReturnOn(lastDay) };
}

export function buildArenaPerformance(
  positions: readonly { ticker: string; weightPct: number; entryPrice: number }[],
  series: ReadonlyMap<string, ReadonlyMap<string, number>>,
  window: NonNullable<ReturnType<typeof arenaPerformanceWindow>>,
  { nav, totalReturnPct }: { nav: number; totalReturnPct: number },
): { spyReturn?: number; curvePoints: EquityCurvePoint[] } {
  const spy = series.get("SPY");
  const benchmark = spy && arenaBenchmark(spy, window);
  if (!benchmark) return { curvePoints: [] };
  const { days, lastDay, spyReturnOn, spyReturn } = benchmark;
  if (!window.includeHoldings || positions.length === 0 || days.length < 2) {
    return { spyReturn, curvePoints: [] };
  }

  const startPrices = positions.map((position) => ({
    ...position,
    prices: series.get(position.ticker),
  }));
  const points: EquityCurvePoint[] = [];
  for (const date of days) {
    let weightedReturn = 0;
    let hasAllPrices = true;
    for (const { entryPrice, prices, weightPct } of startPrices) {
      const price = prices?.get(date);
      if (weightPct === 0) continue;
      if (!price || entryPrice <= 0) {
        hasAllPrices = false;
        break;
      }
      weightedReturn += weightPct * (price / entryPrice - 1);
    }
    // End at the saved live or finalized score shown on the scorecard.
    if (hasAllPrices || date === lastDay) {
      const portfolioPct = date === lastDay
        ? totalReturnPct
        : Number((nav * (1 + weightedReturn / 100) - 100).toFixed(2));
      points.push({
        date,
        portfolioPct,
        spyPct: spyReturnOn(date),
      });
    }
  }

  if (points.length < 2) return { spyReturn, curvePoints: [] };
  if (window.monthly || points[0].date.slice(0, 7) === lastDay.slice(0, 7)) {
    return { spyReturn, curvePoints: points };
  }
  // Keep the entry-day baseline and the last available close in each later month.
  const entryMonth = points[0].date.slice(0, 7);
  const monthEnds = new Map<string, EquityCurvePoint>();
  for (const point of points) {
    const month = point.date.slice(0, 7);
    if (month > entryMonth) monthEnds.set(month, point);
  }
  const curvePoints = [points[0], ...monthEnds.values()].map((point) => ({
    ...point,
    date: point.date.slice(0, 7),
  }));
  return { spyReturn, curvePoints };
}
