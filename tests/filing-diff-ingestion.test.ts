import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractFilingDiffs } from "../scripts/extract-filing-diffs.ts";

test("no-change filings free the processing budget on later runs and failed filings retry", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "amber-filing-diffs-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "companies.json"), JSON.stringify([
    { ticker: "AAA", cik: "1", name: "First issuer", marketCap: 200, filingDiffs: [] },
    { ticker: "BBB", cik: "2", name: "Second issuer", marketCap: 100, filingDiffs: [] },
  ]));

  const filingRequests: string[] = [];
  let secondSubmissionsAvailable = false;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/submissions/")) {
      const cik = url.endsWith("0000000001.json") ? 1 : 2;
      if (cik === 2 && !secondSubmissionsAvailable) return new Response("invalid JSON");
      return Response.json({
        filings: { recent: {
          form: ["10-K", "10-K"],
          accessionNumber: [`000000000${cik}-26-000001`, `000000000${cik}-25-000001`],
          filingDate: ["2026-02-01", "2025-02-01"],
          primaryDocument: ["latest.htm", "prior.htm"],
        } },
      });
    }
    filingRequests.push(url);
    return new Response("<h2>Item 1A. Risk Factors</h2><p>Identical text in both years.</p>");
  });

  const options = { directory, databaseUrl: "", maxTickers: 1 };
  const readCache = async () => JSON.parse(await readFile(join(directory, "filing-diffs-cache.json"), "utf8"));
  await extractFilingDiffs(options);
  assert.equal(filingRequests.length, 2);
  assert.deepEqual((await readCache()).AAA.diffs, []);

  await extractFilingDiffs(options);
  assert.equal(filingRequests.length, 2);
  assert.equal((await readCache()).BBB, undefined);

  secondSubmissionsAvailable = true;
  await extractFilingDiffs(options);
  assert.equal(filingRequests.length, 4);
  assert.ok(filingRequests.slice(2).every((url) => url.includes("/data/2/")));
  assert.deepEqual((await readCache()).BBB.diffs, []);
});

test("a missed prior section does not publish unchanged prose or cache the comparison", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "amber-filing-diffs-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "companies.json"), JSON.stringify([
    { ticker: "ABC", cik: "1", name: "Example", marketCap: 100, filingDiffs: [] },
  ]));

  const paragraph = "Our suppliers remain exposed to export controls, tariffs, and technology restrictions across several jurisdictions, which could materially disrupt semiconductor manufacturing, procurement schedules, inventory commitments, and contractual delivery obligations.";
  let priorHeading = "Risk Factors";
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/submissions/")) {
      return Response.json({ filings: { recent: {
        form: ["10-K", "10-K"],
        accessionNumber: ["0000000001-26-000001", "0000000001-25-000001"],
        filingDate: ["2026-02-01", "2025-02-01"],
        primaryDocument: ["latest.htm", "prior.htm"],
      } } });
    }
    const heading = url.endsWith("prior.htm") ? priorHeading : "Item 1A. Risk Factors";
    return new Response(`<h2>${heading}</h2><p>${paragraph}</p>`);
  });

  const cache = async () => JSON.parse(await readFile(join(directory, "filing-diffs-cache.json"), "utf8"));
  await extractFilingDiffs({ directory, databaseUrl: "" });
  assert.equal((await cache()).ABC, undefined);

  priorHeading = "Item 1A. Risk Factors";
  await extractFilingDiffs({ directory, databaseUrl: "" });
  assert.deepEqual((await cache()).ABC.diffs, []);
});

test("extracts 10-Q prose diffs when a 10-Q is newer than the latest 10-K", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "amber-filing-diffs-10q-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "companies.json"), JSON.stringify([
    { ticker: "QCO", cik: "3", name: "Quarterly Corp", marketCap: 500, filingDiffs: [] },
  ]));

  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.includes("/submissions/")) {
      return Response.json({
        filings: {
          recent: {
            form: ["10-Q", "10-Q", "10-K", "10-K"],
            accessionNumber: [
              "0000000003-26-000003",
              "0000000003-26-000002",
              "0000000003-26-000001",
              "0000000003-25-000001",
            ],
            filingDate: ["2026-08-05", "2026-05-05", "2026-02-01", "2025-02-01"],
            primaryDocument: ["q2.htm", "q1.htm", "k26.htm", "k25.htm"],
          },
        },
      });
    }
    if (url.endsWith("q2.htm")) {
      return new Response(
        "<h2>Item 2. Management's Discussion</h2><p>During the quarter we experienced substantial tariff and supply chain disruption across our primary contract manufacturing facilities in Southeast Asia, increasing component procurement costs and compressing gross margins across our flagship enterprise hardware lines.</p>"
      );
    }
    return new Response(
      "<h2>Item 2. Management's Discussion</h2><p>Operations during the prior quarter remained stable with predictable fulfillment schedules, balanced inventory levels, and steady commercial demand across North American enterprise accounts.</p>"
    );
  });

  await extractFilingDiffs({ directory, databaseUrl: "" });
  const cacheData = JSON.parse(await readFile(join(directory, "filing-diffs-cache.json"), "utf8"));
  assert.equal(cacheData.QCO.accessionNumber, "0000000003-26-000003");
  assert.equal(cacheData.QCO.diffs.length, 1);
  assert.equal(cacheData.QCO.diffs[0].filingType, "10-Q");
  assert.match(cacheData.QCO.diffs[0].section, /Item 2: MD&A/);
});
