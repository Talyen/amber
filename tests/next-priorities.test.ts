import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBrokerageCsv } from "../src/lib/portfolio-csv.ts";
import { computeUpcomingFilings } from "../src/lib/filing-calendar.ts";
import { isMeaningfulThesisChange } from "../src/lib/valuation-presets.ts";
import { summarizeSearchIndexCoverage } from "../src/lib/coverage-health.ts";

describe("Brokerage CSV portfolio import", () => {
  const known = new Set(["NVDA", "MSFT", "AAPL", "COST", "META"]);
  const prices = new Map<string, number>([
    ["NVDA", 140],
    ["MSFT", 420],
    ["AAPL", 230],
    ["COST", 900],
  ]);

  it("parses Fidelity-style CSV with preamble, currency values, duplicate tax lots, and cash/ETF skipping", () => {
    const csv = [
      "Account Summary,Individual Brokerage",
      "Date Downloaded,11/26/2026",
      "Symbol,Description,Quantity,Current Value,Percent of Account",
      'NVDA,NVIDIA CORP,100,"$14,000.00",28.0%',
      'NVDA,NVIDIA CORP (Lot 2),50,"$7,000.00",14.0%',
      'MSFT,MICROSOFT CORP,50,"$21,000.00",42.0%',
      'SPAXX**,FIDELITY GOVT MONEY MARKET,5000,"$5,000.00",10.0%',
      'VOO,VANGUARD S&P 500 ETF,6,"$3,000.00",6.0%',
      'Total,,"$50,000.00",100.0%',
    ].join("\n");

    const result = parseBrokerageCsv(csv, known, prices);
    assert.equal(result.mode, "dollars");
    assert.deepEqual(result.holdings, [
      { ticker: "NVDA", value: 21000 },
      { ticker: "MSFT", value: 21000 },
    ]);
    assert.deepEqual(result.skippedTickers, ["VOO"]);
  });

  it("computes dollar values from shares × current price when no value column is present", () => {
    const tsv = [
      "Ticker\tShares",
      "AAPL\t10",
      "COST\t2",
    ].join("\n");

    const result = parseBrokerageCsv(tsv, known, prices);
    assert.equal(result.mode, "dollars");
    assert.deepEqual(result.holdings, [
      { ticker: "AAPL", value: 2300 },
      { ticker: "COST", value: 1800 },
    ]);
  });

  it("uses weight mode when only allocation percentages are provided", () => {
    const csv = [
      "Ticker,Weight",
      "NVDA,40%",
      "MSFT,35%",
      "META,25%",
    ].join("\n");

    const result = parseBrokerageCsv(csv, known, prices);
    assert.equal(result.mode, "weight");
    assert.deepEqual(result.holdings, [
      { ticker: "NVDA", value: 40 },
      { ticker: "MSFT", value: 35 },
      { ticker: "META", value: 25 },
    ]);
  });
});

describe("Thesis Journal change detection", () => {
  it("ignores identical saves and flags meaningful assumption or note changes", () => {
    const base = {
      ticker: "NVDA",
      lens: "fcf" as const,
      revGrowth: 18,
      targetMargin: 42,
      exitMultiple: 28,
      thesisNote: "Data center demand durable",
    };

    assert.equal(isMeaningfulThesisChange(null, base), true);
    assert.equal(isMeaningfulThesisChange(base, { ...base }), false);
    assert.equal(isMeaningfulThesisChange(base, { ...base, revGrowth: 20 }), true);
    assert.equal(isMeaningfulThesisChange(base, { ...base, thesisNote: "Updated after Q3 10-Q" }), true);
  });
});

describe("Upcoming SEC Filing Calendar", () => {
  it("projects ~91-day SEC cadence windows, buckets imminent filings, and excludes stale 20-F filers", () => {
    const nowMs = Date.parse("2026-11-26T12:00:00Z");
    const entries = [
      // Filed 88 days ago -> expected in 3 days (imminent)
      {
        ticker: "NVDA",
        name: "NVIDIA",
        sector: "Semiconductors",
        marketCap: 3400000,
        lastFilingDate: "2026-08-30",
        trueFcfMargin: 48,
        impliedCagr: 16.5,
      },
      // Filed 78 days ago -> expected in 13 days (two-weeks)
      {
        ticker: "MSFT",
        name: "Microsoft",
        sector: "Cloud & Software",
        marketCap: 3100000,
        lastFilingDate: "2026-09-09",
        trueFcfMargin: 31,
        impliedCagr: 12.1,
      },
      // Filed 250 days ago (annual-only foreign filer) -> excluded
      {
        ticker: "ASML",
        name: "ASML Holding",
        sector: "Semiconductors",
        marketCap: 320000,
        lastFilingDate: "2026-03-21",
        trueFcfMargin: 28,
        impliedCagr: 14.0,
      },
    ];

    const upcoming = computeUpcomingFilings(entries, nowMs, 30);
    assert.equal(upcoming.length, 2);
    assert.equal(upcoming[0].ticker, "NVDA");
    assert.equal(upcoming[0].bucket, "imminent");
    assert.equal(upcoming[0].daysUntil, 3);
    assert.equal(upcoming[1].ticker, "MSFT");
    assert.equal(upcoming[1].bucket, "two-weeks");
    assert.equal(upcoming[1].daysUntil, 13);
  });
});

describe("Search index coverage summary", () => {
  it("counts fresh quotes, dividend payers, bank P/TBV, REIT FFO, and recent filings", () => {
    const nowMs = Date.parse("2026-11-26T12:00:00Z");
    const summary = summarizeSearchIndexCoverage(
      [
        {
          ticker: "JPM",
          sector: "Financials",
          priceAsOf: "2026-11-25",
          dividendYieldPct: 2.3,
          priceToTbv: 2.4,
          lastFilingDate: "2026-11-01",
        },
        {
          ticker: "O",
          sector: "Real Estate & REITs",
          priceAsOf: "2026-11-25",
          dividendYieldPct: 5.5,
          priceToFfo: 14.2,
          lastFilingDate: "2026-11-05",
        },
        {
          ticker: "NVDA",
          sector: "Semiconductors",
          priceAsOf: "2026-11-25",
          dividendYieldPct: 0.03,
          lastFilingDate: "2026-06-01",
        },
      ],
      nowMs
    );

    assert.deepEqual(summary, {
      totalCompanies: 3,
      freshQuotes: 3,
      dividendPayers: 3,
      banksWithTbv: 1,
      reitsWithFfo: 1,
      recentFilings90d: 2,
    });
  });
});
