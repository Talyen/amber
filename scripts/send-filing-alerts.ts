/** Send periodic filing alerts to confirmed subscriptions. */
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { alertSubscriptions, companies } from "../src/db/schema.ts";
import {
  alertActionUrl,
  canRetryAlertDelivery,
  defaultAlertSender,
  escapeAlertHtml,
  sendAlertEmail,
} from "../src/lib/alert-email.ts";

export async function dispatchFilingAlerts({
  databaseUrl = process.env.DATABASE_URL,
  resendKey = process.env.RESEND_API_KEY,
  fromEmail = process.env.ALERT_FROM_EMAIL ?? defaultAlertSender,
  siteUrl = process.env.AMBER_PROD_URL ?? "https://amber-theta-three.vercel.app",
  wait = sleep,
}: {
  databaseUrl?: string;
  resendKey?: string;
  fromEmail?: string;
  siteUrl?: string;
  wait?: (ms: number) => Promise<void>;
} = {}) {
  if (!databaseUrl || !resendKey) {
    console.log("[amber-alerts] Skipping email dispatch (DATABASE_URL or RESEND_API_KEY not set).");
    return;
  }

  const db = drizzle(neon(databaseUrl));
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const due = await db
    .select({
      id: alertSubscriptions.id,
      email: alertSubscriptions.email,
      ticker: alertSubscriptions.ticker,
      token: alertSubscriptions.unsubscribeToken,
      name: companies.name,
      filingType: companies.lastFilingType,
      filingDate: companies.lastFilingDate,
      accession: companies.lastFilingAccession,
    })
    .from(alertSubscriptions)
    .innerJoin(companies, eq(alertSubscriptions.ticker, companies.ticker))
    .where(and(
      gte(companies.lastFilingDate, cutoff),
      isNull(alertSubscriptions.confirmationExpiresAt),
      sql`${alertSubscriptions.lastNotifiedAccession} is distinct from ${companies.lastFilingAccession}`,
    ));

  let sent = 0;
  let failed = 0;
  for (const item of due) {
    try {
      const subscription = and(
        eq(alertSubscriptions.id, item.id),
        eq(alertSubscriptions.unsubscribeToken, item.token),
      );
      const [claim] = await db.update(alertSubscriptions).set({
        deliveryAccession: item.accession,
        deliveryStartedAt: sql`case when ${alertSubscriptions.deliveryAccession} = ${item.accession}
          then coalesce(${alertSubscriptions.deliveryStartedAt}, statement_timestamp())
          else statement_timestamp() end`,
      }).where(and(
        subscription,
        isNull(alertSubscriptions.confirmationExpiresAt),
        sql`${alertSubscriptions.lastNotifiedAccession} is distinct from ${item.accession}`,
        sql`exists (select 1 from ${companies}
          where ${companies.ticker} = ${item.ticker} and ${companies.lastFilingAccession} = ${item.accession})`,
      )).returning({ startedAt: alertSubscriptions.deliveryStartedAt });

      if (!claim) continue;
      // A response can be lost after Resend accepts a message. Stop before its key expires.
      if (!claim.startedAt || !canRetryAlertDelivery(claim.startedAt)) {
        console.warn(`[amber-alerts] ${item.ticker} filing ${item.accession} has an unresolved delivery outside the retry window.`);
        failed++;
        continue;
      }

      const unsubscribe = alertActionUrl(siteUrl, "unsubscribe", item.token);
      const ticker = escapeAlertHtml(item.ticker);
      const filingType = escapeAlertHtml(item.filingType);
      const filingDate = escapeAlertHtml(item.filingDate);
      const accession = escapeAlertHtml(item.accession);
      const companyUrl = escapeAlertHtml(new URL(`/t/${encodeURIComponent(item.ticker)}`, siteUrl).href);
      await sendAlertEmail(resendKey, `filing-alert/${item.token}/${item.accession}`, {
        from: fromEmail,
        to: [item.email],
        subject: `Amber Alert: ${item.ticker} filed a new ${item.filingType} (${item.filingDate})`,
        html: `
          <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#151517;">
            <div style="font-size:12px;font-weight:600;letter-spacing:0.06em;color:#B45309;">AMBER / SEC FILING ALERT</div>
            <h2 style="margin:8px 0 4px;font-size:20px;">${escapeAlertHtml(item.name)} (${ticker})</h2>
            <p style="margin:0 0 16px;font-size:14px;color:#52525B;">
              A new <strong>${filingType}</strong> was filed on ${filingDate} (EDGAR ${accession}).
              View the filing and available analysis in Amber.
            </p>
            <a href="${companyUrl}" style="display:inline-block;padding:10px 16px;background:#B45309;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">
              Open ${ticker} in Amber →
            </a>
            <p style="margin:20px 0 0;font-size:11px;color:#71717A;">
              <a href="${escapeAlertHtml(unsubscribe)}" style="color:#B45309;">Unsubscribe from ${ticker} filing alerts</a>.
            </p>
          </div>
        `,
      }, wait);

      for (let attempt = 0; ; attempt++) {
        try {
          await db.update(alertSubscriptions)
            .set({ lastNotifiedAccession: item.accession, deliveryAccession: null, deliveryStartedAt: null })
            .where(and(subscription, eq(alertSubscriptions.deliveryAccession, item.accession)));
          break;
        } catch {
          if (attempt >= 2) throw new Error("Could not record accepted delivery");
          await wait(500 * 2 ** attempt);
        }
      }
      sent++;
    } catch (error) {
      failed++;
      const detail = error instanceof Error && !("query" in error) ? error.message : "Database error";
      console.warn(`[amber-alerts] ${item.ticker} filing ${item.accession} delivery failed: ${detail}.`);
    }
  }

  console.log(`[amber-alerts] Dispatched ${sent}/${due.length} due filing alerts (${failed} unresolved).`);
  if (failed > 0) throw new Error(`${failed} filing alert deliveries need attention.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await dispatchFilingAlerts();
}
