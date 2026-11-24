import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeValuationPresetInput } from "../src/lib/valuation-presets.ts";
import { buildCompareCompanyHistory } from "../src/lib/compare-history.ts";
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
    });
    assert.deepEqual(valid, {
      ticker: "NVDA",
      lens: "ebit",
      revGrowth: 18.2,
      targetMargin: 42.7,
      exitMultiple: 24.5,
    });

    assert.equal(normalizeValuationPresetInput(null), null);
    assert.equal(normalizeValuationPresetInput({ ticker: "BAD TICKER", revGrowth: 10, targetMargin: 20, exitMultiple: 15 }), null);
    assert.equal(normalizeValuationPresetInput({ ticker: "NVDA", revGrowth: 99, targetMargin: 20, exitMultiple: 15 }), null);
    assert.equal(normalizeValuationPresetInput({ ticker: "NVDA", revGrowth: 10, targetMargin: 0, exitMultiple: 15 }), null);
    assert.equal(normalizeValuationPresetInput({ ticker: "NVDA", revGrowth: 10, targetMargin: 20, exitMultiple: 100 }), null);
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
