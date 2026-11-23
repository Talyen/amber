import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { activeArenaEntryForUser } from "@/data/arena-entry";
import { getDb } from "@/db";
import { alertSubscriptions, arenaPortfolios, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { arenaMonth } from "@/lib/arena-period";
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

  const [userRows, portRows] = await Promise.all([
    db
      .select({
        email: user.email,
        handle: user.handle,
        avatarIcon: user.avatarIcon,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    db
      .select()
      .from(arenaPortfolios)
      .where(activeArenaEntryForUser(session.user.id, arenaMonth(new Date())))
      .limit(1),
  ]);

  const dbUser = userRows[0];
  const port = portRows[0] ?? null;

  return NextResponse.json({
    authenticated: true,
    user: {
      email: dbUser?.email ?? session.user.email,
      handle: dbUser?.handle ?? port?.handle ?? "",
      avatarIcon: dbUser?.avatarIcon ?? port?.avatarIcon ?? "compass",
    },
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

  let body: { handle?: string; avatarIcon?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const handle = String(body.handle ?? "")
    .trim()
    .replace(/^@+/, "")
    .slice(0, 28);

  if (handle.length < 2 || !/^[A-Za-z0-9_.-]+$/.test(handle)) {
    return NextResponse.json(
      { error: "Handle must be 2–28 characters (letters, numbers, _, ., -)." },
      { status: 400 }
    );
  }

  const lower = handle.toLowerCase();

  // Check uniqueness across other users AND other Arena portfolios (including Strategy Bots)
  const [userConflict, portConflict] = await Promise.all([
    db
      .select({ id: user.id })
      .from(user)
      .where(and(sql`lower(${user.handle}) = ${lower}`, ne(user.id, session.user.id)))
      .limit(1),
    db
      .select({ id: arenaPortfolios.id, userId: arenaPortfolios.userId })
      .from(arenaPortfolios)
      .where(and(
        sql`lower(${arenaPortfolios.handle}) = ${lower}`,
        or(isNull(arenaPortfolios.userId), ne(arenaPortfolios.userId, session.user.id))
      ))
      .limit(1),
  ]);

  if (userConflict.length > 0 || portConflict.length > 0) {
    return NextResponse.json(
      { error: `Handle @${handle} is already taken. Please choose another.` },
      { status: 409 }
    );
  }

  const avatarIcon = normalizeAvatarId(body.avatarIcon);
  const now = new Date();

  await db
    .update(user)
    .set({ handle, avatarIcon, updatedAt: now })
    .where(eq(user.id, session.user.id));

  // Keep user's Arena portfolio in sync if they have one
  const activeEntry = activeArenaEntryForUser(session.user.id, arenaMonth(now));
  const existingPorts = await db
    .select({ id: arenaPortfolios.id, handle: arenaPortfolios.handle })
    .from(arenaPortfolios)
    .where(activeEntry)
    .limit(1);

  if (existingPorts[0]) {
    await db
      .update(arenaPortfolios)
      .set({ handle, avatarIcon })
      .where(and(eq(arenaPortfolios.id, existingPorts[0].id), activeEntry));

    revalidateTag("arena");
    revalidatePath("/arena");
    revalidatePath(`/arena/${existingPorts[0].id}`);
    revalidatePath(`/u/${existingPorts[0].handle}`);
    revalidatePath(`/u/${handle}`);
  }

  return NextResponse.json({
    ok: true,
    user: { handle, avatarIcon },
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

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "portfolio";

  // Fetch existing handle & portfolio ID before deleting so we can revalidate their routes
  const [userRow, existingPorts] = await Promise.all([
    db
      .select({ handle: user.handle, email: user.email })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    db
      .select({ id: arenaPortfolios.id, handle: arenaPortfolios.handle })
      .from(arenaPortfolios)
      .where(
        and(
          eq(arenaPortfolios.userId, session.user.id),
          eq(arenaPortfolios.isBot, 0)
        )
      ),
  ]);

  const revalidateTargets = () => {
    revalidateTag("arena");
    revalidatePath("/arena");
    if (userRow[0]?.handle) revalidatePath(`/u/${userRow[0].handle}`);
    for (const p of existingPorts) {
      revalidatePath(`/arena/${p.id}`);
      if (p.handle) revalidatePath(`/u/${p.handle}`);
    }
  };

  if (scope === "account") {
    // Also purge any filing alert subscriptions tied to this user's email
    const email = userRow[0]?.email?.trim().toLowerCase();
    if (email) {
      await db
        .delete(alertSubscriptions)
        .where(eq(alertSubscriptions.email, email));
    }
    // Cascades to session, account, user_watchlists, arena_portfolios, arena_positions, arena_rebalances
    await db.delete(user).where(eq(user.id, session.user.id));
    revalidateTargets();
    return NextResponse.json({ ok: true, deleted: "account" });
  }

  await db
    .delete(arenaPortfolios)
    .where(
      and(
        eq(arenaPortfolios.userId, session.user.id),
        eq(arenaPortfolios.isBot, 0)
      )
    );

  revalidateTargets();

  return NextResponse.json({ ok: true, deleted: "portfolio" });
}
