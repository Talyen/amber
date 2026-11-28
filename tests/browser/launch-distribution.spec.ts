import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

test.skip(!process.env.AMBER_TEST_POSTGRES_URL, "Requires disposable local Postgres.");

test("records a landing without a URL or client identifier and honors privacy preferences", async ({ page, request }) => {
  const response = page.waitForResponse((response) => response.url().endsWith("/api/distribution"));
  await page.goto("/lenses/hidden-dilution", { referer: "https://claude.ai/chats/private-id" });
  expect((await response).status()).toBe(204);

  const origin = new URL(page.url()).origin;
  const data = { route: "lenses", event: "landing_view", source: "chatgpt" };
  expect((await request.post("/api/distribution", { data, headers: { Origin: "https://example.test" } })).status()).toBe(403);
  expect((await request.post("/api/distribution", {
    data: { ...data, source: "https://example.test/private-path" }, headers: { Origin: origin },
  })).status()).toBe(400);
  expect((await request.post("/api/distribution", {
    data, headers: { Origin: origin, "Sec-GPC": "1" },
  })).status()).toBe(204);

  const client = new Client({ connectionString: process.env.AMBER_BROWSER_TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT route_group, event, source_group, count FROM distribution_counts
      WHERE route_group = 'lenses' AND source_group IN ('claude', 'chatgpt')
    `);
    expect(rows).toEqual([{ route_group: "lenses", event: "landing_view", source_group: "claude", count: 1 }]);
  } finally {
    await client.end();
  }
});

test("records completed chart exports and clicks from an embed", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/lenses/hidden-dilution");
  const chart = page.waitForResponse(response =>
    response.url().endsWith("/api/distribution") &&
    ["chart_copy", "chart_download"].includes(response.request().postDataJSON()?.event)
  );
  await page.getByRole("button", { name: "Copy Top 10 PNG" }).click();
  expect((await chart).status()).toBe(204);

  await page.goto("/embed/NVDA?chart=sankey");
  await context.route("https://amberstocks.com/t/NVDA", route => route.fulfill({ body: "Amber" }));
  const embed = page.waitForResponse(response =>
    response.url().endsWith("/api/distribution") && response.request().postDataJSON()?.event === "embed_click"
  );
  await page.getByRole("link", { name: /Interactive model/ }).click();
  expect((await embed).status()).toBe(204);
});

test("watchlist digests apply filing preferences before limiting recent results", async () => {
  const client = new Client({ connectionString: process.env.AMBER_BROWSER_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      INSERT INTO "user" (id, name, email, email_verified)
      VALUES ('filing-digest-subscriber', 'Fixture Subscriber', 'filing-digest@example.test', true);
      INSERT INTO user_watchlists (id, user_id, ticker)
      VALUES ('filing-digest-subscriber:AUDP', 'filing-digest-subscriber', 'AUDP');
      INSERT INTO user_alert_preferences (user_id, watchlist_digest, include_filing_diffs,
        include_form4_buys, include_form8k, include_valuation_triggers)
      VALUES ('filing-digest-subscriber', true, true, false, false, false);
      INSERT INTO filing_diffs (id, ticker, filing_type, filing_date, accession_number, section,
        category, materiality, headline, summary, prior_excerpt, current_excerpt, signal_note)
      SELECT 'digest-8k-' || n, 'AUDP', '8-K', (now() AT TIME ZONE 'UTC')::date::text,
        'fixture', 'Item 2.02', 'Other', 'Medium', 'Company event ' || n, '', '', '', ''
      FROM generate_series(1, 20) AS n;
      INSERT INTO filing_diffs (id, ticker, filing_type, filing_date, accession_number, section,
        category, materiality, headline, summary, prior_excerpt, current_excerpt, signal_note)
      VALUES ('digest-eligible', 'AUDP', '10-Q', ((now() AT TIME ZONE 'UTC')::date - 1)::text,
        'fixture', 'Item 2', 'Other', 'High', 'Quarterly filing belongs in digest', '', '', '', '');
    `);

    const dispatch = () => execFileSync(process.execPath, [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types",
      "--import", resolve("tests/browser/postgres-preload.mjs"), "--input-type=module", "-e",
      'const { dispatchFilingAlerts } = await import("./scripts/send-filing-alerts.ts"); await dispatchFilingAlerts({ requireConfig: true });',
    ], { env: {
      ...process.env,
      DATABASE_URL: "postgresql://fixture:fixture@db.amber-test.invalid/fixture",
      RESEND_API_KEY: "amber-fixture-resend",
      AMBER_PROD_URL: "https://amber.example",
    } });
    dispatch();
    dispatch();
    const { rows } = await client.query(`
      SELECT message->>'html' AS html, attempts FROM fixture_resend_messages
      WHERE idempotency_key LIKE 'watchlist-digest/filing-digest-subscriber/%'
    `);
    expect(rows).toEqual([{ html: expect.stringContaining("Quarterly filing belongs in digest"), attempts: 1 }]);
    expect(rows[0].html).not.toContain("Company event");
  } finally {
    await client.end();
  }
});

test("confirms signup after retrying a pending confirmation with no delivery receipt", async ({ request, baseURL }) => {
  test.skip(process.env.AMBER_TEST_DIGEST_RESEND !== "1", "Run with the fixture Resend sender enabled.");
  const email = "retry-confirmation@example.test";
  const token = randomUUID();
  const client = new Client({ connectionString: process.env.AMBER_BROWSER_TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      INSERT INTO weekly_digest_subscribers (id, email, is_active, confirmation_token, confirmation_expires_at)
      VALUES ('retry-confirmation', $1, false, $2, now() + interval '24 hours')
    `, [email, token]);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request.post("/api/digest-subscribe", { data: { email }, headers: { Origin: baseURL! } });
      expect(response.status()).toBe(202);
    }
    const { rows } = await client.query(`
      SELECT idempotency_key, message->>'text' AS text, attempts FROM fixture_resend_messages
      WHERE message->'to'->>0 = $1
    `, [email]);
    expect(rows).toEqual([{
      idempotency_key: `sunday-signal-confirm/${token}`,
      text: expect.stringContaining(`/api/digest-confirm?token=${token}`),
      attempts: 2,
    }]);
  } finally {
    await client.end();
  }
});

test("confirms signup, retries an unrecorded receipt with the same issue, and unsubscribes by POST", async ({ page, request }) => {
  test.skip(process.env.AMBER_TEST_DIGEST_RESEND !== "1", "Run with the fixture Resend sender enabled.");
  const email = "sunday-digest@example.test";
  const client = new Client({ connectionString: process.env.AMBER_BROWSER_TEST_DATABASE_URL });
  await client.connect();
  try {
    await page.goto("/feed");
    await page.getByRole("textbox", { name: "Email address" }).fill(email.toUpperCase());
    await page.getByRole("button", { name: "Subscribe", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "check your inbox" })).toBeVisible();
    const [confirmation] = (await client.query(`
      SELECT f.message, s.confirmed_at, s.is_active FROM fixture_resend_messages f
      JOIN weekly_digest_subscribers s ON f.message->'to'->>0 = s.email
      WHERE s.email = $1
    `, [email])).rows;
    expect(confirmation).toMatchObject({ confirmed_at: null, is_active: false });
    const confirmUrl = new URL(confirmation.message.text.match(/https?:\/\/\S+/)[0]);
    await page.goto(confirmUrl.pathname + confirmUrl.search);
    expect((await client.query("SELECT is_active FROM weekly_digest_subscribers WHERE email = $1", [email])).rows[0].is_active).toBe(false);
    await page.getByRole("button", { name: "Confirm subscription" }).click();
    await expect(page.getByText("You’re subscribed to Sunday Signal.")).toBeVisible();

    const now = new Date();
    const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
      now.getUTCDate() + (7 - now.getUTCDay()), 17)).toISOString();
    await client.query(`INSERT INTO weekly_digest_subscribers (id, email)
      VALUES ('legacy-unconfirmed-digest', 'legacy-digest@example.test')`);
    const dispatch = () => execFileSync(process.execPath, [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types",
      "--import", resolve("tests/browser/postgres-preload.mjs"), "--input-type=module", "-e",
      'const { sendSundaySignal } = await import("./scripts/send-sunday-signal.ts"); await sendSundaySignal({ now: new Date(process.argv[1]), wait: async () => {} });',
      sunday,
    ], { env: {
      ...process.env,
      DATABASE_URL: "postgresql://fixture:fixture@db.amber-test.invalid/fixture",
      RESEND_API_KEY: "amber-fixture-resend",
      ALERT_FROM_EMAIL: "Amber Alerts <alerts@amberstocks.com>",
      AMBER_PROD_URL: new URL(page.url()).origin,
    } });
    dispatch();
    const deliveries = () => client.query(`
      SELECT message, attempts FROM fixture_resend_messages WHERE idempotency_key LIKE 'sunday-signal/%'
    `);
    const [first] = (await deliveries()).rows;
    expect(first.message.to).toEqual([email]);
    expect(first.message.text).toContain("Featured lens");
    expect(first.message.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(first.attempts).toBe(1);
    expect((await deliveries()).rowCount).toBe(1);
    dispatch();
    expect((await deliveries()).rows[0].attempts).toBe(1);
    await client.query("UPDATE weekly_digest_deliveries SET sent_at = null");
    dispatch();
    expect((await deliveries()).rows).toEqual([{ message: first.message, attempts: 2 }]);

    const unsubscribe = first.message.headers["List-Unsubscribe"].slice(1, -1);
    expect((await request.get(unsubscribe)).status()).toBe(200);
    expect((await client.query("SELECT is_active FROM weekly_digest_subscribers WHERE email = $1", [email])).rows[0].is_active).toBe(true);
    for (let i = 0; i < 2; i++) {
      const result = await request.post(unsubscribe, { form: { "List-Unsubscribe": "One-Click" } });
      expect(result.status()).toBe(200);
    }
    expect((await client.query("SELECT is_active FROM weekly_digest_subscribers WHERE email = $1", [email])).rows[0].is_active).toBe(false);
  } finally {
    await client.end();
  }
});
