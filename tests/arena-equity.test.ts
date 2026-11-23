import assert from "node:assert/strict";
import { test } from "node:test";
import { arenaEquityWindow, buildArenaEquityCurve } from "../src/lib/arena-equity.ts";

const entry = {
  periodKey: "2026-11",
  lockedAt: "2026-11-12T20:00:00Z",
  lastRebalancedAt: "2026-11-12T20:00:00Z",
  isBot: false,
  rebalances: [],
};

test("the portfolio and benchmark both start at entry and stop at period close", () => {
  const window = arenaEquityWindow(entry);
  assert.ok(window);
  const series = new Map([
    ["MSFT", new Map([["2026-11-02", 100], ["2026-11-12", 120], ["2026-11-23", 120], ["2026-12-01", 135]])],
    ["SPY", new Map([["2026-11-02", 100], ["2026-11-12", 125], ["2026-11-23", 130], ["2026-12-01", 140]])],
  ]);
  assert.deepEqual(buildArenaEquityCurve([{ ticker: "MSFT", weightPct: 100 }], series, window), [
    { date: "2026-11-12", portfolioPct: 0, spyPct: 0 },
    { date: "2026-11-23", portfolioPct: 0, spyPct: 4 },
  ]);
});

test("rebalanced entries use the summary when historical holdings are unavailable", () => {
  assert.equal(arenaEquityWindow({ ...entry, rebalances: [{}] }), null);
  assert.equal(arenaEquityWindow({ ...entry, lastRebalancedAt: "2026-11-20T20:00:00Z" }), null);
  // Seeded bot entries predate the default last-rebalanced timestamp.
  assert.ok(arenaEquityWindow({ ...entry, isBot: true, lastRebalancedAt: "2026-11-20T20:00:00Z" }));
});
