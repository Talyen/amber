import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePortfolioHoldings, serializePortfolioHoldings } from "../src/lib/portfolio-link.ts";

const knownTickers = new Map([["AAPL", true], ["MSFT", true], ["NVDA", true]]);

test("portfolio links retain fractional and zero allocations", () => {
  const weights = new Map([["AAPL", 0.9975], ["MSFT", 0.0025], ["NVDA", 0]]);
  const restored = parsePortfolioHoldings(serializePortfolioHoldings(weights), knownTickers);
  assert.deepEqual([...restored], [["AAPL", 99.75], ["MSFT", 0.25], ["NVDA", 0]]);
});

test("portfolio links accept older relative weights and resolve each known ticker once", () => {
  const restored = parsePortfolioHoldings("aapl:25,BOGUS:50,MSFT,AAPL:5,NVDA:-10", knownTickers);
  assert.deepEqual([...restored], [["AAPL", 25], ["MSFT", 10], ["NVDA", 10]]);
  assert.equal(parsePortfolioHoldings("", knownTickers).size, 0);
});
