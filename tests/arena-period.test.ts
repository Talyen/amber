import assert from "node:assert/strict";
import test from "node:test";
import { arenaMonth, arenaPeriodBounds, lastTradingClose } from "../src/lib/arena-period.ts";

const epoch = (date: string) => Date.parse(date) / 1000;

test("uses UTC calendar boundaries for monthly and yearly Arena results", () => {
  assert.equal(arenaMonth(new Date("2026-01-31T20:00:00-08:00")), "2026-02");
  assert.deepEqual(arenaPeriodBounds("2024-02"), {
    start: epoch("2024-02-01"),
    end: epoch("2024-03-01"),
  });
  assert.deepEqual(arenaPeriodBounds("2025"), {
    start: epoch("2025-01-01"),
    end: epoch("2026-01-01"),
  });
  assert.equal(arenaPeriodBounds("2025-13"), null);
});

test("uses the last valid trading close inside the expired period", () => {
  const bounds = arenaPeriodBounds("2026-10");
  assert.ok(bounds);
  assert.equal(lastTradingClose([
    epoch("2026-11-02"),
    epoch("2026-10-30"),
    epoch("2026-10-29"),
    epoch("2026-10-31"),
  ], [145, 120, 112, null], bounds), 120);
  assert.equal(lastTradingClose([epoch("2026-11-02")], [145], bounds), undefined);
});
