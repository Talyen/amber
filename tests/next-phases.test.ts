import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeBalanceSheetHealth,
  computeCapitalAllocationMix,
  computeQuarterlyMomentum,
  computeAnnualMetrics,
  type AnnualFinancials,
} from "../src/lib/finance.ts";
import {
  evaluateValuationTriggers,
  VALUATION_ALERT_COOLDOWN_MS,
  type PresetValuationEntry,
} from "../src/lib/valuation-presets.ts";
import {
  DEFAULT_USD_PER_UNIT,
  detectReportingCurrency,
  getUsdConversionRate,
} from "../src/lib/fx-rates.ts";
import {
  extractProxyCompHighlights,
  stripHtmlToText,
} from "../scripts/ingest-proxy.ts";

describe("Phase 1: Valuation Trigger Alerts", () => {
  it("triggers when live expected IRR meets threshold and respects 7-day cooldown", () => {
    const entries = new Map<string, PresetValuationEntry>([
      [
        "ACME",
        {
          ticker: "ACME",
          scenarioBasis: {
            price: 100,
            dilutedShares: 100,
            netCash: 1_000,
            revenue: 3_000,
            trueFcfMargin: 25,
            operatingMargin: null,
            netMargin: null,
            equityLensOnly: false,
          },
        },
      ],
      [
        "COOL",
        {
          ticker: "COOL",
          scenarioBasis: {
            price: 100,
            dilutedShares: 100,
            netCash: 1_000,
            revenue: 3_000,
            trueFcfMargin: 25,
            operatingMargin: null,
            netMargin: null,
            equityLensOnly: false,
          },
        },
      ],
    ]);

    const now = Date.parse("2026-11-25T12:00:00Z");
    const hits = evaluateValuationTriggers(
      [
        {
          id: "u1:ACME",
          ticker: "ACME",
          lens: "fcf",
          revGrowth: 18,
          targetMargin: 28,
          exitMultiple: 24,
          thesisNote: "Strong cash compounder",
          updatedAt: "2026-11-01T00:00:00Z",
          lastValuationAlertAt: null,
        },
        {
          id: "u1:COOL",
          ticker: "COOL",
          lens: "fcf",
          revGrowth: 18,
          targetMargin: 28,
          exitMultiple: 24,
          thesisNote: "Already alerted 2 days ago",
          updatedAt: "2026-11-01T00:00:00Z",
          lastValuationAlertAt: new Date(now - VALUATION_ALERT_COOLDOWN_MS / 3),
        },
      ],
      entries,
      15,
      now
    );

    assert.equal(hits.length, 1);
    assert.equal(hits[0].ticker, "ACME");
    assert.ok(hits[0].irrPct >= 15);
  });
});

describe("Phase 2: Quarterly & TTM Momentum", () => {
  it("computes YoY quarter revenue growth, 4Q TTM True FCF margin, and QoQ share change", () => {
    const quarters: AnnualFinancials[] = [
      { fiscalYear: "24Q3", revenue: 1000, operatingCashFlow: 300, capex: 50, sbc: 40, buybacks: 50, dilutedShares: 100 },
      { fiscalYear: "24Q4", revenue: 1100, operatingCashFlow: 320, capex: 50, sbc: 40, buybacks: 50, dilutedShares: 99 },
      { fiscalYear: "25Q1", revenue: 1150, operatingCashFlow: 340, capex: 60, sbc: 40, buybacks: 60, dilutedShares: 98 },
      { fiscalYear: "25Q2", revenue: 1200, operatingCashFlow: 360, capex: 60, sbc: 40, buybacks: 60, dilutedShares: 97 },
      { fiscalYear: "25Q3", revenue: 1250, operatingCashFlow: 380, capex: 60, sbc: 40, buybacks: 60, dilutedShares: 96 },
    ];

    const summary = computeQuarterlyMomentum(quarters);
    assert.equal(summary.latestQuarterLabel, "25Q3");
    assert.ok(summary.latestYoyRevGrowthPct !== null);
    assert.equal(Math.round(summary.latestYoyRevGrowthPct!), 25);
    assert.ok(summary.ttmTrueFcfMarginPct !== null && summary.ttmTrueFcfMarginPct > 20);
    assert.ok(summary.qoqShareChangePct !== null && summary.qoqShareChangePct < 0);
  });

  it("leaves rolling metrics blank across missing quarters or duplicate periods", () => {
    const quarter = (fiscalYear: string, dilutedShares = 100): AnnualFinancials => ({
      fiscalYear, revenue: 100, operatingCashFlow: 40, capex: 5, sbc: 5, buybacks: 0, dilutedShares,
    });
    const gap = computeQuarterlyMomentum(["24Q2", "24Q4", "25Q1", "25Q3"].map((label) => quarter(label)));
    assert.equal(gap.ttmTrueFcfMarginPct, null);
    assert.equal(gap.qoqShareChangePct, null);
    assert.equal(gap.latestQuarterLabel, "25Q3");

    const duplicate = computeQuarterlyMomentum(["24Q4", "25Q1", "2025Q1", "25Q2"].map((label) => quarter(label)));
    assert.equal(duplicate.ttmTrueFcfMarginPct, null);
    assert.equal(duplicate.qoqShareChangePct, 0);

    const contiguous = computeQuarterlyMomentum([
      quarter("2024Q3"), quarter("24Q4"), quarter("25Q1"), quarter("2025Q2", 98),
    ]);
    assert.equal(contiguous.ttmTrueFcfMarginPct, 30);
    assert.equal(contiguous.qoqShareChangePct, -2);
  });
});

describe("Phase 3: Capital Allocation & Balance Sheet Health", () => {
  it("aggregates multi-year capital deployment mix excluding TTM", () => {
    const annuals: AnnualFinancials[] = [
      { fiscalYear: "FY24", revenue: 1000, operatingCashFlow: 400, capex: 100, rdExpense: 150, sbc: 30, buybacks: 200, dividendsPaid: 50, dilutedShares: 100 },
      { fiscalYear: "FY25", revenue: 1200, operatingCashFlow: 500, capex: 100, rdExpense: 150, sbc: 30, buybacks: 200, dividendsPaid: 50, dilutedShares: 98 },
      { fiscalYear: "TTM", revenue: 1250, operatingCashFlow: 520, capex: 110, rdExpense: 160, sbc: 30, buybacks: 210, dividendsPaid: 50, dilutedShares: 97 },
    ];

    const mix = computeCapitalAllocationMix(annuals);
    assert.ok(mix);
    assert.equal(mix.years, 2);
    assert.equal(mix.total, 1000);
    const pctSum = mix.segments.reduce((s, seg) => s + seg.pct, 0);
    assert.ok(Math.abs(pctSum - 100) < 0.01);
  });

  it("computes Net Debt/EBITDA, ROIC-WACC spread, and cash conversion", () => {
    const series = computeAnnualMetrics([
      {
        fiscalYear: "FY25",
        revenue: 2000,
        operatingCashFlow: 600,
        capex: 100,
        sbc: 50,
        buybacks: 100,
        dilutedShares: 100,
        operatingIncome: 500,
        depreciationAmortization: 100,
      },
    ]);
    const health = computeBalanceSheetHealth(
      {
        cashAndEquiv: 200,
        totalDebt: 1400,
        defaultDcf: { wacc: 10, terminalMultiple: 20, targetFcfMargin: 25, sbcDragPct: 3 },
      },
      series[0],
      22
    );
    assert.equal(health.isNetCash, false);
    assert.equal(health.netDebt, 1200);
    assert.equal(health.netDebtToEbitda, 2);
    assert.equal(health.roicSpreadPct, 12);
    assert.equal(health.cashConversionPct, 90);
  });
});

describe("Phase 4: Non-USD ADR FX Normalization", () => {
  it("detects non-USD reporting currency for 20-F filers and prefers USD when present", () => {
    const twdFacts = {
      facts: {
        "ifrs-full": {
          Revenue: {
            units: {
              TWD: [{ form: "20-F" }, { form: "20-F" }],
            },
          },
        },
      },
    };
    assert.equal(detectReportingCurrency(twdFacts, ["Revenue"]), "TWD");
    assert.equal(getUsdConversionRate("TWD", DEFAULT_USD_PER_UNIT), DEFAULT_USD_PER_UNIT.TWD);

    const usdFacts = {
      facts: {
        "us-gaap": {
          Revenues: {
            units: {
              USD: [{ form: "10-K" }],
              EUR: [{ form: "20-F" }, { form: "20-F" }],
            },
          },
        },
      },
    };
    assert.equal(detectReportingCurrency(usdFacts, ["Revenues"]), "USD");
  });
});

describe("Phase 5: DEF 14A Proxy Extraction", () => {
  it("extracts equity plan share-pool dilution proposals from proxy HTML", () => {
    const html = `
      <html><body>
        <h1>Proposal 3: Amendment to the 2020 Equity Incentive Plan</h1>
        <p>We are asking stockholders to approve an amendment to our 2020 Equity Incentive Plan
        to increase the number of shares reserved for issuance by 25,000,000 additional shares of common stock
        to support ongoing employee stock-based compensation grants over the next three years.
        Our Compensation Committee reviews burn rate and overhang annually.</p>
      </body></html>
    `;
    const plain = stripHtmlToText(html.repeat(3));
    const result = extractProxyCompHighlights(plain, "ACME");
    assert.ok(result);
    assert.equal(result.materiality, "High");
    assert.match(result.headline, /25,000,000/);
  });
});
