"use client";

import { useCallback, useEffect, useState } from "react";

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

  const toggle = useCallback((rawTicker: string) => {
    const ticker = rawTicker.trim().toUpperCase();
    const current = readWatchlist();
    const next = current.includes(ticker)
      ? current.filter((t) => t !== ticker)
      : [ticker, ...current];
    writeWatchlist(next);
    setTickers(next);
  }, []);

  const has = useCallback(
    (rawTicker: string) => tickers.includes(rawTicker.trim().toUpperCase()),
    [tickers]
  );

  return { tickers, toggle, has };
}
