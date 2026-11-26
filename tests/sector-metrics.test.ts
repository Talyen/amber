import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeFinancialSectorMetrics,
  isFinancialInstitution,
  isReit,
  matchesReitPriceToFfo,
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

  it("uses issuer-reported FFO from the matching annual period and excludes non-REITs", () => {
    const reit = {
      ticker: "O",
      cik: "0000726728",
      sector: "Real Estate & REITs",
      price: 63.75,
      marketCap: 58_000,
      annuals: [
        {
          fiscalYear: "FY25",
          periodEndDate: "2025-12-31",
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
    assert.equal(m.ffo, 3860.323);
    assert.equal(m.ffoPerShare, 4.25);
    assert.equal(m.priceToFfo, 15);
    assert.equal(m.ffoFiscalYear, "FY25");
    assert.equal(m.tangibleBookValue, null);
    assert.equal(matchesReitPriceToFfo({ ...reit, priceToFfo: m.priceToFfo }, 15), true);
    assert.equal(matchesReitPriceToFfo({ sector: "Semiconductors", priceToFfo: 9 }, 15), false);
    assert.equal(matchesReitPriceToFfo({ ...reit, priceToFfo: null }, 15), false);
    assert.equal(computeFinancialSectorMetrics({ ...reit, cik: "12345" }).priceToFfo, null);
    assert.equal(computeFinancialSectorMetrics({ ...reit, sector: "Semiconductors" }).priceToFfo, null);
    assert.equal(computeFinancialSectorMetrics({
      ...reit,
      annuals: [...reit.annuals, { ...reit.annuals[0], fiscalYear: "FY26", periodEndDate: "2026-12-31" }],
    }).priceToFfo, null);
  });
});
