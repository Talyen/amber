DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS user_valuation_history (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    ticker text NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
    lens text NOT NULL DEFAULT 'fcf',
    rev_growth double precision NOT NULL,
    target_margin double precision NOT NULL,
    exit_multiple double precision NOT NULL,
    thesis_note text,
    price_at_save double precision,
    filing_date_at_save text,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS user_valuation_history_user_ticker_created_idx
    ON user_valuation_history (user_id, ticker, created_at DESC);
END $$;
