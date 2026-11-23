import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArenaWeights } from "../src/lib/arena-weights.ts";

test("ignores malformed positions and preserves the last weight for a duplicate ticker", () => {
  assert.deepEqual(
    parseArenaWeights([
      null,
      { ticker: " msft ", weight: 1 },
      { ticker: "MSFT", weight: "3" },
      { ticker: "AAPL", weight: 1 },
      { ticker: "NVDA", weight: true },
      { ticker: "AMZN", weight: 0 },
    ]),
    new Map([["MSFT", 75], ["AAPL", 25]])
  );
});

test("normalizes finite weights without overflowing or rounding allocations to zero", () => {
  const weights = parseArenaWeights([
    { ticker: "MSFT", weight: Number.MAX_VALUE },
    { ticker: "AAPL", weight: Number.MAX_VALUE },
    { ticker: "NVDA", weight: 1e301 },
  ]);
  assert.ok(weights.get("NVDA")! > 0);
  assert.ok(Math.abs([...weights.values()].reduce((a, b) => a + b, 0) - 100) < 1e-10);
});
