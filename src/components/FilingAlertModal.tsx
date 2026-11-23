"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Check, X } from "lucide-react";

interface FilingAlertModalProps {
  ticker: string;
  companyName: string;
}

export function FilingAlertModal({
  ticker,
  companyName,
}: FilingAlertModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  function openModal() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setFeedback("");
    if (status === "error") setStatus("idle");
    dialog.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
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
    setStatus("submitting");
    setFeedback("");

    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ticker }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setStatus("error");
        setFeedback(data.error ?? "Something went wrong.");
        return;
      }
      setStatus("done");
      setFeedback(data.message ?? `Subscribed to ${ticker} filing alerts.`);
    } catch {
      setStatus("error");
      setFeedback("Network error. Please try again.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors cursor-pointer ${
          status === "done"
            ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        }`}
      >
        {status === "done" ? (
          <>
            <Check className="h-3.5 w-3.5" />
            Tracking {ticker} filings
          </>
        ) : (
          <>
            <Bell className="h-3.5 w-3.5" />
            Alert me on next filing
          </>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="alert-dialog-title"
        {...({ closedby: "any" } as Record<string, string>)}
        className="amber-dialog m-auto w-[min(440px,calc(100vw-2rem))] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-5 text-[var(--text-primary)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono-num text-[11px] font-semibold text-[var(--amber)]">
              {ticker} Filing Alerts
            </div>
            <h2
              id="alert-dialog-title"
              className="mt-0.5 text-base font-semibold text-[var(--text-primary)]"
            >
              Get notified on new {companyName} filings
            </h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close alert dialog"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
          Get a concise email whenever {ticker} files a new 10-K or 10-Q, covering True FCF changes, SBC shifts, and Risk Factor diffs. Zero spam.
        </p>

        {status === "done" ? (
          <div className="mt-4 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3.5 py-3 text-xs text-[var(--text-primary)]">
            <div className="flex items-center gap-2 font-medium text-[var(--amber)]">
              <Check className="h-4 w-4" />
              Subscription saved
            </div>
            <p className="mt-1 text-[var(--text-secondary)]">{feedback}</p>
            <button
              type="button"
              onClick={closeModal}
              className="mt-3 inline-flex h-8 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="alert-email"
                className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Email address
              </label>
              <input
                ref={inputRef}
                id="alert-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
              />
            </div>

            {status === "error" && feedback && (
              <p className="text-xs text-[var(--negative)]">{feedback}</p>
            )}

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
                disabled={status === "submitting"}
                className="h-8 rounded-md bg-[var(--cta-bg)] px-3.5 text-xs font-semibold text-[var(--cta-fg)] ring-1 ring-inset ring-white/15 transition-colors hover:bg-[var(--cta-bg-hover)] disabled:opacity-50 cursor-pointer"
              >
                {status === "submitting" ? "Saving…" : `Track ${ticker}`}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
