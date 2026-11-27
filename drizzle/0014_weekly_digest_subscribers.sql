DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS public.weekly_digest_subscribers (
    id text PRIMARY KEY,
    email text NOT NULL,
    unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
    is_active boolean NOT NULL DEFAULT true,
    last_sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS weekly_digest_email_idx
    ON public.weekly_digest_subscribers (email);

  CREATE UNIQUE INDEX IF NOT EXISTS weekly_digest_unsub_token_idx
    ON public.weekly_digest_subscribers (unsubscribe_token);
END $$;
