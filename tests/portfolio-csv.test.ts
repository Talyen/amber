import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBrokerageCsv } from "../src/lib/portfolio-csv.ts";

const known = new Set(["NVDA", "MSFT", "AAPL", "GOOG"]);
const prices = new Map([["NVDA", 100], ["MSFT", 200], ["AAPL", 300]]);

test("weight imports preserve explicit zeroes and skip negatives and missing weights", () => {
  const result = parseBrokerageCsv(
    "Symbol,Weight,Quantity\nNVDA,0%,50\nMSFT,40%,10\nAAPL,-5%,5\nGOOG,,30",
    known,
    prices,
  );
  assert.equal(result.mode, "weight");
  assert.deepEqual(result.holdings, [{ ticker: "NVDA", value: 0 }, { ticker: "MSFT", value: 40 }]);
  assert.deepEqual(result.negativeTickers, ["AAPL"]);
  assert.deepEqual(result.missingAllocationTickers, ["GOOG"]);
});

test("dollar imports preserve zero and convert share counts only when market value is missing", () => {
  const result = parseBrokerageCsv(
    "Symbol,Market Value,Quantity\nNVDA,0,50\nMSFT,,10\nAAPL,($150),5\nMSFT,$25,4",
    known,
    prices,
  );
  assert.equal(result.mode, "dollars");
  assert.deepEqual(result.holdings, [{ ticker: "NVDA", value: 0 }, { ticker: "MSFT", value: 2025 }]);
  assert.deepEqual(result.negativeTickers, ["AAPL"]);
});

test("quoted delimiters and newlines preserve records and cost basis does not stand in for market value", () => {
  const result = parseBrokerageCsv(
    'Symbol\tDescription\tCost Basis Value\tQuantity\r\nNVDA\t"Company, Inc., Equity, Common\nClass A"\t"1,000"\t20\r\nMSFT\tOther\t"2,000"\t5',
    known,
    prices,
  );
  assert.deepEqual(result.holdings, [{ ticker: "NVDA", value: 2000 }, { ticker: "MSFT", value: 1000 }]);
  assert.deepEqual(parseBrokerageCsv("NVDA\nMSFT", known).holdings, [
    { ticker: "NVDA", value: 10 }, { ticker: "MSFT", value: 10 },
  ]);
});
