import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { userSavedScreens } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import {
  normalizeSavedScreenFilters,
  normalizeSavedScreenName,
} from "@/lib/saved-screens";

const MAX_SAVED_SCREENS = 15;

export async function GET(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ authenticated: false, screens: [] });
  }
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ authenticated: false, screens: [] });
    }
    const rows = await db
      .select()
      .from(userSavedScreens)
      .where(eq(userSavedScreens.userId, userId))
      .orderBy(desc(userSavedScreens.updatedAt))
      .limit(MAX_SAVED_SCREENS);

    return NextResponse.json({
      authenticated: true,
      screens: rows.map((row) => ({
        id: row.id,
        name: row.name,
        filters: row.filters,
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ authenticated: false, screens: [] });
  }
}

export async function POST(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Sign in to save screens." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = normalizeSavedScreenName(raw.name);
  if (!name) {
    return NextResponse.json({ error: "Screen name must be 2–48 characters." }, { status: 400 });
  }
  const filters = normalizeSavedScreenFilters(raw.filters);
  if (Object.keys(filters).length === 0) {
    return NextResponse.json({ error: "Add at least one filter before saving." }, { status: 400 });
  }

  const existing = await db
    .select({ id: userSavedScreens.id })
    .from(userSavedScreens)
    .where(eq(userSavedScreens.userId, userId));
  if (existing.length >= MAX_SAVED_SCREENS) {
    return NextResponse.json(
      { error: `You can save up to ${MAX_SAVED_SCREENS} screens. Delete an older one first.` },
      { status: 400 }
    );
  }

  const id = `scr_${randomUUID().slice(0, 12)}`;
  const now = new Date();
  await db.insert(userSavedScreens).values({
    id,
    userId,
    name,
    filters,
    updatedAt: now,
  });

  return NextResponse.json({
    ok: true,
    screen: { id, name, filters, updatedAt: now.toISOString() },
  });
}

export async function DELETE(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing screen id." }, { status: 400 });
  }

  await db
    .delete(userSavedScreens)
    .where(and(eq(userSavedScreens.id, id), eq(userSavedScreens.userId, userId)));

  return NextResponse.json({ ok: true, deleted: id });
}
