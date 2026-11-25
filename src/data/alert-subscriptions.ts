import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { alertSubscriptions } from "../db/schema.ts";

type AlertDb = Pick<NeonHttpDatabase, "insert" | "update" | "delete">;

export async function saveVerifiedAlert(db: AlertDb, id: string, email: string, ticker: string) {
  await db.insert(alertSubscriptions).values({ id, email, ticker })
    .onConflictDoUpdate({
      target: [alertSubscriptions.email, alertSubscriptions.ticker],
      set: { confirmationExpiresAt: null },
    });
}

export async function requestAlertConfirmation(db: Pick<NeonHttpDatabase, "insert" | "select">, id: string, email: string, ticker: string) {
  const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [row] = await db.insert(alertSubscriptions).values({ id, email, ticker, confirmationExpiresAt })
    .onConflictDoUpdate({
      target: [alertSubscriptions.email, alertSubscriptions.ticker],
      set: { confirmationExpiresAt, unsubscribeToken: sql`gen_random_uuid()` },
      setWhere: lte(alertSubscriptions.confirmationExpiresAt, sql`statement_timestamp()`),
    })
    .returning({ token: alertSubscriptions.unsubscribeToken });
  if (row) return row.token;

  // A previous send may have been accepted even if Amber never received the reply.
  const [pending] = await db.select({ token: alertSubscriptions.unsubscribeToken })
    .from(alertSubscriptions)
    .where(and(
      eq(alertSubscriptions.email, email),
      eq(alertSubscriptions.ticker, ticker),
      gt(alertSubscriptions.confirmationExpiresAt, sql`statement_timestamp()`),
    ))
    .limit(1);
  return pending?.token;
}

export async function confirmAlert(db: AlertDb, token: string) {
  const [row] = await db.update(alertSubscriptions).set({ confirmationExpiresAt: null })
    .where(and(
      eq(alertSubscriptions.unsubscribeToken, token),
      gt(alertSubscriptions.confirmationExpiresAt, sql`statement_timestamp()`),
    ))
    .returning({ id: alertSubscriptions.id });
  return Boolean(row);
}

export async function unsubscribeAlert(db: AlertDb, token: string) {
  await db.delete(alertSubscriptions).where(eq(alertSubscriptions.unsubscribeToken, token));
}
