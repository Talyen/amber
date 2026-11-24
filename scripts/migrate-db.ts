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
        select 1 from pg_index
        where indexrelid = to_regclass('public.user_valuation_presets_user_ticker_idx')
          and indrelid = 'public.user_valuation_presets'::regclass
          and indisunique and indisvalid and indnkeyatts = 2
      ) as unique_user_ticker
  `;
  if (!presetSchema?.table_exists || !presetSchema.unique_user_ticker) {
    throw new Error("Could not verify the user_valuation_presets schema.");
  }
  console.log("[amber-migrate] Verified user_valuation_presets.");
}

await migrate();
