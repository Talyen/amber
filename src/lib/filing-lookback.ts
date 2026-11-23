export const INSIDER_BUY_LOOKBACK_DAYS = 365;
export const MATERIAL_EVENT_LOOKBACK_DAYS = 120;

export function filingCutoffDate(now: Date, lookbackDays: number): string {
  return new Date(now.getTime() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
}
