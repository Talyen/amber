import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { digestPage, digestToken } from "@/lib/digest-actions";

const invalid = "This unsubscribe link is invalid.";

export function GET(request: Request) {
  return digestToken(request)
    ? digestPage("Stop receiving Amber’s Sunday Signal email.", 200, "unsubscribe")
    : digestPage(invalid, 400);
}

export async function POST(request: Request) {
  const token = digestToken(request);
  if (!token || Number(request.headers.get("content-length")) > 4096) return digestPage(invalid, 400);
  const form = await request.formData().catch(() => null);
  if (form?.get("List-Unsubscribe") !== "One-Click") return digestPage(invalid, 400);
  const db = getDb();
  if (!db) return digestPage("Unsubscribe is temporarily unavailable. Try again later.", 503);
  try {
    const { rows } = await db.execute(sql`
      UPDATE weekly_digest_subscribers SET is_active = false
      WHERE unsubscribe_token = ${token}::uuid AND confirmed_at IS NOT NULL
      RETURNING id
    `);
    return rows.length ? digestPage("You’re unsubscribed from Sunday Signal.") : digestPage(invalid, 400);
  } catch {
    return digestPage("Unsubscribe is temporarily unavailable. Try again later.", 503);
  }
}
