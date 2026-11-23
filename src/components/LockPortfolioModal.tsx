"use client";

import { useEffect, useRef, useState } from "react";
import { useDialogLightDismiss } from "@/lib/dialog-light-dismiss";
import { useRouter } from "next/navigation";
import { RefreshCw, Trophy, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { openAuthDialog } from "@/components/AuthButton";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { AVATAR_PRESETS, normalizeAvatarId, type AvatarId } from "@/lib/avatars";

interface LockPortfolioModalProps {
  positions: Array<{ ticker: string; weight: number }>;
  buttonLabel?: string;
}

interface ExistingArenaPortfolio {
  id: string;
  handle: string;
  title: string;
  thesis: string;
  avatarIcon?: string;
  nav: number;
  lockedAt: string;
  lastRebalancedAt: string;
}

export function LockPortfolioModal({
  positions,
  buttonLabel,
}: LockPortfolioModalProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lightDismiss = useDialogLightDismiss(dialogRef);
  const handleRef = useRef<HTMLInputElement>(null);

  const [existing, setExisting] = useState<ExistingArenaPortfolio | null>(null);
  const [handle, setHandle] = useState("");
  const [title, setTitle] = useState("");
  const [thesis, setThesis] = useState("");
  const [avatarIcon, setAvatarIcon] = useState<AvatarId>("compass");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.user) {
      setExisting(null);
      return;
    }
    let active = true;
    Promise.all([
      fetch("/api/arena/me").then((res) => (res.ok ? res.json() : null)),
      fetch("/api/account/profile").then((res) => (res.ok ? res.json() : null)),
    ])
      .then(
        ([arenaData, profileData]: [
          { portfolio: ExistingArenaPortfolio | null } | null,
          { user?: { handle?: string; avatarIcon?: string } } | null,
        ]) => {
          if (!active) return;
          const port = arenaData?.portfolio ?? null;
          setExisting(port);
          if (port) {
            setHandle(port.handle);
            setTitle(port.title);
            setThesis(port.thesis);
            setAvatarIcon(normalizeAvatarId(port.avatarIcon));
          } else if (profileData?.user) {
            if (profileData.user.handle) setHandle(profileData.user.handle);
            if (profileData.user.avatarIcon) {
              setAvatarIcon(normalizeAvatarId(profileData.user.avatarIcon));
            }
          }
        }
      )
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.user]);

  function openModal() {
    if (!session?.user) {
      openAuthDialog();
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setError("");
    dialog.showModal();
    window.requestAnimationFrame(() => handleRef.current?.focus());
  }

  function closeModal() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/arena/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, title, thesis, avatarIcon, positions }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not save portfolio.");
        setSubmitting(false);
        return;
      }
      closeModal();
      router.push(data.url);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const canPublish = positions.length >= 3 && positions.length <= 10;
  const isRebalance = Boolean(existing);
  const resolvedButtonLabel = isRebalance
    ? "Rebalance Arena Portfolio"
    : buttonLabel ?? "Publish to Arena";

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={!canPublish}
        title={
          !canPublish
            ? "Arena entries require between 3 and 10 stocks"
            : !session?.user
              ? "Sign in to publish your portfolio to the Arena"
              : isRebalance
                ? "Update your Arena portfolio weights and holdings"
                : "Publish this portfolio to compete on the Arena leaderboard"
        }
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--cta-bg)] px-3.5 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
      >
        {isRebalance ? (
          <RefreshCw className="h-3.5 w-3.5" />
        ) : (
          <Trophy className="h-3.5 w-3.5" />
        )}
        {resolvedButtonLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="lock-arena-title"
        {...lightDismiss}
        className="amber-dialog m-auto w-[min(480px,calc(100vw-2rem))] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-5 text-[var(--text-primary)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono-num text-[11px] font-semibold text-[var(--amber)]">
              PORTFOLIO ARENA
            </div>
            <h2
              id="lock-arena-title"
              className="mt-0.5 text-base font-semibold text-[var(--text-primary)]"
            >
              {isRebalance
                ? `Rebalance your ${positions.length}-stock portfolio`
                : `Publish your ${positions.length}-stock portfolio`}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close Arena portfolio dialog"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
          {isRebalance
            ? "Your cumulative return so far is banked automatically, and these updated holdings take effect from today's closing prices."
            : "Enter the Arena leaderboard with one active portfolio per account. You can rebalance holdings or weights anytime."}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-2.5">
          {positions.map((p) => (
            <span
              key={p.ticker}
              className="font-mono-num rounded bg-[var(--surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber)] ring-1 ring-inset ring-[var(--border)]"
            >
              {p.ticker}
            </span>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Profile Icon
            </span>
            <div className="grid grid-cols-6 gap-1.5">
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

          <div>
            <label
              htmlFor="arena-handle"
              className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
            >
              Public Handle
            </label>
            <input
              ref={handleRef}
              id="arena-handle"
              type="text"
              required
              autoFocus
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="e.g. value_owl (never uses your Google name)"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              Shown publicly on leaderboards instead of your Google or GitHub name.
            </p>
          </div>

          <div>
            <label
              htmlFor="arena-title"
              className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
            >
              Portfolio Title
            </label>
            <input
              id="arena-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2026 Cash Machines & AI Leaders"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="arena-thesis"
              className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
            >
              One-Sentence Thesis (optional)
            </label>
            <textarea
              id="arena-thesis"
              rows={2}
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Why this basket will outperform over the next 12 months…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-[var(--negative)]">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeModal}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--cta-bg)] px-4 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)] disabled:opacity-50 cursor-pointer"
            >
              {isRebalance ? (
                <RefreshCw className="h-3 w-3" />
              ) : (
                <Trophy className="h-3 w-3" />
              )}
              {submitting
                ? isRebalance
                  ? "Rebalancing…"
                  : "Publishing…"
                : isRebalance
                  ? "Save Rebalance"
                  : "Publish to Arena"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
