DO $migration$
BEGIN
  ALTER TABLE public.annual_financials
    ADD COLUMN IF NOT EXISTS dividends_paid double precision;
END;
$migration$;
