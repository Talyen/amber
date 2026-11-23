import { and, eq, isNull, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { arenaEntryPeriodKey, arenaPortfolios } from "../db/schema.ts";

export function activeArenaEntryForUser(userId: string, periodKey: string) {
  return and(
    eq(arenaPortfolios.userId, userId),
    eq(arenaPortfolios.isBot, 0),
    isNull(arenaPortfolios.finalReturnPct),
    sql`${arenaEntryPeriodKey(arenaPortfolios)} = ${periodKey}`
  );
}

export function deleteActiveArenaEntry(
  db: Pick<NeonHttpDatabase, "delete">,
  userId: string,
  periodKey: string,
  entryId: string,
) {
  return db.delete(arenaPortfolios)
    .where(and(
      eq(arenaPortfolios.id, entryId),
      activeArenaEntryForUser(userId, periodKey),
    ))
    .returning({ id: arenaPortfolios.id, handle: arenaPortfolios.handle });
}
