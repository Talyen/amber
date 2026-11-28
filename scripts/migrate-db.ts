import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { neon } from "@neondatabase/serverless";

function productionDatabaseUrl() {
  const directory = mkdtempSync(join(tmpdir(), "amber-migration-"));
  const envFile = join(directory, "production.env");
  try {
    execFileSync("vercel", [
      "env", "pull", envFile, "--environment=production", "--project=amber",
      "--scope=talyen-s-projects", "--yes", "--non-interactive",
    ], { stdio: ["ignore", "ignore", "inherit"] });
    return parseEnv(readFileSync(envFile, "utf8")).DATABASE_URL;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function migrate() {
  const url = process.argv.includes("--production") ? productionDatabaseUrl() : process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to apply Amber's migrations.");

  const sql = neon(url);
  const arenaIndexMigration = readFileSync(
    new URL("../drizzle/0001_arena_open_user_period.sql", import.meta.url),
    "utf8"
  );
  const filingDiffMigration = readFileSync(
    new URL("../drizzle/0002_filing_diff_no_changes.sql", import.meta.url),
    "utf8"
  );

  await sql.transaction([
    sql`set local lock_timeout = '5s'`,
    sql`set local statement_timeout = '20s'`,
    sql.query(arenaIndexMigration),
    sql.query(filingDiffMigration),
    sql.query(readFileSync(new URL("../drizzle/0003_arena_handle_ownership.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0004_filing_alert_confirmation.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0005_user_valuation_presets.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0006_valuation_preset_notes.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0007_sector_financial_inputs.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0008_dividends_paid.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0009_alert_preferences_and_digest.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0010_saved_screens_portfolios_public_theses.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0011_valuation_alerts.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0012_company_quote_date.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0013_valuation_thesis_history.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0014_weekly_digest_subscribers.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0015_valuation_save_receipts.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0016_public_api_rate_windows.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0017_sunday_signal.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0018_distribution_counts.sql", import.meta.url), "utf8")),
    sql.query(readFileSync(new URL("../drizzle/0019_valuation_business_facts.sql", import.meta.url), "utf8")),
  ]);

  const [index] = await sql`
    select i.indisvalid and i.indisready and i.indisunique and i.indnkeyatts = 2 as enforced,
      pg_get_indexdef(i.indexrelid, 1, true) as user_key,
      pg_get_indexdef(i.indexrelid, 2, true) as period_key,
      pg_get_expr(i.indpred, i.indrelid, true) as predicate
    from pg_index i
    where i.indexrelid = to_regclass('public.arena_open_user_period_idx')
      and i.indrelid = 'public.arena_portfolios'::regclass
  `;
  const periodKey = [
    "COALESCE(period_key, (lpad(EXTRACT(year FROM (locked_at AT TIME ZONE 'UTC'::text))",
    "::integer::text, 4, '0'::text) || '-'::text) || lpad(EXTRACT(month FROM ",
    "(locked_at AT TIME ZONE 'UTC'::text))::integer::text, 2, '0'::text))",
  ].join("");
  if (!index?.enforced || index.user_key !== "user_id" || index.period_key !== periodKey ||
      index.predicate !== "is_bot = 0 AND final_return_pct IS NULL") {
    throw new Error("Could not verify the Arena open-entry uniqueness index.");
  }
  console.log("[amber-migrate] Verified arena_open_user_period_idx.");

  const [filingDiffTable] = await sql`
    select
      exists (
        select 1 from pg_constraint
        where conrelid = to_regclass('public.filing_diff_no_changes')
          and contype = 'p' and convalidated
          and pg_get_constraintdef(oid) = 'PRIMARY KEY (ticker, accession_number)'
      ) as primary_key,
      exists (
        select 1 from pg_constraint
        where conrelid = to_regclass('public.filing_diff_no_changes')
          and contype = 'f' and convalidated and confdeltype = 'c'
          and confrelid = 'public.companies'::regclass
          and pg_get_constraintdef(oid) like 'FOREIGN KEY (ticker) REFERENCES %companies(ticker) ON DELETE CASCADE'
      ) as company_reference
  `;
  if (!filingDiffTable?.primary_key || !filingDiffTable.company_reference) {
    throw new Error("Could not verify the filing_diff_no_changes table.");
  }
  console.log("[amber-migrate] Verified filing_diff_no_changes.");

  const [handleOwnership] = await sql`
    select count(*)::int as enforced
    from pg_trigger
    where tgfoid = to_regprocedure('public.enforce_arena_handle_owner()')
      and tgdeferrable and tginitdeferred and tgenabled = 'O'
      and (
        (tgrelid = 'public."user"'::regclass and tgname = 'amber_user_handle_owner')
        or (tgrelid = 'public.arena_portfolios'::regclass and tgname = 'amber_portfolio_handle_owner')
      )
  `;
  if (handleOwnership?.enforced !== 2) throw new Error("Could not verify the Arena handle constraints.");
  console.log("[amber-migrate] Verified Arena handle ownership.");

  const [alertSchema] = await sql`
    select
      (select count(*)::int from information_schema.columns
        where table_schema = 'public' and table_name = 'alert_subscriptions' and (
          (column_name = 'unsubscribe_token' and udt_name = 'uuid'
            and is_nullable = 'NO' and column_default like '%gen_random_uuid()%')
          or (column_name in ('confirmation_expires_at', 'delivery_started_at') and udt_name = 'timestamptz')
          or (column_name = 'delivery_accession' and udt_name = 'text')
        )) as columns,
      exists (select 1 from pg_index
        where indexrelid = to_regclass('public.alert_unsubscribe_token_idx')
          and indrelid = 'public.alert_subscriptions'::regclass and indisunique and indisvalid
          and indpred is null and indnkeyatts = 1
          and pg_get_indexdef(indexrelid, 1, true) = 'unsubscribe_token'
      ) as unique_token
  `;
  if (alertSchema?.columns !== 4 || !alertSchema.unique_token) {
    throw new Error("Could not verify the filing alert confirmation and delivery schema.");
  }
  console.log("[amber-migrate] Verified filing alert confirmation and delivery.");

  const [presetSchema] = await sql`
    select
      to_regclass('public.user_valuation_presets') is not null as table_exists,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_valuation_presets'
          and column_name = 'thesis_note'
          and udt_name = 'text'
      ) as has_thesis_note,
      exists (
        select 1 from pg_index
        where indexrelid = to_regclass('public.user_valuation_presets_user_ticker_idx')
          and indrelid = 'public.user_valuation_presets'::regclass
          and indisunique and indisvalid and indnkeyatts = 2
      ) as unique_user_ticker
  `;
  if (!presetSchema?.table_exists || !presetSchema.has_thesis_note || !presetSchema.unique_user_ticker) {
    throw new Error("Could not verify the user_valuation_presets schema.");
  }
  console.log("[amber-migrate] Verified user_valuation_presets.");

  const [quoteSchema] = await sql`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'companies'
        and column_name = 'price_as_of' and data_type = 'date'
    ) as has_close_date
  `;
  if (!quoteSchema?.has_close_date) throw new Error("Could not verify the company quote date.");
  console.log("[amber-migrate] Verified company quote dates.");

  const [sectorSchema] = await sql`
    select count(*)::int as columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'annual_financials'
      and column_name in ('depreciation_amortization', 'goodwill_intangibles', 'dividends_paid')
      and udt_name = 'float8'
  `;
  if (sectorSchema?.columns !== 3) {
    throw new Error("Could not verify annual_financials sector and dividend columns.");
  }
  console.log("[amber-migrate] Verified annual_financials sector and dividend inputs.");

  const [featureSchema] = await sql`
    select
      to_regclass('public.user_alert_preferences') is not null as has_alert_prefs,
      to_regclass('public.user_saved_screens') is not null as has_saved_screens,
      to_regclass('public.user_portfolios') is not null as has_user_portfolios,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_valuation_presets'
          and column_name = 'is_public'
          and udt_name = 'bool'
      ) as has_public_theses,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_alert_preferences'
          and column_name = 'valuation_irr_threshold'
          and udt_name = 'float8'
      ) as has_valuation_alerts,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'user_valuation_presets'
          and column_name = 'last_valuation_alert_at'
          and udt_name = 'timestamptz'
      ) as has_valuation_alert_cooldown
  `;
  if (
    !featureSchema?.has_alert_prefs ||
    !featureSchema.has_saved_screens ||
    !featureSchema.has_user_portfolios ||
    !featureSchema.has_public_theses ||
    !featureSchema.has_valuation_alerts ||
    !featureSchema.has_valuation_alert_cooldown
  ) {
    throw new Error("Could not verify alert preferences, saved screens, portfolios, public theses, and valuation alerts schema.");
  }
  console.log("[amber-migrate] Verified alert preferences, saved screens, portfolios, public theses, and valuation alerts.");

  const [historySchema] = await sql`
    select
      to_regclass('public.user_valuation_history') is not null as has_history_table,
      to_regclass('public.user_valuation_history_user_ticker_created_idx') is not null as has_history_idx
  `;
  if (!historySchema?.has_history_table || !historySchema.has_history_idx) {
    throw new Error("Could not verify the user_valuation_history schema.");
  }
  console.log("[amber-migrate] Verified user_valuation_history.");

  const [digestSchema] = await sql`
    select
      (select count(*)::int from information_schema.columns
        where table_schema = 'public' and table_name = 'weekly_digest_subscribers' and (
          (column_name = 'id' and udt_name = 'text' and is_nullable = 'NO')
          or (column_name = 'email' and udt_name = 'text' and is_nullable = 'NO')
          or (column_name = 'unsubscribe_token' and udt_name = 'uuid' and is_nullable = 'NO'
            and column_default like '%gen_random_uuid()%')
          or (column_name = 'is_active' and udt_name = 'bool' and is_nullable = 'NO' and column_default = 'true')
          or (column_name = 'last_sent_at' and udt_name = 'timestamptz')
          or (column_name = 'created_at' and udt_name = 'timestamptz' and is_nullable = 'NO')
        )) as columns,
      (select count(*)::int from pg_index
        where indrelid = to_regclass('public.weekly_digest_subscribers')
          and indisunique and indisvalid and indisready and indpred is null and indnkeyatts = 1
          and ((indexrelid = to_regclass('public.weekly_digest_email_idx') and pg_get_indexdef(indexrelid, 1, true) = 'email')
            or (indexrelid = to_regclass('public.weekly_digest_unsub_token_idx') and pg_get_indexdef(indexrelid, 1, true) = 'unsubscribe_token'))
      ) as unique_indexes
  `;
  if (digestSchema?.columns !== 6 || digestSchema.unique_indexes !== 2) {
    throw new Error("Could not verify weekly digest subscribers and unique indexes.");
  }
  console.log("[amber-migrate] Verified weekly digest subscribers.");

  const [saveSchema] = await sql`
    select exists (
      select 1 from pg_constraint
      where conrelid = to_regclass('public.user_valuation_saves') and contype = 'p' and convalidated
        and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
    ) as primary_key,
    (select count(*)::int from pg_constraint
      where conrelid = to_regclass('public.user_valuation_saves') and contype = 'f' and convalidated
        and confdeltype = 'c' and (
          (confrelid = to_regclass('public."user"') and pg_get_constraintdef(oid) like 'FOREIGN KEY (user_id) REFERENCES %')
          or (confrelid = to_regclass('public.companies') and pg_get_constraintdef(oid) like 'FOREIGN KEY (ticker) REFERENCES %')
        )) as ownership_references
  `;
  if (!saveSchema?.primary_key || saveSchema.ownership_references !== 2) {
    throw new Error("Could not verify valuation save receipts.");
  }
  console.log("[amber-migrate] Verified valuation save receipts.");

  const [rateSchema] = await sql`
    select
      exists (
        select 1 from pg_constraint
        where conrelid = to_regclass('public.api_rate_windows')
          and contype = 'p' and convalidated
          and pg_get_constraintdef(oid) = 'PRIMARY KEY (window_start, client_key)'
      ) as primary_key,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'api_rate_windows'
          and column_name = 'used' and udt_name = 'int4' and is_nullable = 'NO'
      ) as count_column
  `;
  if (!rateSchema?.primary_key || !rateSchema.count_column) {
    throw new Error("Could not verify the public API quota counters.");
  }
  console.log("[amber-migrate] Verified public API quota counters.");

  const [launchSchema] = await sql`
    select
      (select count(*)::int from information_schema.columns
        where table_schema = 'public' and table_name = 'weekly_digest_subscribers' and (
          (column_name in ('confirmation_expires_at', 'confirmed_at') and udt_name = 'timestamptz')
          or (column_name = 'confirmation_token' and udt_name = 'uuid')
        )) as confirmed_columns,
      exists (select 1 from pg_index where indexrelid = to_regclass('public.weekly_digest_confirmation_idx')
        and indisunique and indisvalid and indnkeyatts = 1
        and pg_get_indexdef(indexrelid, 1, true) = 'confirmation_token') as confirmation_index,
      (select count(*)::int from pg_constraint where contype = 'p' and convalidated and (
        (conrelid = to_regclass('public.weekly_digest_issues') and pg_get_constraintdef(oid) = 'PRIMARY KEY (issue_date)')
        or (conrelid = to_regclass('public.weekly_digest_deliveries') and pg_get_constraintdef(oid) = 'PRIMARY KEY (issue_date, subscriber_id)')
        or (conrelid = to_regclass('public.distribution_counts') and pg_get_constraintdef(oid) = 'PRIMARY KEY (day, route_group, event, source_group)')
      )) as primary_keys,
      (select count(*)::int from pg_constraint where conrelid = to_regclass('public.weekly_digest_deliveries')
        and contype = 'f' and convalidated and confdeltype = 'c'
        and confrelid in (to_regclass('public.weekly_digest_issues'), to_regclass('public.weekly_digest_subscribers'))
      ) as delivery_references
  `;
  if (launchSchema?.confirmed_columns !== 3 || !launchSchema.confirmation_index ||
      launchSchema.primary_keys !== 3 || launchSchema.delivery_references !== 2) {
    throw new Error("Could not verify Sunday Signal and distribution reporting schema.");
  }
  console.log("[amber-migrate] Verified Sunday Signal and distribution reporting.");

  const [businessFactsColumn] = await sql`
    select data_type, is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'business_facts'
  `;
  if (businessFactsColumn?.data_type !== "jsonb" || businessFactsColumn?.is_nullable !== "YES") {
    throw new Error("Could not verify company valuation business facts.");
  }
  console.log("[amber-migrate] Verified company valuation business facts.");
}

await migrate();
