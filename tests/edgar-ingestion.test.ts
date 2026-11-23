import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ingestCandidate } from "../scripts/ingest-edgar.ts";
import { selectFinancialSnapshots } from "../scripts/seed-neon.ts";
import { PILOT_TICKERS } from "../src/data/pilot-tickers.ts";

const candidate = { ticker: "EXAMPLE", name: "Example", cik: "0000000100", exchange: "NYSE" } as const;
const priorQuarterAccession = "0000000100-25-000001";
const quarterAccession = "0000000100-26-000002";
const annualAccession = "0000000100-26-000001";

function fact(start: string, end: string, value: number, form: string, filed: string, accn: string) {
  return { start, end, val: value * 1e6, form, filed, accn };
}

function annual(value: number) {
  return [2023, 2024, 2025].map((year) => fact(
    `${year}-01-01`,
    `${year}-12-31`,
    value,
    "10-K",
    `${year + 1}-02-15`,
    year === 2025 ? annualAccession : `annual-${year}`
  ));
}

function ytd(prior: number, current: number, monthDay = "06-30") {
  return [
    fact("2025-01-01", `2025-${monthDay}`, prior, "10-Q", "2025-08-01", priorQuarterAccession),
    fact("2026-01-01", `2026-${monthDay}`, current, "10-Q", "2026-08-01", quarterAccession),
  ];
}

const usd = (...facts: ReturnType<typeof fact>[]) => ({ units: { USD: facts } });

function mockSec(t: TestContext, gaap: Record<string, { units: Record<string, ReturnType<typeof fact>[]> }>) {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/companyfacts/")) {
      return Response.json({ entityName: candidate.name, facts: { "us-gaap": gaap } });
    }
    assert.equal(url, `https://data.sec.gov/submissions/CIK${candidate.cik}.json`);
    return Response.json({
      filings: {
        recent: {
          form: ["8-K", "10-Q", "10-K"],
          filingDate: ["2026-08-03", "2026-08-01", "2026-02-15"],
          reportDate: ["2026-08-03", "2026-06-30", "2025-12-31"],
          accessionNumber: ["0000000100-26-000003", quarterAccession, annualAccession],
        },
      },
    });
  });
}

test("a failed refresh retains the last saved snapshot and skips replacing persisted financials", async (t) => {
  const pilot = PILOT_TICKERS[0];
  const saved = {
    ...pilot,
    lastFiling: { ...pilot.lastFiling, date: "2026-10-30", accessionNumber: "0000000100-26-000004" },
  };
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  const result = await ingestCandidate(pilot, new Map([[pilot.ticker, pilot]]), new Map([[pilot.ticker, saved]]));

  assert.equal(fetch.mock.callCount(), 4);
  assert.deepEqual(result, { ...saved, edgarFallback: true });
  assert.deepEqual(selectFinancialSnapshots([result!], new Set([pilot.ticker])), []);
  assert.deepEqual(selectFinancialSnapshots([result!], new Set()), [result]);
  assert.deepEqual(selectFinancialSnapshots([saved], new Set([pilot.ticker])), [saved]);
});

test("TTM uses identical current and prior YTD windows across adjustments", async (t) => {
  mockSec(t, {
    Revenues: usd(...annual(1000), ...ytd(500, 550)),
    NetCashProvidedByUsedInOperatingActivities: usd(...annual(200), ...ytd(90, 100)),
    PaymentsToAcquirePropertyPlantAndEquipment: usd(...annual(100), ...ytd(10, 50, "03-31")),
    ShareBasedCompensation: usd(...annual(40), ...ytd(20, 25)),
    OperatingIncomeLoss: usd(
      ...annual(180),
      fact("2025-04-01", "2025-06-30", 60, "10-Q", "2025-08-01", priorQuarterAccession),
      fact("2026-04-01", "2026-06-30", 80, "10-Q", "2026-08-01", quarterAccession)
    ),
    NetIncomeLoss: usd(
      ...annual(150),
      ...ytd(60, 75),
      fact("2025-01-05", "2025-06-30", 80, "10-Q/A", "2026-08-05", "wrong-prior-window")
    ),
  });
  const result = await ingestCandidate(candidate, new Map(), new Map());
  const row = result?.annuals.at(-1);

  assert.equal(row?.fiscalYear, "TTM");
  assert.equal(row.periodEndDate, "2026-06-30");
  assert.equal(row.revenue, 1050);
  assert.equal(row.operatingCashFlow, 210);
  assert.equal(row.capex, 100);
  assert.equal(row.sbc, 45);
  assert.equal(row.operatingIncome, null);
  assert.equal(row.netIncome, 165);
});

test("the latest periodic filing advances before XBRL can produce TTM", async (t) => {
  mockSec(t, {
    Revenues: usd(...annual(1000)),
    NetCashProvidedByUsedInOperatingActivities: usd(...annual(200)),
    PaymentsToAcquirePropertyPlantAndEquipment: usd(...annual(100)),
  });
  const result = await ingestCandidate(candidate, new Map(), new Map());

  assert.deepEqual(result?.lastFiling, {
    type: "10-Q",
    date: "2026-08-01",
    periodEnd: "2026-06-30",
    accessionNumber: quarterAccession,
  });
  assert.equal(result.annuals.at(-1)?.fiscalYear, "FY25");
  assert.equal(result.filingDiffs[0]?.accessionNumber, annualAccession);
});
