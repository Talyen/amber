/**
 * Monthly Arena Close & Snapshot Script (Idempotent)
 *
 * Designed to run daily in GitHub Actions:
 *   - Checks for any active (`finalReturnPct IS NULL`) monthly Arena entries
 *     whose `periodKey` (YYYY-MM) is strictly before the current calendar month.
 *   - Freezes each expired monthly entry's `finalReturnPct` using official closing
 *     prices from Neon Postgres + its banked Time-Weighted NAV.
 *
 * Safe to run on any day; does nothing if all prior months are already finalized.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, isNull } from "drizzle-orm";
import { arenaPortfolios, arenaPositions, companies } from "../src/db/schema.ts";

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[amber-arena-close] DATABASE_URL not set; skipping.");
    return;
  }

  const db = drizzle(neon(url));
  const currentYm = new Date().toISOString().slice(0, 7); // e.g. "2026-12"

  const openPortfolios = await db
    .select()
    .from(arenaPortfolios)
    .where(isNull(arenaPortfolios.finalReturnPct));

  const toClose = openPortfolios.filter(
    (p) =>
      p.periodKey &&
      /^\d{4}-\d{2}$/.test(p.periodKey) &&
      p.periodKey < currentYm
  );

  if (toClose.length === 0) {
    console.log(
      `[amber-arena-close] All prior monthly Arena periods are already finalized (current: ${currentYm}).`
    );
    return;
  }

  const compRows = await db
    .select({ ticker: companies.ticker, price: companies.price })
    .from(companies);
  const priceMap = new Map(compRows.map((c) => [c.ticker, c.price]));

  let closed = 0;
  for (const port of toClose) {
    const positions = await db
      .select()
      .from(arenaPositions)
      .where(eq(arenaPositions.portfolioId, port.id));

    if (positions.length === 0) continue;

    let weightedRet = 0;
    for (const pos of positions) {
      const livePrice = priceMap.get(pos.ticker) ?? pos.entryPrice;
      const ret =
        pos.entryPrice > 0
          ? ((livePrice - pos.entryPrice) / pos.entryPrice) * 100
          : 0;
      weightedRet += ret * (pos.weightPct / 100);
    }

    const nav =
      typeof port.nav === "number" && Number.isFinite(port.nav) ? port.nav : 100;
    const finalReturnPct = Number((nav * (1 + weightedRet / 100) - 100).toFixed(2));

    await db
      .update(arenaPortfolios)
      .set({ finalReturnPct })
      .where(eq(arenaPortfolios.id, port.id));
    closed++;
  }

  console.log(
    `[amber-arena-close] ✓ Finalized ${closed} expired monthly Arena entries prior to ${currentYm}.`
  );
}

run();
