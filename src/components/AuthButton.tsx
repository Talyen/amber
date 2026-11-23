"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDialogLightDismiss } from "@/lib/dialog-light-dismiss";
import { LogIn, LogOut, Settings, X } from "lucide-react";
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

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      className="h-4 w-4 fill-current"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function AuthButton() {
  const { data: session, isPending } = authClient.useSession();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lightDismiss = useDialogLightDismiss(dialogRef);

  const [submitting, setSubmitting] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<ProviderAvailability | null>(null);
  const [userHandle, setUserHandle] = useState<string>("");

  useEffect(() => {
    if (!session?.user) {
      setUserHandle("");
      return;
    }
    const fetchProfile = () => {
      fetch("/api/account/profile")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { user?: { handle?: string } } | null) => {
          setUserHandle(data?.user?.handle ?? "");
        })
        .catch(() => {});
    };
    fetchProfile();
    window.addEventListener("amber:profile-updated", fetchProfile);
    return () => window.removeEventListener("amber:profile-updated", fetchProfile);
  }, [session?.user]);

  function openModal() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setError("");
    dialog.showModal();
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
      .catch(() => {
        if (active) setProviders({ google: false, github: false });
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSocial(provider: "google" | "github") {
    setError("");
    setSubmitting(provider);
    try {
      const res = await authClient.signIn.social({
        provider,
        callbackURL: window.location.href,
      });
      if (res?.error) {
        setError(res.error.message ?? `Could not sign in with ${provider}.`);
        setSubmitting(null);
      }
    } catch {
      setError(`Could not start ${provider} sign-in.`);
      setSubmitting(null);
    }
  }

  async function handleSignOut() {
    await authClient.signOut();
  }

  if (!isPending && session?.user) {
    const displayLabel = userHandle || "Settings";
    return (
      <div className="inline-flex items-center gap-1">
        <Link
          href="/settings"
          title="Account & Profile Settings"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] hover:text-[var(--amber)]"
        >
          <Settings className="h-3.5 w-3.5 text-[var(--amber)]" />
          <span className="hidden max-w-[110px] truncate md:inline">
            {displayLabel}
          </span>
        </Link>
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

  const anyConfigured = Boolean(providers?.google || providers?.github);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--amber-border)] bg-[var(--amber-soft)] px-2.5 text-xs font-semibold text-[var(--amber)] transition-colors hover:bg-[var(--cta-bg)] hover:text-[var(--cta-fg)] cursor-pointer"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span>Sign In</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="amber-auth-title"
        {...lightDismiss}
        className="amber-dialog m-auto w-[min(400px,calc(100vw-2rem))] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-5 text-[var(--text-primary)] shadow-2xl"
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
              Sign in to Amber
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

        <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
          Sign in with Google or GitHub to sync your watchlist across devices, manage filing alerts, and publish your Arena portfolio. Amber never stores passwords.
        </p>

        <div className="mt-5 space-y-2.5">
          {providers === null ? (
            <div className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] opacity-60" />
          ) : anyConfigured ? (
            <>
              {providers.google && (
                <button
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => handleSocial("google")}
                  className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-4 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] cursor-pointer disabled:opacity-50"
                >
                  <GoogleIcon />
                  {submitting === "google"
                    ? "Redirecting to Google…"
                    : "Continue with Google"}
                </button>
              )}

              {providers.github && (
                <button
                  type="button"
                  disabled={submitting !== null}
                  onClick={() => handleSocial("github")}
                  className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-4 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--amber-border)] cursor-pointer disabled:opacity-50"
                >
                  <GitHubIcon />
                  {submitting === "github"
                    ? "Redirecting to GitHub…"
                    : "Continue with GitHub"}
                </button>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3 text-xs text-[var(--text-secondary)]">
              Sign-in providers are being configured. Check back shortly.
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-[var(--negative)]">{error}</p>}

        <p className="mt-4 border-t border-[var(--border)] pt-3 text-center text-[11px] text-[var(--text-muted)]">
          By signing in you agree to Amber&apos;s{" "}
          <Link href="/terms" onClick={closeModal} className="text-[var(--text-secondary)] hover:text-[var(--amber)] hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" onClick={closeModal} className="text-[var(--text-secondary)] hover:text-[var(--amber)] hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </dialog>
    </>
  );
}
