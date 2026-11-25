import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { userAlertPreferences } from "@/db/schema";
import { getAuth } from "@/lib/auth";

export interface AlertPreferencesPayload {
  watchlistDigest: boolean;
  includeFilingDiffs: boolean;
  includeForm4Buys: boolean;
  includeForm8k: boolean;
}

const DEFAULT_PREFS: AlertPreferencesPayload = {
  watchlistDigest: false,
  includeFilingDiffs: true,
  includeForm4Buys: true,
  includeForm8k: true,
};

export async function GET(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ authenticated: false, preferences: DEFAULT_PREFS });
  }
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ authenticated: false, preferences: DEFAULT_PREFS });
    }
    const [row] = await db
      .select()
      .from(userAlertPreferences)
      .where(eq(userAlertPreferences.userId, userId))
      .limit(1);

    return NextResponse.json({
      authenticated: true,
      preferences: row
        ? {
            watchlistDigest: row.watchlistDigest,
            includeFilingDiffs: row.includeFilingDiffs,
            includeForm4Buys: row.includeForm4Buys,
            includeForm8k: row.includeForm8k,
          }
        : DEFAULT_PREFS,
    });
  } catch {
    return NextResponse.json({ authenticated: false, preferences: DEFAULT_PREFS });
  }
}

export async function PUT(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Sign in to update alert preferences." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const prefs: AlertPreferencesPayload = {
    watchlistDigest: Boolean(raw.watchlistDigest),
    includeFilingDiffs: raw.includeFilingDiffs !== false,
    includeForm4Buys: raw.includeForm4Buys !== false,
    includeForm8k: raw.includeForm8k !== false,
  };

  const now = new Date();
  await db
    .insert(userAlertPreferences)
    .values({
      userId,
      ...prefs,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userAlertPreferences.userId,
      set: {
        ...prefs,
        updatedAt: now,
      },
    });

  return NextResponse.json({ ok: true, preferences: prefs });
}
