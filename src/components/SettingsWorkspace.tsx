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
import { SiteFooter } from "@/components/SiteFooter";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { AVATAR_PRESETS, normalizeAvatarId, type AvatarId } from "@/lib/avatars";
import { setTheme, useTheme } from "@/lib/theme";

export interface SettingsProfileData {
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

interface SettingsWorkspaceProps {
  initialUserId?: string | null;
  initialProfile?: SettingsProfileData | null;
  initialAlertTickers?: string[] | null;
}

interface ProfileDraft {
  userId: string;
  handle?: string;
  avatarIcon?: AvatarId;
}

export function SettingsWorkspace({
  initialUserId = null,
  initialProfile = null,
  initialAlertTickers = null,
}: SettingsWorkspaceProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [profileState, setProfileState] = useState<{
    userId: string;
    profile: SettingsProfileData | null;
  } | null>(() =>
    initialUserId && initialProfile
      ? { userId: initialUserId, profile: initialProfile }
      : null
  );
  const [alertState, setAlertState] = useState<{
    userId: string;
    tickers: string[];
  } | null>(() =>
    initialUserId && initialAlertTickers
      ? { userId: initialUserId, tickers: initialAlertTickers }
      : null
  );
  const sessionUserId = isPending
    ? initialUserId
    : (session?.user?.id ?? null);
  const isAuthenticated = isPending
    ? Boolean(initialUserId)
    : Boolean(session?.user);
  const profile =
    sessionUserId && profileState?.userId === sessionUserId
      ? profileState.profile
      : null;
  const alertTickers =
    sessionUserId && alertState?.userId === sessionUserId
      ? alertState.tickers
      : [];
  const [profileDraft, setProfileDraft] = useState<ProfileDraft | null>(null);
  const draft = profileDraft?.userId === sessionUserId ? profileDraft : null;
  const handle = draft?.handle ?? profile?.user?.handle ?? "";
  const avatarIcon = draft?.avatarIcon ?? normalizeAvatarId(profile?.user?.avatarIcon);
  const isProfileDirty =
    handle.trim() !== (profile?.user?.handle ?? "").trim() ||
    avatarIcon !== normalizeAvatarId(profile?.user?.avatarIcon);
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
  const [digestPrefs, setDigestPrefs] = useState({
    watchlistDigest: false,
    includeFilingDiffs: true,
    includeForm4Buys: true,
    includeForm8k: true,
    includeValuationTriggers: true,
    valuationIrrThreshold: 15,
  });
  const [savingDigest, setSavingDigest] = useState(false);
  const [digestStatus, setDigestStatus] = useState("");

  const profileLoaded = profileState?.userId === sessionUserId;
  const alertsLoaded = alertState?.userId === sessionUserId;

  useEffect(() => {
    if (!sessionUserId || profileLoaded) return;
    const controller = new AbortController();
    fetch("/api/account/profile", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SettingsProfileData | null) => {
        if (!controller.signal.aborted && data?.authenticated) {
          setProfileState({ userId: sessionUserId, profile: data });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [sessionUserId, profileLoaded]);

  useEffect(() => {
    if (!sessionUserId || alertsLoaded) return;
    const controller = new AbortController();
    fetch("/api/alerts", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { authenticated?: boolean; tickers?: string[] } | null) => {
        if (!controller.signal.aborted && data?.authenticated && Array.isArray(data.tickers)) {
          setAlertState({ userId: sessionUserId, tickers: data.tickers });
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [sessionUserId, alertsLoaded]);

  useEffect(() => {
    if (!sessionUserId) return;
    const controller = new AbortController();
    fetch("/api/alerts/preferences", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { preferences?: typeof digestPrefs } | null) => {
        if (!controller.signal.aborted && data?.preferences) {
          setDigestPrefs(data.preferences);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [sessionUserId]);

  async function handleUpdateDigest(next: typeof digestPrefs) {
    if (!sessionUserId || savingDigest) return;
    const prev = digestPrefs;
    setDigestPrefs(next);
    setSavingDigest(true);
    setDigestStatus("");
    try {
      const res = await fetch("/api/alerts/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        setDigestPrefs(prev);
        setAlertError("Could not save Watchlist Digest preferences.");
      } else {
        setDigestStatus(
          next.watchlistDigest
            ? "Watchlist Digest enabled — sent daily when new signals arrive."
            : "Watchlist Digest paused."
        );
      }
    } catch {
      setDigestPrefs(prev);
      setAlertError("Network error while saving digest preferences.");
    } finally {
      setSavingDigest(false);
    }
  }

  function updateDraft(changes: Omit<ProfileDraft, "userId">) {
    if (!sessionUserId) return;
    setProfileDraft((prev) => ({
      ...(prev?.userId === sessionUserId ? prev : {}),
      ...changes,
      userId: sessionUserId,
    }));
  }

  async function handleSyncWatchlistAlerts() {
    if (!sessionUserId || syncingWatchlistAlerts || removingAlerts.length > 0) return;
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
    if (!sessionUserId || syncingWatchlistAlerts || removingAlerts.includes(ticker)) return;
    setRemovingAlerts((prev) => [...prev, ticker]);
    setAlertError("");
    try {
      const res = await fetch(`/api/alerts?ticker=${encodeURIComponent(ticker)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAlertState((prev) =>
          prev?.userId === sessionUserId
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
    if (!sessionUserId || saving) return;
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
        const savedHandle = data.user?.handle ?? handle;
        const savedAvatar = normalizeAvatarId(data.user?.avatarIcon ?? avatarIcon);
        setProfileDraft((prev) => prev?.userId === sessionUserId ? {
          ...prev,
          handle: prev.handle === handle ? savedHandle : prev.handle,
          avatarIcon: prev.avatarIcon === avatarIcon ? savedAvatar : prev.avatarIcon,
        } : prev);
        setProfileState((prev) => {
          if (prev?.userId !== sessionUserId || !prev.profile) return prev;
          const { user, portfolio } = prev.profile;
          const saved = { handle: savedHandle, avatarIcon: savedAvatar };
          return {
            ...prev,
            profile: {
              ...prev.profile,
              user: user && { ...user, ...saved },
              portfolio: portfolio && { ...portfolio, ...saved },
            },
          };
        });
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

        {!isAuthenticated ? (
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
                          onClick={() => updateDraft({ avatarIcon: preset.id })}
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
                    onChange={(e) => updateDraft({ handle: e.target.value })}
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
                    disabled={saving || !isProfileDirty}
                    className="inline-flex h-9 items-center rounded-lg bg-[var(--cta-bg)] px-4 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
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
                  {session?.user?.email ?? profile?.user?.email ?? ""}
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
                  disabled={syncingWatchlistAlerts || removingAlerts.length > 0}
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
                        disabled={syncingWatchlistAlerts || removingAlerts.includes(t)}
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

              {/* Daily Watchlist Digest */}
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Daily Watchlist Digest
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                      One concise email whenever your starred companies trigger new SEC signals — includes Filing Diff Radar highlights.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={digestPrefs.watchlistDigest}
                    aria-label="Toggle Daily Watchlist Digest"
                    disabled={savingDigest}
                    onClick={() =>
                      handleUpdateDigest({
                        ...digestPrefs,
                        watchlistDigest: !digestPrefs.watchlistDigest,
                      })
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                      digestPrefs.watchlistDigest
                        ? "bg-[var(--cta-bg)]"
                        : "border border-[var(--border-strong)] bg-[var(--bg)]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`inline-block h-4 w-4 rounded-full shadow-sm transition-transform ${
                        digestPrefs.watchlistDigest
                          ? "translate-x-6 bg-[var(--cta-fg)]"
                          : "translate-x-1 bg-[var(--text-muted)]"
                      }`}
                    />
                  </button>
                </div>

                {digestPrefs.watchlistDigest && (
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={digestPrefs.includeFilingDiffs}
                        disabled={savingDigest}
                        onChange={(e) =>
                          handleUpdateDigest({
                            ...digestPrefs,
                            includeFilingDiffs: e.target.checked,
                          })
                        }
                        className="accent-[var(--amber)]"
                      />
                      10-K/10-Q Diffs
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={digestPrefs.includeForm8k}
                        disabled={savingDigest}
                        onChange={(e) =>
                          handleUpdateDigest({
                            ...digestPrefs,
                            includeForm8k: e.target.checked,
                          })
                        }
                        className="accent-[var(--amber)]"
                      />
                      8-K Material Events
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={digestPrefs.includeForm4Buys}
                        disabled={savingDigest}
                        onChange={(e) =>
                          handleUpdateDigest({
                            ...digestPrefs,
                            includeForm4Buys: e.target.checked,
                          })
                        }
                        className="accent-[var(--amber)]"
                      />
                      Form 4 Insider Buys
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={digestPrefs.includeValuationTriggers}
                        disabled={savingDigest}
                        onChange={(e) =>
                          handleUpdateDigest({
                            ...digestPrefs,
                            includeValuationTriggers: e.target.checked,
                          })
                        }
                        className="accent-[var(--amber)]"
                      />
                      Saved Thesis IRR Targets
                    </label>
                    {digestPrefs.includeValuationTriggers && (
                      <div className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg)] p-0.5 text-[11px]">
                        {[12, 15, 20].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            disabled={savingDigest}
                            onClick={() =>
                              handleUpdateDigest({
                                ...digestPrefs,
                                valuationIrrThreshold: pct,
                              })
                            }
                            className={`font-mono-num rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
                              digestPrefs.valuationIrrThreshold === pct
                                ? "bg-[var(--amber-soft)] font-semibold text-[var(--amber)]"
                                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            ≥{pct}%
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {digestStatus && (
                  <p className="mt-2 text-xs text-[var(--positive)]">{digestStatus}</p>
                )}
              </div>
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

        <SiteFooter />
      </main>
    </div>
  );
}
