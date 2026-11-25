DO $migration$
BEGIN
  ALTER TABLE public.user_valuation_presets
    ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

  CREATE TABLE IF NOT EXISTS public.user_saved_screens (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name text NOT NULL,
    filters jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS user_saved_screens_user_idx
    ON public.user_saved_screens (user_id);

  CREATE TABLE IF NOT EXISTS public.user_portfolios (
    user_id text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
    input_mode text NOT NULL DEFAULT 'weight',
    holdings jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
END;
$migration$;
