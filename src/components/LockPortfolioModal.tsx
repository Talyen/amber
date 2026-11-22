"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck, X } from "lucide-react";

interface LockPortfolioModalProps {
  positions: Array<{ ticker: string; weight: number }>;
  buttonLabel?: string;
}

export function LockPortfolioModal({
  positions,
  buttonLabel = "Lock into Arena",
}: LockPortfolioModalProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);
  const [handle, setHandle] = useState("");
  const [title, setTitle] = useState("");
  const [thesis, setThesis] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function openModal() {
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

  // Safari fallback for closedby="any"
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (
      typeof HTMLDialogElement !== "undefined" &&
      "closedBy" in HTMLDialogElement.prototype
    ) {
      return;
    }
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };
    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
    };
    dialog.addEventListener("pointerdown", onDown);
    dialog.addEventListener("pointerup", onUp);
    return () => {
      dialog.removeEventListener("pointerdown", onDown);
      dialog.removeEventListener("pointerup", onUp);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/arena/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, title, thesis, positions }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not lock portfolio.");
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

  const canLock = positions.length >= 3 && positions.length <= 10;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={!canLock}
        title={
          canLock
            ? "Lock this portfolio at official EOD prices to compete on the Arena leaderboard"
            : "Arena entries require between 3 and 10 stocks"
        }
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--amber)] px-3.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
      >
        <Lock className="h-3.5 w-3.5" />
        {buttonLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="lock-arena-title"
        {...({ closedby: "any" } as Record<string, string>)}
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
              Publish your {positions.length}-stock portfolio
            </h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close lock portfolio dialog"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
          Enter the Arena leaderboard starting from today&apos;s closing prices. Returns update automatically after each market close.
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
              placeholder="e.g. compounder_ryan"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
            />
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
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--amber)] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Lock className="h-3 w-3" />
              {submitting ? "Locking…" : "Lock & Publish"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
