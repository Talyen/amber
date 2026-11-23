CREATE TABLE IF NOT EXISTS "public"."filing_diff_no_changes" (
  "ticker" text NOT NULL REFERENCES "public"."companies" ("ticker") ON DELETE CASCADE,
  "accession_number" text NOT NULL,
  PRIMARY KEY ("ticker", "accession_number")
);
