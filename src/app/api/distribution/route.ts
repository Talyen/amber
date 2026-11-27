import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { parseDistributionEvent } from "@/lib/distribution";
import { consumeQuota } from "@/lib/public-api";
import { isSameOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return new Response(null, { status: 403 });
  }
  if (request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1") {
    return new Response(null, { status: 204 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json") ||
      Number(request.headers.get("content-length")) > 512) {
    return new Response(null, { status: 400 });
  }
  const event = parseDistributionEvent(await request.json().catch(() => null));
  if (!event) return new Response(null, { status: 400 });

  const db = getDb();
  if (!db) return new Response(null, { status: 204 });
  try {
    if (!(await consumeQuota(request, "distribution", 120)).allowed) {
      return new Response(null, { status: 429 });
    }
    await db.execute(sql`
      INSERT INTO distribution_counts (day, route_group, event, source_group)
      VALUES ((now() at time zone 'UTC')::date, ${event.route}, ${event.event}, ${event.source})
      ON CONFLICT (day, route_group, event, source_group)
      DO UPDATE SET count = distribution_counts.count + 1
    `);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[amber-distribution] Counter unavailable:", error);
    return new Response(null, { status: 503 });
  }
}
