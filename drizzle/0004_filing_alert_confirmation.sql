DO $migration$
BEGIN
  ALTER TABLE public.alert_subscriptions
    ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS confirmation_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS delivery_accession text,
    ADD COLUMN IF NOT EXISTS delivery_started_at timestamptz;

  CREATE UNIQUE INDEX IF NOT EXISTS alert_unsubscribe_token_idx
    ON public.alert_subscriptions (unsubscribe_token);
END;
$migration$;
