import assert from "node:assert/strict";
import { test } from "node:test";
import { extractSingleQuarterMap } from "../scripts/ingest-edgar.ts";

function fact(start: string, end: string, val: number, filed: string, form = "10-Q") {
  return { start, end, val, filed, form, accn: filed };
}

test("fills quarters from adjacent YTD facts even with years of standalone facts", () => {
  const historical = [2020, 2021, 2022, 2023, 2024].map((year) =>
    fact(`${year}-01-01`, `${year}-03-31`, 30, `${year}-05-01`)
  );
  const primary = [
    ...historical,
    fact("2025-01-01", "2025-03-31", 40, "2025-05-01"),
    fact("2025-01-01", "2025-06-30", 110, "2025-09-01", "10-Q/A"),
    fact("2025-01-01", "2025-06-30", 90, "2025-08-01"),
    fact("2025-01-01", "2025-09-30", 160, "2025-11-01"),
    fact("2025-01-01", "2025-12-31", 245, "2026-02-01", "10-K"),
    fact("2026-01-01", "2026-03-31", 80, "2026-05-01"),
    fact("2026-01-01", "2026-09-30", 300, "2026-11-01"),
  ];
  const facts = {
    entityName: "Example",
    facts: { "us-gaap": {
      Preferred: { units: { USD: primary } },
      Fallback: { units: { USD: [
        fact("2025-04-01", "2025-06-30", 999, "2025-10-01"),
        fact("2026-04-01", "2026-06-30", 100, "2026-08-01"),
      ] } },
    } },
  };
  const quarters = extractSingleQuarterMap(facts, ["Preferred", "Fallback"], "USD");

  assert.equal(quarters.get("2025-06-30"), 70);
  assert.equal(quarters.get("2025-09-30"), 50);
  assert.equal(quarters.get("2025-12-31"), 85);
  assert.equal(quarters.get("2026-06-30"), 100);
  assert.equal(quarters.has("2026-09-30"), false);
});

test("uses reported quarterly share averages and ignores cumulative averages", () => {
  const facts = {
    entityName: "Example",
    facts: { "us-gaap": {
      Shares: { units: { shares: [
        fact("2025-01-01", "2025-03-31", 100, "2025-05-01"),
        fact("2025-01-01", "2025-06-30", 105, "2025-08-01"),
        fact("2025-01-01", "2025-09-30", 110, "2025-11-01"),
        fact("2025-07-01", "2025-09-30", 115, "2025-11-01"),
      ] } },
    } },
  };
  assert.deepEqual(
    extractSingleQuarterMap(facts, ["Shares"], "shares"),
    new Map([["2025-03-31", 100], ["2025-09-30", 115]])
  );
});
