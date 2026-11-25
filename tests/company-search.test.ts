import assert from "node:assert/strict";
import { test } from "node:test";
import { searchCompanies } from "../src/lib/company-search.ts";

test("puts an exact ticker first even when larger prefix matches would fill the results", () => {
  const dell = { ticker: "DELL", name: "Dell Technologies", sector: "Technology", marketCap: 250 };
  const deere = { ticker: "DE", name: "Deere", sector: "Industrials", marketCap: 100 };
  const entries = [dell, deere];

  assert.deepEqual(searchCompanies(entries, " de ", 1), [deere]);
  assert.deepEqual(searchCompanies(entries, "", 2), [dell, deere]);
  assert.deepEqual(searchCompanies(entries, "industrials", 2), [deere]);
  assert.deepEqual(entries, [dell, deere]);
});
