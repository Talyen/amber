import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { arenaPortfolios, user } from "@/db/schema";
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
      .where(
        and(
          eq(arenaPortfolios.userId, session.user.id),
          eq(arenaPortfolios.isBot, 0)
        )
      )
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
      .where(sql`lower(${arenaPortfolios.handle}) = ${lower}`)
      .limit(2),
  ]);

  const takenByOtherPortfolio = portConflict.some(
    (p) => p.userId !== session.user.id
  );
  if (userConflict.length > 0 || takenByOtherPortfolio) {
    return NextResponse.json(
      { error: `Handle @${handle} is already taken. Please choose another.` },
      { status: 409 }
    );
  }

  const avatarIcon = normalizeAvatarId(body.avatarIcon);

  await db
    .update(user)
    .set({ handle, avatarIcon, updatedAt: new Date() })
    .where(eq(user.id, session.user.id));

  // Keep user's Arena portfolio in sync if they have one
  const existingPorts = await db
    .select({ id: arenaPortfolios.id, handle: arenaPortfolios.handle })
    .from(arenaPortfolios)
    .where(
      and(
        eq(arenaPortfolios.userId, session.user.id),
        eq(arenaPortfolios.isBot, 0)
      )
    )
    .limit(1);

  if (existingPorts[0]) {
    await db
      .update(arenaPortfolios)
      .set({ handle, avatarIcon })
      .where(eq(arenaPortfolios.id, existingPorts[0].id));

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

  if (scope === "account") {
    // Cascades to session, account, user_watchlists, arena_portfolios, arena_positions, arena_rebalances
    await db.delete(user).where(eq(user.id, session.user.id));
    revalidateTag("arena");
    revalidatePath("/arena");
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

  revalidateTag("arena");
  revalidatePath("/arena");

  return NextResponse.json({ ok: true, deleted: "portfolio" });
}
