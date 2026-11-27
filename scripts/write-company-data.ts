import fs from "node:fs";
import path from "node:path";
import { buildSearchIndexEntry, toSearchIndexEntry } from "../src/data/search-index.ts";
import type { CompanySnapshot } from "../src/lib/finance.ts";

function writeRows(filename: string, rows: object[]) {
  // Keep generated diffs readable at the company level.
  fs.writeFileSync(filename, `[\n${rows.map((row) => JSON.stringify(row)).join(",\n")}\n]\n`);
}

export function writeCompanyData(outDir: string, snapshots: CompanySnapshot[]) {
  writeRows(path.join(outDir, "companies.json"), snapshots);
  writeRows(path.join(outDir, "search-index.json"), snapshots.map((snapshot) => toSearchIndexEntry(buildSearchIndexEntry(snapshot))));
}
