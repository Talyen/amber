import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { isFinancialInstitution, isReit } from "../src/lib/finance.ts";
import { isFreshPriceDate, meetsQuoteCoverage, MIN_QUOTE_COVERAGE } from "../src/lib/market-price.ts";

const DEFAULT_BASE_URL = "https://amber-theta-three.vercel.app";
const baseUrl = (process.env.AMBER_PROD_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
const useVercelCurl = process.argv.includes("--vercel") || process.env.AMBER_SMOKE_VERCEL_CURL === "1";

interface RouteCheck {
  path: string;
  checkIndex?: boolean;
  expectSubstring?: string;
}

const CHECKS: RouteCheck[] = [
  { path: "/", expectSubstring: "Market Extremes" },
  { path: "/feed", expectSubstring: "Insider" },
  { path: "/compare", expectSubstring: "Compare up to" },
  { path: "/portfolio", expectSubstring: "PORTFOLIO ANALYZER" },
  { path: "/arena", expectSubstring: "Leaderboard" },
  { path: "/t/NVDA", expectSubstring: "NVIDIA" },
  { path: "/api/search-index", checkIndex: true },
];

export function searchIndexHealthErrors(payload: unknown, now = Date.now()): string[] {
  if (!Array.isArray(payload) || payload.length === 0) return ["Expected a populated search index."];
  const errors: string[] = [];
  const tickers = new Set<string>();
  let fresh = 0;
  for (const row of payload) {
    if (!row || typeof row.ticker !== "string" || typeof row.sector !== "string" ||
      !Number.isFinite(row.price) || row.price <= 0 || !Number.isFinite(row.marketCap) || row.marketCap <= 0) {
      return ["Search index contains a malformed company or invalid price."];
    }
    if (tickers.has(row.ticker)) errors.push(`Duplicate ticker: ${row.ticker}.`);
    tickers.add(row.ticker);
    if (isFreshPriceDate(row.priceAsOf, now)) fresh++;
    if (isFinancialInstitution(row) && row.impliedCagr !== null) {
      errors.push(`Reverse DCF must be unavailable for ${row.ticker}.`);
    }
    if (row.priceToFfo != null && (!isReit(row) || !row.ffoFiscalYear || row.priceToFfo <= 0)) {
      errors.push(`Price / FFO lacks a valid REIT reporting period for ${row.ticker}.`);
    }
  }
  for (const ticker of ["NVDA", "JPM"]) {
    if (!tickers.has(ticker)) errors.push(`Missing ${ticker} from the search index.`);
  }
  if (!meetsQuoteCoverage(fresh, payload.length)) {
    errors.unshift(`Only ${fresh}/${payload.length} companies have recent closes (minimum ${MIN_QUOTE_COVERAGE * 100}%).`);
  }
  return errors;
}

async function fetchRoute(url: string): Promise<{ status: number; body: string }> {
  if (useVercelCurl) {
    const out = execFileSync(
      "vercel",
      ["curl", url, "--", "--silent", "--show-error", "--write-out", "\n__STATUS__:%{http_code}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }
    );
    const idx = out.lastIndexOf("\n__STATUS__:");
    const status = idx >= 0 ? Number(out.slice(idx + "\n__STATUS__:".length).trim()) : 0;
    const body = idx >= 0 ? out.slice(0, idx) : out;
    return { status, body };
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  return { status: res.status, body: await res.text() };
}

async function run() {
  let failures = 0;
  for (const check of CHECKS) {
    const url = `${baseUrl}${check.path}`;
    try {
      const { status, body } = await fetchRoute(url);
      if (status !== 200) {
        console.error(`[smoke-prod] FAIL ${check.path}: HTTP ${status}`);
        failures++;
        continue;
      }
      if (check.checkIndex) {
        const errors = searchIndexHealthErrors(JSON.parse(body));
        if (errors.length) {
          const samples = errors.slice(0, 5);
          if (errors.length > samples.length) samples.push(`${errors.length - samples.length} more issues.`);
          console.error(`[smoke-prod] FAIL ${check.path}: ${samples.join(" ")}`);
          failures++;
          continue;
        }
      }
      if (check.expectSubstring && !body.includes(check.expectSubstring)) {
        console.error(`[smoke-prod] FAIL ${check.path}: missing expected marker "${check.expectSubstring}"`);
        failures++;
        continue;
      }
      console.log(`[smoke-prod] OK   ${check.path} (HTTP 200, ${body.length} bytes)`);
    } catch (err) {
      console.error(`[smoke-prod] FAIL ${check.path}:`, err instanceof Error ? err.message : err);
      failures++;
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    throw new Error(`${failures} production smoke check(s) failed.`);
  }
  console.log(`[smoke-prod] All ${CHECKS.length} checks passed against ${baseUrl}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
