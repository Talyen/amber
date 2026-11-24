import assert from "node:assert/strict";
import { test } from "node:test";
import { closeAtPeriodEnd, completedDailyCloses } from "../scripts/sync-prices.ts";

const seconds = (iso: string) => Date.parse(iso) / 1000;

test("only uses completed trading sessions and matches fiscal dates without looking ahead", () => {
  const chart = {
    meta: {
      currency: "USD",
      instrumentType: "EQUITY",
      exchangeTimezoneName: "America/New_York",
      currentTradingPeriod: { regular: {
        start: seconds("2026-11-27T14:30:00Z"),
        end: seconds("2026-11-27T18:00:00Z"), // Day after Thanksgiving closes early.
      } },
    },
    timestamp: ["2026-11-24", "2026-11-25", "2026-11-27"].map((date) => seconds(`${date}T14:30:00Z`)),
    indicators: { quote: [{ close: [102, 103, 108.126] }] },
  };

  const intraday = completedDailyCloses(chart, seconds("2026-11-27T17:00:00Z"));
  assert.equal(intraday.at(-1)?.price, 103);
  const afterClose = completedDailyCloses(chart, seconds("2026-11-27T18:05:00Z"));
  assert.equal(afterClose.at(-1)?.price, 108.13);
  assert.equal(closeAtPeriodEnd(afterClose, "2026-11-26"), 103);
  assert.equal(closeAtPeriodEnd(afterClose, "2026-11-28"), 108.13);
  assert.equal(closeAtPeriodEnd(afterClose, "2026-11-23"), undefined);
  assert.equal(closeAtPeriodEnd(afterClose, "2026-12-05"), undefined);
});
