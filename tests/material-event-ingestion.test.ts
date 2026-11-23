import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fetch8KSubmissions } from "../scripts/ingest-8k.ts";

test("8-K ingestion retries a transient SEC response with a per-request deadline", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    assert.ok(options.signal instanceof AbortSignal);
    return ++requests === 1
      ? new Response(null, { status: 503 })
      : Response.json({ filings: { recent: { form: [] } } });
  });
  const waits: number[] = [];
  const response = await fetch8KSubmissions("0000000001", async (ms) => { waits.push(ms); });
  assert.deepEqual(response.filings?.recent?.form, []);
  assert.equal(requests, 2);
  assert.deepEqual(waits, [500]);
});

test("8-K job exits unsuccessfully when it cannot scan any company", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "amber-8k-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = join(directory, "src/data/generated");
  await mkdir(files, { recursive: true });
  await writeFile(join(files, "companies.json"), JSON.stringify([{ ticker: "ABC", cik: "1", name: "Example" }]));

  const fixture = `globalThis.fetch = async () => new Response(null, { status: 503 });`;
  const script = new URL("../scripts/ingest-8k.ts", import.meta.url);
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types", "--import", `data:text/javascript,${encodeURIComponent(fixture)}`, script.pathname,
  ], { cwd: directory, env: { ...process.env, DATABASE_URL: "", MAX_8K_TICKERS: "1" }, encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Scanned 0 tickers.*1 scan failures/);
});
