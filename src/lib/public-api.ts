import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const API_VERSION = "1.0";
export const REST_LIMIT = 120;
export const REST_WINDOW = 60;

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "X-API-Version, RateLimit, RateLimit-Policy, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, Deprecation, Sunset, Link",
  "Cache-Control": "no-store",
  "X-API-Version": API_VERSION,
};

export function apiError(status: number, code: string, message: string, resolution: string, headers?: HeadersInit) {
  const responseHeaders = new Headers(baseHeaders);
  new Headers(headers).forEach((value, name) => responseHeaders.set(name, value));
  return Response.json({ code, error: message, message, resolution }, { status, headers: responseHeaders });
}

export function publicApiMethodNotAllowed() {
  return apiError(405, "method_not_allowed", "Use GET or HEAD for this read-only endpoint.",
    "Send a GET request. The API documentation at /docs includes examples.",
    { Allow: "GET, HEAD, OPTIONS" });
}

export function publicApiOptions() {
  return new Response(null, { status: 204, headers: {
    ...baseHeaders,
    Allow: "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "X-API-Version",
  } });
}

const localQuotas = new Map<string, { window: number; count: number }>();

export async function consumeQuota(request: Request, scope = "", limit = REST_LIMIT) {
  const now = Math.floor(Date.now() / 1000);
  const window = now - now % REST_WINDOW;
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") : null;
  const db = getDb();
  let count: number;

  if (db) {
    const partition = ip && isIP(ip) ? ip : "local";
    const key = createHmac("sha256", process.env.DATABASE_URL!)
      .update(scope ? `${scope}:${window}:${partition}` : `${window}:${partition}`).digest("hex");
    // The key is window-specific. A guarded upsert shares one quota across
    // function instances and avoids incrementing a counter that has hit its cap.
    const result = await db.execute<{ used: number }>(sql`
      WITH expired AS (
        DELETE FROM public.api_rate_windows
        WHERE (window_start, client_key) IN (
          SELECT window_start, client_key FROM public.api_rate_windows
          WHERE window_start < ${window - REST_WINDOW}
          ORDER BY window_start LIMIT 32 FOR UPDATE SKIP LOCKED
        )
      )
      INSERT INTO public.api_rate_windows (window_start, client_key, used)
      VALUES (${window}, ${key}, 1)
      ON CONFLICT (window_start, client_key) DO UPDATE SET used = api_rate_windows.used + 1
        WHERE api_rate_windows.used < ${limit}
      RETURNING used
    `);
    count = result.rows[0]?.used ?? limit + 1;
  } else {
    // The static fixture mode also behaves correctly on a single local server.
    if (process.env.VERCEL_ENV === "production") throw new Error("Public API quota storage is unavailable.");
    const state = localQuotas.get(scope);
    count = state?.window === window ? state.count + 1 : 1;
    localQuotas.set(scope, { window, count });
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    reset: window + REST_WINDOW - now,
  };
}

export async function servePublicApi(request: Request, handler: () => Promise<Response>, vary?: string) {
  const headers = new Headers(baseHeaders);
  if (vary) headers.set("Vary", vary);

  try {
    const quota = await consumeQuota(request);
    headers.set("RateLimit-Policy", `public-api;q=${REST_LIMIT};w=${REST_WINDOW}`);
    headers.set("RateLimit", `public-api;r=${quota.remaining};t=${quota.reset}`);
    // Preserve the quota fields used by existing Amber integrations.
    headers.set("RateLimit-Limit", String(REST_LIMIT));
    headers.set("RateLimit-Remaining", String(quota.remaining));
    headers.set("RateLimit-Reset", String(quota.reset));

    if (!quota.allowed) {
      headers.set("Retry-After", String(quota.reset));
      return apiError(429, "rate_limit_exceeded", "The public REST API quota was exceeded.", "Wait for the seconds in Retry-After before retrying.", headers);
    }
  } catch (error) {
    console.error("[amber-public-api] Quota check failed:", error);
    headers.set("Retry-After", "60");
    return apiError(503, "quota_unavailable", "The public REST API is temporarily unavailable.", "Wait for the seconds in Retry-After before retrying.", headers);
  }

  const requestedVersion = request.headers.get("X-API-Version");
  if (requestedVersion !== null && requestedVersion !== API_VERSION) {
    return apiError(400, "unsupported_api_version", "Amber serves REST API version 1.0 at this URL.", "Omit X-API-Version or set it to 1.0.", headers);
  }

  try {
    const response = await handler();
    for (const [name, value] of headers) response.headers.set(name, value);
    return response;
  } catch (error) {
    console.error("[amber-public-api] Request failed:", error);
    return apiError(500, "internal_error", "Amber could not complete this request.", "Retry shortly or report repeated failures through /contact.", headers);
  }
}
