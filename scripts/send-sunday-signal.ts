import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { canRetryAlertDelivery, defaultAlertSender, escapeAlertHtml, sendAlertEmail } from "../src/lib/alert-email.ts";
import { digestActionUrl } from "../src/lib/digest-actions.ts";

const day = 86_400_000;
const unsubscribePlaceholder = "__AMBER_UNSUBSCRIBE_URL__";
const testAddress = "delivered@resend.dev";

export function sundaySignalWindow(now: Date, preview = false) {
  const today = new Date(now.toISOString().slice(0, 10));
  const weekday = today.getUTCDay();
  const sunday = preview && weekday ? new Date(+today + (7 - weekday) * day) : today;
  if (!preview && weekday) throw new Error("Live Sunday Signal delivery runs on Sunday (UTC).");
  const issueDate = sunday.toISOString().slice(0, 10);
  return {
    issueDate,
    since: new Date(+sunday - 7 * day).toISOString().slice(0, 10),
    signupCutoff: `${issueDate}T16:00:00Z`,
  };
}

interface IssueMessage {
  from: string;
  siteUrl: string;
  subject: string;
  html: string;
  text: string;
}

async function buildIssue(
  sql: NeonQueryFunction<false, false>,
  window: ReturnType<typeof sundaySignalWindow>,
  siteUrl: string,
  from: string,
): Promise<IssueMessage> {
  const { issueDate, since } = window;
  const [diffs, buys, lens] = await Promise.all([
    sql`
      SELECT * FROM (
        SELECT DISTINCT ON (ticker, accession_number) id, ticker, headline, summary, filing_date
        FROM filing_diffs
        WHERE filing_type IN ('10-K', '10-Q') AND materiality = 'High'
          AND filing_date >= ${since} AND filing_date < ${issueDate}
        ORDER BY ticker, accession_number, filing_date DESC, id
      ) AS filings ORDER BY filing_date DESC, ticker, id LIMIT 5
    `,
    sql`
      SELECT ticker, insider_name, total_value, filing_date
      FROM insider_trades
      WHERE transaction_type = 'Buy' AND total_value >= 0.5
        AND filing_date >= ${since} AND filing_date < ${issueDate}
      ORDER BY total_value DESC, filing_date DESC, id LIMIT 5
    `,
    sql`
      SELECT c.ticker, c.name, (100 * f.sbc / nullif(f.revenue, 0)) AS sbc_pct
      FROM companies c
      CROSS JOIN LATERAL (
        SELECT sbc, revenue FROM annual_financials
        WHERE ticker = c.ticker ORDER BY sort_order DESC LIMIT 1
      ) f
      WHERE c.is_active AND f.revenue >= 300
        AND (100 * f.sbc / nullif(f.revenue, 0)) BETWEEN 12 AND 85
      ORDER BY c.market_cap DESC, c.ticker LIMIT 1
    `,
  ]);
  const link = (path: string) => new URL(path, siteUrl).href;
  const sections = [
    {
      title: "High-materiality SEC filing changes",
      items: diffs.map((d) => ({
        title: `${d.ticker} · ${d.headline}`,
        detail: `${d.filing_date} · ${String(d.summary).slice(0, 450)}`,
        url: link(`/filings/${encodeURIComponent(d.id)}`),
      })),
    },
    {
      title: "Largest open-market insider buys",
      items: buys.map((b) => ({
        title: `${b.ticker} · ${b.insider_name}`,
        detail: `${b.filing_date} · $${Number(b.total_value).toFixed(2)}M`,
        url: link(`/t/${encodeURIComponent(b.ticker)}/filings`),
      })),
    },
    {
      title: "Featured lens",
      items: [{
        title: "Hidden Dilution",
        detail: lens[0]
          ? `${lens[0].name} (${lens[0].ticker}) reported stock-based compensation equal to ${Number(lens[0].sbc_pct).toFixed(1)}% of revenue in Amber's latest view. The lens shows how that expense changes cash flow after stock comp.`
          : "Compare reported free cash flow with cash flow after stock-based compensation.",
        url: link("/lenses/hidden-dilution"),
      }],
    },
  ];
  const subject = `Sunday Signal · ${issueDate}`;
  const period = `SEC filings from ${since} through ${new Date(+new Date(issueDate) - day).toISOString().slice(0, 10)} (UTC)`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:620px;margin:auto">
    <h1>${subject}</h1><p>${period}</p>
    ${sections.map(({ title, items }) => `<h2>${title}</h2>${items.length
      ? `<ul>${items.map((item) => `<li><a href="${escapeAlertHtml(item.url)}">${escapeAlertHtml(item.title)}</a>
        <br>${escapeAlertHtml(item.detail)}</li>`).join("")}</ul>`
      : "<p>No qualifying entries this week.</p>"}`).join("")}
    <p><a href="${escapeAlertHtml(link("/feed"))}">Open Amber’s feed</a> · <a href="${unsubscribePlaceholder}">Unsubscribe</a></p></div>`;
  const text = [
    subject, period,
    ...sections.flatMap(({ title, items }) => ["", title,
      ...(items.length ? items.map((item) => `${item.title} — ${item.detail}\n${item.url}`) : ["No qualifying entries this week."])]),
    "", `Amber’s feed: ${link("/feed")}`, `Unsubscribe: ${unsubscribePlaceholder}`,
  ].join("\n");
  return { from, siteUrl, subject, html, text };
}

function issueEmail(issue: IssueMessage, email: string, token: string) {
  const unsubscribe = digestActionUrl(issue.siteUrl, "unsubscribe", token);
  return {
    from: issue.from,
    to: [email],
    subject: issue.subject,
    html: issue.html.replaceAll(unsubscribePlaceholder, escapeAlertHtml(unsubscribe)),
    text: issue.text.replaceAll(unsubscribePlaceholder, unsubscribe),
    headers: {
      "List-Unsubscribe": `<${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

export async function sendSundaySignal({
  databaseUrl = process.env.DATABASE_URL,
  resendKey = process.env.RESEND_API_KEY,
  siteUrl = process.env.AMBER_PROD_URL || "https://amberstocks.com",
  from = process.env.ALERT_FROM_EMAIL || defaultAlertSender,
  now = new Date(),
  mode = "live",
  wait = sleep,
}: {
  databaseUrl?: string;
  resendKey?: string;
  siteUrl?: string;
  from?: string;
  now?: Date;
  mode?: "live" | "preview" | "test-email";
  wait?: (ms: number) => Promise<void>;
} = {}) {
  if (!databaseUrl || (mode !== "preview" && !resendKey)) {
    throw new Error("Sunday Signal requires DATABASE_URL and a Resend key for email delivery.");
  }
  const sql = neon(databaseUrl);
  const window = sundaySignalWindow(now, mode !== "live");
  const { issueDate, signupCutoff } = window;
  if (mode !== "live") {
    const issue = await buildIssue(sql, window, siteUrl, from);
    if (mode === "preview") {
      console.log(issue.text.replaceAll(unsubscribePlaceholder, "(added per recipient)"));
    } else {
      const token = randomUUID();
      const email = issueEmail(issue, testAddress, token);
      await sendAlertEmail(resendKey!, `sunday-signal-test/${token}`, { ...email, subject: `[Test] ${email.subject}` });
      console.log("[amber-sunday-signal] Resend accepted the test issue.");
    }
    return;
  }
  if (now < new Date(signupCutoff)) throw new Error("Sunday Signal sending starts Sunday at 16:00 UTC.");

  const [stored] = await sql`SELECT message FROM weekly_digest_issues WHERE issue_date = ${issueDate}::date`;
  let issue = stored?.message as IssueMessage | undefined;
  if (!issue) {
    const draft = await buildIssue(sql, window, siteUrl, from);
    await sql`
      INSERT INTO weekly_digest_issues (issue_date, message) VALUES (${issueDate}::date, ${JSON.stringify(draft)}::jsonb)
      ON CONFLICT DO NOTHING
    `;
    const [frozen] = await sql`SELECT message FROM weekly_digest_issues WHERE issue_date = ${issueDate}::date`;
    issue = frozen.message as IssueMessage;
  }

  const recipients = await sql`
    SELECT s.id FROM weekly_digest_subscribers s
    WHERE s.is_active AND s.confirmed_at <= ${signupCutoff}::timestamptz
      AND NOT EXISTS (
        SELECT 1 FROM weekly_digest_deliveries d
        WHERE d.issue_date = ${issueDate}::date AND d.subscriber_id = s.id
          AND (d.sent_at IS NOT NULL OR d.unsubscribe_token <> s.unsubscribe_token)
      )
    ORDER BY s.id
  `;
  let sent = 0;
  let failed = 0;
  for (const { id } of recipients) {
    await sql`
      INSERT INTO weekly_digest_deliveries (issue_date, subscriber_id, unsubscribe_token, started_at)
      SELECT ${issueDate}::date, id, unsubscribe_token, ${now.toISOString()}::timestamptz
      FROM weekly_digest_subscribers WHERE id = ${id} AND is_active AND confirmed_at <= ${signupCutoff}::timestamptz
      ON CONFLICT DO NOTHING
    `;
    const [claim] = await sql`
      SELECT s.email, d.unsubscribe_token, d.started_at
      FROM weekly_digest_deliveries d
      JOIN weekly_digest_subscribers s ON s.id = d.subscriber_id
      WHERE d.issue_date = ${issueDate}::date AND d.subscriber_id = ${id} AND d.sent_at IS NULL
        AND s.is_active AND s.unsubscribe_token = d.unsubscribe_token
    `;
    if (!claim) continue;
    if (!canRetryAlertDelivery(new Date(claim.started_at), Math.max(+now, Date.now()))) {
      failed++;
      console.error("[amber-sunday-signal] An uncertain delivery is past its safe retry window.");
      continue;
    }
    try {
      const key = `sunday-signal/${issueDate}/${id}`;
      await sendAlertEmail(resendKey!, key, issueEmail(issue, claim.email, claim.unsubscribe_token));
      await sql.transaction([
        sql`UPDATE weekly_digest_deliveries SET sent_at = now()
          WHERE issue_date = ${issueDate}::date AND subscriber_id = ${id} AND sent_at IS NULL`,
        sql`UPDATE weekly_digest_subscribers SET last_sent_at = now()
          WHERE id = ${id} AND unsubscribe_token = ${claim.unsubscribe_token}::uuid`,
      ]);
      sent++;
    } catch {
      failed++;
      console.error("[amber-sunday-signal] A delivery remains unresolved.");
    }
    await wait(550);
  }

  console.log(`[amber-sunday-signal] ${issueDate}: ${sent} accepted, ${failed} unresolved.`);
  if (failed) throw new Error(`${failed} Sunday Signal deliveries remain unresolved.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = process.argv.slice(2);
  if (flags.length !== 1 || !["--live", "--preview", "--test-email"].includes(flags[0])) {
    throw new Error("Choose --preview, --test-email, or --live.");
  }
  await sendSundaySignal({ mode: flags[0].slice(2) as "live" | "preview" | "test-email" });
}
