import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import type { EdgarSnapshot } from "../../scripts/ingest-edgar";
import { readFixtureSchema } from "./postgres-setup";

test.skip(!process.env.AMBER_TEST_POSTGRES_URL, "Requires disposable local Postgres.");

test("the seeder preserves newer financial snapshots while accepting other companies", async () => {
  const temp = await mkdtemp(join(tmpdir(), "amber-seed-replay-"));
  const admin = new Client({ connectionString: process.env.AMBER_TEST_POSTGRES_URL });
  const name = `amber_browser_${randomUUID().replaceAll("-", "")}`;
  const database = new URL(process.env.AMBER_BROWSER_TEST_DATABASE_URL!);
  database.pathname = `/${name}`;
  const client = new Client({ connectionString: database.href });
  const exec = promisify(execFile);
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await client.connect();
    await client.query(readFixtureSchema());
    const generated = join(temp, "src", "data", "generated");
    await mkdir(generated, { recursive: true });
    const snapshots = JSON.parse(await readFile("src/data/generated/companies.json", "utf8")) as EdgarSnapshot[];
    const template = snapshots.find((snapshot) => snapshot.ticker === "NVDA")!;
    const current = {
      ...template, ticker: "SEEDX", edgarFallback: undefined, cashAndEquiv: 9000, filingDiffs: [],
      lastFiling: { ...template.lastFiling, date: "2026-11-20", periodEnd: "2026-10-31" },
    };
    const stale = {
      ...current, cashAndEquiv: 1000, annuals: current.annuals.slice(0, 2),
      lastFiling: { ...current.lastFiling, date: "2026-08-20", periodEnd: "2026-07-31" },
    };
    async function seed(input: EdgarSnapshot[]) {
      await writeFile(join(generated, "companies.json"), JSON.stringify(input));
      await exec(process.execPath, [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types",
        "--import", resolve("tests/browser/postgres-preload.mjs"), resolve("scripts/seed-neon.ts"),
      ], {
        cwd: temp,
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://fixture:fixture@db.amber-test.invalid/fixture",
          AMBER_BROWSER_TEST_DATABASE_URL: database.href,
        },
      });
    }
    async function company(ticker: string) {
      const { rows } = await client.query(`
        select cash_and_equiv, last_filing_date, (
          select array_agg(fiscal_year order by sort_order) from annual_financials where ticker = $1
        ) as fiscal_years
        from companies where ticker = $1
      `, [ticker]);
      return rows[0];
    }

    await seed([current]);
    await seed([stale, { ...stale, ticker: "SEEDY" }]);
    expect(await company("SEEDX")).toEqual({
      cash_and_equiv: 9000, last_filing_date: "2026-11-20",
      fiscal_years: current.annuals.map(({ fiscalYear }) => fiscalYear),
    });
    expect(await company("SEEDY")).toEqual({
      cash_and_equiv: 1000, last_filing_date: "2026-08-20",
      fiscal_years: stale.annuals.map(({ fiscalYear }) => fiscalYear),
    });

    const corrected = { ...current, cashAndEquiv: 9100, annuals: current.annuals.slice(1) };
    await seed([corrected]);
    expect(await company("SEEDX")).toEqual({
      cash_and_equiv: 9100, last_filing_date: "2026-11-20",
      fiscal_years: corrected.annuals.map(({ fiscalYear }) => fiscalYear),
    });
  } finally {
    await client.end();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    } finally {
      await admin.end();
      await rm(temp, { recursive: true, force: true });
    }
  }
});
