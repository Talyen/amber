import assert from "node:assert/strict";
import test from "node:test";
import { resolveComparisonTickers } from "../src/lib/compare.ts";
import { readExploreLink, writeExploreLink } from "../src/lib/explore-link.ts";
import { valuationModelFromUrl } from "../src/lib/valuation-link.ts";

const buybacks = { id: "buyback-cannibals", defaultSortKey: "netDilutionCagr", defaultSortDir: "asc" } as const;
const exploreSortKeys = () => ["marketCap", "netDilutionCagr", "trueFcf"] as const;

test("round-trips the sector and non-default sort on an Explore lens", () => {
  const params = new URLSearchParams("source=shared");
  writeExploreLink(params, {
    sector: "Semiconductors",
    sortKey: "marketCap",
    sortDir: "desc",
    fcf: " 20 ",
    sbc: "",
    imp: "",
    dil: "",
  }, buybacks, null);
  assert.deepEqual(readExploreLink(params, null, [buybacks], ["Semiconductors"], exploreSortKeys), {
    lensId: buybacks.id,
    sector: "Semiconductors",
    sortKey: "marketCap",
    sortDir: "desc",
    fcf: "20",
    sbc: "",
    imp: "",
    dil: "",
  });
  assert.equal(params.get("source"), "shared");
});

test("restores a legacy descending sort and validates Explore filters", () => {
  const params = new URLSearchParams("sort=trueFcf&sector=Missing&fcf=garbage");
  const state = readExploreLink(params, buybacks, [buybacks], ["Semiconductors"], exploreSortKeys);
  assert.equal(state.sortKey, "trueFcf");
  assert.equal(state.sortDir, "desc");
  assert.equal(state.sector, "All");
  assert.equal(state.fcf, "");

  writeExploreLink(params, { ...state, sortKey: "marketCap" }, null, buybacks);
  assert.equal(readExploreLink(params, buybacks, [buybacks], [], exploreSortKeys).lensId, null);
});

test("restores legacy valuation links that also specify the Valuation tab", () => {
  assert.equal(valuationModelFromUrl(new URLSearchParams("tab=dcf&wacc=12&margin=1.5")), "reverse");
  assert.equal(valuationModelFromUrl(new URLSearchParams("tab=dcf&rev=15&exit=22")), "scenario");
  assert.equal(valuationModelFromUrl(new URLSearchParams("tab=dcf")), null);
});

test("uses the explicitly selected valuation model when both sets of assumptions are present", () => {
  assert.equal(valuationModelFromUrl(new URLSearchParams("model=reverse&rev=15&wacc=12")), "reverse");
  assert.equal(valuationModelFromUrl(new URLSearchParams("model=scenario&rev=15&wacc=12")), "scenario");
});

test("rejects comparison slugs with missing, unknown, or repeated companies", () => {
  const available = new Set(["NVDA", "AMD", "MSFT", "AAPL", "COST"]);
  assert.deepEqual(resolveComparisonTickers("nvda-vs-amd", available), ["NVDA", "AMD"]);
  assert.deepEqual(resolveComparisonTickers("NVDA-vs-AMD-vs-MSFT-vs-AAPL", available), [
    "NVDA", "AMD", "MSFT", "AAPL",
  ]);
  for (const slug of [
    "NVDA",
    "NVDA-vs-NOTREAL",
    "NVDA-vs-nvda",
    "NVDA-vs--vs-AMD",
    "NVDA-vs-AMD-vs-MSFT-vs-AAPL-vs-COST",
  ]) {
    assert.deepEqual(resolveComparisonTickers(slug, available), [], slug);
  }
});
