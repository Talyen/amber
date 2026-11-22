/**
 * Amber Automated Batch SEC 10-K Text-Diff Extractor (Phase 2)
 *
 * Fetches the latest two 10-K primary HTML filings from SEC EDGAR for each ticker,
 * extracts Item 1A (Risk Factors) & high-signal disclosures, and produces structured
 * FilingDiffItems incrementally (skips any ticker whose latest accession number is
 * already cached).
 *
 * Modes:
 *   - With GEMINI_API_KEY: Runs a single batch Gemini 2.5 Flash structured JSON pass
 *     per newly filed 10-K (zero live per-user LLM calls).
 *   - Without GEMINI_API_KEY: Runs a deterministic novelty detector on Risk Factor
 *     and concentration disclosures ($0 cost).
 *
 * Usage:
 *   pnpm ingest:diffs                  # Processes up to MAX_TICKERS (default 5) uncached tickers
 *   TICKERS=NVDA,CRWD,ORCL pnpm ingest:diffs
 */

import fs from "node:fs";
import path from "node:path";
import type { CompanySnapshot, FilingDiffItem } from "../src/lib/finance.ts";

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "AmberFinance research@amber.example";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MAX_TICKERS = Number(process.env.MAX_TICKERS ?? "5");

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

async function fetchSecText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      Accept: "text/html,application/json,*/*",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return await res.text();
}

async function getLatestTwo10Ks(cik: string): Promise<[FilingRef, FilingRef] | null> {
  const padded = cik.padStart(10, "0");
  const cikNum = String(Number(cik));
  const raw = await fetchSecText(
    `https://data.sec.gov/submissions/CIK${padded}.json`
  );
  const sub = JSON.parse(raw) as SubmissionsResponse;
  const recent = sub.filings?.recent;
  if (!recent) return null;

  const tenKs: FilingRef[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "10-K") {
      const accn = recent.accessionNumber[i];
      const doc = recent.primaryDocument[i];
      const accnNoDash = accn.replace(/-/g, "");
      tenKs.push({
        accessionNumber: accn,
        filingDate: recent.filingDate[i],
        primaryDocument: doc,
        url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accnNoDash}/${doc}`,
      });
      if (tenKs.length === 2) break;
    }
  }

  return tenKs.length === 2 ? [tenKs[0], tenKs[1]] : null;
}

function htmlToCleanText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&rsquo;|&#8217;/gi, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/gi, '"')
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractItem1ASlice(cleanText: string): string {
  // Find the second occurrence of "Item 1A" (first is usually Table of Contents)
  const matches = [...cleanText.matchAll(/item\s+1a\.?\s*risk\s+factors/gi)];
  const startIdx =
    matches.length >= 2
      ? matches[1].index!
      : matches.length === 1
        ? matches[0].index!
        : 0;
  // Take up to 45,000 chars of Item 1A for comparison
  return cleanText.slice(startIdx, startIdx + 45_000);
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
];

function extractHighSignalSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 75 && s.length <= 320);

  return sentences.filter((s) => {
    const lower = s.toLowerCase();
    return SIGNAL_KEYWORDS.some((kw) => lower.includes(kw));
  });
}

function deterministicRiskDiff(
  ticker: string,
  currentFiling: FilingRef,
  priorFiling: FilingRef,
  currentItem1A: string,
  priorItem1A: string
): FilingDiffItem[] {
  const priorLower = priorItem1A.toLowerCase();
  const currentSignals = extractHighSignalSentences(currentItem1A);
  const priorSignals = extractHighSignalSentences(priorItem1A);

  // Find sentences in latest 10-K whose core 45-char fingerprint didn't exist in prior 10-K
  const novel = currentSignals.filter((sent) => {
    const probe = sent.toLowerCase().slice(15, 65).trim();
    return probe.length > 25 && !priorLower.includes(probe);
  });

  if (novel.length === 0) return [];

  const chosen = novel[0];
  const matchedKw =
    SIGNAL_KEYWORDS.find((kw) => chosen.toLowerCase().includes(kw)) ??
    "risk disclosure";

  const relatedPrior =
    priorSignals.find((s) => s.toLowerCase().includes(matchedKw)) ??
    `Prior 10-K (${priorFiling.filingDate}) did not contain equivalent disclosure language in Item 1A.`;

  return [
    {
      id: `${ticker.toLowerCase()}-10k-diff-${currentFiling.filingDate}`,
      filingType: "10-K",
      filingDate: currentFiling.filingDate,
      accessionNumber: currentFiling.accessionNumber,
      section: "Item 1A — Risk Factors (10-K Text Diff)",
      category:
        matchedKw.includes("customer") || matchedKw.includes("10%")
          ? "Customer Concentration"
          : "Risk Factors",
      materiality: "High",
      headline: `New ${matchedKw} language added in latest 10-K (${currentFiling.filingDate})`,
      summary: `Automated 10-K comparison between ${priorFiling.filingDate} and ${currentFiling.filingDate} flagged newly introduced Risk Factor language referencing ${matchedKw}.`,
      priorExcerpt: relatedPrior.slice(0, 260),
      currentExcerpt: chosen.slice(0, 260),
      signalNote:
        "Extracted deterministically by comparing consecutive SEC EDGAR 10-K Item 1A filings.",
    },
  ];
}

async function llmRiskDiff(
  company: CompanySnapshot,
  currentFiling: FilingRef,
  priorFiling: FilingRef,
  currentItem1A: string,
  priorItem1A: string
): Promise<FilingDiffItem[]> {
  if (!GEMINI_API_KEY) return [];

  const prompt = `You are an institutional equity research analyst for Amber.
Compare the PRIOR 10-K (${priorFiling.filingDate}) and LATEST 10-K (${currentFiling.filingDate}) Item 1A Risk Factors excerpts for ${company.name} (${company.ticker}).
Return ONLY a valid JSON array of 1 to 2 genuinely material changes (ignore boilerplate legal rewording). Each item must match:
{
  "section": "Item 1A — Risk Factors",
  "category": "Risk Factors" | "Customer Concentration" | "Executive Comp" | "Capital Allocation",
  "materiality": "High" | "Medium" | "Watch",
  "headline": "Short punchy headline (<= 90 chars)",
  "summary": "1-2 concise sentences explaining what changed and why it matters.",
  "priorExcerpt": "Short verbatim excerpt from prior 10-K (<= 220 chars)",
  "currentExcerpt": "Short verbatim excerpt from latest 10-K (<= 220 chars)",
  "signalNote": "One-sentence investor takeaway."
}

PRIOR 10-K EXCERPT:
${priorItem1A.slice(0, 14_000)}

LATEST 10-K EXCERPT:
${currentItem1A.slice(0, 14_000)}`;

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
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API failed (${res.status})`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
  const parsed = JSON.parse(text) as Array<Omit<FilingDiffItem, "id" | "filingType" | "filingDate" | "accessionNumber">>;

  return parsed.slice(0, 2).map((item, idx) => ({
    ...item,
    id: `${company.ticker.toLowerCase()}-llm-${currentFiling.filingDate}-${idx}`,
    filingType: "10-K",
    filingDate: currentFiling.filingDate,
    accessionNumber: currentFiling.accessionNumber,
  }));
}

async function run() {
  const companiesPath = path.resolve(
    process.cwd(),
    "src/data/generated/companies.json"
  );
  const cachePath = path.resolve(
    process.cwd(),
    "src/data/generated/filing-diffs-cache.json"
  );

  if (!fs.existsSync(companiesPath)) {
    throw new Error("Run `pnpm ingest:edgar` first to generate companies.json.");
  }

  const companies = JSON.parse(
    fs.readFileSync(companiesPath, "utf8")
  ) as CompanySnapshot[];

  const cache: DiffCache = fs.existsSync(cachePath)
    ? (JSON.parse(fs.readFileSync(cachePath, "utf8")) as DiffCache)
    : {};

  const requestedTickers = process.env.TICKERS
    ? new Set(
        process.env.TICKERS.split(",").map((t) => t.trim().toUpperCase())
      )
    : null;

  let processed = 0;

  for (const company of companies) {
    if (requestedTickers && !requestedTickers.has(company.ticker)) continue;
    if (!requestedTickers && processed >= MAX_TICKERS) break;

    const cached = cache[company.ticker];
    if (cached && cached.accessionNumber === company.lastFiling.accessionNumber) {
      continue;
    }

    try {
      const pair = await getLatestTwo10Ks(company.cik);
      if (!pair) continue;

      const [latest, prior] = pair;
      if (cached && cached.accessionNumber === latest.accessionNumber) {
        continue;
      }

      console.log(
        `[amber-diffs] Fetching 10-K pair for ${company.ticker} (${prior.filingDate} -> ${latest.filingDate})...`
      );

      const [latestHtml, priorHtml] = await Promise.all([
        fetchSecText(latest.url),
        fetchSecText(prior.url),
      ]);

      const latestItem1A = extractItem1ASlice(htmlToCleanText(latestHtml));
      const priorItem1A = extractItem1ASlice(htmlToCleanText(priorHtml));

      let extracted: FilingDiffItem[] = [];
      let source: "llm" | "text-diff" = "text-diff";

      if (GEMINI_API_KEY) {
        extracted = await llmRiskDiff(
          company,
          latest,
          prior,
          latestItem1A,
          priorItem1A
        );
        source = "llm";
      }

      if (extracted.length === 0) {
        extracted = deterministicRiskDiff(
          company.ticker,
          latest,
          prior,
          latestItem1A,
          priorItem1A
        );
        source = "text-diff";
      }

      if (extracted.length > 0) {
        cache[company.ticker] = {
          accessionNumber: latest.accessionNumber,
          filingDate: latest.filingDate,
          extractedAt: new Date().toISOString(),
          source,
          diffs: extracted,
        };

        // Prepend new 10-K text diffs ahead of existing XBRL diffs (deduplicating by id)
        const existingIds = new Set(extracted.map((d) => d.id));
        company.filingDiffs = [
          ...extracted,
          ...company.filingDiffs.filter((d) => !existingIds.has(d.id)),
        ];

        console.log(
          `[amber-diffs] ✓ ${company.ticker}: extracted ${extracted.length} diff(s) via ${source}`
        );
      } else {
        console.log(`[amber-diffs] – ${company.ticker}: no material Item 1A diff detected`);
      }

      processed++;
      // Respect SEC EDGAR rate limits
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.warn(
        `[amber-diffs] ! ${company.ticker}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + "\n");
  fs.writeFileSync(companiesPath, JSON.stringify(companies, null, 2) + "\n");
  console.log(`[amber-diffs] Complete. Processed ${processed} ticker(s).`);
}

run();
