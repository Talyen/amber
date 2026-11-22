/**
 * Amber SEC Form 4 Open-Market Insider Activity Ingestor
 *
 * Fetches recent Form 4 XML filings from SEC EDGAR (`data.sec.gov/submissions`)
 * and extracts open-market purchases (Code P) and sales (Code S), filtering out
 * routine RSU grants/vestings/tax withholdings.
 *
 * Persists into Neon Postgres `insider_trades` when DATABASE_URL is set,
 * and caches to `src/data/generated/insider-trades.json`.
 */

import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { insiderTrades } from "../src/db/schema.ts";
import type { CompanySnapshot } from "../src/lib/finance.ts";
import type { InsiderTradeItem } from "../src/components/InsiderRadar.tsx";

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "AmberFinance research@amber.example";
const MAX_TICKERS = Number(process.env.FORM4_MAX_TICKERS ?? "25");

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

async function fetchSecText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": SEC_USER_AGENT,
      Accept: "application/xml,text/xml,application/json,*/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, "&")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXmlEntities(m[1].replace(/<[^>]+>/g, "")) : "";
}

function parseForm4Xml(
  xml: string,
  ticker: string,
  filingDate: string,
  accessionNumber: string
): InsiderTradeItem[] {
  const ownerName = extractTag(xml, "rptOwnerName") || "Executive Insider";
  const officerTitle =
    extractTag(xml, "officerTitle") ||
    (extractTag(xml, "isDirector") === "1" ? "Director" : "10% Owner");

  const txBlocks = xml.match(
    /<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/gi
  );
  if (!txBlocks) return [];

  let buyShares = 0;
  let buyValue = 0;
  let sellShares = 0;
  let sellValue = 0;

  for (const block of txBlocks) {
    const code = extractTag(block, "transactionCode").toUpperCase();
    if (code !== "P" && code !== "S") continue;

    const shares = parseFloat(extractTag(block, "transactionShares"));
    const price = parseFloat(extractTag(block, "transactionPricePerShare"));

    if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
      continue;
    }

    if (code === "P") {
      buyShares += shares;
      buyValue += shares * price;
    } else {
      sellShares += shares;
      sellValue += shares * price;
    }
  }

  const items: InsiderTradeItem[] = [];
  if (buyShares > 0 && buyValue >= 50_000) {
    items.push({
      id: `${ticker}:${accessionNumber}:P`,
      filingDate,
      insiderName: ownerName,
      insiderTitle: officerTitle,
      transactionType: "Buy",
      shares: Math.round(buyShares),
      pricePerShare: Number((buyValue / buyShares).toFixed(2)),
      totalValue: Number((buyValue / 1e6).toFixed(3)),
      accessionNumber,
    });
  }
  if (sellShares > 0 && sellValue >= 100_000) {
    items.push({
      id: `${ticker}:${accessionNumber}:S`,
      filingDate,
      insiderName: ownerName,
      insiderTitle: officerTitle,
      transactionType: "Sell",
      shares: Math.round(sellShares),
      pricePerShare: Number((sellValue / sellShares).toFixed(2)),
      totalValue: Number((sellValue / 1e6).toFixed(3)),
      accessionNumber,
    });
  }

  return items;
}

async function ingestTickerForm4(
  ticker: string,
  cik: string
): Promise<InsiderTradeItem[]> {
  const padded = cik.padStart(10, "0");
  const cikNum = String(Number(cik));
  const subRaw = await fetchSecText(
    `https://data.sec.gov/submissions/CIK${padded}.json`
  );
  const sub = JSON.parse(subRaw) as SubmissionsResponse;
  const recent = sub.filings?.recent;
  if (!recent) return [];

  const form4Refs: Array<{ accn: string; date: string; url: string }> = [];
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "4") {
      const accn = recent.accessionNumber[i];
      const rawDoc = recent.primaryDocument[i];
      // Strip XSLT prefix (e.g. "xslF345X05/form4.xml" -> "form4.xml") to get raw XML
      const xmlDoc = rawDoc.includes("/") ? rawDoc.split("/").pop()! : rawDoc;
      if (!xmlDoc.toLowerCase().endsWith(".xml")) continue;
      form4Refs.push({
        accn,
        date: recent.filingDate[i],
        url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accn.replace(/-/g, "")}/${xmlDoc}`,
      });
      if (form4Refs.length >= 16) break;
    }
  }

  const trades: InsiderTradeItem[] = [];
  for (const ref of form4Refs) {
    try {
      const xml = await fetchSecText(ref.url);
      trades.push(...parseForm4Xml(xml, ticker, ref.date, ref.accn));
      if (trades.length >= 8) break;
    } catch {
      // Skip malformed XML
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  return trades;
}

async function run() {
  const outDir = path.resolve(process.cwd(), "src/data/generated");
  const companiesPath = path.join(outDir, "companies.json");
  const tradesPath = path.join(outDir, "insider-trades.json");

  if (!fs.existsSync(companiesPath)) {
    throw new Error("Run `pnpm ingest:edgar` first.");
  }

  const companies = JSON.parse(
    fs.readFileSync(companiesPath, "utf8")
  ) as CompanySnapshot[];

  const existing: Record<string, InsiderTradeItem[]> = fs.existsSync(tradesPath)
    ? (JSON.parse(fs.readFileSync(tradesPath, "utf8")) as Record<
        string,
        InsiderTradeItem[]
      >)
    : {};

  const targetList = companies.slice(0, MAX_TICKERS);
  console.log(
    `[amber-form4] Syncing recent Form 4 XML filings for ${targetList.length} companies...`
  );

  let totalTrades = 0;
  for (const c of targetList) {
    try {
      const list = await ingestTickerForm4(c.ticker, c.cik);
      if (list.length > 0) {
        existing[c.ticker] = list;
        totalTrades += list.length;
      }
    } catch {
      // Continue cleanly on SEC hiccups
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  fs.writeFileSync(tradesPath, JSON.stringify(existing, null, 2) + "\n");

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const db = drizzle(neon(dbUrl));
    const rows = Object.entries(existing).flatMap(([ticker, list]) =>
      list.map((t) => ({
        id: t.id,
        ticker,
        filingDate: t.filingDate,
        insiderName: t.insiderName,
        insiderTitle: t.insiderTitle,
        transactionType: t.transactionType,
        shares: t.shares,
        pricePerShare: t.pricePerShare,
        totalValue: t.totalValue,
        accessionNumber: t.accessionNumber,
      }))
    );

    for (let i = 0; i < rows.length; i += 100) {
      await db
        .insert(insiderTrades)
        .values(rows.slice(i, i + 100))
        .onConflictDoUpdate({
          target: insiderTrades.id,
          set: {
            shares: sql`excluded.shares`,
            pricePerShare: sql`excluded.price_per_share`,
            totalValue: sql`excluded.total_value`,
          },
        });
    }
    console.log(`[amber-form4] ✓ Upserted ${rows.length} Form 4 trades into Neon.`);
  }

  console.log(
    `[amber-form4] ✓ Done (${totalTrades} open-market Form 4 transactions extracted).`
  );
}

run();
