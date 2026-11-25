export function arenaMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function arenaPeriodBounds(periodKey: string) {
  if (!/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(periodKey)) return null;

  const monthly = periodKey.length === 7;
  const start = new Date(`${monthly ? periodKey : `${periodKey}-01`}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + (monthly ? 1 : 12));

  return {
    start: start.getTime() / 1000,
    end: end.getTime() / 1000,
  };
}

export function lastTradingClose(
  timestamps: readonly number[],
  closes: readonly (number | null)[],
  { start, end }: NonNullable<ReturnType<typeof arenaPeriodBounds>>
) {
  let lastTimestamp = -Infinity;
  let lastPrice: number | undefined;

  for (const [index, time] of timestamps.entries()) {
    const price = closes[index];
    if (
      Number.isFinite(time) && time >= start && time < end && time > lastTimestamp &&
      typeof price === "number" && Number.isFinite(price) && price > 0
    ) {
      lastTimestamp = time;
      lastPrice = price;
    }
  }
  return lastPrice;
}

const BENCHMARK_LOOKBACK_SECONDS = 10 * 86_400;

export function arenaBenchmarkHistoryStart(periodStart: number) {
  return periodStart - BENCHMARK_LOOKBACK_SECONDS;
}

export function arenaIndexPeriodReturn(
  timestamps: readonly number[],
  closes: readonly (number | null)[],
  bounds: NonNullable<ReturnType<typeof arenaPeriodBounds>>,
) {
  const entry = lastTradingClose(timestamps, closes, {
    start: arenaBenchmarkHistoryStart(bounds.start),
    end: bounds.start,
  });
  const exit = lastTradingClose(timestamps, closes, bounds);
  if (entry !== undefined && exit !== undefined) {
    return Number((((exit - entry) / entry) * 100).toFixed(2));
  }
}
