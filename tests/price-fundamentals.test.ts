import assert from "node:assert/strict";
import { test } from "node:test";
import { indexPriceAndFundamentals } from "../src/lib/price-fundamentals.ts";

const company = {
  price: 125,
  priceHistory: [{ fiscalYear: "FY22", price: 50 }, { fiscalYear: "FY23", price: 100 }],
};

test("indexes prices and revenue per share from the first positive aligned revenue", () => {
  const result = indexPriceAndFundamentals(company, [
    { fiscalYear: "FY22", revenue: 0, dilutedShares: 10, trueFcf: -5 },
    { fiscalYear: "FY23", revenue: 10, dilutedShares: 10, trueFcf: -3 },
    { fiscalYear: "FY24", revenue: 30, dilutedShares: 20, trueFcf: 5 },
  ]);
  assert.deepEqual(result, {
    fundLabel: "Revenue / Share",
    indexed: [
      { fiscalYear: "FY23", price: 100, fundVal: 1, priceIdx: 100, fundIdx: 100 },
      { fiscalYear: "FY24", price: 125, fundVal: 1.5, priceIdx: 125, fundIdx: 150 },
    ],
  });
});

test("keeps negative FCF periods when the chart has valid FCF endpoints", () => {
  const result = indexPriceAndFundamentals(company, [
    { fiscalYear: "FY22", revenue: 10, dilutedShares: 10, trueFcf: 10 },
    { fiscalYear: "FY23", revenue: 20, dilutedShares: 10, trueFcf: -20 },
    { fiscalYear: "FY24", revenue: 30, dilutedShares: 10, trueFcf: 20 },
  ]);
  assert.equal(result?.fundLabel, "True FCF / Share");
  assert.deepEqual(result.indexed.map(({ fundIdx }) => fundIdx), [100, -200, 200]);
});

test("returns no chart when only one period can be indexed", () => {
  assert.equal(indexPriceAndFundamentals(company, [
    { fiscalYear: "FY23", revenue: 0, dilutedShares: 10, trueFcf: -10 },
    { fiscalYear: "FY24", revenue: 20, dilutedShares: 10, trueFcf: 20 },
  ]), null);
});
