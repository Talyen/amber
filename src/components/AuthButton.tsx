"use client";

import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut, User, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface ProviderAvailability {
  google: boolean;
  github: boolean;
}

export function openAuthDialog() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("amber:open-auth"));
  }
}

export function AuthButton() {
  const { data: session, isPending } = authClient.useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<ProviderAvailability>({
    google: false,
    github: false,
  });

  function openModal() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setError("");
    dialog.showModal();
    window.requestAnimationFrame(() => emailRef.current?.focus());
  }

  function closeModal() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }

  useEffect(() => {
    const onOpen = () => openModal();
    window.addEventListener("amber:open-auth", onOpen);
    return () => window.removeEventListener("amber:open-auth", onOpen);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/providers")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProviderAvailability | null) => {
        if (active && data) setProviders(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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

  async function handleSocial(provider: "google" | "github") {
    setError("");
    setSubmitting(true);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: window.location.href,
      });
    } catch {
      setError(`Could not start ${provider} sign-in.`);
      setSubmitting(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({
          name: name.trim() || email.split("@")[0],
          email: email.trim(),
          password,
        });
        if (res.error) {
          setError(res.error.message ?? "Could not create account.");
          setSubmitting(false);
          return;
        }
      } else {
        const res = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (res.error) {
          setError(res.error.message ?? "Invalid email or password.");
          setSubmitting(false);
          return;
        }
      }
      setSubmitting(false);
      setPassword("");
      closeModal();
    } catch {
      setError("Authentication request failed. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await authClient.signOut();
  }

  if (isPending) {
    return (
      <div
        aria-hidden="true"
        className="h-8 w-16 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] opacity-60"
      />
    );
  }

  if (session?.user) {
    const displayName =
      session.user.name?.trim() || session.user.email?.split("@")[0] || "Account";
    return (
      <div className="inline-flex items-center gap-1">
        <span
          title={session.user.email ?? displayName}
          className="hidden h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text-primary)] md:inline-flex"
        >
          <User className="h-3.5 w-3.5 text-[var(--amber)]" />
          <span className="max-w-[110px] truncate">{displayName}</span>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          title="Sign out"
          aria-label="Sign out"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Sign Out</span>
        </button>
      </div>
    );
  }

  const hasSocial = providers.google || providers.github;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 text-xs font-semibold text-[var(--amber)] transition-colors hover:bg-[var(--amber)] hover:text-white cursor-pointer"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span>Sign In</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="amber-auth-title"
        {...({ closedby: "any" } as Record<string, string>)}
        className="amber-dialog m-auto w-[min(420px,calc(100vw-2rem))] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-5 text-[var(--text-primary)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono-num text-[11px] font-semibold text-[var(--amber)]">
              AMBER ACCOUNT
            </div>
            <h2
              id="amber-auth-title"
              className="mt-0.5 text-base font-semibold text-[var(--text-primary)]"
            >
              {mode === "signin"
                ? "Sign in to your account"
                : "Create an Amber account"}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close sign in dialog"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
          Manage your Arena portfolio and rebalance positions anytime.
        </p>

        {hasSocial && (
          <div className="mt-4 space-y-2">
            {providers.google && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSocial("google")}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] cursor-pointer disabled:opacity-50"
              >
                Continue with Google
              </button>
            )}
            {providers.github && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSocial("github")}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] cursor-pointer disabled:opacity-50"
              >
                Continue with GitHub
              </button>
            )}
            <div className="relative py-1 text-center text-[11px] text-[var(--text-muted)]">
              <span className="bg-[var(--surface)] px-2">or continue with email</span>
            </div>
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3">
          {mode === "signup" && (
            <div>
              <label
                htmlFor="auth-name"
                className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Display Name
              </label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ryan"
                className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
            >
              Email
            </label>
            <input
              ref={emailRef}
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
            >
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--amber-border)] focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-[var(--negative)]">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-9 w-full items-center justify-center rounded-md bg-[var(--amber)] px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {submitting
              ? "Please wait…"
              : mode === "signin"
                ? "Sign In"
                : "Create Account"}
          </button>
        </form>

        <div className="mt-4 border-t border-[var(--border)] pt-3 text-center text-xs text-[var(--text-secondary)]">
          {mode === "signin" ? (
            <>
              New to Amber?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
                className="font-semibold text-[var(--amber)] hover:underline cursor-pointer"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
                className="font-semibold text-[var(--amber)] hover:underline cursor-pointer"
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
