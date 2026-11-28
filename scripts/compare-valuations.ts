import { readFileSync } from "node:fs";
import { buildSearchIndexEntry, type SearchIndexEntry } from "../src/data/search-index.ts";
import type { CompanySnapshot } from "../src/lib/finance.ts";

const [snapshotPath, baselinePath, date] = process.argv.slice(2);
const now = Date.parse(date ?? "");
if (!snapshotPath || !baselinePath || !date || !Number.isFinite(now)) {
  throw new Error("Usage: pnpm audit:valuations <company-snapshots.json> <baseline-index.json> <YYYY-MM-DD>");
}

const snapshots = JSON.parse(readFileSync(snapshotPath, "utf8")) as CompanySnapshot[];
const baselineRows = JSON.parse(readFileSync(baselinePath, "utf8")) as SearchIndexEntry[];
const baseline = new Map(baselineRows.map((company) => [company.ticker, company]));

if (baseline.size !== baselineRows.length || snapshots.length !== baseline.size ||
    new Set(snapshots.map((company) => company.ticker)).size !== baseline.size) {
  throw new Error("The baseline and company snapshots must contain the same unique ticker universe.");
}

const companies = snapshots.map((snapshot) => {
  const before = baseline.get(snapshot.ticker);
  if (!before || before.price !== snapshot.price || before.revenue !== snapshot.annuals.at(-1)?.revenue ||
      (before.priceAsOf ?? null) !== (snapshot.priceAsOf ?? null)) {
    throw new Error(`${snapshot.ticker} differs from the baseline, so a like-for-like comparison is unavailable.`);
  }
  const after = buildSearchIndexEntry(snapshot, now);
  return {
    ticker: snapshot.ticker,
    sector: snapshot.sector,
    quote: snapshot.price,
    quoteDate: snapshot.priceAsOf ?? null,
    financialPeriod: snapshot.annuals.at(-1)?.periodEndDate ?? null,
    beforeFairValue: before.fairValue ?? null,
    beforeUpsidePct: before.fairValueUpsidePct ?? null,
    afterFairValue: after.fairValue ?? null,
    afterUpsidePct: after.fairValueUpsidePct ?? null,
    bearBullRange: after.fairValueLow !== undefined && after.fairValueHigh !== undefined
      ? [after.fairValueLow, after.fairValueHigh] : null,
    assumptions: after.baseScenario ?? null,
    issue: after.fairValueIssue ?? null,
  };
}).sort((a, b) => a.ticker.localeCompare(b.ticker));

function summarize(values: (number | null)[]) {
  const valued = values.filter((value): value is number => value !== null);
  return {
    estimates: valued.length,
    withoutEstimate: values.length - valued.length,
    upsideAtLeast200Pct: valued.filter((value) => value >= 200).length,
    upsideAtLeast300Pct: valued.filter((value) => value >= 300).length,
    downsideAtLeast90Pct: valued.filter((value) => value <= -90).length,
    downside100Pct: valued.filter((value) => value === -100).length,
  };
}

const reasons = new Map<string, number>();
for (const { issue } of companies) {
  if (issue) reasons.set(issue, (reasons.get(issue) ?? 0) + 1);
}

console.log(JSON.stringify({
  date,
  coverage: companies.length,
  before: summarize(companies.map((company) => company.beforeUpsidePct)),
  after: summarize(companies.map((company) => company.afterUpsidePct)),
  withheldReasons: Object.fromEntries(reasons),
  companies,
}, null, 2));
