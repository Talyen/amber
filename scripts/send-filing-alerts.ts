/**
 * Amber Filing Alert Email Dispatcher (Phase 4A)
 *
 * Queries Neon `alert_subscriptions` joined with `companies` for any company
 * whose `last_filing_date` is within the last 24 hours, and sends a crisp digest
 * email via Resend's REST API (zero extra npm dependencies).
 *
 * Skips gracefully when RESEND_API_KEY or DATABASE_URL is not configured.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { alertSubscriptions, companies } from "../src/db/schema.ts";

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.ALERT_FROM_EMAIL ?? "Amber Alerts <alerts@amber.finance>";
  const siteUrl =
    process.env.AMBER_PROD_URL ?? "https://amber-theta-three.vercel.app";

  if (!dbUrl || !resendKey) {
    console.log(
      "[amber-alerts] Skipping email dispatch (DATABASE_URL or RESEND_API_KEY not set)."
    );
    return;
  }

  const db = drizzle(neon(dbUrl));
  const subs = await db
    .select({
      email: alertSubscriptions.email,
      ticker: alertSubscriptions.ticker,
      name: companies.name,
      filingType: companies.lastFilingType,
      filingDate: companies.lastFilingDate,
      accession: companies.lastFilingAccession,
    })
    .from(alertSubscriptions)
    .innerJoin(companies, eq(alertSubscriptions.ticker, companies.ticker));

  // Filter to filings filed within the last 2 days to handle weekend/timezone skew
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const due = subs.filter((s) => s.filingDate >= cutoff);
  if (due.length === 0) {
    console.log(
      `[amber-alerts] Checked ${subs.length} subscription(s); no new filings since ${cutoff}.`
    );
    return;
  }

  let sent = 0;
  for (const item of due) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [item.email],
        subject: `Amber Alert: ${item.ticker} filed a new ${item.filingType} (${item.filingDate})`,
        html: `
          <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#151517;">
            <div style="font-size:12px;font-weight:600;letter-spacing:0.06em;color:#B45309;">AMBER / SEC FILING ALERT</div>
            <h2 style="margin:8px 0 4px;font-size:20px;">${item.name} (${item.ticker})</h2>
            <p style="margin:0 0 16px;font-size:14px;color:#52525B;">
              A new <strong>${item.filingType}</strong> was filed on ${item.filingDate} (EDGAR ${item.accession}).
              True FCF, SBC dilution, and Risk Factor diffs have been updated.
            </p>
            <a href="${siteUrl}/t/${item.ticker}" style="display:inline-block;padding:10px 16px;background:#B45309;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">
              Open ${item.ticker} in Amber →
            </a>
          </div>
        `,
      }),
    });

    if (res.ok) {
      sent++;
    } else {
      console.warn(
        `[amber-alerts] Failed to email ${item.email} for ${item.ticker}: HTTP ${res.status}`
      );
    }
  }

  console.log(`[amber-alerts] ✓ Dispatched ${sent}/${due.length} filing alerts.`);
}

run();
