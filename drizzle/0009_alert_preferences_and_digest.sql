DO $migration$
BEGIN
  CREATE TABLE IF NOT EXISTS public.user_alert_preferences (
    user_id text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
    watchlist_digest boolean NOT NULL DEFAULT false,
    include_filing_diffs boolean NOT NULL DEFAULT true,
    include_form4_buys boolean NOT NULL DEFAULT true,
    include_form8k boolean NOT NULL DEFAULT true,
    last_digest_sent_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
END;
$migration$;
