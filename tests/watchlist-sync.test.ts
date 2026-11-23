import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createWatchlistSync, type SavedWatchlist } from "../src/lib/watchlist-sync.ts";

function watchlistFixture(initial: SavedWatchlist = { owner: null, tickers: [] }) {
  let saved = initial;
  const requests: {
    signal: AbortSignal;
    mutation: Parameters<Parameters<typeof createWatchlistSync>[0]["request"]>[1];
    response: ReturnType<typeof Promise.withResolvers<string[]>>;
  }[] = [];
  const sync = createWatchlistSync({
    read: () => saved,
    write: (value) => { saved = value; },
    request: (signal, mutation) => {
      const response = Promise.withResolvers<string[]>();
      requests.push({ signal, mutation, response });
      return response.promise;
    },
  });
  return { ...sync, requests, snapshot: () => saved };
}

test("serializes watchlist edits and keeps pending edits visible", async () => {
  const fixture = watchlistFixture();
  fixture.connect("account");
  fixture.toggle("NVDA", "account");
  fixture.toggle("MSFT", "account");
  await setImmediate();
  assert.equal(fixture.requests.length, 1);
  fixture.requests[0].response.resolve(["AMZN"]);
  await setImmediate();
  assert.deepEqual(fixture.snapshot().tickers, ["MSFT", "NVDA", "AMZN"]);
  assert.equal(fixture.requests.length, 2);
  assert.deepEqual(fixture.requests[1].mutation, { ticker: "NVDA", action: "add" });

  fixture.requests[1].response.resolve(["NVDA", "AMZN"]);
  await setImmediate();
  assert.deepEqual(fixture.snapshot().tickers, ["MSFT", "NVDA", "AMZN"]);
  assert.deepEqual(fixture.requests[2].mutation, { ticker: "MSFT", action: "add" });
  fixture.requests[2].response.resolve(["MSFT", "NVDA", "AMZN"]);
  await setImmediate();
  assert.deepEqual(fixture.snapshot().tickers, ["MSFT", "NVDA", "AMZN"]);
});

test("a failed watchlist request rolls back only its own edit", async () => {
  const fixture = watchlistFixture({ owner: "account", tickers: ["AMZN"] });
  fixture.connect("account");
  fixture.toggle("NVDA", "account");
  fixture.toggle("MSFT", "account");
  await setImmediate();
  fixture.requests[0].response.resolve(["AMZN"]);
  await setImmediate();
  fixture.requests[1].response.reject(new Error("watchlist unavailable"));
  await setImmediate();
  assert.equal(fixture.requests[2].mutation, undefined);
  fixture.requests[2].response.resolve(["AMZN"]);
  await setImmediate();
  assert.deepEqual(fixture.snapshot().tickers, ["MSFT", "AMZN"]);
  fixture.requests[3].response.resolve(["MSFT", "AMZN"]);
  await setImmediate();
});

test("late responses cannot apply to a different signed-in account", async () => {
  const fixture = watchlistFixture({ owner: "previous", tickers: ["NVDA"] });
  fixture.connect("previous");
  await setImmediate();
  fixture.connect("next");
  await setImmediate();
  assert.ok(fixture.requests[0].signal.aborted);
  assert.deepEqual(fixture.snapshot(), { owner: "next", tickers: [] });
  fixture.requests[1].response.resolve([]);
  fixture.requests[0].response.resolve(["NVDA", "MSFT"]);
  await setImmediate();
  assert.equal(fixture.requests.length, 2);
  assert.deepEqual(fixture.snapshot(), { owner: "next", tickers: [] });
});
