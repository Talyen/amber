import test from "node:test";
import assert from "node:assert/strict";
import { computeShareholderYieldMetrics } from "../src/lib/finance.ts";
import {
  renderFilingAlertHtml,
  renderWatchlistDigestHtml,
} from "../src/lib/alert-email.ts";
import {
  normalizeSavedScreenFilters,
  normalizeSavedScreenName,
} from "../src/lib/saved-screens.ts";
import { readExploreLink, writeExploreLink } from "../src/lib/explore-link.ts";

test("computeShareholderYieldMetrics combines buybacks and dividends net of SBC", () => {
  const result = computeShareholderYieldMetrics({
    marketCap: 100_000,
    annuals: [
      {
        fiscalYear: "FY25",
        revenue: 25_000,
        operatingCashFlow: 9_000,
        capex: 1_000,
        sbc: 500,
        buybacks: 2_500,
        dividendsPaid: 3_000,
        dilutedShares: 1_000,
        netIncome: 4_000,
        depreciationAmortization: 2_000,
      },
    ],
  });

  assert.equal(result.dividendsPaid, 3_000);
  assert.equal(result.dividendYieldPct, 3);
  assert.equal(result.buybackYieldPct, 2.5);
  assert.equal(result.netBuybackYieldPct, 2);
  // (2500 + 3000 - 500) / 100000 = 5%
  assert.equal(result.totalShareholderYieldPct, 5);
  // True FCF = 9000 - 1000 - 500 = 7500 -> 3000 / 7500 = 40%
  assert.equal(result.dividendPayoutTrueFcfPct, 40);
  // FFO = 4000 + 2000 = 6000 -> 3000 / 6000 = 50%
  assert.equal(result.dividendPayoutFfoPct, 50);
});

test("renderFilingAlertHtml embeds Filing Diff Radar highlights and escapes HTML", () => {
  const html = renderFilingAlertHtml({
    companyName: "Acme & Co",
    ticker: "ACME",
    filingType: "10-K",
    filingDate: "2026-11-24",
    accession: "0001-26-000001",
    companyUrl: "https://amber.example/t/ACME",
    unsubscribeUrl: "https://amber.example/api/alerts/manage?action=unsubscribe&token=abc",
    highlights: [
      {
        materiality: "High",
        section: "Risk Factors",
        headline: "Customer concentration <increased>",
        summary: "Top customer rose to 28% of revenue.",
      },
    ],
  });

  assert.match(html, /FILING DIFF RADAR HIGHLIGHTS/);
  assert.match(html, /Acme &amp; Co/);
  assert.match(html, /Customer concentration &lt;increased&gt;/);
});

test("renderWatchlistDigestHtml formats multi-signal digest cleanly", () => {
  const html = renderWatchlistDigestHtml({
    dateLabel: "2026-11-25",
    siteUrl: "https://amber.example",
    items: [
      {
        ticker: "MSFT",
        kind: "10-K/10-Q Diff",
        date: "2026-11-24",
        headline: "[High] CapEx guidance raised",
        detail: "Cloud infrastructure spend accelerated.",
      },
      {
        ticker: "JPM",
        kind: "Form 4 Buy",
        date: "2026-11-24",
        headline: "Jane Doe (CFO) bought $1.50M",
        detail: "Open-market Form 4 purchase.",
      },
    ],
  });

  assert.match(html, /WATCHLIST DIGEST/);
  assert.match(html, /2 new SEC signals/);
  assert.match(html, /MSFT/);
  assert.match(html, /Form 4 Buy/);
});

test("saved screen normalization validates names and numeric filter keys", () => {
  assert.equal(normalizeSavedScreenName("  Quality   Banks  "), "Quality Banks");
  assert.equal(normalizeSavedScreenName("a"), null);

  const filters = normalizeSavedScreenFilters({
    sector: "Financials",
    minRotce: "14",
    maxPtbv: "2.5",
    minShareholderYield: "not-a-number",
    unknownKey: "ignored",
  });
  assert.deepEqual(filters, {
    sector: "Financials",
    minRotce: "14",
    maxPtbv: "2.5",
  });
});

test("explore-link preserves sector-native and thesis IRR filters in URL params", () => {
  const params = new URLSearchParams();
  writeExploreLink(
    params,
    {
      sector: "Financials",
      sortKey: "marketCap",
      sortDir: "desc",
      shy: "4",
      ptbv: "2.5",
      rotce: "15",
      pffo: "16",
      irr: "12",
    },
    null,
    null
  );

  const parsed = readExploreLink(
    params,
    null,
    [],
    ["All", "Financials"],
    () => ["marketCap"]
  );
  assert.equal(parsed.sector, "Financials");
  assert.equal(parsed.shy, "4");
  assert.equal(parsed.ptbv, "2.5");
  assert.equal(parsed.rotce, "15");
  assert.equal(parsed.pffo, "16");
  assert.equal(parsed.irr, "12");
});
