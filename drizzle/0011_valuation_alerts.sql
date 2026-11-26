DO $migration$
BEGIN
  ALTER TABLE public.user_alert_preferences
    ADD COLUMN IF NOT EXISTS include_valuation_triggers boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS valuation_irr_threshold double precision NOT NULL DEFAULT 15;

  ALTER TABLE public.user_valuation_presets
    ADD COLUMN IF NOT EXISTS last_valuation_alert_at timestamptz;
END;
$migration$;
