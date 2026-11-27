import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicCompanyPayload,
  formatCompanyMarkdown,
  sectorSlug,
} from "../src/lib/agentic-data.ts";
import type { CompanySnapshot } from "../src/lib/finance.ts";
import { extractSiteHost } from "../src/lib/site.ts";

test("extractSiteHost cleanly derives bare host for watermarks and embeds", () => {
  assert.equal(extractSiteHost("https://amber.finance"), "amber.finance");
  assert.equal(extractSiteHost("https://amber.finance/"), "amber.finance");
  assert.equal(
    extractSiteHost("https://amber-theta-three.vercel.app"),
    "amber-theta-three.vercel.app"
  );
  assert.equal(extractSiteHost("http://localhost:3000/t/NVDA"), "localhost:3000");
});

test("sectorSlug normalizes sector names cleanly", () => {
  assert.equal(sectorSlug("Technology"), "technology");
  assert.equal(sectorSlug("Consumer Discretionary"), "consumer-discretionary");
  assert.equal(sectorSlug("Energy & Materials"), "energy-and-materials");
});

test("buildPublicCompanyPayload and formatCompanyMarkdown produce citation-ready agent output", () => {
  const company: CompanySnapshot = {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    tagline: "Accelerated computing & AI infrastructure",
    cik: "0001045810",
    exchange: "NASDAQ",
    sector: "Technology",
    price: 140,
    marketCap: 3_400_000,
    cashAndEquiv: 38_000,
    totalDebt: 10_000,
    defaultDcf: {
      wacc: 10,
      terminalMultiple: 22,
      targetFcfMargin: 42,
      sbcDragPct: 4,
    },
    lastFiling: {
      type: "10-K",
      date: "2026-02-26",
      periodEnd: "2026-01-26",
      accessionNumber: "0001045810-26-000010",
    },
    annuals: [
      {
        fiscalYear: "FY24",
        revenue: 60_922,
        operatingIncome: 32_972,
        netIncome: 29_760,
        operatingCashFlow: 28_090,
        capex: 1_069,
        sbc: 3_549,
        buybacks: 9_533,
        dilutedShares: 24_940,
      },
      {
        fiscalYear: "FY25",
        revenue: 130_497,
        operatingIncome: 81_453,
        netIncome: 72_880,
        operatingCashFlow: 64_089,
        capex: 3_236,
        sbc: 4_737,
        buybacks: 33_706,
        dilutedShares: 24_650,
      },
    ],
    filingDiffs: [],
  };

  const payload = buildPublicCompanyPayload(company, []);
  assert.equal(payload.ticker, "NVDA");
  assert.equal(payload.sector_slug, "technology");
  assert.ok(payload.urls.overview.endsWith("/t/NVDA"));
  assert.ok(payload.urls.sbc_and_true_fcf.endsWith("/t/NVDA/sbc"));
  assert.ok(payload.urls.valuation.endsWith("/t/NVDA/valuation"));
  assert.ok(payload.urls.rss.endsWith("/t/NVDA/feed.xml"));

  const md = formatCompanyMarkdown(payload);
  assert.ok(md.includes("# NVIDIA Corporation (NVDA)"));
  assert.ok(md.includes("True FCF (FCF − SBC)"));
  assert.ok(md.includes("/t/NVDA/valuation"));
});
