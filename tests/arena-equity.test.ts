import assert from "node:assert/strict";
import { test } from "node:test";
import { arenaBenchmark, arenaPerformanceWindow, buildArenaPerformance } from "../src/lib/arena-equity.ts";

const entry = {
  periodKey: "2026-11",
  lockedAt: "2026-11-12T20:00:00Z",
  lastRebalancedAt: "2026-11-12T20:00:00Z",
  isBot: false,
  rebalances: [],
};

test("the scorecard uses the recorded entry and shares the closing benchmark across views", () => {
  const window = arenaPerformanceWindow(entry);
  assert.ok(window);
  const series = new Map([
    ["MSFT", new Map([["2026-11-02", 100], ["2026-11-12", 120], ["2026-11-20", 125], ["2026-11-23", 132], ["2026-12-01", 135]])],
    ["SPY", new Map([["2026-11-02", 100], ["2026-11-11", 125], ["2026-11-12", 127.5], ["2026-11-23", 130], ["2026-12-01", 140]])],
  ]);
  const performance = buildArenaPerformance(
    [{ ticker: "MSFT", weightPct: 100, entryPrice: 128 }],
    series, window, { nav: 100, totalReturnPct: 3.13 },
  );
  assert.deepEqual(performance, {
    spyReturn: 4,
    curvePoints: [
      { date: "2026-11-12", portfolioPct: -6.25, spyPct: 2 },
      { date: "2026-11-23", portfolioPct: 3.13, spyPct: 4 },
    ],
  });
});

test("rebalanced entries use the summary when historical holdings are unavailable", () => {
  const window = arenaPerformanceWindow({ ...entry, rebalances: [{}] });
  assert.ok(window);
  assert.equal(window.includeHoldings, false);
  assert.equal(arenaPerformanceWindow({ ...entry, lastRebalancedAt: "2026-11-20T20:00:00Z" })?.includeHoldings, false);
  // Seeded bot entries predate the default last-rebalanced timestamp.
  assert.equal(arenaPerformanceWindow({ ...entry, isBot: true, lastRebalancedAt: "2026-11-20T20:00:00Z" })?.includeHoldings, true);

  const spy = new Map([["2026-11-02", 100], ["2026-11-11", 125], ["2026-11-23", 130]]);
  assert.deepEqual(buildArenaPerformance([], new Map([["SPY", spy]]), window, { nav: 103, totalReturnPct: 8 }), {
    spyReturn: 4,
    curvePoints: [],
  });
});

test("seeded bots benchmark against the trading close before entry", () => {
  const window = arenaPerformanceWindow({
    ...entry,
    lockedAt: "2026-11-02T14:30:00Z",
    isBot: true,
  });
  assert.ok(window);
  const spy = new Map([["2026-10-30", 100], ["2026-11-02", 102], ["2026-11-03", 103]]);
  assert.equal(buildArenaPerformance([], new Map([["SPY", spy]]), window, { nav: 100, totalReturnPct: 0 }).spyReturn, 3);
});

test("entries in the same month use their own SPY baseline, including on the scorecard", () => {
  const spy = new Map([
    ["2026-10-30", 100], ["2026-11-11", 110], ["2026-11-12", 111], ["2026-11-30", 112],
  ]);
  const earlier = arenaPerformanceWindow({ ...entry, lockedAt: "2026-11-01T20:00:00Z" });
  const later = arenaPerformanceWindow(entry);
  assert.ok(earlier && later);
  assert.equal(arenaBenchmark(spy, earlier)?.spyReturn, 12);
  const comparison = arenaBenchmark(spy, later)?.spyReturn;
  assert.equal(comparison, 1.82);
  assert.equal(buildArenaPerformance([], new Map([["SPY", spy]]), later, {
    nav: 100,
    totalReturnPct: 5,
  }).spyReturn, comparison);
});
