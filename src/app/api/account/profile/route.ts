import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { arenaPortfolios, userWatchlists } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { normalizeAvatarId } from "@/lib/avatars";

export async function GET(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const [portRows, wlRows] = await Promise.all([
    db
      .select()
      .from(arenaPortfolios)
      .where(
        and(
          eq(arenaPortfolios.userId, session.user.id),
          eq(arenaPortfolios.isBot, 0)
        )
      )
      .limit(1),
    db
      .select({ ticker: userWatchlists.ticker })
      .from(userWatchlists)
      .where(eq(userWatchlists.userId, session.user.id)),
  ]);

  const port = portRows[0] ?? null;

  return NextResponse.json({
    authenticated: true,
    user: {
      email: session.user.email,
      name: session.user.name,
    },
    watchlistCount: wlRows.length,
    portfolio: port
      ? {
          id: port.id,
          handle: port.handle,
          title: port.title,
          thesis: port.thesis,
          avatarIcon: port.avatarIcon ?? "compass",
          lockedAt: port.lockedAt.toISOString(),
        }
      : null,
  });
}

export async function PATCH(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { handle?: string; avatarIcon?: string; title?: string; thesis?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const existingRows = await db
    .select()
    .from(arenaPortfolios)
    .where(
      and(
        eq(arenaPortfolios.userId, session.user.id),
        eq(arenaPortfolios.isBot, 0)
      )
    )
    .limit(1);

  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json(
      { error: "Publish a portfolio to the Arena first to customize your public handle." },
      { status: 404 }
    );
  }

  const handle = String(body.handle ?? existing.handle)
    .trim()
    .replace(/^@+/, "")
    .slice(0, 28);

  if (handle.length < 2 || !/^[A-Za-z0-9_.-]+$/.test(handle)) {
    return NextResponse.json(
      { error: "Handle must be 2–28 characters (letters, numbers, _, ., -)." },
      { status: 400 }
    );
  }

  // Enforce case-insensitive uniqueness across other Arena entries
  const conflict = await db
    .select({ id: arenaPortfolios.id })
    .from(arenaPortfolios)
    .where(
      and(
        sql`lower(${arenaPortfolios.handle}) = ${handle.toLowerCase()}`,
        ne(arenaPortfolios.id, existing.id)
      )
    )
    .limit(1);

  if (conflict.length > 0) {
    return NextResponse.json(
      { error: `Handle @${handle} is already taken. Please choose another.` },
      { status: 409 }
    );
  }

  const avatarIcon = body.avatarIcon
    ? normalizeAvatarId(body.avatarIcon)
    : existing.avatarIcon;
  const title =
    typeof body.title === "string" && body.title.trim().length >= 3
      ? body.title.trim().slice(0, 64)
      : existing.title;
  const thesis =
    typeof body.thesis === "string"
      ? body.thesis.trim().slice(0, 220)
      : existing.thesis;

  await db
    .update(arenaPortfolios)
    .set({ handle, avatarIcon, title, thesis })
    .where(eq(arenaPortfolios.id, existing.id));

  revalidateTag("arena");
  revalidatePath("/arena");
  revalidatePath(`/arena/${existing.id}`);
  revalidatePath(`/u/${existing.handle}`);
  revalidatePath(`/u/${handle}`);

  return NextResponse.json({
    ok: true,
    portfolio: { id: existing.id, handle, avatarIcon, title, thesis },
  });
}

export async function DELETE(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  }

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await db
    .delete(arenaPortfolios)
    .where(
      and(
        eq(arenaPortfolios.userId, session.user.id),
        eq(arenaPortfolios.isBot, 0)
      )
    );

  revalidateTag("arena");
  revalidatePath("/arena");

  return NextResponse.json({ ok: true });
}
