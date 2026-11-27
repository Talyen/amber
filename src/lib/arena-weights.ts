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

/**
 * Rounds an array of positive percentage weights to integers summing to 100
 * using the largest-remainder (Hamilton) method so displayed chips never sum
 * to 98% or 102%.
 */
export function roundWeightsToHundred(weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const sanitized = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const total = sanitized.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return sanitized.map(() => 0);

  const exact = sanitized.map((w) => (w / total) * 100);
  const floors = exact.map((v) => Math.floor(v));
  const remainder = 100 - floors.reduce((sum, v) => sum + v, 0);

  const order = exact
    .map((v, index) => ({ index, frac: v - floors[index] }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (let i = 0; i < remainder && i < order.length; i++) {
    floors[order[i].index] += 1;
  }
  return floors;
}
