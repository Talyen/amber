import assert from "node:assert/strict";
import { test } from "node:test";
import { PILOT_TICKERS } from "../src/data/pilot-tickers.ts";
import { buildSearchIndexEntry } from "../src/data/search-index.ts";
import { exportComparisonCsv } from "../src/lib/export-csv.ts";

test("the comparison CSV quotes embedded carriage returns, newlines, commas, and quotes", async (t) => {
  const link = { href: "", download: "", click() {} };
  const document = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => link } });
  t.after(() => {
    if (document) Object.defineProperty(globalThis, "document", document);
    else Reflect.deleteProperty(globalThis, "document");
  });
  const files: Blob[] = [];
  t.mock.method(URL, "createObjectURL", (blob: Blob) => {
    files.push(blob);
    return "blob:fixture";
  });
  const company = buildSearchIndexEntry(PILOT_TICKERS[0]);
  exportComparisonCsv([{ ...company, name: "First\rSecond", sector: 'Cloud, "Software"\nServices' }]);
  const [file] = files;
  assert.ok(file);
  assert.ok((await file.text()).includes(`${company.ticker},"First\rSecond","Cloud, ""Software""\nServices",`));
  assert.equal(link.download, `amber-compare-${company.ticker.toLowerCase()}.csv`);
});
