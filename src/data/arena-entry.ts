import { and, eq, isNull, sql } from "drizzle-orm";
import { arenaEntryPeriodKey, arenaPortfolios } from "../db/schema.ts";

export function activeArenaEntryForUser(userId: string, periodKey: string) {
  return and(
    eq(arenaPortfolios.userId, userId),
    eq(arenaPortfolios.isBot, 0),
    isNull(arenaPortfolios.finalReturnPct),
    sql`${arenaEntryPeriodKey(arenaPortfolios)} = ${periodKey}`
  );
}
