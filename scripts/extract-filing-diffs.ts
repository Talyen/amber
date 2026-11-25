/**
 * Amber Scalable 2-Stage SEC 10-K Prose Diff Extractor
 *
 * Architecture for scaling across 750+ companies at near-$0 cost:
 *   1. Neon tracks published prose diffs and completed analyses with no changes.
 *      Unprocessed accessions are prioritized by Market Cap DESC.
 *   2. Stage 1 (Deterministic Paragraph Novelty Pre-Filter, $0):
 *      Extracts Item 1A (Risk Factors) and Item 7 (MD&A) from consecutive 10-Ks and
 *      isolates ONLY genuinely new/changed paragraphs via token-Jaccard similarity,
 *      shrinking input size by ~80% before any LLM call.
 *   3. Stage 2 (Optional Batch Gemini 2.5 Flash Pass):
 *      Feeds only the changed paragraphs to Gemini 2.5 Flash (~$0.25/yr for 750 companies)
 *      with deterministic fallback when GEMINI_API_KEY is unset.
 *   4. Upserts directly to Neon `filing_diffs` + updates local JSON snapshots.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { desc, inArray, sql } from "drizzle-orm";
import {
  alertSubscriptions,
  companies as companiesTable,
  filingDiffNoChanges,
  filingDiffs,
  userWatchlists,
} from "../src/db/schema.ts";
import type { CompanySnapshot, FilingDiffItem } from "../src/lib/finance.ts";

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "AmberFinance research@amber.example";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MAX_TICKERS = Number(process.env.MAX_TICKERS ?? "25");

interface SubmissionsResponse {
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

interface FilingRef {
  form: "10-K" | "10-Q";
  accessionNumber: string;
  filingDate: string;
  primaryDocument: string;
  url: string;
}

interface DiffCache {
  [ticker: string]: {
    accessionNumber: string;
    filingDate: string;
    extractedAt: string;
    source: "llm" | "text-diff";
    diffs: FilingDiffItem[];
  };
}

export interface TargetCompany {
  ticker: string;
  cik: string;
  name: string;
  marketCap: number;
  lastFilingType?: string | null;
  lastFilingDate?: string | null;
  lastFilingAccession?: string | null;
}

const FRESH_FILING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isPreprocessedPeriodicAccession(
  company: Pick<TargetCompany, "ticker" | "lastFilingType" | "lastFilingAccession">,
  processedByTicker: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  if (!company.lastFilingAccession) return false;
  if (company.lastFilingType && company.lastFilingType !== "10-K" && company.lastFilingType !== "10-Q") {
    return false;
  }
  return processedByTicker.get(company.ticker)?.has(company.lastFilingAccession) ?? false;
}

export function prioritizeDiffTargets<T extends TargetCompany>(
  companies: readonly T[],
  {
    priorityTickers,
    processedByTicker,
    nowMs = Date.now(),
  }: {
    priorityTickers: ReadonlySet<string>;
    processedByTicker: ReadonlyMap<string, ReadonlySet<string>>;
    nowMs?: number;
  }
): { ordered: T[]; preSkipped: number } {
  const tier1: T[] = [];
  const tier2: T[] = [];
  const tier3: T[] = [];
  let preSkipped = 0;

  for (const company of companies) {
    if (isPreprocessedPeriodicAccession(company, processedByTicker)) {
      preSkipped++;
      continue;
    }
    const filingMs = company.lastFilingDate ? Date.parse(company.lastFilingDate) : NaN;
    const isFresh =
      Number.isFinite(filingMs) &&
      filingMs <= nowMs + 24 * 60 * 60 * 1000 &&
      nowMs - filingMs <= FRESH_FILING_WINDOW_MS;

    if (priorityTickers.has(company.ticker)) {
      tier1.push(company);
    } else if (isFresh) {
      tier2.push(company);
    } else {
      tier3.push(company);
    }
  }

  const byDateThenCap = (a: T, b: T) => {
    const dateCmp = (b.lastFilingDate ?? "").localeCompare(a.lastFilingDate ?? "");
    if (dateCmp !== 0) return dateCmp;
    return b.marketCap - a.marketCap;
  };
  const byCapDesc = (a: T, b: T) => b.marketCap - a.marketCap;

  tier1.sort(byDateThenCap);
  tier2.sort(byDateThenCap);
  tier3.sort(byCapDesc);

  return { ordered: [...tier1, ...tier2, ...tier3], preSkipped };
}

async function fetchSecText(url: string, retries = 2): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": SEC_USER_AGENT,
          Accept: "text/html,application/json,*/*",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${url}`);
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Failed fetching ${url}`);
}

async function getLatestPeriodicPair(cik: string): Promise<[FilingRef, FilingRef] | null> {
  const padded = cik.padStart(10, "0");
  const cikNum = String(Number(cik));
  const raw = await fetchSecText(
    `https://data.sec.gov/submissions/CIK${padded}.json`
  );
  const sub = JSON.parse(raw) as SubmissionsResponse;
  const recent = sub.filings?.recent;
  if (!recent) return null;

  const tenKs: FilingRef[] = [];
  const tenQs: FilingRef[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    const form = recent.form[i];
    if (form !== "10-K" && form !== "10-Q") continue;
    const accn = recent.accessionNumber[i];
    const doc = recent.primaryDocument[i];
    const accnNoDash = accn.replace(/-/g, "");
    const ref: FilingRef = {
      form,
      accessionNumber: accn,
      filingDate: recent.filingDate[i],
      primaryDocument: doc,
      url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accnNoDash}/${doc}`,
    };
    if (form === "10-K" && tenKs.length < 2) tenKs.push(ref);
    if (form === "10-Q" && tenQs.length < 2) tenQs.push(ref);
    if (tenKs.length === 2 && tenQs.length === 2) break;
  }

  const latest10K = tenKs[0];
  const latest10Q = tenQs[0];
  if (
    latest10Q &&
    tenQs.length === 2 &&
    (!latest10K || latest10Q.filingDate > latest10K.filingDate)
  ) {
    return [tenQs[0], tenQs[1]];
  }
  if (tenKs.length === 2) {
    return [tenKs[0], tenKs[1]];
  }
  return tenQs.length === 2 ? [tenQs[0], tenQs[1]] : null;
}

function htmlToCleanText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&rsquo;|&#8217;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/gi, '"')
    .replace(/&mdash;|&#8212;/gi, " - ")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSectionSlice(
  cleanText: string,
  pattern: RegExp,
  maxChars: number
): string {
  const matches = [...cleanText.matchAll(pattern)];
  // Skip Table of Contents hit (usually first match) when a body match exists
  const startIdx =
    matches.length >= 2
      ? matches[1].index!
      : matches.length === 1
        ? matches[0].index!
        : -1;
  if (startIdx < 0) return "";
  return cleanText.slice(startIdx, startIdx + maxChars);
}

const SIGNAL_KEYWORDS = [
  "tariff",
  "export control",
  "artificial intelligence",
  "generative ai",
  "customer concentration",
  "accounted for",
  "10% or more",
  "stock-based compensation",
  "datacenter",
  "data center",
  "antitrust",
  "china",
  "supply chain",
  "litigation",
  "cybersecurity",
  "margin pressure",
  "restructuring",
  "capital expenditure",
  "debt",
  "liquidity",
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s%]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) {
    if (b.has(w)) inter++;
  }
  return inter / (a.size + b.size - inter);
}

interface NovelParagraphPair {
  section: "Item 1A: Risk Factors" | "Item 7: MD&A" | "Item 2: MD&A";
  current: string;
  closestPrior: string | null;
  similarity: number;
  matchedKeyword: string | null;
}

/**
 * Stage 1: Deterministic paragraph-level novelty detector.
 * Isolates only genuinely added or materially rewritten paragraphs so downstream
 * LLM calls receive ~2-6 KB of pure signal instead of 45+ KB of unchanged boilerplate.
 */
function findNovelParagraphs(
  currentText: string,
  priorText: string,
  section: NovelParagraphPair["section"]
): NovelParagraphPair[] {
  const splitParas = (t: string) =>
    t
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length >= 110 && p.length <= 1600);

  const curParas = splitParas(currentText);
  const priorParas = splitParas(priorText).map((text) => ({
    text,
    tokens: tokenize(text),
  }));

  const scored: NovelParagraphPair[] = [];

  for (const p of curParas) {
    const tokens = tokenize(p);
    if (tokens.size < 12) continue;

    let bestSim = 0;
    let bestPrior: string | null = null;
    for (const pr of priorParas) {
      const sim = jaccardSimilarity(tokens, pr.tokens);
      if (sim > bestSim) {
        bestSim = sim;
        bestPrior = pr.text;
      }
      if (bestSim >= 0.78) break; // Essentially unchanged boilerplate
    }

    // Keep paragraphs that are either brand new (<0.25) or materially revised (0.25..0.68)
    if (bestSim < 0.68) {
      const lower = p.toLowerCase();
      const matchedKeyword =
        SIGNAL_KEYWORDS.find((kw) => lower.includes(kw)) ?? null;
      scored.push({
        section,
        current: p,
        closestPrior: bestSim >= 0.25 ? bestPrior : null,
        similarity: bestSim,
        matchedKeyword,
      });
    }
  }

  // Prioritize keyword-bearing novel paragraphs, then lowest similarity (most novel)
  return scored
    .sort((a, b) => {
      const aKw = a.matchedKeyword ? 1 : 0;
      const bKw = b.matchedKeyword ? 1 : 0;
      if (bKw !== aKw) return bKw - aKw;
      return a.similarity - b.similarity;
    })
    .slice(0, 6);
}

function deterministicProseDiff(
  ticker: string,
  currentFiling: FilingRef,
  priorFiling: FilingRef,
  novelPairs: NovelParagraphPair[]
): FilingDiffItem[] {
  const highSignal = novelPairs.filter((p) => p.matchedKeyword !== null);
  const chosen = highSignal[0] ?? novelPairs[0];
  if (!chosen) return [];

  const kw = chosen.matchedKeyword ?? "material risk disclosure";
  const isConcentration =
    kw.includes("customer") || kw.includes("10%");
  const isCapital =
    kw.includes("capital") || kw.includes("debt") || kw.includes("liquidity");

  const form = currentFiling.form;
  const formSlug = form.toLowerCase().replace(/[^a-z0-9]/g, "");

  return [
    {
      id: `${ticker.toLowerCase()}-${formSlug}-diff-${currentFiling.filingDate}`,
      filingType: form,
      filingDate: currentFiling.filingDate,
      accessionNumber: currentFiling.accessionNumber,
      section: `${chosen.section} (${form} Text Diff)`,
      category: isConcentration
        ? "Customer Concentration"
        : isCapital
          ? "Capital Allocation"
          : "Risk Factors",
      materiality: chosen.matchedKeyword ? "High" : "Medium",
      headline: `New ${kw} disclosure in latest ${form} (${currentFiling.filingDate})`,
      summary: `Consecutive ${form} comparison (${priorFiling.filingDate} vs. ${currentFiling.filingDate}) detected newly added or materially revised ${chosen.section} language referencing ${kw}.`,
      priorExcerpt: (
        chosen.closestPrior ??
        `Prior ${form} (${priorFiling.filingDate}) did not contain equivalent disclosure language in ${chosen.section}.`
      ).slice(0, 260),
      currentExcerpt: chosen.current.slice(0, 260),
      signalNote:
        `Extracted deterministically by comparing paragraph-level novelty across consecutive SEC EDGAR ${form} filings.`,
    },
  ];
}

async function llmProseDiff(
  company: TargetCompany,
  currentFiling: FilingRef,
  priorFiling: FilingRef,
  novelPairs: NovelParagraphPair[]
): Promise<FilingDiffItem[]> {
  if (!GEMINI_API_KEY || novelPairs.length === 0) return [];

  const form = currentFiling.form;
  const mdaSection = form === "10-Q" ? "Item 2: MD&A" : "Item 7: MD&A";

  const digest = novelPairs
    .map(
      (p, idx) =>
        `[CHANGE ${idx + 1} | ${p.section}]\nPRIOR (${priorFiling.filingDate}): ${
          p.closestPrior ? p.closestPrior.slice(0, 500) : `(No equivalent paragraph in prior ${form})`
        }\nLATEST (${currentFiling.filingDate}): ${p.current.slice(0, 650)}`
    )
    .join("\n\n");

  const prompt = `You are an institutional equity research analyst for Amber.
Below are the top pre-filtered paragraph-level changes between the PRIOR ${form} (${priorFiling.filingDate}) and LATEST ${form} (${currentFiling.filingDate}) for ${company.name} (${company.ticker}).
Return ONLY a valid JSON array of 1 to 2 genuinely material changes for long-term investors (skip routine date updates or generic boilerplate). Each item must match:
{
  "section": "Item 1A: Risk Factors" | "${mdaSection}",
  "category": "Risk Factors" | "Customer Concentration" | "Executive Comp" | "Capital Allocation",
  "materiality": "High" | "Medium" | "Watch",
  "headline": "Short punchy headline (<= 90 chars, no em-dashes)",
  "summary": "1-2 concise sentences explaining what changed and why it matters.",
  "priorExcerpt": "Short verbatim excerpt from prior ${form} (<= 220 chars)",
  "currentExcerpt": "Short verbatim excerpt from latest ${form} (<= 220 chars)",
  "signalNote": "One-sentence investor takeaway."
}

PRE-FILTERED ${form} CHANGES:
${digest}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(25_000),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API failed (${res.status})`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const parsed = JSON.parse(text) as Array<
    Omit<FilingDiffItem, "id" | "filingType" | "filingDate" | "accessionNumber">
  >;

  return parsed.slice(0, 2).map((item, idx) => ({
    ...item,
    id: `${company.ticker.toLowerCase()}-llm-${currentFiling.filingDate}-${idx}`,
    filingType: form,
    filingDate: currentFiling.filingDate,
    accessionNumber: currentFiling.accessionNumber,
  }));
}

export async function extractFilingDiffs({
  directory = path.resolve(process.cwd(), "src/data/generated"),
  databaseUrl = process.env.DATABASE_URL,
  maxTickers = MAX_TICKERS,
} = {}) {
  const companiesPath = path.resolve(
    directory,
    "companies.json"
  );
  const cachePath = path.resolve(
    directory,
    "filing-diffs-cache.json"
  );

  const db = databaseUrl ? drizzle(neon(databaseUrl)) : null;

  const localCompanies: CompanySnapshot[] = fs.existsSync(companiesPath)
    ? (JSON.parse(fs.readFileSync(companiesPath, "utf8")) as CompanySnapshot[])
    : [];
  const localByTicker = new Map(localCompanies.map((c) => [c.ticker, c]));

  const cache: DiffCache = fs.existsSync(cachePath)
    ? (JSON.parse(fs.readFileSync(cachePath, "utf8")) as DiffCache)
    : {};

  // Build prioritized target list: Tier 1 (alerted/watchlisted) > Tier 2 (fresh 14d filings) > Tier 3 (market cap backfill)
  let targets: TargetCompany[] = [];
  const dbProcessedAccessions = new Map<string, Set<string>>();
  const priorityTickers = new Set<string>();

  if (db) {
    const [compRows, existingProseRows, noChangeRows, alertRows, watchlistRows] = await Promise.all([
      db
        .select({
          ticker: companiesTable.ticker,
          cik: companiesTable.cik,
          name: companiesTable.name,
          marketCap: companiesTable.marketCap,
          lastFilingType: companiesTable.lastFilingType,
          lastFilingDate: companiesTable.lastFilingDate,
          lastFilingAccession: companiesTable.lastFilingAccession,
        })
        .from(companiesTable)
        .orderBy(desc(companiesTable.marketCap)),
      db
        .select({
          ticker: filingDiffs.ticker,
          accessionNumber: filingDiffs.accessionNumber,
        })
        .from(filingDiffs)
        .where(inArray(filingDiffs.source, ["llm", "text-diff"])),
      db.select().from(filingDiffNoChanges),
      db.select({ ticker: alertSubscriptions.ticker }).from(alertSubscriptions),
      db.select({ ticker: userWatchlists.ticker }).from(userWatchlists),
    ]);

    targets = compRows;
    for (const row of [...existingProseRows, ...noChangeRows]) {
      const set = dbProcessedAccessions.get(row.ticker) ?? new Set<string>();
      set.add(row.accessionNumber);
      dbProcessedAccessions.set(row.ticker, set);
    }
    for (const row of [...alertRows, ...watchlistRows]) {
      priorityTickers.add(row.ticker);
    }
  } else {
    targets = [...localCompanies]
      .sort((a, b) => b.marketCap - a.marketCap)
      .map((c) => ({
        ticker: c.ticker,
        cik: c.cik,
        name: c.name,
        marketCap: c.marketCap,
        lastFilingType: c.lastFiling?.type,
        lastFilingDate: c.lastFiling?.date,
        lastFilingAccession: c.lastFiling?.accessionNumber,
      }));
  }

  const requestedTickers = process.env.TICKERS
    ? new Set(
        process.env.TICKERS.split(",").map((t) => t.trim().toUpperCase())
      )
    : null;

  let skippedCached = 0;
  if (!requestedTickers) {
    const prioritized = prioritizeDiffTargets(targets, {
      priorityTickers,
      processedByTicker: dbProcessedAccessions,
    });
    targets = prioritized.ordered;
    skippedCached = prioritized.preSkipped;
  }

  let processed = 0;

  for (const company of targets) {
    if (requestedTickers && !requestedTickers.has(company.ticker)) continue;
    if (!requestedTickers && processed >= maxTickers) break;

    try {
      const pair = await getLatestPeriodicPair(company.cik);
      if (!pair) continue;

      const [latest, prior] = pair;
      const cached = cache[company.ticker];
      const alreadyInDb = dbProcessedAccessions
        .get(company.ticker)
        ?.has(latest.accessionNumber);

      if (db ? alreadyInDb : cached?.accessionNumber === latest.accessionNumber) {
        skippedCached++;
        continue;
      }

      console.log(
        `[amber-diffs] Fetching ${latest.form} pair for ${company.ticker} (${prior.filingDate} -> ${latest.filingDate})...`
      );

      const [latestHtml, priorHtml] = await Promise.all([
        fetchSecText(latest.url),
        fetchSecText(prior.url),
      ]);

      const latestClean = htmlToCleanText(latestHtml);
      const priorClean = htmlToCleanText(priorHtml);

      const riskHeading = /item\s+1a\.?\s*risk\s+factors/gi;
      const managementHeading =
        latest.form === "10-Q"
          ? /item\s+2\.?\s*management['’]?s\s+discussion/gi
          : /item\s+7\.?\s*management['’]?s\s+discussion/gi;
      const managementLabel: "Item 2: MD&A" | "Item 7: MD&A" =
        latest.form === "10-Q" ? "Item 2: MD&A" : "Item 7: MD&A";
      const latestRisk = extractSectionSlice(latestClean, riskHeading, 75_000);
      const priorRisk = extractSectionSlice(priorClean, riskHeading, 75_000);
      const latestManagement = extractSectionSlice(latestClean, managementHeading, 60_000);
      const priorManagement = extractSectionSlice(priorClean, managementHeading, 60_000);
      const hasComparableSection = (latestRisk && priorRisk) || (latestManagement && priorManagement);
      const hasUnpairedSection = Boolean(latestRisk) !== Boolean(priorRisk) ||
        Boolean(latestManagement) !== Boolean(priorManagement);
      if (!hasComparableSection || hasUnpairedSection) {
        console.warn(`[amber-diffs] ! ${company.ticker}: could not pair the ${latest.form} sections.`);
        continue;
      }

      const novelItem1A = findNovelParagraphs(latestRisk, priorRisk, "Item 1A: Risk Factors");
      const novelMda = findNovelParagraphs(latestManagement, priorManagement, managementLabel);

      const combinedNovel = [...novelItem1A.slice(0, 4), ...novelMda.slice(0, 2)];

      let extracted: FilingDiffItem[] = [];
      let source: "llm" | "text-diff" = "text-diff";

      if (GEMINI_API_KEY && combinedNovel.length > 0) {
        try {
          extracted = await llmProseDiff(company, latest, prior, combinedNovel);
          source = "llm";
        } catch (err) {
          console.warn(
            `[amber-diffs] Gemini fallback for ${company.ticker}:`,
            err instanceof Error ? err.message : err
          );
        }
      }

      if (extracted.length === 0 && combinedNovel.length > 0) {
        extracted = deterministicProseDiff(
          company.ticker,
          latest,
          prior,
          combinedNovel
        );
        source = "text-diff";
      }

      if (extracted.length > 0) {
        // Upsert directly into Neon Postgres so CI runs persist across builds
        if (db) {
          const rows = extracted.map((d) => ({
            id: d.id,
            ticker: company.ticker,
            filingType: d.filingType,
            filingDate: d.filingDate,
            accessionNumber: d.accessionNumber,
            section: d.section,
            category: d.category,
            materiality: d.materiality,
            headline: d.headline,
            summary: d.summary,
            priorExcerpt: d.priorExcerpt,
            currentExcerpt: d.currentExcerpt,
            signalNote: d.signalNote,
            source,
          }));
          await db
            .insert(filingDiffs)
            .values(rows)
            .onConflictDoUpdate({
              target: filingDiffs.id,
              set: {
                headline: sql`excluded.headline`,
                summary: sql`excluded.summary`,
                priorExcerpt: sql`excluded.prior_excerpt`,
                currentExcerpt: sql`excluded.current_excerpt`,
                signalNote: sql`excluded.signal_note`,
                source: sql`excluded.source`,
              },
            });
        }

        const local = localByTicker.get(company.ticker);
        if (local) {
          const existingIds = new Set(extracted.map((d) => d.id));
          local.filingDiffs = [
            ...extracted,
            ...local.filingDiffs.filter((d) => !existingIds.has(d.id)),
          ];
        }

        console.log(
          `[amber-diffs] ✓ ${company.ticker}: extracted ${extracted.length} diff(s) via ${source} (from ${combinedNovel.length} novel paragraphs)`
        );
      } else {
        if (db) {
          await db.insert(filingDiffNoChanges)
            .values({ ticker: company.ticker, accessionNumber: latest.accessionNumber })
            .onConflictDoNothing();
        }
        console.log(
          `[amber-diffs] – ${company.ticker}: no material 10-K prose diff detected`
        );
      }

      cache[company.ticker] = {
        accessionNumber: latest.accessionNumber,
        filingDate: latest.filingDate,
        extractedAt: new Date().toISOString(),
        source,
        diffs: extracted,
      };
      processed++;
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      console.warn(
        `[amber-diffs] ! ${company.ticker}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n");
  if (localCompanies.length > 0) {
    fs.writeFileSync(companiesPath, JSON.stringify(localCompanies, null, 2) + "\n");
  }
  console.log(
    `[amber-diffs] Complete. Processed ${processed} ticker(s), skipped ${skippedCached} already-cached.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await extractFilingDiffs();
}
