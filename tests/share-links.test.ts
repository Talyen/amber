import assert from "node:assert/strict";
import test from "node:test";
import { resolveComparisonTickers } from "../src/lib/compare.ts";
import { valuationModelFromUrl } from "../src/lib/valuation-link.ts";

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
