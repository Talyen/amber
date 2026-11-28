import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { hasNewCoverageInputs, ingestCandidate, ingestCoverage, normalizeShareCountToMillions, selectCoverageCandidates } from "../scripts/ingest-edgar.ts";
import { selectFinancialSnapshots } from "../scripts/seed-neon.ts";
import { PILOT_TICKERS } from "../src/data/pilot-tickers.ts";

const candidate = { ticker: "EXAMPLE", name: "Example", cik: "0000000100", exchange: "NYSE" } as const;
const priorQuarterAccession = "0000000100-25-000001";
const quarterAccession = "0000000100-26-000002";
const annualAccession = "0000000100-26-000001";

function fact(start: string | undefined, end: string, value: number, form: string, filed: string, accn: string) {
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

test("SEC requests overlap with paced starts including retries, and snapshot order stays stable", { timeout: 5_000 }, async (t) => {
  const next = { ...candidate, ticker: "NEXT", cik: "0000000101" };
  const firstCanFinish = Promise.withResolvers<void>();
  const starts: { url: string; at: number }[] = [];
  let retryNext = true;
  const facts = {
    entityName: candidate.name,
    facts: { "us-gaap": {
      Revenues: usd(...annual(1000)),
      NetCashProvidedByUsedInOperatingActivities: usd(...annual(200)),
      PaymentsToAcquirePropertyPlantAndEquipment: usd(...annual(100)),
    } },
  };
  t.mock.method(globalThis, "fetch", async (url: string) => {
    starts.push({ url, at: performance.now() });
    if (url.includes("/companyfacts/")) {
      if (url.endsWith(`${candidate.cik}.json`)) await firstCanFinish.promise;
      else if (retryNext) {
        retryNext = false;
        return new Response(null, { status: 429 });
      }
      return Response.json(facts);
    }
    if (url.endsWith(`${next.cik}.json`)) firstCanFinish.resolve();
    return Response.json({});
  });
  const tracked = new Map([candidate, next].map((company) => [company.ticker, { ...PILOT_TICKERS[0], ...company }]));

  const { companies, incompleteNewCoverage } = await ingestCoverage([candidate, next], new Map(), tracked);

  assert.equal(starts.length, 5);
  assert.ok(starts[1].url.endsWith(`${next.cik}.json`));
  assert.ok(starts.slice(1).every(({ at }, index) => at - starts[index].at >= 130));
  assert.deepEqual(companies.map(({ ticker }) => ticker), [candidate.ticker, next.ticker]);
  assert.equal(companies.some(({ edgarFallback }) => edgarFallback), false);
  assert.equal(incompleteNewCoverage, 0);
});

test("the coverage selector keeps ordinary symbols ending in W, U and R", () => {
  const selected = selectCoverageCandidates([
    [1, "Snowflake", "SNOW", "NYSE"],
    [2, "Micron", "MU", "Nasdaq"],
    [3, "Palantir", "PLTR", "Nasdaq"],
    [4, "Example Inc.", "ABCD", "Nasdaq"],
    [4, "Example Inc.", "ABCDW", "Nasdaq"],
    [4, "Example Inc.", "ABCDU", "Nasdaq"],
    [4, "Example Inc.", "ABCDR", "Nasdaq"],
    [5, "Example Bank", "BANK", "NYSE"],
    [6, "Example ETF Trust", "ETF", "NYSE"],
    [7, "Other Inc.", "OTHER", "NYSE"],
  ], 4, ["ABCD"]);

  assert.deepEqual(selected.map(({ ticker }) => ticker), ["PLTR", "SNOW", "MU", "ABCD"]);
});

test("expansion requires a recent annual report and avoids guessed valuation inputs", () => {
  const pilot = PILOT_TICKERS[0];
  const financials = { ...pilot.annuals[0], periodEndDate: "2025-12-31" };
  const snapshot = { ...pilot, annuals: [financials], marketCapShares: 123, sic: 7372 };
  const now = Date.parse("2026-08-01");

  assert.equal(hasNewCoverageInputs(snapshot, now), true);
  assert.equal(hasNewCoverageInputs({ ...snapshot, marketCapShares: undefined }, now), false);
  assert.equal(hasNewCoverageInputs({ ...snapshot, edgarFallback: true }, now), false);
  assert.equal(hasNewCoverageInputs({ ...snapshot, sic: 6798, annuals: [{ ...financials, stockholdersEquity: null, netIncome: null }] }, now), false);
  assert.equal(hasNewCoverageInputs({ ...snapshot, sic: 6798, annuals: [{ ...financials, capex: 0, stockholdersEquity: 12000, netIncome: 1500 }] }, now), true);
  assert.equal(hasNewCoverageInputs({ ...snapshot, sic: 1311, annuals: [{ ...financials, operatingCashFlow: 5000, capex: 2000 }] }, now), true);
  assert.equal(hasNewCoverageInputs({ ...snapshot, sic: 1311, annuals: [{ ...financials, operatingCashFlow: 0, capex: 2000 }] }, now), false);
  assert.equal(hasNewCoverageInputs({ ...snapshot, annuals: [{ ...financials, capex: 0 }] }, now), false);
  assert.equal(hasNewCoverageInputs(snapshot, Date.parse("2027-10-01")), false);
});

test("cash and debt use facts from the same period and count commercial paper once", async (t) => {
  const instant = (end: string, val: number) =>
    fact(undefined, end, val, "10-Q", "2026-08-01", quarterAccession);
  const yearEnd = "2025-12-31";
  const quarterEnd = "2026-06-30";
  mockSec(t, {
    Revenues: usd(...annual(1000), ...ytd(500, 550)),
    NetCashProvidedByUsedInOperatingActivities: usd(...annual(200), ...ytd(90, 100)),
    CashAndCashEquivalentsAtCarryingValue: usd(instant(yearEnd, 30), instant(quarterEnd, 20)),
    CashCashEquivalentsAndShortTermInvestments: usd(instant(yearEnd, 130)),
    MarketableSecuritiesCurrent: usd(instant(yearEnd, 100)),
    ShortTermInvestments: usd(instant(quarterEnd, 10)),
    LongTermDebt: usd(instant(quarterEnd, 50)),
    LongTermDebtNoncurrent: usd(instant(quarterEnd, 40)),
    LongTermNotesPayable: usd(instant(yearEnd, 120), instant(quarterEnd, 40)),
    LongTermDebtCurrent: usd(instant(yearEnd, 5), instant(quarterEnd, 10)),
    DebtCurrent: usd(instant(quarterEnd, 15)),
    CommercialPaper: usd(instant(quarterEnd, 5)),
    CommonStockSharesOutstanding: { units: { shares: [instant(quarterEnd, 40.125)] } },
    WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: annual(50) } },
  });

  const snapshot = await ingestCandidate(candidate, new Map(), new Map());
  assert.equal(snapshot?.cashAndEquiv, 30);
  assert.equal(snapshot.totalDebt, 55);
  assert.equal(snapshot.marketCapShares, 40.125);
  assert.equal(snapshot.annuals.at(-2)?.cashAndEquiv, 130);
  assert.equal(snapshot.annuals.at(-2)?.totalDebt, 125);
  assert.equal(snapshot.annuals.at(-2)?.dilutedShares, 50);
});

test("TTM uses newer YTD revenue when the company changes tags", async (t) => {
  mockSec(t, {
    Revenues: usd(...annual(1000), ...ytd(200, 240, "03-31")),
    RevenueFromContractWithCustomerExcludingAssessedTax: usd(...ytd(500, 550)),
    NetCashProvidedByUsedInOperatingActivities: usd(...annual(200), ...ytd(90, 100)),
    PaymentsToAcquireOtherProductiveAssets: usd(...annual(100), ...ytd(40, 55)),
  });
  const snapshot = await ingestCandidate(candidate, new Map(), new Map());
  const row = snapshot?.annuals.at(-1);
  assert.equal(row?.periodEndDate, "2026-06-30");
  assert.equal(row.revenue, 1050);
  assert.equal(row.capex, 115);
});

test("the ledger retains reported operating cash flow for banks", async (t) => {
  mockSec(t, {
    Revenues: usd(...annual(180_000)),
    NetCashProvidedByUsedInOperatingActivities: usd(...annual(-148_000)),
    NetIncomeLoss: usd(...annual(57_000)),
    ShareBasedCompensation: usd(...annual(3600)),
  });
  const snapshot = await ingestCandidate({ ...candidate, ticker: "JPM" }, new Map(), new Map());
  assert.equal(snapshot?.annuals.at(-1)?.operatingCashFlow, -148_000);
});


test("converts the issuer's common shares into current U.S. listing units", async (t) => {
  mockSec(t, {
    Revenues: usd(...annual(1000)),
    NetCashProvidedByUsedInOperatingActivities: usd(...annual(200)),
    CommonStockSharesOutstanding: {
      units: { shares: [fact(undefined, "2025-12-31", 1000, "20-F", "2026-02-15", annualAccession)] },
    },
  });
  for (const [ticker, expectedShares] of [["SNY", 2000], ["AZN", 1000], ["TSM", 200]] as const) {
    const listing = { ...candidate, ticker };
    const previous = { ...PILOT_TICKERS[0], ...listing, price: 50 };
    const result = await ingestCandidate(listing, new Map(), new Map([[ticker, previous]]));
    assert.equal(normalizeShareCountToMillions(1e9, ticker), expectedShares);
    assert.equal(result?.marketCapShares, expectedShares);
    assert.equal(result?.marketCap, 50 * expectedShares);
  }
});
