import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";

export function readFixtureSchema() {
  const directory = mkdtempSync(join(tmpdir(), "amber-browser-schema-"));
  try {
    execFileSync("pnpm", ["exec", "drizzle-kit", "generate", "--dialect=postgresql",
      "--schema=./src/db/schema.ts", `--out=${directory}`]);
    const migration = readdirSync(directory).find((file) => file.endsWith(".sql"))!;
    return readFileSync(join(directory, migration), "utf8");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

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

  const client = new Client({ connectionString: database.href });
  try {
    await client.connect();
    await client.query(readFixtureSchema());
    await client.query("DROP TABLE weekly_digest_deliveries, weekly_digest_issues, weekly_digest_subscribers, distribution_counts, user_valuation_saves, api_rate_windows");
    await client.query("ALTER TABLE companies DROP COLUMN business_facts");
    for (let pass = 0; pass < 2; pass++) {
      execFileSync("pnpm", ["db:migrate"], {
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://fixture:fixture@db.amber-test.invalid/fixture",
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import="${resolve("tests/browser/postgres-preload.mjs")}"`.trim(),
        },
        stdio: "inherit",
      });
    }
    await client.query(`
      CREATE TABLE fixture_resend_messages (
        idempotency_key text PRIMARY KEY,
        message jsonb NOT NULL,
        attempts int NOT NULL DEFAULT 1
      );
      INSERT INTO "user" (id, name, email, handle)
      VALUES ('owner', 'Fixture Owner', 'owner@example.test', 'FixtureOwner'),
             ('reader', 'Fixture Reader', 'reader@example.test', 'FixtureReader');
      UPDATE "user" SET email_verified = true WHERE id = 'reader';
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
      INSERT INTO companies (ticker, cik, name, exchange, sector, tagline, price, market_cap,
        cash_and_equiv, total_debt, last_filing_type, last_filing_date, last_filing_period_end,
        last_filing_accession, default_dcf, is_active)
      VALUES ('AUDP', '1234567', 'Audit Fixture', 'NASDAQ', 'Semiconductors', '', 100, 10000,
        10, 0, '10-K', '2026-01-15', '2025-12-31', 'fixture', '{}', false),
      ('V', '1403161', 'Visa', 'NYSE', 'Financials', '', 300, 500000,
        10, 0, '10-K', '2026-11-15', '2026-09-30', 'fixture', '{}', false);
      INSERT INTO annual_financials (id, ticker, fiscal_year, sort_order, revenue, operating_cash_flow,
        capex, sbc, buybacks, diluted_shares)
      VALUES ('AUDP:FY25', 'AUDP', 'FY25', 2, 2000, 550, 100, 70, 0, 105),
             ('AUDP:TTM', 'AUDP', 'TTM', 3, 3000, 650, 100, 90, 0, 110),
             ('AUDP:FY24', 'AUDP', 'FY24', 1, 1000, 250, 50, 30, 0, 100);
      INSERT INTO annual_financials (id, ticker, fiscal_year, sort_order, period_end_date,
        revenue, operating_cash_flow, capex, sbc, buybacks, diluted_shares)
      SELECT 'V:FY' || year, 'V', 'FY' || year, year, (2000 + year) || '-09-30',
        1000, 250, 50, 30, 0, 1500 FROM generate_series(20, 26) AS year;
      INSERT INTO annual_financials (id, ticker, fiscal_year, sort_order, revenue, operating_cash_flow,
        capex, sbc, buybacks, diluted_shares)
      VALUES ('V:TTM', 'V', 'TTM', 27, 2000, 500, 100, 60, 0, 1100);
      UPDATE companies SET price_as_of = current_date WHERE ticker IN ('NVDA', 'AAPL');
      UPDATE companies SET price_as_of = current_date - 30 WHERE ticker = 'MSFT';
      UPDATE companies SET price_as_of = '2026-01-15' WHERE ticker = 'AUDP';
      INSERT INTO insider_trades (id, ticker, filing_date, insider_name, insider_title,
        transaction_type, shares, price_per_share, total_value, accession_number)
      VALUES ('msft-buy', 'MSFT', (current_date - 1)::text, 'Buyer Alex', 'Director', 'Buy', 4000, 300, 1.2, 'form4-buy'),
             ('msft-sell', 'MSFT', current_date::text, 'Seller Sam', 'Director', 'Sell', 4000, 300, 1.2, 'form4-sell');
      INSERT INTO filing_diffs (id, ticker, filing_type, filing_date, accession_number, section,
        category, materiality, headline, summary, prior_excerpt, current_excerpt, signal_note)
      VALUES ('aapl-8k', 'AAPL', '8-K', current_date::text, 'material-event', 'Item 5.02',
        'Executive Comp', 'High', 'Director appointed', 'A new director joined the board.', '', '', '');
    `);
  } catch (error) {
    await client.end();
    await dropDatabase();
    throw error;
  }
  await client.end();
  return dropDatabase;
}
