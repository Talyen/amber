"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { createWatchlistSync, type SavedWatchlist } from "@/lib/watchlist-sync";

const STORAGE_KEY = "amber-watchlist-v1";
const SYNC_EVENT = "amber-watchlist-change";
const EMPTY_WATCHLIST: SavedWatchlist = { owner: null, tickers: [] };
let memory = EMPTY_WATCHLIST;
let storageWriteFailed = false;

function readWatchlist(): SavedWatchlist {
  if (storageWriteFailed) return memory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memory = EMPTY_WATCHLIST;
      return memory;
    }
    const parsed = JSON.parse(raw);
    const tickers = Array.isArray(parsed) ? parsed : parsed?.tickers;
    const guestTickers = Array.isArray(parsed?.guestTickers)
      ? parsed.guestTickers.filter((x: unknown): x is string => typeof x === "string")
      : undefined;
    memory = {
      owner: typeof parsed?.owner === "string" ? parsed.owner : null,
      tickers: Array.isArray(tickers) ? tickers.filter((x): x is string => typeof x === "string") : [],
      ...(guestTickers?.length ? { guestTickers } : {}),
      ...(parsed?.guestImportChecked === true ? { guestImportChecked: true } : {}),
    };
    return memory;
  } catch {
    return memory;
  }
}

function writeWatchlist(value: SavedWatchlist) {
  memory = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    storageWriteFailed = false;
  } catch {
    storageWriteFailed = true;
  }
  window.dispatchEvent(new Event(SYNC_EVENT));
}

const watchlistSync = createWatchlistSync({
  read: readWatchlist,
  write: writeWatchlist,
  async request(signal, mutation) {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
    const response = await fetch("/api/watchlist", mutation ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
      signal: requestSignal,
    } : { signal: requestSignal });
    if (!response.ok) throw new Error("Watchlist sync failed");
    const data: { tickers?: string[]; authenticated?: boolean } = await response.json();
    if (data.authenticated === false || !Array.isArray(data.tickers)) {
      throw new Error("Watchlist sync returned no authenticated list");
    }
    return data.tickers;
  },
});

export function useWatchlist() {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const [cached, setCached] = useState<SavedWatchlist | null>(null);
  const tickers = cached?.owner === null || cached?.owner === userId
    ? cached.tickers
    : EMPTY_WATCHLIST.tickers;
  const ready = cached !== null && (!isPending || cached.owner === null);
  const canEdit = cached !== null && !isPending;

  useEffect(() => {
    const sync = () => setCached(readWatchlist());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) sync();
    };
    sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener(SYNC_EVENT, sync);
    if (!isPending) watchlistSync.connect(userId);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SYNC_EVENT, sync);
    };
  }, [isPending, userId]);

  const toggle = useCallback(
    (rawTicker: string) => {
      if (canEdit) watchlistSync.toggle(rawTicker.trim().toUpperCase(), userId);
    },
    [canEdit, userId]
  );

  const has = useCallback(
    (rawTicker: string) => tickers.includes(rawTicker.trim().toUpperCase()),
    [tickers]
  );

  return { tickers, toggle, has, ready, canEdit };
}
