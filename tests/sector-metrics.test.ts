import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeFinancialSectorMetrics,
  isFinancialInstitution,
  isReit,
} from "../src/lib/finance.ts";

describe("Sector-specific financial metrics", () => {
  it("computes P/TBV and ROTCE for banks when goodwill and intangibles are present", () => {
    const bank = {
      ticker: "JPM",
      sector: "Financials",
      marketCap: 600_000,
      annuals: [
        {
          fiscalYear: "FY25",
          revenue: 170_000,
          operatingCashFlow: 50_000,
          capex: 2_000,
          sbc: 3_000,
          buybacks: 15_000,
          dilutedShares: 2_800,
          netIncome: 55_000,
          stockholdersEquity: 350_000,
          goodwillIntangibles: 50_000,
        },
      ],
    };

    assert.equal(isFinancialInstitution(bank), true);
    assert.equal(isReit(bank), false);

    const m = computeFinancialSectorMetrics(bank);
    assert.equal(m.tangibleBookValue, 300_000);
    assert.equal(Number(m.priceToTbv?.toFixed(2)), 2.0);
    assert.equal(Number(m.rotcePct?.toFixed(1)), 18.3);
    assert.equal(Number(m.priceToBook?.toFixed(2)), 1.71);
    assert.equal(Number(m.roePct?.toFixed(1)), 15.7);
  });

  it("computes FFO, FFO/share, and P/FFO for REITs using net income plus D&A", () => {
    const reit = {
      ticker: "PLD",
      sector: "Real Estate & REITs",
      marketCap: 100_000,
      annuals: [
        {
          fiscalYear: "FY25",
          revenue: 8_500,
          operatingCashFlow: 5_000,
          capex: 1_200,
          sbc: 120,
          buybacks: 0,
          dilutedShares: 925,
          netIncome: 3_200,
          depreciationAmortization: 2_300,
          stockholdersEquity: 54_000,
        },
      ],
    };

    assert.equal(isFinancialInstitution(reit), true);
    assert.equal(isReit(reit), true);

    const m = computeFinancialSectorMetrics(reit);
    assert.equal(m.ffo, 5_500);
    assert.equal(Number(m.ffoPerShare?.toFixed(2)), 5.95);
    assert.equal(Number(m.priceToFfo?.toFixed(1)), 18.2);
    assert.equal(m.tangibleBookValue, null);
  });
});
