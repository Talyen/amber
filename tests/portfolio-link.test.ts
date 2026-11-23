import assert from "node:assert/strict";
import { test } from "node:test";
import { arenaPortfolioAnalysisHref, parsePortfolioHoldings, serializePortfolioHoldings } from "../src/lib/portfolio-link.ts";

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

test("the Arena analysis link preserves stored allocations below one tenth of a percent", () => {
  const href = arenaPortfolioAnalysisHref([
    { ticker: "AAPL", weightPct: 99.975 },
    { ticker: "MSFT", weightPct: 0.025 },
  ]);
  const url = new URL(href, "https://amber.example");
  assert.equal(url.pathname, "/portfolio");
  assert.deepEqual(
    [...parsePortfolioHoldings(url.searchParams.get("h")!, knownTickers)],
    [["AAPL", 99.975], ["MSFT", 0.025]]
  );
});
