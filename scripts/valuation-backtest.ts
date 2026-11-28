import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import ts from "typescript";
import { compareForecasts, isDate, panelWindow, primaryMetrics, readObservations } from "./valuation-backtest-metrics.ts";
import type { BacktestEngine, PrimaryMetric } from "./valuation-backtest-metrics.ts";

interface Window { from: string; through: string }
interface Model { digest: string; files: Record<string, string> }
interface Reservation extends Window { digest: string; claimedBy?: string }
interface Trial {
  baseline: Model;
  candidate: Model;
  change: string;
  primaryMetric: PrimaryMetric;
  development: Window & { digest: string };
  availableReservations: string[];
  runtime: string;
  scorerDigest: string;
}
interface Ledger {
  baselines: Record<string, Model>;
  trials: Record<string, Trial>;
  reservations: Record<string, Reservation>;
}

const repo = fileURLToPath(new URL("../", import.meta.url));
const entry = "lib/finance.ts";
const explored = { from: "2017-06-30", through: "2026-06-30" };
const usage = `Amber valuation experiments

  pin <baseline> [--source <src directory>]
  run <trial> --baseline <baseline> --panel <panel.json> --change '<one economic hypothesis>'
      [--metric ${primaryMetrics.join("|")}] [--source <src directory>]
  reserve <validation-set> --sha256 <panel hash> --from <YYYY-MM-DD> --through <YYYY-MM-DD>
  validate <trial> --reservation <validation-set> --panel <panel.json>

Use --store <directory> to locate the ledger (default .valuation-backtest/ in Amber).
Run project commands with pnpm backtest:valuation.`;

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const overlapping = (a: Window, b: Window) => a.from <= b.through && b.from <= a.through;
const scorerDigest = () => hash(JSON.stringify([import.meta.url, new URL("./valuation-backtest-metrics.ts", import.meta.url)]
  .map((file) => hash(readFileSync(fileURLToPath(file))))));

function requireValue(value: string | undefined, option: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`Missing ${option}.`);
  return trimmed;
}

function identifier(id: string | undefined, label: string): string {
  const name = requireValue(id, label);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error(`Use a lowercase name for ${label}.`);
  return name;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

function freezeModel(root: string, store: string): Model {
  const sources = new Map<string, Buffer>();
  function collect(path: string) {
    const key = relative(root, path);
    if (key.startsWith("../") || isAbsolute(key)) throw new Error(`Model dependency escapes the source directory: ${key}`);
    if (sources.has(key)) return;
    const contents = readFileSync(path);
    sources.set(key, contents);
    for (const { fileName } of ts.preProcessFile(contents.toString("utf8"), true).importedFiles) {
      if (!fileName.startsWith(".")) throw new Error(`Model dependency must be bundled with its source: ${fileName}`);
      collect(resolve(dirname(path), fileName));
    }
  }

  collect(resolve(root, entry));
  const files = Object.fromEntries([...sources.keys()].sort().map((key) => [key, hash(sources.get(key)!)]));
  const digest = hash(JSON.stringify(files));
  for (const [key, contents] of sources) {
    const target = resolve(store, "models", digest, key);
    mkdirSync(dirname(target), { recursive: true });
    if (!existsSync(target)) writeFileSync(target, contents, { flag: "wx" });
  }
  return { digest, files };
}

async function loadModel(model: Model, store: string): Promise<BacktestEngine> {
  const root = resolve(store, "models", model.digest);
  if (model.digest !== hash(JSON.stringify(model.files))) throw new Error("Model manifest does not match its hash.");
  for (const [key, digest] of Object.entries(model.files)) {
    if (hash(readFileSync(resolve(root, key))) !== digest) throw new Error(`Frozen source was modified: ${key}`);
  }
  const engine = await import(pathToFileURL(resolve(root, entry)).href) as BacktestEngine;
  for (const key of ["computeGroundedDefaultDcf", "buildScenarioBasis", "getScenarioDefaults", "computeScenarioProjection"] as const) {
    if (typeof engine[key] !== "function") throw new Error(`Frozen model is missing ${key}.`);
  }
  return engine;
}

function loadPanel(path: string | undefined, expectedDigest?: string) {
  const bytes = readFileSync(resolve(requireValue(path, "--panel")));
  const digest = hash(bytes);
  if (expectedDigest && digest !== expectedDigest) throw new Error("Panel hash does not match the registered validation set.");
  const panel = readObservations(JSON.parse(bytes.toString("utf8")));
  return { panel, info: { ...panelWindow(panel), digest } };
}

function changedFiles(baseline: Model, candidate: Model) {
  return [...new Set([...Object.keys(baseline.files), ...Object.keys(candidate.files)])].sort()
    .filter((key) => baseline.files[key] !== candidate.files[key]);
}

function percent(value: number | null) {
  return value === null ? "unavailable" : value.toFixed(2);
}

async function score(store: string, id: string, trial: Trial, loaded: ReturnType<typeof loadPanel>, reservation?: string) {
  const [baseline, candidate] = await Promise.all([loadModel(trial.baseline, store), loadModel(trial.candidate, store)]);
  const metrics = compareForecasts(loaded.panel, baseline, candidate, trial.primaryMetric);
  const role = reservation ? "sealed-validation" : "development";
  const output = resolve(store, reservation ? "validation" : "reports", `${reservation ?? id}.json`);
  writeJson(output, {
    id, role, reservation, formatVersion: 1, panel: loaded.info,
    ...trial,
    changedFiles: changedFiles(trial.baseline, trial.candidate),
    metrics,
  });
  console.log(`${id} (${role}), ${metrics.observations} rows / ${metrics.issuers} issuers`);
  console.log(`${trial.primaryMetric} MAE ${percent(metrics.primary.baselineMae)} → ${percent(metrics.primary.candidateMae)} (${metrics.primary.paired} paired)`);
  console.log(`Coverage ${metrics.coverage.baseline} → ${metrics.coverage.candidate}`);
  console.log(`Quote sensitivity ${metrics.priceIndependence.baselineViolations} → ${metrics.priceIndependence.candidateViolations}. Ticker sensitivity ${metrics.issuerIndependence.baselineIssuerSensitive} → ${metrics.issuerIndependence.candidateIssuerSensitive} (${metrics.issuerIndependence.newlyIssuerSensitive} new).`);
  console.log(output);
  return metrics;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" }, store: { type: "string" }, source: { type: "string" },
      baseline: { type: "string" }, panel: { type: "string" }, change: { type: "string" },
      metric: { type: "string" }, sha256: { type: "string" }, from: { type: "string" },
      through: { type: "string" }, reservation: { type: "string" },
    },
  });
  const [command, name] = positionals;
  if (values.help || !command) {
    console.log(usage);
    return;
  }
  const options: Record<string, string[]> = {
    pin: ["source"], run: ["baseline", "panel", "change", "metric", "source"],
    reserve: ["sha256", "from", "through"], validate: ["reservation", "panel"],
  };
  if (!Object.hasOwn(options, command) || positionals.length !== 2 ||
      Object.keys(values).some((key) => key !== "store" && !options[command].includes(key))) throw new Error(usage);
  const id = identifier(name, "name");
  const source = values.source ? resolve(values.source) : resolve(repo, "src");
  const store = values.store ? resolve(values.store) : resolve(repo, ".valuation-backtest");
  const ledgerPath = resolve(store, "ledger.json");
  const lock = resolve(store, ".lock");
  mkdirSync(store, { recursive: true });
  try {
    mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Ledger is locked at ${lock}. Remove the empty lock directory if its process has exited.`);
    }
    throw error;
  }

  try {
    const ledger: Ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) :
      { baselines: {}, trials: {}, reservations: {} };
    switch (command) {
      case "pin": {
        if (Object.hasOwn(ledger.baselines, id)) throw new Error(`Baseline is already pinned: ${id}`);
        const model = freezeModel(source, store);
        await loadModel(model, store);
        ledger.baselines[id] = model;
        writeJson(ledgerPath, ledger);
        console.log(`Pinned ${id} (${model.digest})`);
        break;
      }
      case "run": {
        if (Object.hasOwn(ledger.trials, id)) throw new Error(`Trial already exists: ${id}`);
        const baselineName = identifier(values.baseline, "--baseline");
        if (!Object.hasOwn(ledger.baselines, baselineName)) throw new Error(`Unknown baseline: ${baselineName}`);
        const change = requireValue(values.change, "--change");
        const primaryMetric = (values.metric ?? "cash-flow-per-share") as PrimaryMetric;
        if (!primaryMetrics.includes(primaryMetric)) throw new Error(`Unknown primary metric: ${primaryMetric}`);
        const loaded = loadPanel(values.panel);
        const availableReservations = Object.keys(ledger.reservations).filter((key) => !ledger.reservations[key].claimedBy);
        if (Object.values(ledger.reservations).some((set) => overlapping(loaded.info, set))) {
          throw new Error("Development dates overlap a registered validation set.");
        }
        const trial: Trial = {
          baseline: ledger.baselines[baselineName], candidate: freezeModel(source, store), change, primaryMetric,
          development: loaded.info, availableReservations, runtime: process.version, scorerDigest: scorerDigest(),
        };
        ledger.trials[id] = trial;
        writeJson(ledgerPath, ledger);
        await score(store, id, trial, loaded);
        break;
      }
      case "reserve": {
        if (Object.hasOwn(ledger.reservations, id)) throw new Error(`Reservation already exists: ${id}`);
        const digest = requireValue(values.sha256, "--sha256").toLowerCase();
        const { from, through } = values;
        if (!/^[a-f0-9]{64}$/.test(digest) || !isDate(from) || !isDate(through) || from >= through) {
          throw new Error("Provide a SHA-256 hash and a valid formation-to-outcome date range.");
        }
        const set = { digest, from, through };
        if ([explored, ...Object.values(ledger.reservations), ...Object.values(ledger.trials).map((trial) => trial.development)]
          .some((prior) => overlapping(prior, set))) throw new Error("Validation dates overlap previously explored or reserved dates.");
        ledger.reservations[id] = set;
        writeJson(ledgerPath, ledger);
        console.log(`Reserved ${id} from ${from} through ${through}.`);
        break;
      }
      case "validate": {
        const name = identifier(values.reservation, "--reservation");
        if (!Object.hasOwn(ledger.trials, id)) throw new Error(`Unknown trial: ${id}`);
        if (!Object.hasOwn(ledger.reservations, name)) throw new Error(`Unknown reservation: ${name}`);
        const trial = ledger.trials[id];
        const set = ledger.reservations[name];
        if (set.claimedBy && (set.claimedBy !== id || existsSync(resolve(store, "validation", `${name}.json`)))) {
          throw new Error(`Validation set was already used by ${set.claimedBy}.`);
        }
        if (!trial.availableReservations.includes(name)) throw new Error("Validation must be reserved before the trial.");
        if (trial.runtime !== process.version || trial.scorerDigest !== scorerDigest()) {
          throw new Error("Validation requires the same runtime and scorer used for the development trial.");
        }
        const developmentPath = resolve(store, "reports", `${id}.json`);
        if (!existsSync(developmentPath)) throw new Error("The trial has no completed development report.");
        const { metrics } = JSON.parse(readFileSync(developmentPath, "utf8")) as { metrics: ReturnType<typeof compareForecasts> };
        if (metrics.priceIndependence.candidateViolations || metrics.issuerIndependence.newlyIssuerSensitive ||
            metrics.issuerIndependence.candidateIssuerSensitive > metrics.issuerIndependence.baselineIssuerSensitive) {
          throw new Error("Resolve the candidate's price or new issuer sensitivity before using sealed data.");
        }
        const loaded = loadPanel(values.panel, set.digest);
        if (loaded.info.from !== set.from || loaded.info.through !== set.through) {
          throw new Error("Actual formation-to-outcome dates do not match the reservation.");
        }
        set.claimedBy = id;
        writeJson(ledgerPath, ledger);
        await score(store, id, trial, loaded, name);
        break;
      }
    }
  } finally {
    rmdirSync(lock);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
