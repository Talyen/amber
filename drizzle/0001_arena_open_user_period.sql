CREATE UNIQUE INDEX IF NOT EXISTS "arena_open_user_period_idx"
ON "public"."arena_portfolios" USING btree (
  "user_id",
  COALESCE(
    "period_key",
    LPAD(EXTRACT(YEAR FROM "locked_at" AT TIME ZONE 'UTC')::int::text, 4, '0') || '-' ||
    LPAD(EXTRACT(MONTH FROM "locked_at" AT TIME ZONE 'UTC')::int::text, 2, '0')
  )
)
WHERE "is_bot" = 0 AND "final_return_pct" IS NULL;
