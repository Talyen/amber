import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { promisify } from "node:util";
import { isArenaHandleConflict } from "../src/lib/arena-handle.ts";

test("unwraps the handle constraint from Drizzle database errors", () => {
  const violation = Object.assign(new Error("duplicate owner"), { constraint: "amber_handle_owner" });
  assert.equal(isArenaHandleConflict(new Error("query failed", { cause: violation })), true);
  assert.equal(isArenaHandleConflict(new Error("other constraint")), false);
});

const postgresUrl = process.env.AMBER_TEST_POSTGRES_URL;
const exec = promisify(execFile);

test("Postgres serializes case-insensitive Arena handle claims across profile and portfolio writes", {
  skip: !postgresUrl && "Set AMBER_TEST_POSTGRES_URL to a local Postgres server with psql available",
}, async () => {
  const server = new URL(postgresUrl!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(server.hostname));
  const name = `amber_test_${randomUUID().replaceAll("-", "")}`;
  const database = new URL(server);
  database.pathname = `/${name}`;
  async function query(url: URL, sql: string) {
    const { stdout } = await exec("psql", [
      "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--dbname", url.href, "-c", sql,
    ], { timeout: 10_000 });
    return stdout.trim();
  }

  await query(server, `CREATE DATABASE ${name}`);
  try {
    await query(database, `
      CREATE TABLE public."user" (id text PRIMARY KEY, handle text);
      CREATE TABLE public.arena_portfolios (id text PRIMARY KEY, user_id text, handle text NOT NULL);
      INSERT INTO public."user" (id) VALUES ('a'), ('b');
      INSERT INTO public.arena_portfolios VALUES ('bot', NULL, 'bot_handle');
    `);
    const migration = await readFile(new URL("../drizzle/0003_arena_handle_ownership.sql", import.meta.url), "utf8");
    await query(database, migration);
    await query(database, migration);
    const claims = await Promise.allSettled([
      query(database, `BEGIN; UPDATE public."user" SET handle = 'Claim' WHERE id = 'a'; SELECT pg_sleep(0.15); COMMIT;`),
      query(database, `BEGIN; INSERT INTO public.arena_portfolios VALUES ('entry', 'b', 'cLaIm'); SELECT pg_sleep(0.15); COMMIT;`),
    ]);
    assert.equal(claims.filter(({ status }) => status === "fulfilled").length, 1);
    const rejected = claims.find((claim) => claim.status === "rejected");
    assert.match(String(rejected?.reason), /Arena handle already belongs to another owner/);
    await assert.rejects(
      query(database, `UPDATE public."user" SET handle = 'BOT_HANDLE' WHERE id = 'a'`),
      /Arena handle already belongs to another owner/,
    );
    await query(database, `BEGIN;
      UPDATE public."user" SET handle = 'second' WHERE id = 'a';
      INSERT INTO public.arena_portfolios VALUES ('archive', 'a', 'Second');
      COMMIT;`);
    await assert.rejects(
      query(database, `UPDATE public."user" SET handle = 'SECOND' WHERE id = 'b'`),
      /Arena handle already belongs to another owner/,
    );
  } finally {
    await query(server, `DROP DATABASE ${name}`);
  }
});
