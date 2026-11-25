export function parseArenaWeights(positions: unknown) {
  const weights = new Map<string, number>();
  if (!Array.isArray(positions)) return weights;

  for (const position of positions) {
    if (!position || typeof position !== "object" || typeof position.ticker !== "string") continue;
    const ticker = position.ticker.trim().toUpperCase();
    const rawWeight: unknown = position.weight;
    if (typeof rawWeight !== "number" && typeof rawWeight !== "string") continue;
    const weight = Number(rawWeight);
    if (/^[A-Z0-9.-]{1,10}$/.test(ticker) && Number.isFinite(weight) && weight > 0) {
      weights.set(ticker, weight);
    }
  }

  // Scale first so even large relative weights can be added safely.
  let largest = 0;
  for (const weight of weights.values()) largest = Math.max(largest, weight);
  const scaled = [...weights].map(([ticker, weight]) => [ticker, weight / largest] as const);
  const total = scaled.reduce((sum, [, weight]) => sum + weight, 0);
  const allocations = new Map<string, number>();
  for (const [ticker, weight] of scaled) {
    const percentage = (weight / total) * 100;
    if (percentage > 0) allocations.set(ticker, percentage);
  }
  return allocations;
}
