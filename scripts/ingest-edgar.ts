/**
 * Deterministic SEC EDGAR Batch Ingestion Script (v1 Foundation)
 *
 * Fetches structured XBRL CompanyFacts and latest 10-K/10-Q metadata from the
 * official free SEC EDGAR API (data.sec.gov) without any live per-user LLM calls.
 *
 * Usage:
 *   SEC_USER_AGENT="AmberFinance your@email.com" pnpm ingest:edgar
 */

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "AmberFinance research@amber.example";

const PILOT_CIKS: Record<string, string> = {
  PLTR: "0001321655",
  NVDA: "0001045810",
  MSFT: "0000789019",
  SNOW: "0001640147",
  SHOP: "0001594805",
  COST: "0000909832",
};

interface XbrlFactUnit {
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
}

interface CompanyFactsResponse {
  entityName: string;
  facts?: {
    "us-gaap"?: Record<
      string,
      {
        units?: Record<string, XbrlFactUnit[]>;
      }
    >;
  };
}

async function fetchSecJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`SEC EDGAR request failed (${res.status}): ${url}`);
  }
  return (await res.json()) as T;
}

function extractLatestAnnualValue(
  facts: CompanyFactsResponse,
  tagCandidates: string[],
  unit: "USD" | "shares"
): { fy: number; val: number; filed: string; accn: string } | null {
  const gaap = facts.facts?.["us-gaap"];
  if (!gaap) return null;

  for (const tag of tagCandidates) {
    const entries = gaap[tag]?.units?.[unit];
    if (!entries?.length) continue;

    const annuals = entries
      .filter((e) => e.form === "10-K" && e.fp === "FY")
      .sort((a, b) => b.end.localeCompare(a.end));

    if (annuals.length > 0) {
      const latest = annuals[0];
      return {
        fy: latest.fy,
        val: latest.val,
        filed: latest.filed,
        accn: latest.accn,
      };
    }
  }

  return null;
}

async function run() {
  console.log(`[amber-ingest] Starting SEC EDGAR sync with User-Agent: ${SEC_USER_AGENT}`);

  for (const [ticker, cik] of Object.entries(PILOT_CIKS)) {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    try {
      const data = await fetchSecJson<CompanyFactsResponse>(url);

      const ocf = extractLatestAnnualValue(
        data,
        ["NetCashProvidedByUsedInOperatingActivities"],
        "USD"
      );
      const capex = extractLatestAnnualValue(
        data,
        ["PaymentsToAcquirePropertyPlantAndEquipment"],
        "USD"
      );
      const sbc = extractLatestAnnualValue(
        data,
        ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
        "USD"
      );

      console.log(
        `[amber-ingest] ${ticker} (${data.entityName}): OCF=${ocf ? `$${(ocf.val / 1e6).toFixed(0)}M` : "n/a"}, CapEx=${capex ? `$${(capex.val / 1e6).toFixed(0)}M` : "n/a"}, SBC=${sbc ? `$${(sbc.val / 1e6).toFixed(0)}M` : "n/a"}`
      );
    } catch (err) {
      console.error(`[amber-ingest] Failed for ${ticker}:`, err);
    }

    // Respect SEC EDGAR fair-access rate limit (<10 req/sec)
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log("[amber-ingest] Sync complete.");
}

run();
