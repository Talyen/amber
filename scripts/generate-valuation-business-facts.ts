import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { CompanySnapshot } from "../src/lib/finance.ts";
import type { ValuationBusinessFacts } from "../src/lib/valuation-business.ts";
import { readValuationBusinessFacts } from "./sec-business-facts.ts";
import { secFilingInstanceUrl } from "./sec-business-instance.ts";

// Bootstrap existing snapshots from cached SEC submissions and Company Facts.
// Routine EDGAR ingestion refreshes the same facts directly on each snapshot.
const [cache, output, ...snapshots] = process.argv.slice(2);
if (!cache || !output || !snapshots.length) {
  throw new Error("Usage: node scripts/generate-valuation-business-facts.ts SEC_CACHE OUTPUT SNAPSHOT...");
}
const companies = new Map<string, CompanySnapshot["lastFiling"]>();
for (const path of snapshots) {
  for (const row of JSON.parse(await readFile(path, "utf8")) as CompanySnapshot[]) {
    if (!row.cik || !/^\d{1,10}$/.test(row.cik) || !row.lastFiling?.periodEnd || !row.lastFiling.date) continue;
    const cik = row.cik.padStart(10, "0");
    const previous = companies.get(cik);
    if (!previous || row.lastFiling.periodEnd > previous.periodEnd ||
        (row.lastFiling.periodEnd === previous.periodEnd && row.lastFiling.date > previous.date)) {
      companies.set(cik, row.lastFiling);
    }
  }
}

const generated: Record<string, ValuationBusinessFacts> = {};
const unavailable = new Set<string>();
for (const [cik, filing] of [...companies.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const profile = JSON.parse(await readFile(join(cache, `submissions-${cik}.json`), "utf8"));
  const { facts } = JSON.parse(await readFile(join(cache, `sec-${cik}.json`), "utf8"));
  const extracted = await readValuationBusinessFacts(facts, Number(profile.sic), filing, cik, async () => {
    const recent = profile.filings?.recent;
    const document = recent?.primaryDocument?.[recent.accessionNumber.indexOf(filing.accessionNumber)];
    const url = secFilingInstanceUrl(cik, filing.accessionNumber, document);
    if (!url) { unavailable.add(cik); return; }
    const path = join(cache, `filing-${cik}-${filing.accessionNumber}.xml`);
    const cached = await readFile(path, "utf8").catch(() => undefined);
    if (cached) return cached;
    await sleep(180);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": process.env.SEC_USER_AGENT ?? "AmberStocks valuation research support@amberstocks.com" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) { unavailable.add(cik); return; }
      const xml = await response.text();
      await writeFile(path, xml);
      return xml;
    } catch {
      unavailable.add(cik);
    }
  });
  if (extracted) generated[cik] = extracted;
}
await writeFile(output, `{\n${Object.entries(generated).map(([cik, facts]) =>
  `  "${cik}": ${JSON.stringify(facts)}`).join(",\n")}\n}\n`);
console.log(JSON.stringify({ companies: companies.size, evidence: Object.keys(generated).length, unavailableInstances: [...unavailable] }));
