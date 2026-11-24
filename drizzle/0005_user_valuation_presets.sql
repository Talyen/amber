DO $migration$
BEGIN
  CREATE TABLE IF NOT EXISTS public.user_valuation_presets (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    ticker text NOT NULL REFERENCES public.companies(ticker) ON DELETE CASCADE,
    lens text NOT NULL DEFAULT 'fcf',
    rev_growth double precision NOT NULL,
    target_margin double precision NOT NULL,
    exit_multiple double precision NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS user_valuation_presets_user_ticker_idx
    ON public.user_valuation_presets (user_id, ticker);

  CREATE INDEX IF NOT EXISTS user_valuation_presets_user_idx
    ON public.user_valuation_presets (user_id);
END;
$migration$;
