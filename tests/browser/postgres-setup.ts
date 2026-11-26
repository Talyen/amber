import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

export default async function setupPostgres() {
  const database = new URL(process.env.AMBER_BROWSER_TEST_DATABASE_URL!);
  const name = database.pathname.slice(1);
  if (!/^amber_browser_[a-f0-9]+$/.test(name)) throw new Error("Invalid browser fixture database name.");
  const admin = new Client({ connectionString: process.env.AMBER_TEST_POSTGRES_URL });
  await admin.connect();

  async function dropDatabase() {
    try {
      await admin.query(`DROP DATABASE ${name}`);
    } finally {
      await admin.end();
    }
  }

  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } catch (error) {
    await admin.end();
    throw error;
  }

  const directory = mkdtempSync(join(tmpdir(), "amber-browser-schema-"));
  const client = new Client({ connectionString: database.href });
  try {
    execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--dialect=postgresql",
      "--schema=./src/db/schema.ts", `--out=${directory}`]);
    await client.connect();
    const migration = readdirSync(directory).find((file) => file.endsWith(".sql"))!;
    await client.query(readFileSync(join(directory, migration), "utf8"));
    await client.query(`
      INSERT INTO "user" (id, name, email, handle)
      VALUES ('owner', 'Fixture Owner', 'owner@example.test', 'FixtureOwner'),
             ('reader', 'Fixture Reader', 'reader@example.test', 'FixtureReader');
      INSERT INTO session (id, user_id, token, expires_at)
      VALUES ('owner-session', 'owner', 'owner-fixture-token', now() + interval '1 day'),
             ('reader-session', 'reader', 'reader-fixture-token', now() + interval '1 day');
      INSERT INTO companies (ticker, cik, name, exchange, sector, tagline, price, market_cap,
        cash_and_equiv, total_debt, last_filing_type, last_filing_date, last_filing_period_end,
        last_filing_accession, default_dcf)
      VALUES ('NVDA', '1045810', 'NVIDIA', 'NASDAQ', 'Semiconductors', '', 100, 1000000,
        10, 0, '10-K', '2026-01-15', '2025-12-31', 'fixture', '{}'),
      ('AAPL', '320193', 'Apple', 'NASDAQ', 'Consumer & Retail', '', 175, 2000000,
        10, 0, '10-K', '2026-01-15', '2025-12-31', 'fixture', '{}'),
      ('MSFT', '789019', 'Microsoft', 'NASDAQ', 'Cloud & Software', '', 300, 2000000,
        10, 0, '10-K', '2026-01-15', '2025-12-31', 'fixture', '{}');
      UPDATE companies SET price_as_of = current_date WHERE ticker IN ('NVDA', 'AAPL');
      UPDATE companies SET price_as_of = current_date - 30 WHERE ticker = 'MSFT';
    `);
  } catch (error) {
    await client.end();
    await dropDatabase();
    throw error;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  await client.end();
  return dropDatabase;
}
