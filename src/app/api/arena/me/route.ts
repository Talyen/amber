import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { activeArenaEntryForUser } from "@/data/arena-entry";
import { getDb } from "@/db";
import { arenaPortfolios, arenaPositions } from "@/db/schema";
import { arenaMonth } from "@/lib/arena-period";
import { getAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ portfolio: null });
  }

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ portfolio: null });
    }

    const rows = await db
      .select()
      .from(arenaPortfolios)
      .where(activeArenaEntryForUser(session.user.id, arenaMonth(new Date())))
      .limit(1);

    const port = rows[0];
    if (!port) {
      return NextResponse.json({ portfolio: null });
    }

    const positions = await db
      .select({
        ticker: arenaPositions.ticker,
        weightPct: arenaPositions.weightPct,
      })
      .from(arenaPositions)
      .where(eq(arenaPositions.portfolioId, port.id));

    return NextResponse.json({
      portfolio: {
        id: port.id,
        handle: port.handle,
        title: port.title,
        thesis: port.thesis,
        avatarIcon: port.avatarIcon ?? "compass",
        nav: port.nav,
        lockedAt: port.lockedAt.toISOString(),
        lastRebalancedAt: (port.lastRebalancedAt ?? port.lockedAt).toISOString(),
        positions,
      },
    });
  } catch {
    return NextResponse.json({ portfolio: null });
  }
}
