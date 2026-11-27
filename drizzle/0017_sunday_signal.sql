DO $$
BEGIN
  ALTER TABLE public.weekly_digest_subscribers
    ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
    ADD COLUMN IF NOT EXISTS confirmation_token uuid,
    ADD COLUMN IF NOT EXISTS confirmation_expires_at timestamptz;

  CREATE UNIQUE INDEX IF NOT EXISTS weekly_digest_confirmation_idx
    ON public.weekly_digest_subscribers (confirmation_token);

  CREATE TABLE IF NOT EXISTS public.weekly_digest_issues (
    issue_date date PRIMARY KEY,
    message jsonb NOT NULL
  );

  CREATE TABLE IF NOT EXISTS public.weekly_digest_deliveries (
    issue_date date NOT NULL REFERENCES public.weekly_digest_issues (issue_date) ON DELETE CASCADE,
    subscriber_id text NOT NULL REFERENCES public.weekly_digest_subscribers (id) ON DELETE CASCADE,
    unsubscribe_token uuid NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    PRIMARY KEY (issue_date, subscriber_id)
  );
END $$;
