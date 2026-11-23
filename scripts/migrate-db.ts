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

  await sql.transaction([
    sql`set local lock_timeout = '5s'`,
    sql`set local statement_timeout = '20s'`,
    sql.query(arenaIndexMigration),
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
}

await migrate();
