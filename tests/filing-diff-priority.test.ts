import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPreprocessedPeriodicAccession,
  prioritizeDiffTargets,
  type TargetCompany,
} from "../scripts/extract-filing-diffs.ts";

describe("Filing diff target prioritization", () => {
  const nowMs = Date.parse("2026-11-25T00:00:00Z");

  it("orders watchlisted/alerted tickers first, then fresh filings, then market-cap backfill, skipping processed accessions", () => {
    const companies: TargetCompany[] = [
      {
        ticker: "DONE",
        cik: "0000000001",
        name: "Already Done MegaCap",
        marketCap: 3_000_000,
        lastFilingType: "10-Q",
        lastFilingDate: "2026-11-24",
        lastFilingAccession: "0001-26-000001",
      },
      {
        ticker: "OLDMEGA",
        cik: "0000000002",
        name: "Old MegaCap",
        marketCap: 2_000_000,
        lastFilingType: "10-K",
        lastFilingDate: "2026-08-01",
        lastFilingAccession: "0002-26-000001",
      },
      {
        ticker: "FRESH",
        cik: "0000000003",
        name: "Fresh Filer",
        marketCap: 50_000,
        lastFilingType: "10-Q",
        lastFilingDate: "2026-11-22",
        lastFilingAccession: "0003-26-000001",
      },
      {
        ticker: "WATCH",
        cik: "0000000004",
        name: "Watchlisted MidCap",
        marketCap: 20_000,
        lastFilingType: "10-K",
        lastFilingDate: "2026-10-01",
        lastFilingAccession: "0004-26-000001",
      },
      {
        ticker: "OLDMID",
        cik: "0000000005",
        name: "Old MidCap",
        marketCap: 100_000,
        lastFilingType: "10-K",
        lastFilingDate: "2026-09-01",
        lastFilingAccession: "0005-26-000001",
      },
    ];

    const processedByTicker = new Map<string, Set<string>>([
      ["DONE", new Set(["0001-26-000001"])],
    ]);
    const priorityTickers = new Set(["WATCH"]);

    const { ordered, preSkipped } = prioritizeDiffTargets(companies, {
      priorityTickers,
      processedByTicker,
      nowMs,
    });

    assert.equal(preSkipped, 1);
    assert.deepEqual(
      ordered.map((c) => c.ticker),
      ["WATCH", "FRESH", "OLDMEGA", "OLDMID"]
    );
  });

  it("does not pre-skip non-periodic filing types such as 20-F", () => {
    const processed = new Map([["PDD", new Set(["acc-20f"])]]);
    assert.equal(
      isPreprocessedPeriodicAccession(
        { ticker: "PDD", lastFilingType: "20-F", lastFilingAccession: "acc-20f" },
        processed
      ),
      false
    );
    assert.equal(
      isPreprocessedPeriodicAccession(
        { ticker: "NVDA", lastFilingType: "10-K", lastFilingAccession: "acc-20f" },
        new Map([["NVDA", new Set(["acc-20f"])]])
      ),
      true
    );
  });
});
