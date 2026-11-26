import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { searchIndexHealthErrors } from "../scripts/smoke-prod.ts";
import { buildSearchIndexEntry } from "../src/data/search-index.ts";
import { PILOT_TICKERS } from "../src/data/pilot-tickers.ts";
import { buildScenarioBasis, computeBaseCaseValuation, computeScenarioProjection } from "../src/lib/finance.ts";
import { computePresetExpectedReturn, evaluateValuationTriggers, type SavedValuationPreset } from "../src/lib/valuation-presets.ts";

const company = PILOT_TICKERS.find(({ ticker }) => ticker === "NVDA")!;

test("scenario, saved thesis, and alert use the same share count and margin period", () => {
  const annual = {
    ...company.annuals.at(-1)!,
    fiscalYear: "FY25",
    revenue: 1000,
    operatingIncome: 150,
    operatingCashFlow: 180,
    sbc: 20,
    capex: 30,
    dilutedShares: 100,
  };
  const snapshot = {
    ...company,
    price: 50,
    marketCap: 4000, // Price and reported diluted shares imply a different amount.
    cashAndEquiv: 300,
    totalDebt: 100,
    annuals: [annual, { ...annual, fiscalYear: "TTM", revenue: 1200, operatingIncome: 360 }],
  };
  const preset: SavedValuationPreset = {
    ticker: snapshot.ticker, lens: "ebit", revGrowth: 10, targetMargin: 25, exitMultiple: 20,
    updatedAt: "2026-11-25",
  };
  const basis = buildScenarioBasis(snapshot);
  assert.equal(basis.dilutedShares, 100);
  assert.equal(basis.operatingMargin, 15);
  const studio = computeScenarioProjection(basis, preset)!;
  const entry = buildSearchIndexEntry(snapshot);
  const saved = computePresetExpectedReturn(preset, entry)!;
  const hits = evaluateValuationTriggers([{ ...preset, id: "test" }], new Map([[entry.ticker, entry]]), studio.irrPct!);
  assert.equal(saved.irrPct, studio.irrPct);
  assert.equal(hits[0]?.irrPct, studio.irrPct);
});

test("the JPM sector alias still uses the earnings lens and excludes industrial metrics", () => {
  const annuals = company.annuals.map((annual) => ({ ...annual, netIncome: annual.revenue * 0.2 }));
  const bank = { ...company, ticker: "JPM", sector: "Fintech & Data", annuals };
  const indexEntry = buildSearchIndexEntry(bank);
  assert.equal(indexEntry.impliedCagr, null);
  assert.equal(indexEntry.priceToFfo, null);
  assert.equal(computeBaseCaseValuation(bank)?.lens, "pe");
  assert.equal(computeScenarioProjection(indexEntry.scenarioBasis, {
    lens: "fcf", revGrowth: 10, targetMargin: 20, exitMultiple: 15,
  }), null);
});

test("smoke checks reject stale quotes, bank DCF, and non-REIT FFO", () => {
  const now = Date.parse("2026-11-25T21:00:00Z");
  const nvda = { ticker: "NVDA", sector: "Semiconductors", price: 100, marketCap: 100_000, priceAsOf: "2026-11-24" };
  const jpm = { ...nvda, ticker: "JPM", sector: "Fintech & Data", impliedCagr: null };
  assert.deepEqual(searchIndexHealthErrors([nvda, jpm], now), []);
  assert.deepEqual(searchIndexHealthErrors({}, now), ["Expected a populated search index."]);
  const errors = searchIndexHealthErrors([
    { ...nvda, priceToFfo: 19 },
    { ...jpm, priceAsOf: "2026-11-01", impliedCagr: 52.4 },
  ], now);
  assert.ok(errors.some((error) => error.includes("1/2 companies have recent closes")));
  assert.ok(errors.some((error) => error.includes("Reverse DCF") && error.includes("JPM")));
  assert.ok(errors.some((error) => error.includes("Price / FFO") && error.includes("NVDA")));
});

test("a complete quote outage fails the CLI before rewriting the local index", () => {
  const directory = mkdtempSync(join(tmpdir(), "amber-price-outage-"));
  try {
    const output = join(directory, "src/data/generated");
    mkdirSync(output, { recursive: true });
    const path = join(output, "companies.json");
    const source = JSON.stringify([company], null, 2);
    writeFileSync(path, source);
    const stub = "data:text/javascript," + encodeURIComponent(
      'globalThis.fetch = async () => new Response("upstream outage", { status: 403 });'
    );
    const result = spawnSync(process.execPath, [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types",
      "--import", stub, fileURLToPath(new URL("../scripts/sync-prices.ts", import.meta.url)),
    ], { cwd: directory, env: { ...process.env, DATABASE_URL: "" }, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Quote refresh reached 0\/1/);
    assert.equal(readFileSync(path, "utf8"), source);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
