import assert from "node:assert/strict";
import { test } from "node:test";
import { rankTrendingTickers } from "../src/lib/trending-ranking.ts";
import { selectFeaturedSignals } from "../src/lib/featured-signals.ts";
import type {
  MarketFilingDiffItem,
  MarketInsiderFeedItem,
} from "../src/data/repository.ts";

const SAMPLE_ENTRIES = [
  { ticker: "NVDA", name: "NVIDIA Corporation", marketCap: 4_000_000 },
  { ticker: "AAPL", name: "Apple Inc.", marketCap: 5_000_000 },
  { ticker: "MSFT", name: "Microsoft Corporation", marketCap: 3_700_000 },
  { ticker: "AMZN", name: "Amazon.com, Inc.", marketCap: 2_400_000 },
  { ticker: "TSLA", name: "Tesla, Inc.", marketCap: 1_200_000 },
  { ticker: "META", name: "Meta Platforms, Inc.", marketCap: 1_600_000 },
  { ticker: "GOOGL", name: "Alphabet Inc.", marketCap: 2_300_000 },
  { ticker: "LLY", name: "Eli Lilly & Co", marketCap: 1_220_000 },
  { ticker: "WMT", name: "Walmart Inc.", marketCap: 1_026_000 },
  { ticker: "AMD", name: "Advanced Micro Devices INC", marketCap: 759_000 },
  { ticker: "COST", name: "Costco Wholesale", marketCap: 485_000 },
  { ticker: "DELL", name: "Dell Technologies Inc.", marketCap: 221_000 },
  { ticker: "BA", name: "Boeing CO", marketCap: 128_000 },
  { ticker: "HPE", name: "Hewlett Packard Enterprise Co", marketCap: 67_000 },
  { ticker: "TEAM", name: "Atlassian Corp.", marketCap: 36_400 },
  { ticker: "INSM", name: "Insmed Inc.", marketCap: 32_000 },
  { ticker: "BG", name: "Bunge Global SA", marketCap: 17_900 },
  { ticker: "DKS", name: "Dick's Sporting Goods", marketCap: 12_100 },
  { ticker: "DKNG", name: "DraftKings Inc.", marketCap: 7_750 },
];

function makeDiff(
  overrides: Partial<MarketFilingDiffItem> & Pick<MarketFilingDiffItem, "id" | "ticker" | "filingDate">
): MarketFilingDiffItem {
  return {
    companyName: overrides.ticker,
    sector: "Technology",
    filingType: "8-K",
    accessionNumber: "0000000000-26-000001",
    section: "Item 5.02",
    category: "Leadership",
    materiality: "High",
    headline: `${overrides.ticker} filing change`,
    summary: "Material update",
    priorExcerpt: "",
    currentExcerpt: "",
    signalNote: "",
    source: "text-diff",
    ...overrides,
  };
}

function makeInsider(
  overrides: Partial<MarketInsiderFeedItem> &
    Pick<MarketInsiderFeedItem, "id" | "ticker" | "filingDate" | "totalValue">
): MarketInsiderFeedItem {
  return {
    insiderName: "Jane Doe",
    insiderTitle: "Director",
    transactionType: "Buy",
    shares: 10_000,
    pricePerShare: 100,
    accessionNumber: "0000000000-26-000002",
    ...overrides,
  };
}

test("rankTrendingTickers filters out obscure smaller companies and elevates mega-cap Yahoo movers", () => {
  const result = rankTrendingTickers(SAMPLE_ENTRIES, {
    yahooSymbols: ["DKS", "INSM", "HPE", "DELL", "AMD", "GOOG", "COST", "LLY", "WMT"],
    recentBuyTickers: ["BG", "DKNG", "TEAM", "BA"],
    communityTickers: ["BG", "NVDA"],
  });

  const tickers = result.map((r) => r.ticker);
  assert.ok(!tickers.includes("DKS"), "excludes $12B DKS from Yahoo trending");
  assert.ok(!tickers.includes("INSM"), "excludes $32B INSM from Yahoo trending");
  assert.ok(!tickers.includes("BG"), "excludes $17.9B BG from insider-buy trending");
  assert.ok(!tickers.includes("DKNG"), "excludes $7.7B DKNG from insider-buy trending");

  assert.ok(tickers.includes("GOOGL"), "normalizes GOOG to GOOGL");
  assert.ok(tickers.includes("LLY"), "includes mega-cap Yahoo mover LLY");
  assert.ok(tickers.includes("WMT"), "includes mega-cap Yahoo mover WMT");
  assert.ok(tickers.includes("TEAM"), "includes large-cap insider buy TEAM");
  assert.ok(tickers.includes("BA"), "includes large-cap insider buy BA");
  assert.equal(result.length, 10);
});

test("rankTrendingTickers caps insider buys when Yahoo is unavailable and backfills bellwethers", () => {
  const result = rankTrendingTickers(SAMPLE_ENTRIES, {
    yahooSymbols: [],
    recentBuyTickers: ["TEAM", "BA", "DELL", "COST", "AMD"],
    communityTickers: [],
  });

  const insiderReasons = result.filter((r) => r.reason === "Insider Buy");
  assert.equal(insiderReasons.length, 2, "caps insider buys at 2 slots");
  assert.ok(
    result.some((r) => r.ticker === "NVDA" && r.reason === "Trending"),
    "backfills liquid bellwethers when Yahoo is unavailable"
  );
  assert.equal(result.length, 10);
});

test("selectFeaturedSignals picks 2 fresh prominent diffs and 1 prominent executive insider buy with distinct tickers", () => {
  const now = new Date("2026-11-24T12:00:00Z");

  const diffs: MarketFilingDiffItem[] = [
    // Stale diff on #1 trending ticker should lose to fresh diffs
    makeDiff({ id: "d-stale", ticker: "AMD", filingDate: "2026-06-01", materiality: "High" }),
    // Fresh High diff on mega-cap NVDA
    makeDiff({ id: "d-nvda", ticker: "NVDA", filingDate: "2026-11-23", materiality: "High" }),
    // Fresh High diff on trending DELL
    makeDiff({ id: "d-dell", ticker: "DELL", filingDate: "2026-11-22", materiality: "High" }),
    // Fresh High diff on obscure smaller company
    makeDiff({ id: "d-dkng", ticker: "DKNG", filingDate: "2026-11-23", materiality: "High" }),
    // Duplicate ticker TEAM (same as winning insider buy)
    makeDiff({ id: "d-team", ticker: "TEAM", filingDate: "2026-11-23", materiality: "High" }),
  ];

  const insiders: MarketInsiderFeedItem[] = [
    // Smaller obscure director buy (even though 1 day newer)
    makeInsider({
      id: "i-bg",
      ticker: "BG",
      filingDate: "2026-11-23",
      totalValue: 1.16,
      insiderTitle: "Director",
    }),
    // Large-cap CEO buy
    makeInsider({
      id: "i-team",
      ticker: "TEAM",
      filingDate: "2026-11-20",
      totalValue: 1.85,
      insiderTitle: "CEO, Co-Founder",
    }),
    // Sell should be ignored
    makeInsider({
      id: "i-sell",
      ticker: "NVDA",
      filingDate: "2026-11-23",
      totalValue: 50,
      transactionType: "Sell",
      insiderTitle: "CEO",
    }),
  ];

  const { featuredDiffs, featuredInsiderBuy } = selectFeaturedSignals({
    diffs,
    insiders,
    entries: SAMPLE_ENTRIES,
    trendingTickers: ["AMD", "DELL", "TEAM", "NVDA"],
    now,
  });

  assert.equal(featuredInsiderBuy?.id, "i-team");
  assert.equal(featuredDiffs.length, 2);
  assert.deepEqual(
    featuredDiffs.map((d) => d.ticker),
    ["DELL", "NVDA"]
  );
  assert.ok(
    !featuredDiffs.some((d) => d.ticker === featuredInsiderBuy?.ticker),
    "keeps tickers distinct between filing diffs and insider buy"
  );
});

test("selectFeaturedSignals falls back to 3 filing cards when no insider buys exist", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  const diffs: MarketFilingDiffItem[] = [
    makeDiff({ id: "d1", ticker: "NVDA", filingDate: "2026-11-23" }),
    makeDiff({ id: "d2", ticker: "DELL", filingDate: "2026-11-22" }),
    makeDiff({ id: "d3", ticker: "COST", filingDate: "2026-11-21" }),
    makeDiff({ id: "d4", ticker: "WMT", filingDate: "2026-11-20" }),
  ];

  const { featuredDiffs, featuredInsiderBuy } = selectFeaturedSignals({
    diffs,
    insiders: [],
    entries: SAMPLE_ENTRIES,
    trendingTickers: ["DELL", "COST", "WMT"],
    now,
  });

  assert.equal(featuredInsiderBuy, null);
  assert.equal(featuredDiffs.length, 3);
});
