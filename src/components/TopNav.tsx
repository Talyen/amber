"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Check,
  GitCompareArrows,
  LayoutGrid,
  Link2,
  Moon,
  PieChart,
  Rss,
  Sun,
  Trophy,
} from "lucide-react";
import { AmberLogo } from "@/components/AmberLogo";
import { AuthButton } from "@/components/AuthButton";
import { CommandSearch } from "@/components/CommandSearch";

interface TopNavProps {
  activeTicker?: string;
  activeRoute?:
    | "index"
    | "compare"
    | "portfolio"
    | "arena"
    | "feed"
    | "ticker"
    | "settings"
    | "legal";
}

const NAV_LINKS: Array<{
  href: string;
  label: string;
  route: NonNullable<TopNavProps["activeRoute"]>;
  icon: typeof LayoutGrid;
}> = [
  { href: "/", label: "Explore", route: "index", icon: LayoutGrid },
  { href: "/feed", label: "Signals", route: "feed", icon: Rss },
  { href: "/compare", label: "Compare", route: "compare", icon: GitCompareArrows },
  { href: "/portfolio", label: "Portfolio", route: "portfolio", icon: PieChart },
  { href: "/arena", label: "Benchmarks", route: "arena", icon: Trophy },
];

export function TopNav({ activeTicker, activeRoute }: TopNavProps) {
  const currentRoute = activeRoute ?? (activeTicker ? "ticker" : "index");
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
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/"
            className="inline-flex h-8 shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--amber)] rounded-sm"
            aria-label="Amber Home"
          >
            <AmberLogo />
          </Link>

          <span
            className="hidden h-4 w-px bg-[var(--border)] md:inline-block"
            aria-hidden="true"
          />

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-1 py-1 md:flex"
          >
            {NAV_LINKS.map((item) => {
              const isActive = currentRoute === item.route;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon className="h-4 w-4 opacity-85" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <CommandSearch variant="nav" />

          <button
            type="button"
            onClick={handleCopyLink}
            aria-label={copied ? "Link copied" : "Share current page link"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 sm:px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
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
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            {isDark ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>

          <AuthButton />
        </div>
      </div>

      {/* Dedicated mobile & compact-tablet navigation bar (zero clipping) */}
      <nav
        aria-label="Mobile navigation"
        className="flex items-center justify-between gap-1 overflow-x-auto border-t border-[var(--border)] px-3 py-1.5 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {NAV_LINKS.map((item) => {
          const isActive = currentRoute === item.route;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-[var(--amber-soft)] text-[var(--amber)] ring-1 ring-inset ring-[var(--amber-border)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5 opacity-85" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
