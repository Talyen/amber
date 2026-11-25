import { execFileSync } from "node:child_process";

const DEFAULT_BASE_URL = "https://amber-theta-three.vercel.app";
const baseUrl = (process.env.AMBER_PROD_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
const useVercelCurl = process.argv.includes("--vercel") || process.env.AMBER_SMOKE_VERCEL_CURL === "1";

interface RouteCheck {
  path: string;
  expectJson?: boolean;
  expectSubstring?: string;
}

const CHECKS: RouteCheck[] = [
  { path: "/", expectSubstring: "Amber" },
  { path: "/feed", expectSubstring: "Amber" },
  { path: "/compare", expectSubstring: "Amber" },
  { path: "/portfolio", expectSubstring: "Amber" },
  { path: "/arena", expectSubstring: "Amber" },
  { path: "/t/NVDA", expectSubstring: "NVDA" },
  { path: "/api/search-index", expectJson: true },
];

async function fetchRoute(url: string): Promise<{ status: number; body: string }> {
  if (useVercelCurl) {
    const out = execFileSync(
      "vercel",
      ["curl", url, "--", "--silent", "--show-error", "--write-out", "\n__STATUS__:%{http_code}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
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
      if (check.expectJson) {
        const parsed = JSON.parse(body) as unknown;
        if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) {
          console.error(`[smoke-prod] FAIL ${check.path}: empty JSON payload`);
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

await run();
