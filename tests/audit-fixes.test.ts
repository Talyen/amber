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
  assert.equal(basis.operatingMargin, 30);
  const studio = computeScenarioProjection(basis, preset)!;
  const entry = buildSearchIndexEntry(snapshot);
  const saved = computePresetExpectedReturn(preset, entry)!;
  const hits = evaluateValuationTriggers([{ ...preset, id: "test" }], new Map([[entry.ticker, entry]]), studio.irrPct!);
  assert.equal(saved.irrPct, studio.irrPct);
  assert.equal(hits[0]?.irrPct, studio.irrPct);
});

test("a verified bank uses the earnings lens across ticker and sector labels", () => {
  const annuals = company.annuals.map((annual) => ({ ...annual, netIncome: annual.revenue * 0.2 }));
  const bank = { ...company, ticker: "SYNTHETIC", cik: "9999999999", sector: "Fintech & Data", sic: 6021, annuals };
  const indexEntry = buildSearchIndexEntry(bank);
  assert.equal(indexEntry.impliedCagr, null);
  assert.equal(indexEntry.priceToFfo, null);
  assert.equal(computeBaseCaseValuation(bank)?.lens, "pe");
  assert.equal(computeBaseCaseValuation({ ...bank, ticker: "NEW", sector: "Industrials" })?.lens, "pe");
  assert.equal(computeScenarioProjection(indexEntry.scenarioBasis, {
    lens: "fcf", revGrowth: 10, targetMargin: 20, exitMultiple: 15,
  }), null);
});

test("smoke checks reject stale quotes, bank DCF, and non-REIT FFO", () => {
  const now = Date.parse("2026-11-25T21:00:00Z");
  const nvda = { ticker: "NVDA", sector: "Semiconductors", price: 100, marketCap: 100_000, priceAsOf: "2026-11-24" };
  const jpm = { ...nvda, ticker: "JPM", sector: "Fintech & Data", impliedCagr: null, valuationBusiness: "financial" as const };
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

test("filing repairs reconcile revenue, funded debt, and listed share units on the audited period", () => {
  const date = "2026-11-25";
  const now = Date.parse("2026-11-27");
  const annual = { ...company.annuals.at(-1)!, fiscalYear: "FY26", revenue: 30000, dilutedShares: 154 };
  const sandisk = {
    ...company, ticker: "SNDK", cik: "0002023554", price: 95, marketCap: 13518, priceAsOf: date,
    annuals: [{ ...annual, periodEndDate: "2026-10-02", totalDebt: null }],
  };
  const split = buildSearchIndexEntry(sandisk, now);
  assert.equal(split.scenarioBasis.dilutedShares, 1232);
  assert.equal(split.marketCap, 108144);
  assert.equal(split.fairValueIssue, undefined);
  assert.match(buildSearchIndexEntry({ ...sandisk, priceAsOf: null }, now).fairValueIssue!, /dated closing price/);

  const mizuho = {
    ...sandisk, ticker: "MFG", cik: "0001335730", sector: "Financials",
    annuals: [{ ...annual, periodEndDate: "2026-03-31", dilutedShares: 2485 }],
    marketCap: 236075,
  };
  assert.equal(buildSearchIndexEntry(mizuho, now).scenarioBasis.dilutedShares, 12425);
  const alreadyConverted = { ...mizuho, annuals: [{ ...mizuho.annuals[0], dilutedShares: 12425 }] };
  assert.equal(buildSearchIndexEntry(alreadyConverted, now).scenarioBasis.dilutedShares, 12425);

  const generalMills = {
    ...sandisk, ticker: "GIS", cik: "0000040704",
    annuals: [{ ...annual, periodEndDate: "2024-05-26", revenue: 2038 }],
  };
  assert.equal(buildSearchIndexEntry(generalMills, now).revenue, 19857.2);

  const oracle = {
    ...sandisk, ticker: "ORCL", cik: "0001341439", cashAndEquiv: 37077, totalDebt: 0,
    annuals: [{ ...annual, periodEndDate: "2026-08-31", totalDebt: null }],
  };
  assert.equal(buildSearchIndexEntry(oracle, now).scenarioBasis.netCash, 37077 - 125337);

  const gamestop = {
    ...sandisk, ticker: "GME", cik: "0001326380", cashAndEquiv: 5060, totalDebt: 0,
    annuals: [{ ...annual, periodEndDate: "2026-08-01", dilutedShares: 592.6, totalDebt: null }],
  };
  const notesAsDebt = buildSearchIndexEntry(gamestop, now).scenarioBasis;
  assert.equal(notesAsDebt.netCash, 5060 - 4167.8);
  assert.equal(notesAsDebt.dilutedShares, 449.1);
});

test("Amber withholds a default for broken inputs without clipping a supported price gap", () => {
  const now = Date.parse("2026-11-27");
  const annual = {
    ...company.annuals.at(-1)!, fiscalYear: "FY26", periodEndDate: "2026-09-30",
    revenue: 2000, operatingCashFlow: 600, capex: 50, sbc: 40, dilutedShares: 100,
    totalDebt: 0, cashAndEquiv: 50,
  };
  const snapshot = {
    ...company, ticker: "GOOD", cik: "8800000", annuals: [annual],
    marketCap: 100, price: 1, priceAsOf: "2026-11-25", cashAndEquiv: 50, totalDebt: 0,
    lastFiling: { ...company.lastFiling, periodEnd: "2026-09-30" },
  };
  const value = buildSearchIndexEntry(snapshot, now);
  assert.ok(value.fairValueUpsidePct! > 300);
  assert.ok(value.fairValueLow! < value.fairValue! && value.fairValueHigh! > value.fairValue!);
  const repriced = buildSearchIndexEntry({ ...snapshot, marketCap: 200, price: 2 }, now);
  assert.equal(value.fairValue, repriced.fairValue);
  const badShares = buildSearchIndexEntry({ ...snapshot, marketCap: 1000 }, now);
  assert.equal(badShares.fairValue, undefined);
  assert.match(badShares.fairValueIssue!, /share count/);
  const unknownDebt = buildSearchIndexEntry({ ...snapshot, annuals: [{ ...annual, totalDebt: null }] }, now);
  assert.equal(unknownDebt.fairValue, undefined);
  assert.match(unknownDebt.fairValueIssue!, /debt/);
  const insolventCase = buildSearchIndexEntry({
    ...snapshot, totalDebt: 20000, annuals: [{ ...annual, totalDebt: 20000 }],
  }, now);
  assert.equal(insolventCase.fairValue, undefined);
  assert.match(insolventCase.fairValueIssue!, /common equity/);
});

test("the dated Up-C share correction follows the filing rather than the ticker", () => {
  const periodEndDate = "2026-09-26";
  const annual = { ...company.annuals.at(-1)!, periodEndDate, dilutedShares: 132, netIncome: 28 };
  const snapshot = {
    ...company, ticker: "RENAMED", cik: "0001837240", annuals: [annual],
    lastFiling: { ...company.lastFiling, periodEnd: periodEndDate },
  };
  const basis = buildScenarioBasis(snapshot);
  assert.equal(basis.dilutedShares, 605.70344);
  assert.equal(basis.earningsShares, 132);
  assert.equal(buildScenarioBasis({ ...snapshot, cik: "9999999999" }).earningsShares, undefined);
});

test("reported REIT FFO supports the default and carries through a saved FFO thesis", () => {
  const now = Date.parse("2026-11-27");
  const annual = {
    ...company.annuals.at(-1)!, fiscalYear: "FY25", periodEndDate: "2025-12-31",
    revenue: 1554, dilutedShares: 2, dividendsPaid: 480,
  };
  const regency = {
    ...company, ticker: "REG", cik: "0000910606", sector: "Industrials & Materials",
    price: 75.52, marketCap: 13830, priceAsOf: "2026-11-25", annuals: [annual],
    lastFiling: { ...company.lastFiling, periodEnd: "2025-12-31" },
  };
  const entry = buildSearchIndexEntry(regency, now);
  assert.equal(entry.scenarioBasis.dilutedShares, 182.234);
  assert.equal(entry.sector, "Real Estate & REITs");
  assert.equal(entry.baseScenario?.lens, "ffo");
  assert.ok(entry.fairValue! > 40 && entry.fairValue! < 120);
  const saved = { ...entry.baseScenario!, ticker: "REG", updatedAt: "2026-11-27" };
  assert.equal(computePresetExpectedReturn(saved, entry)?.fairValueToday, entry.fairValue);
  const noFfo = buildSearchIndexEntry({ ...regency, ticker: "NOFFO", cik: "0000000001", sector: "Real Estate & REITs", annuals: [{ ...annual, dilutedShares: 182.234 }] }, now);
  assert.equal(noFfo.fairValue, undefined);
  assert.match(noFfo.fairValueIssue!, /funds from operations/);
});
