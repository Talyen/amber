import type { Metadata } from "next";
import { headers } from "next/headers";
import { and, desc, eq, isNull } from "drizzle-orm";
import { activeArenaEntryForUser } from "@/data/arena-entry";
import { getDb } from "@/db";
import { alertSubscriptions, arenaPortfolios, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { arenaMonth } from "@/lib/arena-period";
import {
  SettingsWorkspace,
  type SettingsProfileData,
} from "@/components/SettingsWorkspace";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your Amber public handle, profile icon, and display preferences.",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  let initialUserId: string | null = null;
  let initialProfile: SettingsProfileData | null = null;
  let initialAlertTickers: string[] | null = null;

  try {
    const db = getDb();
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (db && session?.user) {
      initialUserId = session.user.id;
      const normalizedEmail = session.user.email?.trim().toLowerCase() ?? "";
      const [userRows, portRows, alertRows] = await Promise.all([
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
        normalizedEmail
          ? db
              .select({ ticker: alertSubscriptions.ticker })
              .from(alertSubscriptions)
              .where(
                and(
                  eq(alertSubscriptions.email, normalizedEmail),
                  isNull(alertSubscriptions.confirmationExpiresAt)
                )
              )
              .orderBy(desc(alertSubscriptions.createdAt))
          : Promise.resolve([]),
      ]);

      const dbUser = userRows[0];
      const port = portRows[0] ?? null;
      initialProfile = {
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
      };
      initialAlertTickers = alertRows.map((a) => a.ticker).sort();
    }
  } catch {
    // Fall back gracefully if auth/DB is unavailable
  }

  return (
    <SettingsWorkspace
      initialUserId={initialUserId}
      initialProfile={initialProfile}
      initialAlertTickers={initialAlertTickers}
    />
  );
}
