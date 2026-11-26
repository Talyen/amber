import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

const url = "http://127.0.0.1:3118";
const postgresUrl = process.env.AMBER_TEST_POSTGRES_URL;
let env: Record<string, string> = { DATABASE_URL: "" };

if (postgresUrl) {
  const database = new URL(postgresUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(database.hostname)) {
    throw new Error("Browser database tests require local Postgres.");
  }
  database.pathname = `/amber_browser_${randomUUID().replaceAll("-", "")}`;
  process.env.AMBER_BROWSER_TEST_DATABASE_URL ??= database.href;
  process.env.AMBER_BROWSER_TEST_AUTH_SECRET ??= randomUUID();

  env = {
    DATABASE_URL: "postgresql://fixture:fixture@db.amber-test.invalid/fixture",
    BETTER_AUTH_URL: url,
    BETTER_AUTH_SECRET: process.env.AMBER_BROWSER_TEST_AUTH_SECRET,
    AMBER_BROWSER_TEST_DATABASE_URL: process.env.AMBER_BROWSER_TEST_DATABASE_URL,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import="${resolve("tests/browser/postgres-preload.mjs")}"`.trim(),
  };
}

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: postgresUrl ? "./tests/browser/postgres-setup.ts" : undefined,
  use: { baseURL: url, browserName: "chromium" },
  webServer: {
    command: "pnpm start --hostname 127.0.0.1 --port 3118",
    url,
    env,
    timeout: 60_000,
  },
});
