import assert from "node:assert/strict";
import { test } from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { dispatchFilingAlerts } from "../scripts/send-filing-alerts.ts";
import { canRetryAlertDelivery, filingAlertEmailIsVerified } from "../src/lib/alert-email.ts";

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
