import { createHmac } from "node:crypto";
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

test("unpublishing removes a note from fresh ticker and profile reads after warming both routes", async ({ request, page }) => {
  const headers = accountHeaders("owner");
  const tickerPage = "/t/NVDA";
  const profilePage = "/u/FixtureOwner";
  const publicTheses = "/api/community-theses?ticker=NVDA";
  const write = "/api/valuation-presets";
  const thesis = {
    ticker: "NVDA", lens: "fcf", revGrowth: 12, targetMargin: 20, exitMultiple: 18,
    thesisNote: "Public fixture thesis the owner later revokes", isPublic: true,
  };

  expect((await request.put(write, { headers, data: thesis })).ok()).toBe(true);
  const publicResponse = await request.get(publicTheses);
  expect(publicResponse.headers()["cache-control"]).toContain("no-store");
  expect(await publicResponse.json()).toEqual([expect.objectContaining({ thesisNote: thesis.thesisNote })]);
  expect(await (await request.get(tickerPage)).text()).not.toContain(thesis.thesisNote);
  expect(await (await request.get(profilePage)).text()).toContain(thesis.thesisNote);

  await page.goto(`${tickerPage}?tab=dcf&model=scenario`);
  const community = page.getByRole("button", { name: "Community Theses" });
  await community.click();
  await expect(page.getByText(thesis.thesisNote, { exact: true })).toBeVisible();
  await community.click();

  expect((await request.put(write, { headers, data: { ...thesis, isPublic: false } })).ok()).toBe(true);
  expect(await (await request.get(publicTheses)).json()).toEqual([]);
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
