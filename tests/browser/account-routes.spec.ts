import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.skip(!process.env.AMBER_TEST_POSTGRES_URL, "Requires disposable local Postgres.");

function accountHeaders(account: "owner" | "reader") {
  const token = `${account}-fixture-token`;
  const signature = createHmac("sha256", process.env.AMBER_BROWSER_TEST_AUTH_SECRET!).update(token).digest("base64");
  return { Cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}` };
}

test("the real portfolio route isolates accounts and saves an empty portfolio", async ({ request }) => {
  const holdings = [{ ticker: "NVDA", value: 2500 }];
  const headers = accountHeaders("owner");
  const portfolio = "/api/portfolio";
  const saved = await request.put(portfolio, { headers, data: { inputMode: "dollars", holdings } });
  expect(await saved.json()).toMatchObject({ ok: true, portfolio: { holdings } });
  expect(await (await request.get(portfolio, { headers: accountHeaders("reader") })).json())
    .toMatchObject({ authenticated: true, portfolio: null });
  expect((await request.put(portfolio, { data: { holdings } })).status()).toBe(401);

  const cleared = await request.put(portfolio, { headers, data: { inputMode: "dollars", holdings: [] } });
  expect(cleared.ok()).toBe(true);
  expect(await (await request.get(portfolio, { headers })).json())
    .toMatchObject({ authenticated: true, portfolio: { inputMode: "dollars", holdings: [] } });
});

test("an oversized portfolio is rejected without changing the saved holdings", async ({ request }) => {
  const headers = accountHeaders("reader");
  const path = "/api/portfolio";
  const previous = { inputMode: "dollars", holdings: [{ ticker: "AAPL", value: 2500 }] };
  expect((await request.put(path, { headers, data: previous })).ok()).toBe(true);

  const tooMany = { inputMode: "dollars", holdings: Array.from({ length: 41 }, (_, index) => ({
    ticker: `FIX${index}`, value: 100 + index,
  })) };
  const rejected = await request.put(path, { headers, data: tooMany });
  expect(rejected.status()).toBe(400);
  expect(await rejected.json()).toEqual({ error: "A portfolio can contain up to 40 holdings." });
  expect(await (await request.get(path, { headers })).json()).toMatchObject({ portfolio: previous });
});

test("a verified user cannot subscribe to filing alerts while email delivery is unconfigured", async ({ request }) => {
  const headers = accountHeaders("reader");
  const path = "/api/alerts";
  for (const data of [{ ticker: "AAPL" }, { scope: "watchlist" }]) {
    const response = await request.post(path, { headers, data });
    expect(response.status()).toBe(503);
  }
  expect(await (await request.get(path, { headers })).json()).toMatchObject({ tickers: [], authenticated: true });
});

test("unpublishing removes a note from fresh ticker and profile reads after warming both routes", async ({ request, page }) => {
  const headers = accountHeaders("owner");
  const tickerPage = "/t/NVDA";
  const profilePage = "/u/FixtureOwner";
  const publicTheses = "/api/community-theses?ticker=NVDA";
  const feedTheses = "/api/community-theses";
  const write = "/api/valuation-presets";
  const thesis = {
    ticker: "NVDA", lens: "fcf", revGrowth: 12, targetMargin: 20, exitMultiple: 18,
    thesisNote: "Public fixture thesis the owner later revokes", isPublic: true,
  };

  expect((await request.put(write, { headers, data: thesis })).ok()).toBe(true);
  for (const path of [publicTheses, feedTheses]) {
    const response = await request.get(path);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(await response.json()).toEqual([expect.objectContaining({ thesisNote: thesis.thesisNote })]);
  }
  expect(await (await request.get(tickerPage)).text()).not.toContain(thesis.thesisNote);
  expect(await (await request.get(profilePage)).text()).toContain(thesis.thesisNote);

  await page.goto(`${tickerPage}?tab=dcf&model=scenario`);
  const community = page.getByRole("button", { name: "Community Theses" });
  await community.click();
  await expect(page.getByText(thesis.thesisNote, { exact: true })).toBeVisible();
  await community.click();

  expect((await request.put(write, { headers, data: { ...thesis, isPublic: false } })).ok()).toBe(true);
  for (const path of [publicTheses, feedTheses]) {
    expect(await (await request.get(path)).json()).toEqual([]);
  }
  expect(await (await request.get(tickerPage)).text()).not.toContain(thesis.thesisNote);
  expect(await (await request.get(profilePage)).text()).not.toContain(thesis.thesisNote);
  await community.click();
  await expect(page.getByText("No published theses for this company.")).toBeVisible();
  await expect(page.getByText(thesis.thesisNote, { exact: true })).toHaveCount(0);
  expect(await (await request.get(`${write}?ticker=NVDA`, { headers })).json())
    .toMatchObject({ preset: { thesisNote: thesis.thesisNote, isPublic: false } });
});

test("Arena rejects an otherwise valid lineup with a stale closing price", async ({ request }) => {
  const response = await request.post("/api/arena/lock", {
    headers: accountHeaders("owner"),
    data: {
      handle: "FixtureOwner",
      title: "Fixture portfolio",
      positions: ["AAPL", "MSFT", "NVDA"].map((ticker) => ({ ticker, weight: 1 })),
    },
  });
  expect(response.status()).toBe(422);
  expect(await response.json()).toEqual({ error: "No recent closing price for: MSFT." });
});


test("a retried thesis cannot overwrite a newer private revision", async ({ request }) => {
  const write = "/api/valuation-presets";
  const headers = accountHeaders("owner");
  const data = {
    ticker: "MSFT", lens: "fcf", revGrowth: 12, targetMargin: 20, exitMultiple: 18,
    thesisNote: "First public revision", isPublic: true, saveId: randomUUID(),
  };
  const first = await Promise.all(Array.from({ length: 2 }, () => request.put(write, { headers, data })));
  for (const response of first) {
    expect(response.ok(), await response.text()).toBe(true);
    expect((await response.json()).historyEntry.id).toContain(data.saveId);
  }
  const publicTheses = "/api/community-theses?ticker=MSFT";
  expect(await (await request.get(publicTheses)).json()).toEqual([
    expect.objectContaining({ thesisNote: data.thesisNote }),
  ]);

  const newer = { ...data, thesisNote: "Latest private revision", isPublic: false, saveId: randomUUID() };
  const updated = await request.put(write, { headers, data: newer });
  expect(updated.ok(), await updated.text()).toBe(true);
  const retried = await request.put(write, { headers, data });
  expect(retried.ok(), await retried.text()).toBe(true);
  expect(await retried.json()).toMatchObject({ preset: { thesisNote: newer.thesisNote, isPublic: false } });
  expect(await (await request.get(publicTheses)).json()).toEqual([]);

  const read = await request.get(`${write}?ticker=MSFT&history=1`, { headers });
  expect((await read.json()).history).toEqual([
    expect.objectContaining({ thesisNote: newer.thesisNote }),
    expect.objectContaining({ thesisNote: data.thesisNote }),
  ]);
});

test("a visibility-only save has a receipt even when it adds no journal entry", async ({ request }) => {
  const write = "/api/valuation-presets";
  const headers = accountHeaders("reader");
  const data = {
    ticker: "AAPL", lens: "fcf", revGrowth: 12, targetMargin: 20, exitMultiple: 18,
    thesisNote: "Visibility-only fixture", isPublic: false,
  };
  const publish = { ...data, isPublic: true, saveId: randomUUID() };
  for (const payload of [{ ...data, saveId: randomUUID() }, publish, { ...data, saveId: randomUUID() }, publish]) {
    const response = await request.put(write, { headers, data: payload });
    expect(response.ok(), await response.text()).toBe(true);
  }
  const read = await request.get(`${write}?ticker=AAPL&history=1`, { headers });
  expect(await read.json()).toMatchObject({
    preset: { isPublic: false },
    history: [expect.objectContaining({ thesisNote: data.thesisNote })],
  });
  expect(await (await request.get("/api/community-theses?ticker=AAPL")).json()).toEqual([]);
});

test("comparison history keeps fiscal order, skips TTM, and falls back when annuals are missing", async ({ request }) => {
  const response = await request.get("/api/compare-history?tickers=AUDP,NVDA,UNKNOWN,AUDP");
  expect(response.ok()).toBe(true);
  const { series } = await response.json();
  expect(series.map((item: { ticker: string }) => item.ticker)).toEqual(["AUDP", "NVDA"]);
  expect(series[0]).toMatchObject({
    points: [
      { fiscalYear: "FY24", revenue: 1000, trueFcfMargin: 17, sbcPctRevenue: 3, dilutedShares: 100 },
      { fiscalYear: "FY25", revenue: 2000, trueFcfMargin: 19, sbcPctRevenue: 3.5, dilutedShares: 105 },
    ],
  });
  expect(series[1].points).toHaveLength(5);
});

test("database comparisons use the latest five fiscal periods and the filed share corrections", async ({ request }) => {
  const response = await request.get("/api/compare-history?tickers=V");
  expect(response.ok()).toBe(true);
  const { series } = await response.json();
  expect(series).toMatchObject([{
    ticker: "V",
    points: [
      { fiscalYear: "FY22", dilutedShares: 2136 },
      { fiscalYear: "FY23", dilutedShares: 2085 },
      { fiscalYear: "FY24", dilutedShares: 2029 },
      { fiscalYear: "FY25", dilutedShares: 1966 },
      { fiscalYear: "FY26", dilutedShares: 1907 },
    ],
  }]);
});
