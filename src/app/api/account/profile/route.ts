import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { activeArenaEntryForUser, deleteActiveArenaEntry } from "@/data/arena-entry";
import { getDb } from "@/db";
import { alertSubscriptions, arenaPortfolios, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { isArenaHandleConflict } from "@/lib/arena-handle";
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

  let body: { handle?: string; avatarIcon?: string } | null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const handle = String(body?.handle ?? "")
    .trim()
    .replace(/^@+/, "")
    .slice(0, 28);

  if (handle.length < 2 || !/^[A-Za-z0-9_.-]+$/.test(handle)) {
    return NextResponse.json(
      { error: "Handle must be 2–28 characters (letters, numbers, _, ., -)." },
      { status: 400 }
    );
  }

  const avatarIcon = normalizeAvatarId(body?.avatarIcon);
  const now = new Date();

  const activeEntry = activeArenaEntryForUser(session.user.id, arenaMonth(now));
  const existingPorts = await db
    .select({ id: arenaPortfolios.id, handle: arenaPortfolios.handle })
    .from(arenaPortfolios)
    .where(activeEntry)
    .limit(1);

  const previous = existingPorts[0];
  try {
    await db.batch([
      db.update(user).set({ handle, avatarIcon, updatedAt: now }).where(eq(user.id, session.user.id)),
      db.update(arenaPortfolios).set({ handle, avatarIcon }).where(activeEntry),
    ]);
  } catch (error) {
    if (!isArenaHandleConflict(error)) throw error;
    return NextResponse.json(
      { error: `Handle @${handle} is already taken. Please choose another.` },
      { status: 409 }
    );
  }

  if (previous) {
    revalidateTag("arena");
    revalidatePath("/arena");
    revalidatePath(`/arena/${previous.id}`);
    revalidatePath(`/u/${previous.handle}`);
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

  if (scope === "portfolio") {
    const entryId = searchParams.get("id")?.trim();
    if (!entryId) {
      return NextResponse.json({ error: "An Arena entry ID is required." }, { status: 400 });
    }
    const [withdrawn] = await deleteActiveArenaEntry(db, session.user.id, arenaMonth(new Date()), entryId);
    if (!withdrawn) {
      return NextResponse.json({ error: "This Arena entry is no longer active." }, { status: 409 });
    }
    revalidateTag("arena");
    revalidatePath("/arena");
    revalidatePath(`/arena/${withdrawn.id}`);
    revalidatePath(`/u/${withdrawn.handle}`);
    return NextResponse.json({ ok: true, deleted: "portfolio" });
  }

  if (scope !== "account") {
    return NextResponse.json({ error: "Invalid deletion scope." }, { status: 400 });
  }

  // Fetch the affected routes before the account cascade deletes the portfolio records.
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

  const email = userRow[0]?.email?.trim().toLowerCase();
  // Cascades to sessions, linked accounts, watchlists, and Arena entries.
  const deleteUser = db.delete(user).where(eq(user.id, session.user.id));
  if (email) {
    await db.batch([
      db.delete(alertSubscriptions).where(eq(alertSubscriptions.email, email)),
      deleteUser,
    ]);
  } else {
    await deleteUser;
  }

  revalidateTag("arena");
  revalidatePath("/arena");
  if (userRow[0]?.handle) revalidatePath(`/u/${userRow[0].handle}`);
  for (const p of existingPorts) {
    revalidatePath(`/arena/${p.id}`);
    if (p.handle) revalidatePath(`/u/${p.handle}`);
  }
  return NextResponse.json({ ok: true, deleted: "account" });
}
