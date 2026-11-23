"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  LogOut,
  Monitor,
  Moon,
  Shield,
  Sun,
  Trash2,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { openAuthDialog } from "@/components/AuthButton";
import { TopNav } from "@/components/TopNav";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { AVATAR_PRESETS, normalizeAvatarId, type AvatarId } from "@/lib/avatars";

interface ProfileResponse {
  authenticated: boolean;
  user?: { email: string; name: string };
  watchlistCount?: number;
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
  const { data: session, isPending } = authClient.useSession();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [handle, setHandle] = useState("");
  const [title, setTitle] = useState("");
  const [thesis, setThesis] = useState("");
  const [avatarIcon, setAvatarIcon] = useState<AvatarId>("compass");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    const saved = window.localStorage.getItem("amber-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    let active = true;
    fetch("/api/account/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProfileResponse | null) => {
        if (!active || !data) return;
        setProfile(data);
        if (data.portfolio) {
          setHandle(data.portfolio.handle);
          setTitle(data.portfolio.title);
          setThesis(data.portfolio.thesis);
          setAvatarIcon(normalizeAvatarId(data.portfolio.avatarIcon));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.user]);

  function applyTheme(next: "system" | "light" | "dark") {
    setTheme(next);
    if (next === "system") {
      delete document.documentElement.dataset.theme;
      window.localStorage.removeItem("amber-theme");
    } else {
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("amber-theme", next);
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
        body: JSON.stringify({ handle, avatarIcon, title, thesis }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        portfolio?: ProfileResponse["portfolio"];
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not save settings.");
      } else {
        setProfile((prev) =>
          prev ? { ...prev, portfolio: data.portfolio ?? prev.portfolio } : prev
        );
        setSavedMsg("Profile updated.");
        window.setTimeout(() => setSavedMsg(""), 2500);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleWithdrawPortfolio() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/account/profile", { method: "DELETE" });
      if (res.ok) {
        setProfile((prev) => (prev ? { ...prev, portfolio: null } : prev));
        setConfirmDelete(false);
      } else {
        setError("Could not withdraw portfolio.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <TopNav />

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <div className="border-b border-[var(--border)] pb-5">
          <div className="font-mono-num text-xs font-semibold text-[var(--amber)]">
            ACCOUNT &amp; PREFERENCES
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            Settings
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Manage your public Arena handle, profile icon, and display preferences.
          </p>
        </div>

        {!isPending && !session?.user ? (
          <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Sign in to manage account settings
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Your public handle, profile icon, and cloud-synced watchlist are tied to your Google or GitHub account.
            </p>
            <button
              type="button"
              onClick={openAuthDialog}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--amber)] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
            >
              Sign In
            </button>
          </section>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Public Arena Identity */}
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Public Arena Identity
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Shown on leaderboards and your public investor profile. Never uses your real name.
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

              {profile?.portfolio ? (
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

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="settings-handle"
                        className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        Public Handle
                      </label>
                      <input
                        id="settings-handle"
                        type="text"
                        required
                        value={handle}
                        onChange={(e) => setHandle(e.target.value)}
                        placeholder="e.g. value_owl"
                        className="font-mono-num h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--amber-border)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="settings-title"
                        className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        Portfolio Title
                      </label>
                      <input
                        id="settings-title"
                        type="text"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--amber-border)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="settings-thesis"
                      className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                    >
                      One-Sentence Thesis
                    </label>
                    <input
                      id="settings-thesis"
                      type="text"
                      value={thesis}
                      onChange={(e) => setThesis(e.target.value)}
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--amber-border)] focus:outline-none"
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
                      className="inline-flex h-9 items-center rounded-lg bg-[var(--amber)] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
                    >
                      {saving ? "Saving…" : "Save Changes"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
                  <div className="text-xs text-[var(--text-secondary)]">
                    You haven&apos;t published a portfolio to the Arena yet. Choose your handle and icon when you publish your first basket.
                  </div>
                  <Link
                    href="/portfolio"
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-[var(--amber)] px-3 text-xs font-semibold text-white"
                  >
                    Go to Portfolio
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </section>

            {/* Account & Privacy */}
            <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[var(--amber)]" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Account &amp; Privacy
                </h2>
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3.5">
                  <dt className="text-[var(--text-muted)]">
                    Email <span className="ml-1 opacity-75">(Private, never shown publicly)</span>
                  </dt>
                  <dd className="font-mono-num mt-1 font-medium text-[var(--text-primary)]">
                    {session?.user?.email ?? "—"}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3.5">
                  <dt className="text-[var(--text-muted)]">Cloud-Synced Watchlist</dt>
                  <dd className="mt-1 flex items-center justify-between">
                    <span className="font-mono-num font-medium text-[var(--text-primary)]">
                      {profile?.watchlistCount ?? 0} starred companies
                    </span>
                    <Link
                      href="/filings"
                      className="text-[var(--amber)] hover:underline"
                    >
                      Open Filings
                    </Link>
                  </dd>
                </div>
              </dl>
            </section>

            {/* Theme Preference */}
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
                      onClick={() => applyTheme(t.id)}
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

            {/* Session & Withdraw Controls */}
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-center gap-2">
                {profile?.portfolio && !confirmDelete && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-xs font-medium text-[var(--negative)] transition-colors hover:border-[var(--negative)] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Withdraw Arena Portfolio
                  </button>
                )}
                {confirmDelete && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--negative)]">
                      Remove your portfolio from leaderboards?
                    </span>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleWithdrawPortfolio}
                      className="h-8 rounded-md bg-[var(--negative)] px-3 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                    >
                      {deleting ? "Removing…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="h-8 rounded-md border border-[var(--border)] px-2.5 text-xs text-[var(--text-secondary)] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
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
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
