import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computePortfolioThesisSummary,
  computePresetExpectedReturn,
  MAX_THESIS_NOTE_LENGTH,
  normalizeValuationPresetInput,
} from "../src/lib/valuation-presets.ts";
import { buildCompareCompanyHistory, indexCompareHistory } from "../src/lib/compare-history.ts";
import { PILOT_TICKERS } from "../src/data/pilot-tickers.ts";
import { readExploreLink, writeExploreLink } from "../src/lib/explore-link.ts";

describe("Valuation presets validation", () => {
  it("normalizes valid valuation assumptions and rejects out-of-range inputs", () => {
    const valid = normalizeValuationPresetInput({
      ticker: " nvda ",
      lens: "ebit",
      revGrowth: 18.24,
      targetMargin: 42.66,
      exitMultiple: 24.5,
      thesisNote: "  AI datacenter   compounding  ",
    });
    assert.deepEqual(valid, {
      ticker: "NVDA",
      lens: "ebit",
      revGrowth: 18.2,
      targetMargin: 42.7,
      exitMultiple: 24.5,
      thesisNote: "AI datacenter compounding",
      isPublic: false,
    });

    assert.equal(normalizeValuationPresetInput(null), null);
    assert.equal(normalizeValuationPresetInput({ ticker: "BAD TICKER", revGrowth: 10, targetMargin: 20, exitMultiple: 15 }), null);
    assert.equal(normalizeValuationPresetInput({ ticker: "NVDA", revGrowth: 99, targetMargin: 20, exitMultiple: 15 }), null);
    assert.equal(normalizeValuationPresetInput({ ticker: "NVDA", revGrowth: 10, targetMargin: 0, exitMultiple: 15 }), null);
    assert.equal(normalizeValuationPresetInput({ ticker: "NVDA", revGrowth: 10, targetMargin: 20, exitMultiple: 100 }), null);
    assert.equal(
      normalizeValuationPresetInput({
        ticker: "NVDA",
        revGrowth: 10,
        targetMargin: 20,
        exitMultiple: 15,
        thesisNote: "x".repeat(MAX_THESIS_NOTE_LENGTH + 1),
      }),
      null
    );
  });

  it("computes expected return and weighted portfolio thesis summary with partial coverage", () => {
    const holdings = [
      { ticker: "AAA", price: 100, marketCap: 10_000, netCash: 500, revenue: 2_000, trueFcfMargin: 25 },
      { ticker: "BBB", price: 50, marketCap: 5_000, netCash: 0, revenue: 1_000, trueFcfMargin: 20 },
      { ticker: "CCC", price: 25, marketCap: 2_500, netCash: 0, revenue: 500, trueFcfMargin: 15 },
    ];
    const presetA = {
      ticker: "AAA",
      lens: "fcf" as const,
      revGrowth: 15,
      targetMargin: 30,
      exitMultiple: 22,
      thesisNote: "High margin core",
      updatedAt: "2026-11-25T00:00:00.000Z",
    };
    const expectedA = computePresetExpectedReturn(presetA, holdings[0]);
    assert.ok(expectedA !== null);
    assert.ok(Number.isFinite(expectedA.irrPct));
    assert.equal(expectedA.thesisNote, "High margin core");

    const weights = new Map([
      ["AAA", 0.5],
      ["BBB", 0.5],
      ["CCC", 0],
    ]);
    const summary = computePortfolioThesisSummary(holdings, weights, { AAA: presetA });
    assert.equal(summary.coveredCount, 1);
    assert.equal(summary.totalAllocatedCount, 2);
    assert.equal(summary.coveredWeightPct, 50);
    assert.equal(summary.weightedIrrPct, expectedA.irrPct);
    assert.equal(summary.byTicker.BBB, undefined);
  });

  it("accepts numeric strings without coercing blank or non-numeric values into assumptions", () => {
    const draft = { ticker: "NVDA", lens: "fcf", revGrowth: "0", targetMargin: "20", exitMultiple: "15" };
    assert.equal(normalizeValuationPresetInput(draft)?.revGrowth, 0);
    for (const revGrowth of [null, " ", false, [], [1]]) {
      assert.equal(normalizeValuationPresetInput({ ...draft, revGrowth }), null);
    }
    assert.equal(normalizeValuationPresetInput({ ...draft, targetMargin: true }), null);
    assert.equal(normalizeValuationPresetInput({ ...draft, exitMultiple: [15] }), null);
  });
});

describe("Compare history builder", () => {
  it("builds up to 5 annual points excluding TTM", () => {
    const sample = PILOT_TICKERS[0];
    const history = buildCompareCompanyHistory({
      ticker: sample.ticker,
      name: sample.name,
      annuals: [
        ...sample.annuals,
        { ...sample.annuals[sample.annuals.length - 1], fiscalYear: "TTM" },
      ],
    });
    assert.equal(history.ticker, sample.ticker);
    assert.ok(history.points.length >= 3 && history.points.length <= 5);
    assert.ok(history.points.every((p) => p.fiscalYear !== "TTM"));
    assert.ok(history.points.every((p) => Number.isFinite(p.trueFcfMargin)));
  });

  it("indexes each series from its first positive value and skips missing share counts", () => {
    const points = [
      { fiscalYear: "FY22", revenue: 0, dilutedShares: 10 },
      { fiscalYear: "FY23", revenue: 50, dilutedShares: 0 },
      { fiscalYear: "FY24", revenue: 125, dilutedShares: 8 },
    ].map((point) => ({ ...point, trueFcfMargin: 0, sbcPctRevenue: 0 }));

    assert.deepEqual(indexCompareHistory(points, "revenue"), [
      { fiscalYear: "FY23", value: 100 },
      { fiscalYear: "FY24", value: 250 },
    ]);
    assert.deepEqual(indexCompareHistory(points, "dilutedShares"), [
      { fiscalYear: "FY22", value: 100 },
      { fiscalYear: "FY24", value: 80 },
    ]);
    assert.deepEqual(indexCompareHistory(points.slice(0, 1), "revenue"), []);
  });
});

describe("Composable explore screener links", () => {
  it("round-trips the minimum market cap filter alongside other screener inputs", () => {
    const params = new URLSearchParams();
    writeExploreLink(
      params,
      {
        sector: "Cloud & Software",
        sortKey: "trueFcfMargin",
        sortDir: "desc",
        fcf: "20",
        sbc: "8",
        imp: "12",
        dil: "0",
        cap: "25",
      },
      null,
      null
    );
    assert.equal(params.get("cap"), "25");

    const parsed = readExploreLink(
      params,
      null,
      [],
      ["All", "Cloud & Software"],
      () => ["marketCap", "trueFcfMargin", "sbcPctRevenue", "netDilutionCagr", "impliedCagr"]
    );
    assert.equal(parsed.cap, "25");
    assert.equal(parsed.fcf, "20");
    assert.equal(parsed.sbc, "8");
    assert.equal(parsed.sector, "Cloud & Software");
  });
});
