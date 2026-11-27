import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { digestPage, digestToken } from "@/lib/digest-actions";

const invalid = "This confirmation link is expired or has already been used. You can sign up again from the feed.";

export function GET(request: Request) {
  return digestToken(request)
    ? digestPage("Confirm that you want to receive Amber’s weekly email.", 200, "confirm")
    : digestPage(invalid, 400);
}

export async function POST(request: Request) {
  const token = digestToken(request);
  if (!token) return digestPage(invalid, 400);
  const db = getDb();
  if (!db) return digestPage("Confirmation is temporarily unavailable. Try again later.", 503);
  try {
    const { rows } = await db.execute(sql`
      UPDATE weekly_digest_subscribers SET is_active = true, confirmed_at = now(),
        confirmation_token = null, confirmation_expires_at = null, unsubscribe_token = gen_random_uuid()
      WHERE confirmation_token = ${token}::uuid AND confirmation_expires_at > now()
      RETURNING id
    `);
    return rows.length ? digestPage("You’re subscribed to Sunday Signal.") : digestPage(invalid, 400);
  } catch {
    return digestPage("Confirmation is temporarily unavailable. Try again later.", 503);
  }
}
