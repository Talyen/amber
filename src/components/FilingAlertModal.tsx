"use client";

import { useEffect, useRef, useState } from "react";
import { useDialogLightDismiss } from "@/lib/dialog-light-dismiss";
import { Bell, Check, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface FilingAlertModalProps {
  ticker: string;
  companyName: string;
  compactLabel?: boolean;
}

export function FilingAlertModal({
  ticker,
  companyName,
  compactLabel = false,
}: FilingAlertModalProps) {
  const { data: session } = authClient.useSession();
  const accountEmail = session?.user.email;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lightDismiss = useDialogLightDismiss(dialogRef);
  const inputRef = useRef<HTMLInputElement>(null);
  const [enteredEmail, setEnteredEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "confirmation" | "error">("idle");
  const [feedback, setFeedback] = useState("");
  const [subscriptions, setSubscriptions] = useState<{ email: string; tickers: string[] } | null>(null);
  const [confirmed, setConfirmed] = useState<{ ticker: string; email?: string } | null>(null);
  const email = enteredEmail ?? accountEmail ?? "";
  const isTracking =
    (confirmed?.ticker === ticker && confirmed.email === accountEmail) ||
    (subscriptions !== null && subscriptions.email === accountEmail && subscriptions.tickers.includes(ticker));

  useEffect(() => {
    if (!accountEmail) return;
    const controller = new AbortController();
    fetch("/api/alerts", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { authenticated?: boolean; tickers?: string[] } | null) => {
        if (!controller.signal.aborted && data?.authenticated && Array.isArray(data.tickers)) {
          setSubscriptions({ email: accountEmail, tickers: data.tickers });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [accountEmail]);

  function openModal() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setFeedback("");
    if (status === "error" || status === "confirmation") setStatus("idle");
    dialog.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeModal() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }

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
      const data = (await res.json()) as { subscribed?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setStatus("error");
        setFeedback(data.error ?? "Something went wrong.");
        return;
      }
      if (data.subscribed) {
        setStatus("idle");
        setConfirmed({ ticker, email: accountEmail });
        setFeedback(data.message ?? `Subscribed to ${ticker} filing alerts.`);
      } else {
        setStatus("confirmation");
        setFeedback(data.message ?? "Check your email to confirm your filing alerts.");
      }
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
          isTracking
            ? "border-[var(--amber-border)] bg-[var(--amber-soft)] text-[var(--amber)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        }`}
      >
        {isTracking ? (
          <>
            <Check className="h-3.5 w-3.5" />
            {compactLabel ? "Alerts On" : `Tracking ${ticker} filings`}
          </>
        ) : (
          <>
            <Bell className="h-3.5 w-3.5" />
            {compactLabel ? "Alerts" : "Alert me on next filing"}
          </>
        )}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="alert-dialog-title"
        {...lightDismiss}
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

        {isTracking ? (
          <div className="mt-4 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3.5 py-3 text-xs text-[var(--text-primary)]">
            <div className="flex items-center gap-2 font-medium text-[var(--amber)]">
              <Check className="h-4 w-4" />
              Subscription saved
            </div>
            {feedback && <p className="mt-1 text-[var(--text-secondary)]">{feedback}</p>}
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
                onChange={(e) => setEnteredEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber-border)]"
              />
            </div>

            {status === "confirmation" && (
              <p role="status" className="text-xs text-[var(--text-secondary)]">
                {feedback}
              </p>
            )}
            {status === "error" && feedback && (
              <p role="alert" className="text-xs text-[var(--negative)]">
                {feedback}
              </p>
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
