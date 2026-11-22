"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

const STORAGE_KEY = "amber-watchlist-v1";
const SYNC_EVENT = "amber-watchlist-change";

function readWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writeWatchlist(tickers: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
    window.dispatchEvent(new Event(SYNC_EVENT));
  } catch {
    // Ignore storage quota / private mode restrictions
  }
}

export function useWatchlist() {
  const { data: session } = authClient.useSession();
  const [tickers, setTickers] = useState<string[]>([]);

  useEffect(() => {
    setTickers(readWatchlist());
    const sync = () => setTickers(readWatchlist());
    window.addEventListener("storage", sync);
    window.addEventListener(SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SYNC_EVENT, sync);
    };
  }, []);

  // Hydrate from Neon Postgres when signed in
  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    fetch("/api/watchlist")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tickers?: string[]; authenticated?: boolean } | null) => {
        if (!active || !data?.authenticated || !Array.isArray(data.tickers)) return;
        const local = readWatchlist();
        const remote = data.tickers;
        if (remote.length > 0) {
          writeWatchlist(remote);
          setTickers(remote);
        } else if (local.length > 0) {
          // Seed cloud watchlist from existing local stars on first sign-in
          for (const t of local.slice(0, 20)) {
            fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ticker: t, action: "add" }),
            }).catch(() => {});
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.user]);

  const toggle = useCallback(
    (rawTicker: string) => {
      const ticker = rawTicker.trim().toUpperCase();
      const current = readWatchlist();
      const isRemoving = current.includes(ticker);
      const next = isRemoving
        ? current.filter((t) => t !== ticker)
        : [ticker, ...current];
      writeWatchlist(next);
      setTickers(next);

      if (session?.user) {
        fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker,
            action: isRemoving ? "remove" : "add",
          }),
        }).catch(() => {});
      }
    },
    [session?.user]
  );

  const has = useCallback(
    (rawTicker: string) => tickers.includes(rawTicker.trim().toUpperCase()),
    [tickers]
  );

  return { tickers, toggle, has };
}
