export interface FilingCalendarInput {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number;
  lastFilingDate: string;
  trueFcfMargin: number;
  impliedCagr: number | null;
}

export interface UpcomingFilingItem {
  ticker: string;
  name: string;
  sector: string;
  marketCap: number;
  lastFilingDate: string;
  expectedFilingDate: string;
  daysUntil: number;
  bucket: "imminent" | "two-weeks" | "month";
  trueFcfMargin: number;
  impliedCagr: number | null;
}

const DAY_MS = 86_400_000;
const QUARTERLY_CADENCE_DAYS = 91;

function parseIsoDateUtc(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function formatUtcIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Projects upcoming SEC quarterly/annual filing windows (~91-day reporting cadence)
 * from each company's most recent verified SEC EDGAR filing date.
 */
export function computeUpcomingFilings(
  entries: ReadonlyArray<FilingCalendarInput>,
  nowMs = Date.now(),
  windowDays = 30
): UpcomingFilingItem[] {
  const todayDate = new Date(nowMs);
  const todayUtcMs = Date.UTC(
    todayDate.getUTCFullYear(),
    todayDate.getUTCMonth(),
    todayDate.getUTCDate()
  );

  const items: UpcomingFilingItem[] = [];

  for (const entry of entries) {
    const lastMs = parseIsoDateUtc(entry.lastFilingDate);
    if (lastMs === null) continue;

    // Ignore very stale records (> 220 days old, e.g. annual-only 20-F filers where 91d cadence doesn't apply)
    const daysSinceLast = Math.round((todayUtcMs - lastMs) / DAY_MS);
    if (daysSinceLast < 0 || daysSinceLast > 220) continue;

    let expectedMs = lastMs + QUARTERLY_CADENCE_DAYS * DAY_MS;
    // If just past the first 91-day window (e.g., 10-K takes ~15 days longer than 10-Q), allow one grace window
    let daysUntil = Math.round((expectedMs - todayUtcMs) / DAY_MS);
    if (daysUntil < -10) {
      expectedMs += QUARTERLY_CADENCE_DAYS * DAY_MS;
      daysUntil = Math.round((expectedMs - todayUtcMs) / DAY_MS);
    }

    if (daysUntil < -2 || daysUntil > windowDays) continue;

    const bucket: UpcomingFilingItem["bucket"] =
      daysUntil <= 7 ? "imminent" : daysUntil <= 14 ? "two-weeks" : "month";

    items.push({
      ticker: entry.ticker,
      name: entry.name,
      sector: entry.sector,
      marketCap: entry.marketCap,
      lastFilingDate: entry.lastFilingDate,
      expectedFilingDate: formatUtcIsoDate(expectedMs),
      daysUntil,
      bucket,
      trueFcfMargin: entry.trueFcfMargin,
      impliedCagr: entry.impliedCagr,
    });
  }

  return items.sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    return b.marketCap - a.marketCap;
  });
}
