const DAY_MS = 86_400_000;
const MAX_CLOSE_AGE_DAYS = 7;

export const MIN_QUOTE_COVERAGE = 0.9;

export function isFreshPriceDate(date: string | null | undefined, now = Date.now()): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const close = Date.parse(date);
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  return Number.isFinite(close) && new Date(close).toISOString().slice(0, 10) === date &&
    close <= today && today - close <= MAX_CLOSE_AGE_DAYS * DAY_MS;
}

export function meetsQuoteCoverage(refreshed: number, total: number): boolean {
  return total > 0 && refreshed / total >= MIN_QUOTE_COVERAGE;
}
