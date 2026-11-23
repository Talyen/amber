export interface SavedWatchlist {
  owner: string | null;
  tickers: string[];
}

interface WatchlistEdit {
  ticker: string;
  action: "add" | "remove";
}

type WatchlistMutation = WatchlistEdit | { tickers: string[] };

interface WatchlistSession {
  userId: string;
  controller: AbortController;
  confirmed: string[];
  pending: WatchlistEdit[];
  queue: Promise<void>;
  loading: boolean;
}

function applyEdit(tickers: string[], { ticker, action }: WatchlistEdit) {
  if (action === "remove") return tickers.filter((entry) => entry !== ticker);
  return tickers.includes(ticker) ? tickers : [ticker, ...tickers];
}

export function createWatchlistSync({
  read,
  write,
  request,
}: {
  read: () => SavedWatchlist;
  write: (value: SavedWatchlist) => void;
  request: (signal: AbortSignal, mutation?: WatchlistMutation) => Promise<string[]>;
}) {
  let session: WatchlistSession | null = null;

  function publish(current: WatchlistSession) {
    if (session === current) {
      write({ owner: current.userId, tickers: current.pending.reduce(applyEdit, current.confirmed) });
    }
  }

  function connect(userId: string | null) {
    const cached = read();
    if (!userId) {
      session?.controller.abort();
      session = null;
      if (cached.owner !== null) write({ owner: null, tickers: [] });
      return;
    }

    if (session?.userId !== userId) {
      session?.controller.abort();
      const confirmed = cached.owner === null || cached.owner === userId ? cached.tickers : [];
      session = {
        userId,
        controller: new AbortController(),
        confirmed,
        pending: [],
        queue: Promise.resolve(),
        loading: false,
      };
      if (cached.owner !== null && cached.owner !== userId) publish(session);
    }

    const current = session;
    if (current.loading || current.pending.length > 0) return;
    current.loading = true;
    current.queue = current.queue.then(async () => {
      const { signal } = current.controller;
      try {
        if (signal.aborted) return;
        const remote = await request(signal);
        if (signal.aborted) return;
        current.confirmed = remote.length === 0 && cached.owner === null && cached.tickers.length > 0
          ? await request(signal, { tickers: cached.tickers.slice(0, 30) })
          : remote;
        publish(current);
      } catch {
        // Preserve the current cache and let later sync attempts retry.
      } finally {
        current.loading = false;
      }
    });
  }

  function toggle(ticker: string, userId: string | null) {
    if (session?.userId !== userId) connect(userId);
    const cached = read();
    const edit: WatchlistEdit = {
      ticker,
      action: cached.tickers.includes(ticker) ? "remove" : "add",
    };
    if (!session) {
      write({ owner: null, tickers: applyEdit(cached.tickers, edit) });
      return;
    }

    const current = session;
    current.pending.push(edit);
    publish(current);
    current.queue = current.queue.then(async () => {
      const { signal } = current.controller;
      if (signal.aborted) return;
      try {
        current.confirmed = await request(signal, edit);
      } catch {
        // The write may have reached the server before the response failed.
        if (!signal.aborted) {
          try {
            current.confirmed = await request(signal);
          } catch {
            // Roll back to the last confirmed list if the server remains unavailable.
          }
        }
      } finally {
        current.pending.shift();
        publish(current);
      }
    });
  }

  return { connect, toggle };
}
