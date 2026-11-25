DO $migration$
BEGIN
  ALTER TABLE public.annual_financials
    ADD COLUMN IF NOT EXISTS depreciation_amortization double precision;

  ALTER TABLE public.annual_financials
    ADD COLUMN IF NOT EXISTS goodwill_intangibles double precision;
END;
$migration$;
