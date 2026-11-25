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
  return { ...sync, requests, snapshot: () => saved, updateFromOtherTab: (value: SavedWatchlist) => { saved = value; } };
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

test("a queued edit retries the guest import before making a signed-in change", async () => {
  const fixture = watchlistFixture({ owner: null, tickers: ["AAPL", "MSFT"] });
  fixture.connect("account");
  fixture.toggle("NVDA", "account");
  await setImmediate();
  fixture.requests[0].response.reject(new Error("first read failed"));
  await setImmediate();
  assert.equal(fixture.requests[1].mutation, undefined);
  fixture.requests[1].response.resolve([]);
  await setImmediate();
  assert.deepEqual(fixture.requests[2].mutation, { tickers: ["AAPL", "MSFT"] });
  fixture.requests[2].response.resolve(["AAPL", "MSFT"]);
  await setImmediate();
  assert.deepEqual(fixture.requests[3].mutation, { ticker: "NVDA", action: "add" });
  fixture.requests[3].response.resolve(["NVDA", "AAPL", "MSFT"]);
  await setImmediate();
  assert.deepEqual(fixture.snapshot(), { owner: "account", tickers: ["NVDA", "AAPL", "MSFT"] });
});

test("a failed guest import preserves the original guest list across sign-out", async () => {
  const fixture = watchlistFixture({ owner: null, tickers: ["AAPL"] });
  fixture.connect("account");
  fixture.toggle("NVDA", "account");
  await setImmediate();
  fixture.requests[0].response.resolve([]);
  await setImmediate();
  fixture.requests[1].response.reject(new Error("import failed"));
  await setImmediate();
  fixture.requests[2].response.reject(new Error("retry failed"));
  await setImmediate();
  assert.equal(fixture.requests.length, 3);
  fixture.connect(null);
  assert.deepEqual(fixture.snapshot(), { owner: null, tickers: ["AAPL"] });
});

test("signing into an existing watchlist preserves guest tickers without merging them", async () => {
  const fixture = watchlistFixture({ owner: null, tickers: ["AAPL", "AMZN"] });
  fixture.connect("account");
  await setImmediate();
  fixture.requests[0].response.resolve(["MSFT", "AMZN"]);
  await setImmediate();
  const saved = fixture.snapshot();
  assert.deepEqual(saved.tickers, ["MSFT", "AMZN"]);
  assert.deepEqual(saved.guestTickers, ["AAPL", "AMZN"]);

  const reloaded = watchlistFixture(saved);
  reloaded.connect("account");
  await setImmediate();
  reloaded.requests[0].response.resolve([]);
  await setImmediate();
  assert.equal(reloaded.requests.length, 1);
  assert.deepEqual(reloaded.snapshot().tickers, []);
  reloaded.connect(null);
  assert.deepEqual(reloaded.snapshot(), { owner: null, tickers: ["AAPL", "AMZN"] });
});

test("guest tickers omitted from a successful import remain available after sign-out", async () => {
  const guestTickers = Array.from({ length: 31 }, (_, i) => `T${i}`);
  const fixture = watchlistFixture({ owner: null, tickers: guestTickers });
  fixture.connect("account");
  await setImmediate();
  fixture.requests[0].response.resolve([]);
  await setImmediate();
  assert.deepEqual(fixture.requests[1].mutation, { tickers: guestTickers.slice(0, 30) });
  fixture.requests[1].response.resolve(guestTickers.slice(0, 30));
  await setImmediate();
  fixture.connect(null);
  assert.deepEqual(fixture.snapshot(), { owner: null, tickers: ["T30"] });
});

test("a failed edit in one tab rolls back to the latest same-account snapshot", async () => {
  const fixture = watchlistFixture();
  fixture.connect("account");
  await setImmediate();
  fixture.requests[0].response.resolve(["AAPL"]);
  await setImmediate();

  fixture.updateFromOtherTab({ owner: "account", tickers: ["MSFT", "AAPL"] });
  fixture.toggle("NVDA", "account");
  assert.deepEqual(fixture.snapshot().tickers, ["NVDA", "MSFT", "AAPL"]);
  await setImmediate();
  fixture.requests[1].response.reject(new Error("edit failed"));
  await setImmediate();
  fixture.requests[2].response.reject(new Error("refresh failed"));
  await setImmediate();
  assert.deepEqual(fixture.snapshot().tickers, ["MSFT", "AAPL"]);
});
