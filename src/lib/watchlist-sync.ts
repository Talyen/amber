export interface SavedWatchlist {
  owner: string | null;
  tickers: string[];
  guestTickers?: string[];
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
  guestTickers: string[] | undefined;
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
      write({
        owner: current.userId,
        tickers: current.pending.reduce(applyEdit, current.confirmed),
        ...(current.guestTickers ? { guestTickers: current.guestTickers } : {}),
      });
    }
  }

  async function refresh(current: WatchlistSession) {
    const { controller: { signal }, guestTickers } = current;
    const remote = await request(signal);
    signal.throwIfAborted();
    const confirmed = remote.length === 0 && guestTickers
      ? await request(signal, { tickers: guestTickers.slice(0, 30) })
      : remote;
    signal.throwIfAborted();
    current.confirmed = confirmed;
    current.guestTickers = undefined;
  }

  function connect(userId: string | null) {
    const cached = read();
    if (!userId) {
      session?.controller.abort();
      session = null;
      if (cached.owner !== null) write({ owner: null, tickers: cached.guestTickers ?? [] });
      return;
    }

    if (session?.userId !== userId) {
      session?.controller.abort();
      const guest = cached.owner === null ? cached.tickers : cached.guestTickers;
      const guestTickers = guest?.length ? guest : undefined;
      const confirmed = guestTickers ?? (cached.owner === userId ? cached.tickers : []);
      session = {
        userId,
        controller: new AbortController(),
        confirmed,
        guestTickers,
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
        await refresh(current);
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
      let submitted = false;
      try {
        if (current.guestTickers) {
          await refresh(current);
          publish(current);
        }
        signal.throwIfAborted();
        submitted = true;
        current.confirmed = await request(signal, edit);
      } catch {
        // The write may have reached the server before the response failed.
        if (submitted && !signal.aborted) {
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
