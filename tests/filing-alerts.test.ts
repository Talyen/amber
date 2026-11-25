import assert from "node:assert/strict";
import { test } from "node:test";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { dispatchFilingAlerts } from "../scripts/send-filing-alerts.ts";
import { requestAlertConfirmation } from "../src/data/alert-subscriptions.ts";
import { canRetryAlertDelivery, filingAlertEmailIsVerified, sendAlertEmail } from "../src/lib/alert-email.ts";

test("only the signed-in account's verified email can skip filing alert confirmation", () => {
  const email = "reader@example.test";
  assert.equal(filingAlertEmailIsVerified(email), false);
  assert.equal(filingAlertEmailIsVerified(email, { email, emailVerified: false }), false);
  assert.equal(filingAlertEmailIsVerified(email, { email: "other@example.test", emailVerified: true }), false);
  assert.equal(filingAlertEmailIsVerified(email, { email: "Reader@example.test", emailVerified: true }), true);
});

test("unresolved alert deliveries stop before the provider's idempotency key expires", () => {
  const startedAt = new Date("2026-11-01T00:00:00Z");
  assert.equal(canRetryAlertDelivery(startedAt, Date.parse("2026-11-01T22:59:00Z")), true);
  assert.equal(canRetryAlertDelivery(startedAt, Date.parse("2026-11-01T23:00:00Z")), false);
});

test("confirmation requests reuse an unexpired pending token and skip confirmed subscriptions", async (t) => {
  const token = "6d52957c-39cb-4442-be79-2ded8d403408";
  let state = "new";
  const originalNeonFetch = neonConfig.fetchFunction;
  t.after(() => { neonConfig.fetchFunction = originalNeonFetch; });
  neonConfig.fetchFunction = async (_url: string, options: RequestInit) => {
    const { query } = JSON.parse(String(options.body)) as { query: string };
    const isInsert = query.startsWith("insert");
    if (isInsert) assert.match(query, /where "alert_subscriptions"\."confirmation_expires_at" <= statement_timestamp\(\)/i);
    else assert.match(query, /"alert_subscriptions"\."confirmation_expires_at" > statement_timestamp\(\)/i);
    const rows = (isInsert ? state === "new" : state === "pending") ? [[token]] : [];
    if (state === "new") state = "pending";
    return Response.json({ fields: [{ name: "unsubscribe_token", dataTypeID: 25 }], rows });
  };

  const db = drizzle(neon("postgresql://fixture:fixture@fixture.example/database"));
  const email = "reader@example.test";
  assert.equal(await requestAlertConfirmation(db, `ABC:${email}`, email, "ABC"), token);
  assert.equal(await requestAlertConfirmation(db, `ABC:${email}`, email, "ABC"), token);
  state = "confirmed";
  assert.equal(await requestAlertConfirmation(db, `ABC:${email}`, email, "ABC"), undefined);
});

test("email delivery retries an in-progress idempotent request and stops on a conflicting payload", async (t) => {
  let requests = 0;
  let conflict = "concurrent_idempotent_requests";
  t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    assert.equal(new Headers(options.headers).get("Idempotency-Key"), "confirmation/fixture");
    return ++requests === 1 || conflict === "invalid_idempotent_request"
      ? Response.json({ name: conflict }, { status: 409 })
      : new Response(null, { status: 200 });
  });
  const email = { from: "alerts@example.test", to: ["reader@example.test"], subject: "Confirm", html: "Confirm" };
  const waits: number[] = [];
  const wait = async (ms: number) => { waits.push(ms); };
  await sendAlertEmail("fixture", "confirmation/fixture", email, wait);
  assert.equal(requests, 2);
  assert.deepEqual(waits, [500]);

  conflict = "invalid_idempotent_request";
  await assert.rejects(sendAlertEmail("fixture", "confirmation/fixture", email, wait), /HTTP 409/);
  assert.equal(requests, 3);
  assert.deepEqual(waits, [500]);
});

test("failed dispatch retries the same delivery key and records only accepted email", async (t) => {
  const token = "6d52957c-39cb-4442-be79-2ded8d403408";
  const today = new Date().toISOString().slice(0, 10);
  const keys: Array<string | null> = [];
  const bodies: string[] = [];
  let accepted = false;
  let receiptWrites = 0;
  function queryResult(names: string[], values?: Array<string | null>, command = "SELECT") {
    return Response.json({
      fields: names.map((name) => ({ name, dataTypeID: 25 })),
      rows: values ? [values] : [],
      rowCount: values ? 1 : 0,
      command,
    });
  }
  const originalNeonFetch = neonConfig.fetchFunction;
  t.after(() => { neonConfig.fetchFunction = originalNeonFetch; });
  neonConfig.fetchFunction = async (_url: string, options: RequestInit) => {
    const { query } = JSON.parse(String(options.body)) as { query: string };
    if (query.startsWith("select")) {
      assert.match(query, /confirmation_expires_at" is null/);
      return queryResult(
        ["id", "email", "ticker", "token", "name", "filing_type", "filing_date", "accession"],
        ["fixture", "reader@example.test", "ABC", token, "Example", "10-Q", today, "123"],
      );
    }
    if (query.includes("returning \"delivery_started_at\"")) {
      return queryResult(["delivery_started_at"], [new Date().toISOString()], "UPDATE");
    }
    assert.match(query, /set "last_notified_accession"/);
    receiptWrites++;
    if (receiptWrites === 1) throw new Error("Receipt write unavailable");
    return queryResult([], undefined, "UPDATE");
  };
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.resend.com/emails");
    keys.push(new Headers(options.headers).get("Idempotency-Key"));
    bodies.push(String(options.body));
    return new Response(null, { status: accepted ? 200 : 503 });
  });

  const options = {
    databaseUrl: "postgresql://fixture:fixture@fixture.example/database",
    resendKey: "fixture",
    siteUrl: "https://amber.example",
    wait: async () => {},
  };
  await assert.rejects(dispatchFilingAlerts(options), /1 filing alert deliveries need attention/);
  assert.equal(keys.length, 3);
  assert.equal(receiptWrites, 0);

  accepted = true;
  await dispatchFilingAlerts(options);
  assert.equal(receiptWrites, 2);
  assert.equal(keys.length, 4);
  assert.deepEqual(new Set(keys), new Set([`filing-alert/${token}/123`]));
  assert.equal(new Set(bodies).size, 1);
  assert.match(JSON.parse(bodies[0]).html, /action=unsubscribe/);
});
