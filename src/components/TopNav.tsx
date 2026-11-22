"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Check, Link2, Moon, Sun } from "lucide-react";
import { AmberLogo } from "@/components/AmberLogo";
import { PILOT_TICKERS } from "@/data/pilot-tickers";

interface TopNavProps {
  activeTicker: string;
}

export function TopNav({ activeTicker }: TopNavProps) {
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);

    const saved = window.localStorage.getItem("amber-theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    }

    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isDark = theme === "system" ? systemDark : theme === "dark";

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("amber-theme", next);
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/t/${activeTicker}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback ignored silently if clipboard is restricted
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-5 min-w-0">
          <Link
            href="/"
            className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--amber)] rounded-sm"
            aria-label="Amber Home"
          >
            <AmberLogo />
          </Link>

          <span
            className="hidden h-4 w-px bg-[var(--border)] sm:inline-block"
            aria-hidden="true"
          />

          <nav
            aria-label="Pilot companies"
            className="flex items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {PILOT_TICKERS.map((company) => {
              const isActive = company.ticker === activeTicker;
              return (
                <Link
                  key={company.ticker}
                  href={`/t/${company.ticker}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`font-mono-num shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {company.ticker}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[var(--positive)]" />
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {isDark ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
