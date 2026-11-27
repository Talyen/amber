import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildSearchIndexEntry, toPortfolioEntry, toSearchIndexEntry } from "../src/data/search-index.ts";
import { roundWeightsToHundred } from "../src/lib/arena-weights.ts";
import { selectFeaturedSignals } from "../src/lib/featured-signals.ts";
import { computeCompanyValuation, computeScenarioProjection, getScenarioDefaults, type CompanySnapshot } from "../src/lib/finance.ts";
import { formatInsiderName, formatInsiderTitle } from "../src/lib/insider-format.ts";
import { buildCompanyBriefing } from "../src/lib/insights.ts";
import { computePortfolioStress } from "../src/lib/portfolio-stress.ts";

test("buildCompanyBriefing formats net debt without a double-negative sign", () => {
  const company: CompanySnapshot = {
    ticker: "AAPL",
    name: "Apple Inc.",
    tagline: "Consumer electronics & services",
    cik: "0000320193",
    exchange: "NASDAQ",
    sector: "Technology",
    price: 220,
    marketCap: 3_300_000,
    cashAndEquiv: 56_700,
    totalDebt: 80_100,
    defaultDcf: {
      wacc: 10,
      terminalMultiple: 18,
      targetFcfMargin: 25,
      sbcDragPct: 3,
    },
    lastFiling: { type: "10-K", date: "2026-11-01", periodEnd: "2026-09-28", accessionNumber: "0000320193-26-000001" },
    annuals: [
      {
        fiscalYear: "FY22",
        revenue: 394_328,
        operatingIncome: 119_437,
        netIncome: 99_803,
        operatingCashFlow: 122_151,
        capex: 10_708,
        sbc: 9_038,
        buybacks: 89_402,
        dilutedShares: 16_326,
      },
      {
        fiscalYear: "FY23",
        revenue: 383_285,
        operatingIncome: 114_301,
        netIncome: 96_995,
        operatingCashFlow: 110_543,
        capex: 10_959,
        sbc: 10_833,
        buybacks: 77_550,
        dilutedShares: 15_813,
      },
      {
        fiscalYear: "FY24",
        revenue: 391_035,
        operatingIncome: 123_216,
        netIncome: 93_736,
        operatingCashFlow: 118_254,
        capex: 9_447,
        sbc: 11_688,
        buybacks: 94_949,
        dilutedShares: 15_408,
      },
    ],
    filingDiffs: [],
  };

  const { series, reverseDcf } = computeCompanyValuation(company);
  const briefing = buildCompanyBriefing(company, series, reverseDcf?.impliedRevenueCagrPct ?? null, []);
  const balance = briefing.pillars.find((p) => p.id === "balance");
  assert.ok(balance);
  assert.equal(balance.headlineStat, "$23.4B net debt");
  assert.ok(!balance.headlineStat.startsWith("-"), "net debt should not start with a minus sign");
});

test("formatInsiderName reorders SEC Last First names and preserves corporate entities", () => {
  assert.equal(formatInsiderName("Thiel Peter"), "Peter Thiel");
  assert.equal(formatInsiderName("THIEL PETER"), "Peter Thiel");
  assert.equal(formatInsiderName("COOK TIMOTHY D"), "Timothy D Cook");
  assert.equal(formatInsiderName("Smith John Jr."), "John Smith Jr.");
  assert.equal(formatInsiderName("Doe, Jane"), "Jane Doe");
  assert.equal(formatInsiderName("BERKSHIRE HATHAWAY INC"), "Berkshire Hathaway Inc");
  assert.equal(formatInsiderName("Sequoia Capital Fund, L.P."), "Sequoia Capital Fund, L.P.");
  assert.equal(formatInsiderName("Smith &amp; Partners LLC"), "Smith & Partners LLC");
  assert.equal(formatInsiderTitle("Dir"), "Director");
  assert.equal(formatInsiderTitle("See Remarks below."), "Executive Officer");
});

test("selectFeaturedSignals demotes boilerplate 8-Ks and avoids duplicate headlines", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const entries = [
    { ticker: "V", marketCap: 600_000 },
    { ticker: "NVDA", marketCap: 3_600_000 },
    { ticker: "MSFT", marketCap: 3_640_000 },
    { ticker: "AAPL", marketCap: 5_170_000 },
  ];

  const { featuredDiffs } = selectFeaturedSignals({
    entries,
    trendingTickers: ["NVDA", "V", "MSFT", "AAPL"],
    insiders: [],
    now,
    diffs: [
      {
        id: "v-8k",
        ticker: "V",
        companyName: "Visa Inc.",
        sector: "Financials",
        filingType: "8-K",
        filingDate: "2026-11-23",
        section: "Item 5.02",
        category: "Executive Comp",
        materiality: "High",
        headline: "Executive or Board Change (Item 5.02)",
        summary: "Visa Inc. filed SEC Form 8-K on 2026-11-23 disclosing Executive or Board Change (Item 5.02).",
        priorExcerpt: "",
        currentExcerpt: "",
        signalNote: "",
        source: "edgar",
        accessionNumber: "0001",
      },
      {
        id: "nvda-8k",
        ticker: "NVDA",
        companyName: "NVIDIA Corporation",
        sector: "Technology",
        filingType: "8-K",
        filingDate: "2026-11-23",
        section: "Item 5.02",
        category: "Executive Comp",
        materiality: "High",
        headline: "Executive or Board Change (Item 5.02)",
        summary: "NVIDIA Corporation filed SEC Form 8-K on 2026-11-23 disclosing Executive or Board Change (Item 5.02).",
        priorExcerpt: "",
        currentExcerpt: "",
        signalNote: "",
        source: "edgar",
        accessionNumber: "0002",
      },
      {
        id: "msft-10q",
        ticker: "MSFT",
        companyName: "Microsoft Corporation",
        sector: "Technology",
        filingType: "10-Q",
        filingDate: "2026-11-20",
        section: "MD&A",
        category: "CapEx",
        materiality: "High",
        headline: "Cloud AI infrastructure commitments expanded by $18B",
        summary: "Microsoft disclosed new multi-year data center lease commitments driven by Azure AI demand.",
        priorExcerpt: "",
        currentExcerpt: "",
        signalNote: "",
        source: "edgar",
        accessionNumber: "0003",
      },
      {
        id: "aapl-10k",
        ticker: "AAPL",
        companyName: "Apple Inc.",
        sector: "Technology",
        filingType: "10-K",
        filingDate: "2026-11-18",
        section: "Risk Factors",
        category: "Supply Chain",
        materiality: "High",
        headline: "Added tariff exposure language for Asia-Pacific assembly",
        summary: "Apple updated Item 1A to flag potential margin compression from reciprocal tariffs.",
        priorExcerpt: "",
        currentExcerpt: "",
        signalNote: "",
        source: "edgar",
        accessionNumber: "0004",
      },
    ],
  });

  assert.equal(featuredDiffs[0].id, "msft-10q");
  assert.equal(featuredDiffs[1].id, "aapl-10k");
});

test("roundWeightsToHundred always sums to 100 using largest remainder", () => {
  const sixEqual = roundWeightsToHundred([16.6667, 16.6667, 16.6667, 16.6667, 16.6667, 16.6667]);
  assert.equal(sixEqual.reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(sixEqual, [17, 17, 17, 17, 16, 16]);

  const sevenEqual = roundWeightsToHundred(Array(7).fill(100 / 7));
  assert.equal(sevenEqual.reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(sevenEqual, [15, 15, 14, 14, 14, 14, 14]);
});

test("Portfolio Stress uses the same Base Case as Studio and applies the top holding shock to IRR", () => {
  const companies = JSON.parse(readFileSync(
    new URL("../src/data/generated/companies.json", import.meta.url), "utf8",
  )) as CompanySnapshot[];
  for (const ticker of ["MSFT", "JPM"]) {
    const company = companies.find((entry) => entry.ticker === ticker);
    assert.ok(company);
    const indexEntry = buildSearchIndexEntry(company);
    const holding = toPortfolioEntry(indexEntry);
    assert.equal("lastFilingDate" in holding, false);
    assert.equal("baseScenario" in toSearchIndexEntry(indexEntry), false);
    const { defaultLens: lens, revGrowth, byLens } = getScenarioDefaults(company, holding.scenarioBasis);
    const studio = computeScenarioProjection(holding.scenarioBasis, {
      lens, revGrowth, targetMargin: byLens[lens].margin, exitMultiple: byLens[lens].multiple,
    });
    assert.ok(studio?.irrPct != null);

    const weights = new Map([[ticker, 1]]);
    const neutral = { multipleCompressionPct: 0, growthHaircutPts: 0, topPositionDrawdownPct: 0 };
    const base = computePortfolioStress([holding], weights, {}, neutral);
    assert.equal(base.irrSource, "base");
    assert.equal(base.stressedThesisIrrPct, null);
    assert.equal(base.stressedModelIrrPct, Number(studio.irrPct.toFixed(1)));
    assert.equal(base.modelIrrDeltaPct, 0);

    const shocked = computePortfolioStress([holding], weights, {}, { ...neutral, topPositionDrawdownPct: -20 });
    assert.equal(shocked.estimatedDrawdownPct, -20);
    assert.ok(shocked.modelIrrDeltaPct != null && shocked.modelIrrDeltaPct < 0);
  }
});
