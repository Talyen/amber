/**
 * Batch SEC Form 8-K Material Event Ingestion (Zero-Cost, Deterministic)
 *
 * Fetches recent SEC Form 8-K submissions from EDGAR for the Amber universe
 * and filters strictly to high-signal material items that brokers bury:
 *  - Item 1.01 / 2.01: Material Definitive Agreements & Acquisitions/Dispositions
 *  - Item 2.05 / 2.06: Restructuring Costs & Material Impairments
 *  - Item 4.02: Non-Reliance on Previously Issued Financial Statements (Restatements)
 *  - Item 5.02: CEO / CFO / Director Departure or Appointment
 *
 * Usage:
 *   SEC_USER_AGENT="AmberFinance research@amber.example" DATABASE_URL=... pnpm ingest:8k
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { filingDiffs } from "../src/db/schema.ts";
import { filingCutoffDate, MATERIAL_EVENT_LOOKBACK_DAYS } from "../src/lib/filing-lookback.ts";

const USER_AGENT =
  process.env.SEC_USER_AGENT || "AmberFinance research@amber.example";
const MAX_TICKERS = Number(process.env.MAX_8K_TICKERS || "650");
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_8K_DAYS || MATERIAL_EVENT_LOOKBACK_DAYS);
const REQUEST_DELAY_MS = 135; // Stay comfortably under SEC EDGAR 10 req/sec limit

interface HighSignalItemMeta {
  code: string;
  label: string;
  category:
    | "Risk Factors"
    | "Customer Concentration"
    | "Executive Comp"
    | "Capital Allocation";
  materiality: "High" | "Medium";
  signalNote: string;
}

const HIGH_SIGNAL_ITEMS: Record<string, HighSignalItemMeta> = {
  "4.02": {
    code: "4.02",
    label: "Financial Restatement / Non-Reliance",
    category: "Risk Factors",
    materiality: "High",
    signalNote:
      "Item 4.02 signals previously issued financials should not be relied upon — one of the highest-severity red flags in SEC filings.",
  },
  "5.02": {
    code: "5.02",
    label: "Executive or Board Change",
    category: "Executive Comp",
    materiality: "High",
    signalNote:
      "Leadership turnover (CEO, CFO, or Board departures/appointments) often precedes strategic or guidance shifts.",
  },
  "2.01": {
    code: "2.01",
    label: "Completed Acquisition or Disposition",
    category: "Capital Allocation",
    materiality: "High",
    signalNote:
      "Material M&A or asset divestiture alters revenue mix, balance sheet leverage, and capital return capacity.",
  },
  "2.05": {
    code: "2.05",
    label: "Restructuring or Exit Activities",
    category: "Capital Allocation",
    materiality: "High",
    signalNote:
      "Management committed to a formal restructuring plan (layoffs, facility exits, or reorganization charges).",
  },
  "2.06": {
    code: "2.06",
    label: "Material Asset Impairment",
    category: "Risk Factors",
    materiality: "High",
    signalNote:
      "Write-down of goodwill, intangibles, or operating assets indicates prior capital allocation underperformed expectations.",
  },
  "1.01": {
    code: "1.01",
    label: "Material Definitive Agreement",
    category: "Capital Allocation",
    materiality: "Medium",
    signalNote:
      "New major commercial contract, credit facility, or strategic partnership outside the ordinary course of business.",
  },
};

interface SubmissionsJson {
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      form?: string[];
      items?: Array<string | string[]>;
      primaryDocDescription?: string[];
    };
  };
}

export async function fetch8KSubmissions(
  cik: string,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<SubmissionsJson> {
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      if (attempt >= 2) throw error;
      await wait(500 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      const data = await response.json() as SubmissionsJson;
      if (!Array.isArray(data.filings?.recent?.form)) throw new Error("Missing SEC submissions");
      return data;
    }
    if ((response.status !== 429 && response.status < 500) || attempt >= 2) {
      throw new Error(`SEC submissions returned HTTP ${response.status}`);
    }
    await wait(500 * 2 ** attempt);
  }
}

async function main() {
  const companiesPath = path.join(
    process.cwd(),
    "src/data/generated/companies.json"
  );
  if (!fs.existsSync(companiesPath)) {
    console.error("Missing src/data/generated/companies.json");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(companiesPath, "utf8"));
  const list: Array<{ ticker: string; cik: string; name: string }> =
    Array.isArray(raw) ? raw : Object.values(raw);
  const targets = list.slice(0, MAX_TICKERS);

  const cutoffDate = filingCutoffDate(new Date(), LOOKBACK_DAYS);

  const dbUrl = process.env.DATABASE_URL;
  const db = dbUrl ? drizzle(neon(dbUrl)) : null;

  let scanned = 0;
  let failed = 0;
  let writeFailures = 0;
  let foundEvents = 0;

  for (const company of targets) {
    const paddedCik = String(company.cik).replace(/\D/g, "").padStart(10, "0");
    if (!paddedCik || paddedCik === "0000000000") continue;

    try {
      const data = await fetch8KSubmissions(paddedCik);
      scanned++;
      const recent = data.filings?.recent;
      const forms = recent?.form ?? [];
      const dates = recent?.filingDate ?? [];
      const accns = recent?.accessionNumber ?? [];
      const itemsArr = recent?.items ?? [];

      const rowsToUpsert: Array<typeof filingDiffs.$inferInsert> = [];

      for (let i = 0; i < forms.length; i++) {
        if (forms[i] !== "8-K" && forms[i] !== "8-K/A") continue;
        const filingDate = dates[i] ?? "";
        if (!filingDate || filingDate < cutoffDate) break;

        const rawItemEntry = itemsArr[i];
        const rawItems = Array.isArray(rawItemEntry)
          ? rawItemEntry
          : typeof rawItemEntry === "string"
            ? rawItemEntry.split(",").map((s) => s.trim()).filter(Boolean)
            : [];
        const matched = rawItems
          .map((code) => HIGH_SIGNAL_ITEMS[code])
          .filter((m): m is HighSignalItemMeta => Boolean(m));

        if (matched.length === 0) continue;

        const primary =
          matched.find((m) => m.materiality === "High") ?? matched[0];
        const accn = accns[i];
        if (!accn) continue;
        const itemCodes = matched.map((m) => `Item ${m.code}`).join(", ");
        const id = `${company.ticker}:8K:${accn}`;

        rowsToUpsert.push({
          id,
          ticker: company.ticker,
          filingType: "8-K",
          filingDate,
          accessionNumber: accn,
          section: itemCodes,
          category: primary.category,
          materiality: primary.materiality,
          headline: `${primary.label} (${itemCodes})`,
          summary: `${company.name} filed SEC Form ${forms[i]} on ${filingDate} disclosing ${matched
            .map((m) => `${m.label} (Item ${m.code})`)
            .join(" and ")}.`,
          priorExcerpt: "Prior periodic filing did not reflect this current-report event.",
          currentExcerpt: `SEC Form ${forms[i]} filed ${filingDate} under ${itemCodes}: ${matched
            .map((m) => m.label)
            .join("; ")}. Inspect the full EDGAR filing for exact terms.`,
          signalNote: primary.signalNote,
          source: "sec-8k",
        });

        if (rowsToUpsert.length >= 4) break;
      }

      if (rowsToUpsert.length > 0 && db) {
        try {
          for (const row of rowsToUpsert) {
            await db
              .insert(filingDiffs)
              .values(row)
              .onConflictDoUpdate({
                target: filingDiffs.id,
                set: {
                  headline: row.headline,
                  summary: row.summary,
                  signalNote: row.signalNote,
                  materiality: row.materiality,
                },
              });
          }
        } catch {
          writeFailures++;
          console.error(`[ingest:8k] Could not save events for ${company.ticker}.`);
          continue;
        }
      }
      foundEvents += rowsToUpsert.length;
    } catch (error) {
      failed++;
      console.warn(`[ingest:8k] ${company.ticker} scan failed:`, error);
    } finally {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(
    `[ingest:8k] Scanned ${scanned} tickers, captured ${foundEvents} high-signal 8-K events (cutoff ${cutoffDate}, ${failed} scan failures, ${writeFailures} write failures).`
  );
  if (scanned === 0 || writeFailures > 0) throw new Error("8-K ingestion did not complete successfully.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
