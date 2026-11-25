DO $migration$
BEGIN
  ALTER TABLE public.user_valuation_presets
    ADD COLUMN IF NOT EXISTS thesis_note text;
END;
$migration$;
