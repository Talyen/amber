"use client";

import { useState, type FormEvent } from "react";

export function SundaySignalSignup() {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const email = new FormData(form).get("email");
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/digest-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      setStatus({ text: response.ok ? result.message : result.error, error: !response.ok });
      if (response.ok) form.reset();
    } catch {
      setStatus({ text: "Could not start signup. Try again later or use RSS.", error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={subscribe} className="mt-4 border-t border-[var(--border)] pt-4">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">Sunday Signal</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">A weekly email with SEC filing changes, insider buys, and one Amber research insight.</p>
      <label htmlFor="sunday-signal-email" className="mt-3 block text-xs font-medium text-[var(--text-secondary)]">Email address</label>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <input id="sunday-signal-email" name="email" type="email" autoComplete="email" required maxLength={254}
          className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm text-[var(--text-primary)]" />
        <button type="submit" disabled={pending}
          className="rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--amber)] disabled:opacity-60">
          {pending ? "Sending…" : "Subscribe"}
        </button>
      </div>
      {status && <p role={status.error ? "alert" : "status"} className="mt-2 text-xs text-[var(--text-secondary)]">{status.text}</p>}
    </form>
  );
}
