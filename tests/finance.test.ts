import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeAnnualMetrics,
  computeEnterpriseValue,
  computeFiveYearScenario,
  computeGroundedDefaultDcf,
  computeLatestRevenueGrowth,
  computeNetDilutionCagr,
  computeRevenueCagr,
  reverseDcfTargetMargin,
  solveReverseDcf,
  type AnnualFinancials,
  type CompanySnapshot,
} from "../src/lib/finance.ts";

describe("Amber finance engine", () => {
  const sampleAnnuals: AnnualFinancials[] = [
    {
      fiscalYear: "FY21",
      revenue: 10000,
      operatingCashFlow: 3500,
      capex: 500,
      sbc: 400,
      buybacks: 1000,
      dilutedShares: 1000,
    },
    {
      fiscalYear: "FY22",
      revenue: 12000,
      operatingCashFlow: 4200,
      capex: 600,
      sbc: 450,
      buybacks: 1200,
      dilutedShares: 980,
    },
    {
      fiscalYear: "FY23",
      revenue: 14500,
      operatingCashFlow: 5100,
      capex: 700,
      sbc: 500,
      buybacks: 1500,
      dilutedShares: 960,
    },
    {
      fiscalYear: "FY24",
      revenue: 17000,
      operatingCashFlow: 6200,
      capex: 800,
      sbc: 550,
      buybacks: 1800,
      dilutedShares: 940,
    },
    {
      fiscalYear: "TTM",
      revenue: 18000,
      operatingCashFlow: 6600,
      capex: 850,
      sbc: 560,
      buybacks: 1900,
      dilutedShares: 935,
    },
  ];

  it("computes True FCF and guards zero revenue / zero SBC on negative FCF", () => {
    const metrics = computeAnnualMetrics([
      {
        fiscalYear: "FY24",
        revenue: 1000,
        operatingCashFlow: 50,
        capex: 200,
        sbc: 0,
        buybacks: 0,
        dilutedShares: 100,
      },
      {
        fiscalYear: "FY25",
        revenue: 0,
        operatingCashFlow: 0,
        capex: 0,
        sbc: 0,
        buybacks: 0,
        dilutedShares: 100,
      },
    ]);

    assert.equal(metrics[0].reportedFcf, -150);
    assert.equal(metrics[0].trueFcf, -150);
    assert.equal(metrics[0].sbcPctReportedFcf, 0);
    assert.equal(metrics[1].trueFcfMargin, 0);
    assert.equal(Number.isFinite(metrics[1].sbcPctRevenue), true);
  });

  it("excludes TTM from computeNetDilutionCagr so annualization is not understated", () => {
    const withTtm = computeNetDilutionCagr(sampleAnnuals);
    const fyOnly = computeNetDilutionCagr(
      sampleAnnuals.filter((a) => a.fiscalYear !== "TTM")
    );
    assert.equal(withTtm, fyOnly);
    assert.ok(withTtm < -1.9 && withTtm > -2.2);
  });

  it("annualizes changes across missing fiscal years", () => {
    const annuals = [
      { ...sampleAnnuals[0], fiscalYear: "FY2021", revenue: 100, dilutedShares: 100 },
      { ...sampleAnnuals[3], fiscalYear: "FY24", revenue: 133.1, dilutedShares: 72.9 },
      sampleAnnuals[4],
    ];
    assert.ok(Math.abs(computeRevenueCagr(annuals) - 10) < 1e-10);
    assert.ok(Math.abs(computeNetDilutionCagr(annuals) + 10) < 1e-10);
    assert.equal(computeLatestRevenueGrowth(annuals), null);
    assert.equal(computeAnnualMetrics(annuals)[1].yoyShareChangePct, null);
    assert.equal(computeLatestRevenueGrowth(sampleAnnuals), (2500 / 14500) * 100);
  });

  it("displays the same minimum target margin that Reverse DCF models", () => {
    const targetTrueFcfMarginPct = reverseDcfTargetMargin(2, 0.5);
    const result = solveReverseDcf({
      enterpriseValue: 100,
      baseRevenue: 100,
      waccPct: 9.5,
      terminalMultiple: 15,
      targetTrueFcfMarginPct,
      currentTrueFcfMarginPct: 5,
    });
    assert.equal(targetTrueFcfMarginPct, 2);
    assert.ok(Math.abs(result.year10TrueFcf / result.year10Revenue * 100 - targetTrueFcfMarginPct) < 1e-10);
  });

  it("handles negative EV cleanly in solveReverseDcf without crashing or clamping to -25%", () => {
    const res = solveReverseDcf({
      enterpriseValue: -500,
      baseRevenue: 1000,
      waccPct: 10,
      terminalMultiple: 18,
      targetTrueFcfMarginPct: 20,
      currentTrueFcfMarginPct: 15,
    });
    assert.equal(res.clamped, "negative-ev");
    assert.equal(res.impliedRevenueCagrPct, 0);
  });

  it("flags high/low clamps in solveReverseDcf and solves accurately within bounds", () => {
    const normal = solveReverseDcf({
      enterpriseValue: 100_000,
      baseRevenue: 17_000,
      waccPct: 9.5,
      terminalMultiple: 20,
      targetTrueFcfMarginPct: 28,
      currentTrueFcfMarginPct: 25,
    });
    assert.equal(normal.clamped, null);
    assert.ok(normal.impliedRevenueCagrPct > 0 && normal.impliedRevenueCagrPct < 20);

    const extremeHigh = solveReverseDcf({
      enterpriseValue: 50_000_000,
      baseRevenue: 100,
      waccPct: 12,
      terminalMultiple: 15,
      targetTrueFcfMarginPct: 10,
      currentTrueFcfMarginPct: 5,
    });
    assert.equal(extremeHigh.clamped, "high");
  });

  it("produces smooth grounded default DCF assumptions and valid 5-year scenarios", () => {
    const dcf = computeGroundedDefaultDcf(sampleAnnuals);
    assert.ok(dcf.terminalMultiple >= 13 && dcf.terminalMultiple <= 22);
    assert.ok(dcf.targetFcfMargin > 10 && dcf.targetFcfMargin <= 55);

    const ev = computeEnterpriseValue({
      marketCap: 150_000,
      totalDebt: 5_000,
      cashAndEquiv: 20_000,
    } as CompanySnapshot);
    assert.equal(ev, 135_000);

    const scenario = computeFiveYearScenario({
      currentPrice: 150,
      dilutedShares: 940,
      baseRevenue: 17_000,
      currentTrueFcfMarginPct: 28,
      netCash: 15_000,
      revGrowthPct: 12,
      targetTrueFcfMarginPct: 30,
      exitMultiple: 20,
    });
    assert.ok(scenario.fairValueToday > 0);
    assert.ok(Number.isFinite(scenario.irrPct));
  });
});
