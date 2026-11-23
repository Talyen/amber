import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWatchlistRequest } from "../src/lib/watchlist-request.ts";

test("rejects non-object watchlist requests and unknown actions", () => {
  for (const body of [null, true, "AAPL", []]) {
    assert.deepEqual(parseWatchlistRequest(body), { error: "Invalid JSON payload." });
  }
  assert.deepEqual(parseWatchlistRequest({ ticker: "AAPL", action: "delete" }), {
    error: "Invalid watchlist action.",
  });
  assert.deepEqual(parseWatchlistRequest({ ticker: {} }), { error: "Invalid ticker." });
});

test("normalizes explicit, legacy, and batch watchlist edits", () => {
  assert.deepEqual(parseWatchlistRequest({ ticker: " aapl ", action: "remove" }), {
    ticker: "AAPL", action: "remove",
  });
  assert.deepEqual(parseWatchlistRequest({ ticker: " brk.b " }), {
    ticker: "BRK.B", action: "toggle",
  });
  const tickers = Array.from({ length: 32 }, (_, index) => `T${index}`);
  assert.deepEqual(parseWatchlistRequest({ tickers: [" t0 ", null, "BAD SYMBOL", ...tickers] }), {
    tickers: tickers.slice(0, 30),
  });
});
