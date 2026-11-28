import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { compareForecasts, readObservations } from "../scripts/valuation-backtest-metrics.ts";
import * as valuation from "../src/lib/finance.ts";

function panel(year: number) {
  const observation = {
    formation: `${year}-06-30`,
    snapshot: {
      ticker: "SAMPLE", price: 20, priceAsOf: `${year}-06-30`, sector: "Cloud & Software",
      cashAndEquiv: 10, totalDebt: 4,
      annuals: Array.from({ length: 3 }, (_, index) => ({
        fiscalYear: `FY${year - 3 + index}`, periodEndDate: `${year - 3 + index}-12-31`,
        revenue: 100 + index * 10, operatingCashFlow: 30, capex: 3, sbc: 1, buybacks: 0, dilutedShares: 10,
        operatingIncome: 20, netIncome: 16, stockholdersEquity: 40, totalDebt: 4, cashAndEquiv: 10,
      })),
      filedFundamentals: { sic: "7372", reportedAt: `${year}-03-31`, source: "Example annual report", netRevenueRetentionPct: 105 },
    },
    results: {
      5: {
        date: `${year + 5}-06-30`, totalGrowth: 1.5, benchmarkTotalGrowth: 1.4,
        fundamentals: { growth: 6, revenue: 160, fcfMargin: 22, shares: 10 },
      },
    },
  };
  return { panel: [observation] };
}

test("valuation panel rejects lookahead filings and duplicate observations", () => {
  const data = panel(2018);
  assert.equal(readObservations(data).length, 1);
  assert.throws(() => readObservations({ panel: [...data.panel, ...data.panel] }), /Duplicate/);
  data.panel[0].snapshot.filedFundamentals.reportedAt = "2018-06-30";
  assert.throws(() => readObservations(data), /Invalid supplemental fundamentals/);
  const stale = panel(2018);
  Object.assign(stale.panel[0].snapshot.annuals[0], { filedAt: "2018-07-01" });
  assert.throws(() => readObservations(stale), /Invalid point-in-time observation/);
});

test("valuation backtest compares archived margins to earnings forecasts and excludes earnings from sales forecasts", () => {
  const data = panel(2018);
  data.panel[0].snapshot.sector = "Financials";
  data.panel[0].snapshot.filedFundamentals.sic = "6021";
  Object.assign(data.panel[0].results[5].fundamentals, { netMargin: 15 });
  const engine = {
    computeGroundedDefaultDcf: valuation.computeGroundedDefaultDcf,
    buildScenarioBasis: valuation.buildScenarioBasis,
    getScenarioDefaults: valuation.getScenarioDefaults,
    computeScenarioProjection: valuation.computeScenarioProjection,
  };
  const report = compareForecasts(readObservations(data), engine, engine, "earnings-per-share");
  assert.equal(report.primary.paired, 1);
  assert.equal(report.fundamentals5.revenueGrowth.paired, 0);
});

test("valuation backtests compare with a size index only when the cohort has a consistent series", () => {
  const rows = Array.from({ length: 5 }, (_, index) => {
    const row = panel(2018).panel[0];
    row.snapshot.ticker = `SAMPLE${index}`;
    Object.assign(row.results[5], { sizeTotalGrowth: 1.2 });
    return row;
  });
  const score = () => compareForecasts(readObservations({ panel: rows }), valuation, valuation, "return-error")
    .horizonChecks[5].portfolios.baseline;
  const result = score();
  assert.ok(result.vsSizeIndex !== null && result.vsSizeIndex > result.vsIndex!);
  Object.assign(rows[0].results[5], { sizeTotalGrowth: null });
  assert.equal(score().vsSizeIndex, null);
});

test("default earnings valuations normalize established profits using full fiscal periods", () => {
  const { snapshot, formation } = panel(2018).panel[0];
  snapshot.sector = "Financials";
  const trailing = { ...snapshot.annuals.at(-1)!, fiscalYear: "TTM", revenue: 200, netIncome: 60 };
  snapshot.annuals.push(trailing);

  const basis = valuation.buildScenarioBasis(snapshot, Date.parse(formation));
  assert.equal(basis.netMargin, 30);
  assert.equal(basis.model?.sustainableNetMargin, 16 / 110 * 100);

  trailing.netIncome = -60;
  const lossBasis = valuation.buildScenarioBasis(snapshot, Date.parse(formation));
  assert.ok(lossBasis.model && lossBasis.model.sustainableNetMargin < 0);
});

test("earnings valuations include repurchases in shareholder cash flow after required retention", () => {
  const { snapshot, formation } = panel(2018).panel[0];
  const annuals = snapshot.annuals.map(row => ({ ...row, netIncome: 20, stockholdersEquity: 100, dividendsPaid: 2, buybacks: 6 }));
  const project = (buybacks: number) => {
    const basis = valuation.buildScenarioBasis({
      ...snapshot, sector: "Financials", annuals: annuals.map(row => ({ ...row, buybacks })),
    }, Date.parse(formation));
    return valuation.computeScenarioProjection(basis, { lens: "pe", revGrowth: 2.5, targetMargin: 20, exitMultiple: 10 })!;
  };
  const dividends = project(0);
  const distributions = project(6);
  const excessRepurchases = project(100);
  assert.ok(distributions.fairValueToday > dividends.fairValueToday);
  assert.equal(distributions.yr5TargetPrice, dividends.yr5TargetPrice);
  assert.ok(Math.abs(distributions.yr5RecurringCashFlow / distributions.yr5TrueFcf - 0.4) < 1e-10);
  assert.ok(Math.abs(excessRepurchases.yr5RecurringCashFlow / excessRepurchases.yr5TrueFcf - 0.875) < 1e-10);
});

test("valuation trials pin engine and panel hashes and use disjoint validation once", (t) => {
  const store = mkdtempSync(join(tmpdir(), "amber-valuation-test-"));
  t.after(() => rmSync(store, { force: true, recursive: true }));
  const cli = fileURLToPath(new URL("../scripts/valuation-backtest.ts", import.meta.url));
  function invoke(...args: string[]) {
    return spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types",
      cli, "--store", store, ...args], { encoding: "utf8" });
  }
  function succeed(...args: string[]) {
    const result = invoke(...args);
    assert.equal(result.status, 0, result.stderr);
  }
  function reject(pattern: RegExp, ...args: string[]) {
    const result = invoke(...args);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, pattern);
  }
  const development = join(store, "development.json");
  const sealed = join(store, "sealed.json");
  const contents = JSON.stringify(panel(2010));
  const hash = createHash("sha256").update(contents).digest("hex");
  writeFileSync(development, JSON.stringify(panel(2018)));
  writeFileSync(sealed, contents);
  const trial = ["--baseline", "baseline", "--change", "Unchanged control"];
  const reserved = ["--reservation", "holdout", "--panel", sealed];
  succeed("pin", "baseline");
  reject(/previously explored/, "reserve", "overlap", "--sha256", hash, "--from", "2018-06-30", "--through", "2023-06-30");
  succeed("run", "too-early", ...trial, "--panel", development);
  succeed("reserve", "holdout", "--sha256", hash, "--from", "2010-06-30", "--through", "2015-06-30");
  reject(/reserved before the trial/, "validate", "too-early", ...reserved);
  reject(/overlap a registered validation set/, "run", "overlap", ...trial, "--panel", sealed);
  succeed("run", "control", ...trial, "--panel", development);
  const report = JSON.parse(readFileSync(join(store, "reports", "control.json"), "utf8"));
  assert.equal(report.role, "development");
  assert.deepEqual(report.changedFiles, []);
  assert.equal(report.metrics.primary.paired, 1);
  assert.equal(report.metrics.primary.deltaMae, 0);
  assert.equal(report.metrics.byIndustry[7372].observations, 1);
  assert.equal(report.metrics.inputCoverage.netRevenueRetentionPct, 1);
  assert.equal(report.metrics.issuerIndependence.newlyIssuerSensitive, 0);
  const frozenSource = join(store, "models", report.baseline.digest);
  const biasedSource = join(store, "biased-source");
  cpSync(frozenSource, biasedSource, { recursive: true });
  const finance = join(biasedSource, "lib", "finance.ts");
  const original = readFileSync(finance, "utf8");
  const biased = original.replace("const sustainableFcfMargin = historicalCashMargin", "const sustainableFcfMargin = company.price + historicalCashMargin");
  assert.notEqual(biased, original);
  writeFileSync(finance, biased);
  succeed("run", "quote-sensitive", ...trial, "--panel", development, "--source", biasedSource);
  reject(/candidate's price or new issuer sensitivity/, "validate", "quote-sensitive", ...reserved);
  writeFileSync(sealed, `${contents}\n`);
  reject(/Panel hash does not match/, "validate", "control", ...reserved);
  writeFileSync(sealed, contents);
  succeed("validate", "control", ...reserved);
  assert.equal(JSON.parse(readFileSync(join(store, "validation", "holdout.json"), "utf8")).role, "sealed-validation");
  reject(/already used/, "validate", "control", ...reserved);
  writeFileSync(join(frozenSource, "lib", "finance.ts"), "// changed");
  reject(/Frozen source was modified/, "run", "tampered", ...trial, "--panel", development);
});
