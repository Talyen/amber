DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.user_valuation_saves (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    ticker text NOT NULL REFERENCES public.companies(ticker) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS user_valuation_saves_user_idx
    ON public.user_valuation_saves (user_id);
END $$;
