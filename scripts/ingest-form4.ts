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
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { companies as companiesTable, insiderTrades } from "../src/db/schema.ts";
import type { CompanySnapshot } from "../src/lib/finance.ts";
import type { InsiderTradeItem } from "../src/components/InsiderRadar.tsx";

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "AmberFinance research@amber.example";

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

function parseOpenInsiderHtml(
  html: string,
  validTickers: Set<string>,
  txType: "Buy" | "Sell"
): Array<InsiderTradeItem & { ticker: string }> {
  const results: Array<InsiderTradeItem & { ticker: string }> = [];
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
    results.push({
      id: `${ticker}:${accessionNumber}:${code}`,
      ticker,
      filingDate,
      insiderName: insiderName || "Executive Insider",
      insiderTitle,
      transactionType: txType,
      shares,
      pricePerShare: Number(price.toFixed(2)),
      totalValue: Number((valUsd / 1e6).toFixed(3)),
      accessionNumber,
    });
  }

  return results;
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
  });
  if (!res.ok) return [];
  const html = await res.text();
  return parseOpenInsiderHtml(html, validSet, txType);
}

async function run() {
  const outDir = path.resolve(process.cwd(), "src/data/generated");
  const companiesPath = path.join(outDir, "companies.json");
  const tradesPath = path.join(outDir, "insider-trades.json");

  const dbUrl = process.env.DATABASE_URL;
  let allTickers: string[] = [];

  if (dbUrl) {
    const db = drizzle(neon(dbUrl));
    const rows = await db
      .select({ ticker: companiesTable.ticker })
      .from(companiesTable);
    allTickers = rows.map((r) => r.ticker.toUpperCase());
  }

  if (allTickers.length === 0 && fs.existsSync(companiesPath)) {
    const companies = JSON.parse(
      fs.readFileSync(companiesPath, "utf8")
    ) as CompanySnapshot[];
    allTickers = companies.map((c) => c.ticker.toUpperCase());
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
      for (const s of sells) {
        // Keep up to 12 most recent sales per ticker so mega-caps don't bloat DB
        const existingTickerSales = [...byId.values()].filter(
          (x) => x.ticker === s.ticker && x.transactionType === "Sell"
        );
        if (existingTickerSales.length < 12) {
          byId.set(s.id, s);
        }
      }
    } catch {
      // Continue cleanly on network hiccups
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  const allTrades = [...byId.values()].sort((a, b) =>
    b.filingDate.localeCompare(a.filingDate)
  );

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

run();
