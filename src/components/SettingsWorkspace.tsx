"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  LogOut,
  Monitor,
  Moon,
  Shield,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { openAuthDialog } from "@/components/AuthButton";
import { TopNav } from "@/components/TopNav";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { AVATAR_PRESETS, normalizeAvatarId, type AvatarId } from "@/lib/avatars";
import { setTheme, useTheme } from "@/lib/theme";

interface ProfileResponse {
  authenticated: boolean;
  user?: { email: string; handle: string; avatarIcon: string };
  portfolio?: {
    id: string;
    handle: string;
    title: string;
    thesis: string;
    avatarIcon: string;
    lockedAt: string;
  } | null;
}

export function SettingsWorkspace() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [profileState, setProfileState] = useState<{
    userId: string;
    profile: ProfileResponse | null;
  } | null>(null);
  const [alertState, setAlertState] = useState<{
    userId: string;
    tickers: string[];
  } | null>(null);
  const sessionUserId = session?.user?.id ?? null;
  const profile =
    sessionUserId && profileState?.userId === sessionUserId
      ? profileState.profile
      : null;
  const alertTickers =
    sessionUserId && alertState?.userId === sessionUserId
      ? alertState.tickers
      : [];
  const [handle, setHandle] = useState("");
  const [avatarIcon, setAvatarIcon] = useState<AvatarId>("compass");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const theme = useTheme() ?? "system";
  const [removingAlerts, setRemovingAlerts] = useState<string[]>([]);
  const [syncingWatchlistAlerts, setSyncingWatchlistAlerts] = useState(false);
  const [alertStatus, setAlertStatus] = useState("");
  const [alertError, setAlertError] = useState("");

  useEffect(() => {
    if (!sessionUserId) {
      return;
    }
    let active = true;
    fetch("/api/account/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProfileResponse | null) => {
        if (!active || !data) return;
        setProfileState({ userId: sessionUserId, profile: data });
        if (data.user) {
          setHandle(data.user.handle ?? "");
          setAvatarIcon(normalizeAvatarId(data.user.avatarIcon));
        }
      })
      .catch(() => {});

    fetch("/api/alerts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tickers?: string[] } | null) => {
        if (active && Array.isArray(data?.tickers)) {
          setAlertState({ userId: sessionUserId, tickers: data.tickers });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [sessionUserId]);

  async function handleSyncWatchlistAlerts() {
    if (!sessionUserId) return;
    setSyncingWatchlistAlerts(true);
    setAlertError("");
    setAlertStatus("");
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "watchlist" }),
      });
      const data = (await res.json()) as {
        tickers?: string[];
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setAlertError(data.error ?? "Could not sync watchlist alerts.");
      } else {
        if (Array.isArray(data.tickers)) {
          setAlertState({ userId: sessionUserId, tickers: data.tickers });
        }
        setAlertStatus(data.message ?? "Watchlist alerts enabled.");
      }
    } catch {
      setAlertError("Network error while syncing watchlist alerts.");
    } finally {
      setSyncingWatchlistAlerts(false);
    }
  }

  async function handleUnsubscribeAlert(ticker: string) {
    setRemovingAlerts((prev) => [...prev, ticker]);
    setAlertError("");
    try {
      const res = await fetch(`/api/alerts?ticker=${encodeURIComponent(ticker)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAlertState((prev) =>
          prev
            ? { ...prev, tickers: prev.tickers.filter((t) => t !== ticker) }
            : prev
        );
      } else {
        setAlertError(`Could not unsubscribe from ${ticker} filing alerts. Please try again.`);
      }
    } catch {
      setAlertError(`Could not unsubscribe from ${ticker} filing alerts. Please try again.`);
    } finally {
      setRemovingAlerts((prev) => prev.filter((t) => t !== ticker));
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSavedMsg("");
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, avatarIcon }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        user?: { handle: string; avatarIcon: string };
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not save profile.");
      } else {
        setProfileState((prev) =>
          prev?.profile
            ? {
                ...prev,
                profile: {
                  ...prev.profile,
                  user: prev.profile.user
                    ? {
                        ...prev.profile.user,
                        handle: data.user?.handle ?? handle,
                        avatarIcon: data.user?.avatarIcon ?? avatarIcon,
                      }
                    : prev.profile.user,
                  portfolio: prev.profile.portfolio
                    ? {
                        ...prev.profile.portfolio,
                        handle: data.user?.handle ?? handle,
                        avatarIcon: data.user?.avatarIcon ?? avatarIcon,
                      }
                    : null,
                },
              }
            : prev
        );
        window.dispatchEvent(new CustomEvent("amber:profile-updated"));
        setSavedMsg("Profile saved.");
        window.setTimeout(() => setSavedMsg(""), 2500);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdrawPortfolio() {
    const entryId = profile?.portfolio?.id;
    if (!entryId) return;
    setDeleting(true);
    setError("");
    try {
      const params = new URLSearchParams({ scope: "portfolio", id: entryId });
      const res = await fetch(`/api/account/profile?${params}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProfileState((prev) =>
          prev?.profile?.portfolio?.id === entryId
            ? { ...prev, profile: { ...prev.profile, portfolio: null } }
            : prev
        );
        setConfirmWithdraw(false);
      } else {
        setError("Could not withdraw portfolio.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/account/profile?scope=account", {
        method: "DELETE",
      });
      if (res.ok) {
        await authClient.signOut().catch(() => {});
        router.push("/");
        router.refresh();
      } else {
        setError("Could not delete account.");
        setDeleting(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav activeRoute="settings" />

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <div className="border-b border-[var(--border)] pb-5">
          <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
            ACCOUNT &amp; PREFERENCES
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            Settings
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Choose your public nickname, profile icon, and display preferences.
          </p>
        </div>

        {!isPending && !session?.user ? (
          <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Sign in to manage account settings
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Sign in with Google or GitHub to set your public nickname and profile icon.
            </p>
            <button
              type="button"
              onClick={openAuthDialog}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--cta-bg)] px-4 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)] cursor-pointer"
            >
              Sign In
            </button>
          </section>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Standalone Public Profile */}
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Profile &amp; Nickname
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Shown in the header and on leaderboards instead of your Google or GitHub name.
                  </p>
                </div>
                {profile?.portfolio && (
                  <Link
                    href={`/u/${encodeURIComponent(profile.portfolio.handle)}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--amber)] hover:underline"
                  >
                    View /u/{profile.portfolio.handle}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>

              <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                    Profile Icon
                  </span>
                  <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
                    {AVATAR_PRESETS.map((preset) => {
                      const selected = avatarIcon === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setAvatarIcon(preset.id)}
                          aria-label={`Select ${preset.label} icon`}
                          aria-pressed={selected}
                          title={preset.label}
                          className={`flex items-center justify-center rounded-lg border p-1.5 transition-colors cursor-pointer ${
                            selected
                              ? "border-[var(--amber)] bg-[var(--amber-soft)]"
                              : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--border-strong)]"
                          }`}
                        >
                          <ProfileAvatar icon={preset.id} size="sm" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="max-w-sm">
                  <label
                    htmlFor="settings-handle"
                    className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    Nickname / Handle
                  </label>
                  <input
                    id="settings-handle"
                    type="text"
                    required
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="e.g. value_owl"
                    className="font-mono-num h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
                  />
                </div>

                {error && <p className="text-xs text-[var(--negative)]">{error}</p>}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--positive)]">
                    {savedMsg && (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        {savedMsg}
                      </>
                    )}
                  </span>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-9 items-center rounded-lg bg-[var(--cta-bg)] px-4 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)] disabled:opacity-50 cursor-pointer"
                  >
                    {saving ? "Saving…" : "Save Profile"}
                  </button>
                </div>
              </form>
            </section>

            {/* Account & Privacy */}
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[var(--amber)]" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Account &amp; Privacy
                </h2>
              </div>

              <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3.5 text-xs">
                <div className="text-[var(--text-muted)]">
                  Email <span className="ml-1 opacity-75">(Private, never shown publicly)</span>
                </div>
                <div className="font-mono-num mt-1 font-medium text-[var(--text-primary)]">
                  {session?.user?.email ?? ""}
                </div>
              </div>
            </section>

            {/* SEC Filing Alerts */}
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-[var(--amber)]" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    SEC Filing Alerts
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={syncingWatchlistAlerts}
                  onClick={handleSyncWatchlistAlerts}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 text-[11px] font-semibold text-[var(--amber)] transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {syncingWatchlistAlerts ? "Syncing…" : "Enable for Watchlist"}
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Email notifications when tracked companies file a new 10-K or 10-Q.
              </p>
              {alertStatus && (
                <p className="mt-2 text-xs text-[var(--positive)]">{alertStatus}</p>
              )}

              {alertTickers.length === 0 ? (
                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3 text-xs text-[var(--text-muted)]">
                  No active filing alerts. Open any company&apos;s Filing Diffs tab to subscribe.
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {alertTickers.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs"
                    >
                      <Link
                        href={`/t/${t}`}
                        className="font-mono-num font-semibold text-[var(--amber)] hover:underline"
                      >
                        {t}
                      </Link>
                      <button
                        type="button"
                        disabled={removingAlerts.includes(t)}
                        onClick={() => handleUnsubscribeAlert(t)}
                        aria-label={`Unsubscribe from ${t} filing alerts`}
                        className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--negative)] disabled:opacity-50 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {alertError && (
                <p role="alert" className="mt-2 text-xs text-[var(--negative)]">{alertError}</p>
              )}
            </section>

            {/* Appearance */}
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Appearance
              </h2>
              <div className="mt-3 inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5 text-xs">
                {(
                  [
                    { id: "system", label: "System", icon: Monitor },
                    { id: "light", label: "Light", icon: Sun },
                    { id: "dark", label: "Dark", icon: Moon },
                  ] as const
                ).map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      aria-pressed={theme === t.id}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors cursor-pointer ${
                        theme === t.id
                          ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Danger Zone & Sign Out */}
            <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {profile?.portfolio && !confirmWithdraw && (
                    <button
                      type="button"
                      onClick={() => setConfirmWithdraw(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--negative)] hover:text-[var(--negative)] cursor-pointer"
                    >
                      Withdraw Arena Portfolio
                    </button>
                  )}

                  {!confirmDeleteAccount && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAccount(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium text-[var(--negative)] transition-colors hover:border-[var(--negative)] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Account
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => authClient.signOut()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>

              {confirmWithdraw && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-xs">
                  <span className="text-[var(--text-secondary)]">
                    Remove your portfolio from the Arena leaderboard?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleWithdrawPortfolio}
                      className="h-7 rounded-md bg-[var(--negative)] px-3 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                    >
                      {deleting ? "Removing…" : "Confirm Withdraw"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmWithdraw(false)}
                      className="h-7 rounded-md border border-[var(--border)] px-2.5 text-xs text-[var(--text-secondary)] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {confirmDeleteAccount && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--negative)]/40 bg-[var(--bg)] p-3 text-xs">
                  <span className="text-[var(--negative)]">
                    Permanently delete your account, watchlist, and Arena portfolio? This cannot be undone.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleDeleteAccount}
                      className="h-7 rounded-md bg-[var(--negative)] px-3 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Yes, Delete Account"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAccount(false)}
                      className="h-7 rounded-md border border-[var(--border)] px-2.5 text-xs text-[var(--text-secondary)] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
