/**
 * Amber SEC Form 4 Open-Market Insider Activity Ingestor
 *
 * Scans all 625+ companies in our SEC universe for open-market Form 4 purchases
 * (Code P, >= $25K) and sales (Code S, >= $100K), filtering out routine RSU grants,
 * option exercises, and tax withholdings.
 *
 * Combines batched SEC Form 4 index queries (via OpenInsider's SEC Form 4 table)
 * with direct SEC EDGAR XML fallback, and persists into Neon Postgres `insider_trades`
 * plus `src/data/generated/insider-trades.json`.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { companies as companiesTable, insiderTrades } from "../src/db/schema.ts";
import type { CompanySnapshot } from "../src/lib/finance.ts";
import type { InsiderTradeItem } from "../src/components/InsiderRadar.tsx";

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "AmberFinance research@amber.example";

type InsiderTrade = InsiderTradeItem & { ticker: string };
type InsiderFill = Omit<InsiderTrade, "pricePerShare" | "totalValue"> & {
  price: number;
  valueUsd: number;
};

function aggregateInsiderFills(fills: InsiderFill[]): InsiderTrade[] {
  const byId = new Map<string, InsiderFill>();
  for (const fill of fills) {
    const previous = byId.get(fill.id);
    if (!previous) {
      byId.set(fill.id, fill);
      continue;
    }

    const shares = previous.shares + fill.shares;
    const valueUsd = previous.valueUsd + fill.valueUsd;
    byId.set(fill.id, { ...previous, shares, valueUsd, price: valueUsd / shares });
  }

  return [...byId.values()].map(({ shares, price, valueUsd, ...filing }) => ({
    ...filing,
    shares: Math.round(shares),
    pricePerShare: Number(price.toFixed(2)),
    totalValue: Number((valueUsd / 1e6).toFixed(3)),
  }));
}

function normalizeInsiderTitle(raw: string): string {
  const t = raw
    .replace(/&amp;/gi, "&")
    .replace(/See Remarks below\.?/i, "Executive Officer")
    .trim();
  if (!t || t === "Dir") return "Director";
  if (t === "10%") return "10% Owner";
  if (t === "Pres") return "President";
  return t
    .replace(/\bDir\b/g, "Director")
    .replace(/\bPres\b/g, "President")
    .replace(/\bTreas\b/g, "Treasurer")
    .replace(/\bSec\b/g, "Secretary")
    .replace(/,\s*10%$/, "");
}

export function parseOpenInsiderHtml(
  html: string,
  validTickers: Set<string>,
  txType: "Buy" | "Sell"
): InsiderTrade[] {
  const fills: InsiderFill[] = [];
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const tr of trs) {
    const rawTds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (m) => m[1]
    );
    if (rawTds.length < 13) continue;

    const tickerMatch = rawTds[3].match(/>([A-Z0-9.-]+)<\/a>/i);
    const ticker = tickerMatch ? tickerMatch[1].trim().toUpperCase() : "";
    if (!validTickers.has(ticker)) continue;

    const filingDateText = rawTds[1].replace(/<[^>]+>/g, "").trim();
    const filingDate = filingDateText.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) continue;

    // Extract 18-digit SEC accession folder from href="http://www.sec.gov/Archives/edgar/data/{cik}/{accn18}/..."
    const accMatch = rawTds[1].match(/\/edgar\/data\/\d+\/(\d{18})\//i);
    const acc18 = accMatch ? accMatch[1] : "";
    const accessionNumber = acc18
      ? `${acc18.slice(0, 10)}-${acc18.slice(10, 12)}-${acc18.slice(12)}`
      : `${ticker.toLowerCase()}-${filingDate}`;

    const insiderName = rawTds[5]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    const rawTitle = rawTds[6].replace(/<[^>]+>/g, "").trim();
    const insiderTitle = normalizeInsiderTitle(rawTitle);

    const price = parseFloat(rawTds[8].replace(/[^0-9.]/g, ""));
    const shares = parseInt(rawTds[9].replace(/[^0-9]/g, ""), 10);
    const valUsd = parseFloat(rawTds[12].replace(/[^0-9.]/g, ""));

    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(shares) ||
      shares <= 0 ||
      !Number.isFinite(valUsd) ||
      valUsd <= 0
    ) {
      continue;
    }

    const code = txType === "Buy" ? "P" : "S";
    fills.push({
      id: `${ticker}:${accessionNumber}:${code}`,
      ticker,
      filingDate,
      insiderName: insiderName || "Executive Insider",
      insiderTitle,
      transactionType: txType,
      shares,
      price,
      valueUsd: valUsd,
      accessionNumber,
    });
  }

  return aggregateInsiderFills(fills);
}

async function fetchOpenInsiderBatch(
  tickers: string[],
  validSet: Set<string>,
  txType: "Buy" | "Sell"
): Promise<Array<InsiderTradeItem & { ticker: string }>> {
  const s = tickers.join("+");
  const filterParam =
    txType === "Buy"
      ? "fd=365&xp=1&vl=25" // Open-market purchases >= $25K over last 365 days
      : "fd=180&xs=1&vl=100"; // Open-market sales >= $100K over last 180 days
  const url = `http://openinsider.com/screener?s=${s}&o=&pl=&ph=&ll=&lh=&${filterParam}&fdr=&td=0&tdr=&fdlyl=&fdlyh=&daysago=&vh=&ocl=&och=&sic1=-1&sicl=100&sich=9999&grp=0&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l=&oc2h=&sortcol=0&cnt=300&page=1`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`OpenInsider HTTP ${res.status}`);
  const html = await res.text();
  return parseOpenInsiderHtml(html, validSet, txType);
}

export function parseSecForm4Xml(xml: string, ticker: string, accn: string, filingDate: string): InsiderTrade[] {
  const ownerMatch = xml.match(/<rptOwnerName>([^<]+)<\/rptOwnerName>/i);
  const titleMatch = xml.match(/<officerTitle>([^<]+)<\/officerTitle>/i);
  const isDir = /<isDirector>\s*(1|true)\s*<\/isDirector>/i.test(xml);
  const insiderName = ownerMatch ? ownerMatch[1].trim() : "Executive Insider";
  const insiderTitle = normalizeInsiderTitle(
    titleMatch ? titleMatch[1].trim() : isDir ? "Director" : "Executive Officer"
  );

  const fills: InsiderFill[] = [];
  const txBlocks = [...xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi)];
  for (const block of txBlocks) {
    const body = block[1];
    const code = body.match(/<transactionCode>\s*([A-Z])\s*<\/transactionCode>/i)?.[1]?.toUpperCase();
    if (code !== "P" && code !== "S") continue;
    const shares = parseFloat(
      body.match(/<transactionShares>\s*<value>([^<]+)<\/value>/i)?.[1] ?? "0"
    );
    const price = parseFloat(
      body.match(/<transactionPricePerShare>\s*<value>([^<]+)<\/value>/i)?.[1] ?? "0"
    );
    const valUsd = shares * price;
    if (shares <= 0 || price <= 0 || !Number.isFinite(valUsd) || valUsd < (code === "P" ? 25_000 : 100_000)) continue;

    fills.push({
      id: `${ticker}:${accn}:${code}`,
      ticker,
      filingDate,
      insiderName,
      insiderTitle,
      transactionType: code === "P" ? "Buy" : "Sell",
      shares,
      price,
      valueUsd: valUsd,
      accessionNumber: accn,
    });
  }

  return aggregateInsiderFills(fills);
}

/**
 * Direct SEC EDGAR Form 4 XML fallback when OpenInsider is unreachable.
 * Fetches the latest Form 4 XML filings for a ticker's CIK and parses Code P / Code S open-market trades.
 */
async function fetchSecForm4Fallback(
  ticker: string,
  cik: string
): Promise<Array<InsiderTradeItem & { ticker: string }>> {
  const padded = cik.padStart(10, "0");
  const cikNum = String(Number(cik));
  const out: Array<InsiderTradeItem & { ticker: string }> = [];

  try {
    const subRes = await fetch(
      `https://data.sec.gov/submissions/CIK${padded}.json`,
      {
        headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      }
    );
    if (!subRes.ok) return out;
    const sub = (await subRes.json()) as {
      filings?: {
        recent?: {
          form?: string[];
          accessionNumber?: string[];
          filingDate?: string[];
          primaryDocument?: string[];
        };
      };
    };
    const recent = sub.filings?.recent;
    if (!recent?.form || !recent.accessionNumber || !recent.filingDate || !recent.primaryDocument) {
      return out;
    }

    let checked = 0;
    for (let i = 0; i < recent.form.length && checked < 6; i++) {
      if (recent.form[i] !== "4") continue;
      checked++;
      const accn = recent.accessionNumber[i];
      const filingDate = recent.filingDate[i];
      const rawDoc = recent.primaryDocument[i].replace(/^xsl[^/]+\//i, "");
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accn.replace(/-/g, "")}/${rawDoc}`;
      const xmlRes = await fetch(xmlUrl, {
        headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/xml,text/xml" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!xmlRes.ok) continue;
      const xml = await xmlRes.text();

      out.push(...parseSecForm4Xml(xml, ticker, accn, filingDate));
      await new Promise((r) => setTimeout(r, 150));
    }
  } catch {
    // Ignore transient SEC fallback errors
  }

  return out;
}

async function run() {
  const outDir = path.resolve(process.cwd(), "src/data/generated");
  const companiesPath = path.join(outDir, "companies.json");
  const tradesPath = path.join(outDir, "insider-trades.json");

  const dbUrl = process.env.DATABASE_URL;
  let allTickers: string[] = [];
  const cikByTicker = new Map<string, string>();

  if (dbUrl) {
    const db = drizzle(neon(dbUrl));
    const rows = await db
      .select({ ticker: companiesTable.ticker, cik: companiesTable.cik })
      .from(companiesTable);
    allTickers = rows.map((r) => r.ticker.toUpperCase());
    for (const r of rows) cikByTicker.set(r.ticker.toUpperCase(), r.cik);
  }

  if (allTickers.length === 0 && fs.existsSync(companiesPath)) {
    const companies = JSON.parse(
      fs.readFileSync(companiesPath, "utf8")
    ) as CompanySnapshot[];
    allTickers = companies.map((c) => c.ticker.toUpperCase());
    for (const c of companies) cikByTicker.set(c.ticker.toUpperCase(), c.cik);
  }

  const validSet = new Set(allTickers);
  console.log(
    `[amber-form4] Scanning open-market Form 4 Buys & Sells across ${allTickers.length} companies...`
  );

  const byId = new Map<string, InsiderTradeItem & { ticker: string }>();

  // Preserve existing trades
  if (fs.existsSync(tradesPath)) {
    const existing = JSON.parse(fs.readFileSync(tradesPath, "utf8")) as Record<
      string,
      InsiderTradeItem[]
    >;
    for (const [ticker, list] of Object.entries(existing)) {
      if (!validSet.has(ticker)) continue;
      for (const item of list) {
        byId.set(item.id, { ...item, ticker });
      }
    }
  }

  // Batch tickers in groups of 65 (~10 requests for Buys, ~10 requests for Sells)
  const batchSize = 65;
  for (let i = 0; i < allTickers.length; i += batchSize) {
    const batch = allTickers.slice(i, i + batchSize);
    try {
      const [buys, sells] = await Promise.all([
        fetchOpenInsiderBatch(batch, validSet, "Buy"),
        fetchOpenInsiderBatch(batch, validSet, "Sell"),
      ]);
      for (const b of buys) byId.set(b.id, b);
      for (const s of sells) byId.set(s.id, s);
    } catch {
      // Fallback to direct SEC EDGAR Form 4 XML for top tickers in this batch
      for (const t of batch.slice(0, 10)) {
        const cik = cikByTicker.get(t);
        if (!cik) continue;
        const xmlTrades = await fetchSecForm4Fallback(t, cik);
        for (const x of xmlTrades) byId.set(x.id, x);
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  // Sort all trades newest-first, then cap sales to 12 most recent per ticker
  // (so older cached sales never block newer sales from being kept)
  const sortedRaw = [...byId.values()].sort((a, b) =>
    b.filingDate.localeCompare(a.filingDate)
  );
  const sellCountByTicker = new Map<string, number>();
  const allTrades: Array<InsiderTradeItem & { ticker: string }> = [];
  for (const t of sortedRaw) {
    if (t.transactionType === "Sell") {
      const cnt = sellCountByTicker.get(t.ticker) ?? 0;
      if (cnt >= 12) continue;
      sellCountByTicker.set(t.ticker, cnt + 1);
    }
    allTrades.push(t);
  }

  const byTickerObj: Record<string, InsiderTradeItem[]> = {};
  for (const t of allTrades) {
    const list = byTickerObj[t.ticker] ?? [];
    list.push({
      id: t.id,
      filingDate: t.filingDate,
      insiderName: t.insiderName,
      insiderTitle: t.insiderTitle,
      transactionType: t.transactionType,
      shares: t.shares,
      pricePerShare: t.pricePerShare,
      totalValue: t.totalValue,
      accessionNumber: t.accessionNumber,
    });
    byTickerObj[t.ticker] = list;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(tradesPath, JSON.stringify(byTickerObj, null, 2) + "\n");

  const buyCount = allTrades.filter((t) => t.transactionType === "Buy").length;
  const sellCount = allTrades.filter((t) => t.transactionType === "Sell").length;
  const buyTickers = new Set(
    allTrades.filter((t) => t.transactionType === "Buy").map((t) => t.ticker)
  ).size;

  if (dbUrl) {
    const db = drizzle(neon(dbUrl));
    const rows = allTrades.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      filingDate: t.filingDate,
      insiderName: t.insiderName,
      insiderTitle: t.insiderTitle,
      transactionType: t.transactionType,
      shares: t.shares,
      pricePerShare: t.pricePerShare,
      totalValue: t.totalValue,
      accessionNumber: t.accessionNumber,
    }));

    for (let i = 0; i < rows.length; i += 100) {
      await db
        .insert(insiderTrades)
        .values(rows.slice(i, i + 100))
        .onConflictDoUpdate({
          target: insiderTrades.id,
          set: {
            insiderName: sql`excluded.insider_name`,
            insiderTitle: sql`excluded.insider_title`,
            shares: sql`excluded.shares`,
            pricePerShare: sql`excluded.price_per_share`,
            totalValue: sql`excluded.total_value`,
          },
        });
    }
    console.log(
      `[amber-form4] ✓ Upserted ${rows.length} Form 4 trades into Neon (${buyCount} Buys across ${buyTickers} companies, ${sellCount} Sells).`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
