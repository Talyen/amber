import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { consumeQuota } from "@/lib/public-api";
import { defaultAlertSender, sendAlertEmail } from "@/lib/alert-email";
import { digestActionUrl, digestHeaders } from "@/lib/digest-actions";
import { SITE_URL } from "@/lib/site";
import { isSameOrigin } from "@/lib/request-origin";

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: digestHeaders });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return reply(403, { error: "Open the Amber feed to subscribe." });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json") ||
      Number(request.headers.get("content-length")) > 1024) {
    return reply(400, { error: "Enter a valid email address." });
  }
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
    return reply(400, { error: "Enter a valid email address." });
  }

  const db = getDb();
  const apiKey = process.env.RESEND_API_KEY;
  const unavailable = { error: "Email subscriptions are currently unavailable. Try again later or use RSS.", rssUrl: "/feed.xml" };
  if (!db || !apiKey) return reply(503, unavailable);

  const token = randomUUID();
  try {
    if (!(await consumeQuota(request, "digest-signup", 5)).allowed) {
      return reply(429, { error: "Too many signup requests. Try again in a minute." });
    }
    const { rows } = await db.execute(sql`
      INSERT INTO weekly_digest_subscribers
        (id, email, is_active, confirmation_token, confirmation_expires_at)
      VALUES (${randomUUID()}, ${email}, false, ${token}::uuid, now() + interval '24 hours')
      ON CONFLICT (email) DO UPDATE SET
        confirmation_token = excluded.confirmation_token,
        confirmation_expires_at = excluded.confirmation_expires_at
      WHERE (weekly_digest_subscribers.confirmed_at IS NULL OR NOT weekly_digest_subscribers.is_active)
        AND (weekly_digest_subscribers.confirmation_expires_at IS NULL
          OR weekly_digest_subscribers.confirmation_expires_at <= now() + interval '23 hours')
      RETURNING id
    `);
    if (rows.length) {
      const url = digestActionUrl(SITE_URL, "confirm", token);
      await sendAlertEmail(apiKey, `sunday-signal-confirm/${token}`, {
        from: process.env.ALERT_FROM_EMAIL || defaultAlertSender,
        to: [email],
        subject: "Confirm your Sunday Signal subscription",
        html: `<p>Confirm your email to receive Amber’s weekly SEC filing and insider activity roundup.</p>
          <p><a href="${url}">Confirm Sunday Signal</a></p>
          <p>This link expires in 24 hours. If you did not request it, you can ignore this email.</p>`,
        text: `Confirm Sunday Signal: ${url}\n\nThis link expires in 24 hours.`,
      });
    }
    return reply(202, { message: "If this address still needs confirmation, check your inbox for a link." });
  } catch {
    console.error("[amber-sunday-signal] Could not start signup.");
    return reply(503, unavailable);
  }
}
