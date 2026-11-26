/**
 * Batch SEC DEF 14A Proxy Executive Compensation & SBC Alignment Ingestion
 *
 * Scans recent DEF 14A proxy statements from SEC EDGAR for tracked companies,
 * SQL pre-skips already-processed accessions, and extracts high-signal
 * executive compensation & equity-plan dilution highlights into `filing_diffs`.
 *
 * Usage:
 *   SEC_USER_AGENT="AmberFinance research@amber.example" DATABASE_URL=... pnpm ingest:proxy
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { filingDiffs } from "../src/db/schema.ts";

const USER_AGENT =
  process.env.SEC_USER_AGENT || "AmberFinance research@amber.example";
const MAX_TICKERS = Number(process.env.MAX_PROXY_TICKERS || "120");
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_PROXY_DAYS || "365");
const REQUEST_DELAY_MS = 140;

interface ProxyHighlight {
  materiality: "High" | "Medium" | "Watch";
  headline: string;
  summary: string;
  excerpt: string;
  signalNote: string;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&rsquo;|&#8217;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function findWindow(text: string, pattern: RegExp, radius = 220): string | null {
  const m = pattern.exec(text);
  if (!m || m.index === undefined) return null;
  const start = Math.max(0, m.index - 80);
  const end = Math.min(text.length, m.index + m[0].length + radius);
  return text.slice(start, end).trim();
}

export function extractProxyCompHighlights(
  plainText: string,
  ticker: string
): ProxyHighlight | null {
  if (!plainText || plainText.length < 400) return null;

  const equityPlanExcerpt = findWindow(
    plainText,
    /\b(?:approve|amendment to|increase the number of shares|additional)\b[^.]{0,120}\b(?:equity incentive plan|stock incentive plan|omnibus incentive plan|shares reserved for issuance)\b/i
  );

  const sayOnPayExcerpt = findWindow(
    plainText,
    /\b(?:say[- ]on[- ]pay|advisory vote to approve executive compensation|pay versus performance|summary compensation table)\b/i
  );

  const ceoPayRatioMatch = plainText.match(
    /\bCEO\s+pay\s+ratio[^.]{0,140}?(\d{1,4}(?:,\d{3})?\s*(?:to|:)\s*1)/i
  );

  const shareRequestMatch = plainText.match(
    /\b(?:increase|add|reserve|authorize)[^.]{0,80}?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*million)\s+(?:additional\s+)?(?:shares|common\s+stock)/i
  );

  if (equityPlanExcerpt && shareRequestMatch) {
    return {
      materiality: "High",
      headline: `Proxy proposes ${shareRequestMatch[1]} shares for equity incentive plan`,
      summary: `${ticker}'s annual DEF 14A proxy requests shareholder approval for additional equity-plan share reserves (${shareRequestMatch[1]} shares), directly affecting future SBC run-rate and dilution.`,
      excerpt: equityPlanExcerpt.slice(0, 320),
      signalNote:
        "Review equity-plan share requests alongside Amber's 4-year net dilution and SBC-to-FCF ratio to verify whether management is constraining share overhang.",
    };
  }

  if (ceoPayRatioMatch || sayOnPayExcerpt) {
    const ratioNote = ceoPayRatioMatch
      ? ` Reported CEO pay ratio: ${ceoPayRatioMatch[1]}.`
      : "";
    return {
      materiality: "Medium",
      headline: `Annual DEF 14A proxy details executive pay & SBC alignment`,
      summary: `${ticker} filed its annual proxy statement covering executive compensation structure, Pay vs. Performance disclosures, and Say-on-Pay voting.${ratioNote}`,
      excerpt: (sayOnPayExcerpt ?? equityPlanExcerpt ?? plainText.slice(0, 300)).slice(0, 320),
      signalNote:
        "Compare management's performance-vesting metrics (PSUs vs. time-based RSUs) against True FCF per share growth.",
    };
  }

  return null;
}

interface SubmissionsJson {
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      form?: string[];
      primaryDocument?: string[];
    };
  };
}

async function fetchSecText(url: string, wait: (ms: number) => Promise<void> = sleep): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 || res.status >= 500) {
        await wait(600 * 2 ** attempt);
        continue;
      }
      if (!res.ok) return null;
      return await res.text();
    } catch {
      if (attempt < 2) await wait(600 * 2 ** attempt);
    }
  }
  return null;
}

export async function runProxyIngestion() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("[amber-proxy] Skipping DEF 14A ingestion (DATABASE_URL not set).");
    return;
  }

  const companiesPath = path.resolve(process.cwd(), "src/data/generated/companies.json");
  if (!fs.existsSync(companiesPath)) {
    console.log("[amber-proxy] companies.json not found; skipping.");
    return;
  }

  const allCompanies = JSON.parse(fs.readFileSync(companiesPath, "utf8")) as Array<{
    ticker: string;
    cik: string;
  }>;
  const targets = allCompanies.slice(0, Math.max(1, MAX_TICKERS));
  const cutoffIso = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const db = drizzle(neon(databaseUrl));
  const existingRows = await db
    .select({ accessionNumber: filingDiffs.accessionNumber })
    .from(filingDiffs)
    .where(eq(filingDiffs.filingType, "DEF 14A"));
  const seenAccessions = new Set(existingRows.map((r) => r.accessionNumber));

  let scanned = 0;
  let inserted = 0;

  for (const company of targets) {
    const cik = company.cik.padStart(10, "0");
    const subText = await fetchSecText(`https://data.sec.gov/submissions/CIK${cik}.json`);
    await sleep(REQUEST_DELAY_MS);
    if (!subText) continue;
    scanned++;

    let subs: SubmissionsJson;
    try {
      subs = JSON.parse(subText) as SubmissionsJson;
    } catch {
      continue;
    }

    const recent = subs.filings?.recent;
    if (!recent?.form || !recent.accessionNumber || !recent.filingDate || !recent.primaryDocument) {
      continue;
    }

    let matchIdx = -1;
    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] !== "DEF 14A") continue;
      if (recent.filingDate[i] < cutoffIso) break;
      matchIdx = i;
      break;
    }
    if (matchIdx === -1) continue;

    const accession = recent.accessionNumber[matchIdx];
    if (seenAccessions.has(accession)) continue;
    const filingDate = recent.filingDate[matchIdx];
    const primaryDoc = recent.primaryDocument[matchIdx];
    const cikNumeric = String(Number(cik));
    const accCompact = accession.replace(/-/g, "");
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accCompact}/${primaryDoc}`;

    const html = await fetchSecText(docUrl);
    await sleep(REQUEST_DELAY_MS);
    if (!html) continue;

    // Limit parse slice to first 450KB to stay fast and memory-safe
    const plainText = stripHtmlToText(html.slice(0, 450_000));
    const highlight = extractProxyCompHighlights(plainText, company.ticker);
    if (!highlight) continue;

    const id = `${company.ticker.toLowerCase()}-def14a-${accCompact}`;
    await db
      .insert(filingDiffs)
      .values({
        id,
        ticker: company.ticker,
        filingType: "DEF 14A",
        filingDate,
        accessionNumber: accession,
        section: "Executive Comp & SBC",
        category: "Executive Comp",
        materiality: highlight.materiality,
        headline: highlight.headline,
        summary: highlight.summary,
        priorExcerpt: "Annual proxy disclosure (DEF 14A).",
        currentExcerpt: highlight.excerpt,
        signalNote: highlight.signalNote,
        source: "proxy",
      })
      .onConflictDoNothing();

    seenAccessions.add(accession);
    inserted++;
  }

  console.log(
    `[amber-proxy] Scanned ${scanned}/${targets.length} issuers, persisted ${inserted} new DEF 14A proxy disclosures.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runProxyIngestion();
}
