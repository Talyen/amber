import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computePortfolioThesisSummary,
  computeThesisDrift,
  type PresetValuationEntry,
  type SavedValuationPreset,
} from "../src/lib/valuation-presets.ts";
import {
  computePortfolioStress,
  computeSbcDilutionAttribution,
  type StressHoldingInput,
} from "../src/lib/portfolio-stress.ts";
import { renderWatchlistDigestHtml } from "../src/lib/alert-email.ts";

function makeEntry(overrides: Partial<PresetValuationEntry> = {}): PresetValuationEntry {
  return {
    ticker: "ACME",
    revenueCagr: 11,
    scenarioBasis: {
      price: 100,
      dilutedShares: 100,
      netCash: 1_000,
      revenue: 3_000,
      trueFcfMargin: 21,
      operatingMargin: 24,
      netMargin: 18,
      equityLensOnly: false,
    },
    ...overrides,
  };
}

describe("Thesis vs. Reality Drift Tracking", () => {
  it("flags trailing actuals when growth or lens margin lags thesis assumptions", () => {
    const preset: SavedValuationPreset = {
      ticker: "ACME",
      lens: "fcf",
      revGrowth: 18,
      targetMargin: 26,
      exitMultiple: 22,
      updatedAt: "2026-11-25T00:00:00Z",
    };
    const drift = computeThesisDrift(preset, makeEntry());
    assert.ok(drift);
    assert.equal(drift.status, "trailing");
    assert.equal(drift.revGrowthGapPct, -7);
    assert.equal(drift.marginGapPct, -5);
    assert.match(drift.summary, /trails/);
  });

  it("classifies ahead and on_track theses accurately", () => {
    const aheadPreset: SavedValuationPreset = {
      ticker: "ACME",
      lens: "ebit",
      revGrowth: 6,
      targetMargin: 20,
      exitMultiple: 18,
      updatedAt: "2026-11-25T00:00:00Z",
    };
    const ahead = computeThesisDrift(aheadPreset, makeEntry());
    assert.equal(ahead?.status, "ahead");

    const onTrackPreset: SavedValuationPreset = {
      ticker: "ACME",
      lens: "pe",
      revGrowth: 10,
      targetMargin: 19,
      exitMultiple: 18,
      updatedAt: "2026-11-25T00:00:00Z",
    };
    const onTrack = computeThesisDrift(onTrackPreset, makeEntry());
    assert.equal(onTrack?.status, "on_track");
  });

  it("counts trailing holdings in computePortfolioThesisSummary", () => {
    const entry = makeEntry();
    const presets: Record<string, SavedValuationPreset> = {
      ACME: {
        ticker: "ACME",
        lens: "fcf",
        revGrowth: 20,
        targetMargin: 28,
        exitMultiple: 22,
        updatedAt: "2026-11-25T00:00:00Z",
      },
    };
    const summary = computePortfolioThesisSummary(
      [entry],
      new Map([["ACME", 1]]),
      presets
    );
    assert.equal(summary.trailingCount, 1);
    assert.equal(summary.driftByTicker.ACME?.status, "trailing");
  });

  it("renders Thesis Drift items in watchlist digest emails", () => {
    const html = renderWatchlistDigestHtml({
      dateLabel: "2026-11-26",
      siteUrl: "https://amber.finance",
      items: [
        {
          ticker: "ACME",
          kind: "Thesis Drift",
          date: "2026-11-26",
          headline: "ACME actuals trail your saved FCF thesis",
          detail: "11.0% rev CAGR trails 18.0% thesis (-7.0 pts)",
        },
      ],
    });
    assert.match(html, /Thesis Drift/);
    assert.match(html, /ACME actuals trail/);
  });
});

describe("Portfolio Stress Test & SBC Attribution", () => {
  const holdings: StressHoldingInput[] = [
    {
      ticker: "GROW",
      name: "Growth Co",
      impliedCagr: 22,
      sbcPctRevenue: 16,
      netDilutionCagr: 3.2,
      scenarioBasis: makeEntry({ ticker: "GROW" }).scenarioBasis,
    },
    {
      ticker: "CASH",
      name: "Cash Machine",
      impliedCagr: 8,
      sbcPctRevenue: 2,
      netDilutionCagr: -2.5,
      scenarioBasis: makeEntry({ ticker: "CASH" }).scenarioBasis,
    },
  ];
  const weights = new Map([
    ["GROW", 0.6],
    ["CASH", 0.4],
  ]);
  const presets: Record<string, SavedValuationPreset> = {
    GROW: {
      ticker: "GROW",
      lens: "fcf",
      revGrowth: 18,
      targetMargin: 25,
      exitMultiple: 24,
      updatedAt: "2026-11-25T00:00:00Z",
    },
  };

  it("returns neutral impact at zero stress and lowers IRR under compression", () => {
    const base = computePortfolioStress(holdings, weights, presets, {
      multipleCompressionPct: 0,
      growthHaircutPts: 0,
      topPositionDrawdownPct: 0,
    });
    assert.equal(base.estimatedDrawdownPct, 0);
    assert.equal(base.topHoldingTicker, "GROW");
    assert.equal(base.thesisIrrDeltaPct, 0);

    const shocked = computePortfolioStress(holdings, weights, presets, {
      multipleCompressionPct: -20,
      growthHaircutPts: 4,
      topPositionDrawdownPct: -25,
    });
    assert.ok(shocked.estimatedDrawdownPct < -20);
    assert.ok(
      shocked.stressedThesisIrrPct !== null &&
        base.baseThesisIrrPct !== null &&
        shocked.stressedThesisIrrPct < base.baseThesisIrrPct
    );
  });

  it("attributes weighted SBC drag and ranks top contributors first", () => {
    const rows = computeSbcDilutionAttribution(holdings, weights);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].ticker, "GROW");
    assert.ok(rows[0].shareOfPortfolioSbcPct > 90);
    assert.equal(rows[0].shareOfPortfolioSbcPct + rows[1].shareOfPortfolioSbcPct, 100);
  });
});
