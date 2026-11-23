import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { queryInsiderBuySummaries, queryMaterialEventSummaries } from "../src/data/filing-summaries.ts";

test("recent filing summaries apply their cutoffs to membership, totals, and counts", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(`
    create table insider_trades (ticker text, transaction_type text, filing_date text,
      total_value real, insider_name text, insider_title text);
    insert into insider_trades values
      ('AAA', 'Buy', '2025-11-23', 2, 'Earlier Buyer', 'Director'),
      ('AAA', 'Buy', '2026-11-22', 5, 'Latest Buyer', 'CEO'),
      ('AAA', 'Buy', '2025-11-22', 99, 'Old Buyer', 'Director'),
      ('AAA', 'Sell', '2026-11-23', 99, 'Seller', 'Director'),
      ('OLD', 'Buy', '2025-11-22', 99, 'Old Buyer', 'Director');
    create table filing_diffs (ticker text, filing_type text, filing_date text,
      headline text, section text, category text);
    insert into filing_diffs values
      ('AAA', '8-K', '2026-07-26', 'On the cutoff', 'Item 5.02', 'Executive Comp'),
      ('AAA', '8-K', '2026-11-22', 'New CEO (Item 5.02)', 'Item 5.02', 'Executive Comp'),
      ('AAA', '8-K', '2026-07-25', 'Older event', 'Item 5.02', 'Executive Comp'),
      ('AAA', '10-K', '2026-11-23', 'Periodic filing', 'Risk Factors', 'Risk Factors'),
      ('OLD', '8-K', '2026-07-25', 'Older event', 'Item 5.02', 'Executive Comp');
  `);
  const client = {
    async query(sql: string, params: string[]) {
      const statement = sqlite.prepare(sql);
      statement.setReturnArrays(true);
      const bindings = Object.fromEntries(params.map((value, i) => [`$${i + 1}`, value]));
      return { rows: statement.all(bindings) };
    },
  };
  const db = drizzle({ client: client as unknown as NeonQueryFunction<false, false> });
  const now = new Date("2026-11-23T12:00:00Z");
  assert.deepEqual(await queryInsiderBuySummaries(db, now), {
    AAA: {
      ticker: "AAA", totalBuyValue: 7, buyCount: 2,
      latestBuyer: "Latest Buyer", latestTitle: "CEO", latestDate: "2026-11-22",
    },
  });
  assert.deepEqual(await queryMaterialEventSummaries(db, now), {
    AAA: {
      ticker: "AAA", headline: "New CEO", section: "Item 5.02", category: "Executive Comp",
      filingDate: "2026-11-22", eventCount: 2,
    },
  });
});
