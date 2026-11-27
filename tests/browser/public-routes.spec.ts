import { expect, test } from "@playwright/test";

test("public company formats are cache-safe and bank cash-flow metrics are unavailable", async ({ request }) => {
  const path = "/api/public/t/JPM";
  const json = await request.get(path, { headers: { Accept: "application/json" } });
  expect(json.ok()).toBe(true);
  expect(json.headers().vary?.toLowerCase().split(/,\s*/)).toContain("accept");
  expect(await json.json()).toMatchObject({
    ticker: "JPM",
    metrics: {
      reported_fcf_m: null,
      true_fcf_m: null,
      true_fcf_margin_pct: null,
      implied_10y_revenue_cagr_pct: null,
    },
  });

  const markdown = await request.get(path, { headers: { Accept: "application/json;q=0.5, text/markdown" } });
  expect(markdown.headers()["content-type"]).toContain("text/markdown");
  expect(markdown.headers().vary?.toLowerCase().split(/,\s*/)).toContain("accept");
  expect(await markdown.text()).toContain("| **True FCF (FCF − SBC)** | N/A (Sector-native lens) |");

  const excluded = await request.get(path, { headers: { Accept: "text/markdown;q=0" } });
  expect(excluded.headers()["content-type"]).toContain("application/json");
  const explicit = await request.get(`${path}?format=json`, { headers: { Accept: "text/markdown" } });
  expect(explicit.headers()["content-type"]).toContain("application/json");

  const tickerPage = "/t/NVDA";
  const html = { headers: { Accept: "text/html, text/markdown;q=0" } };
  const initialHtml = await request.get(tickerPage, html);
  expect(initialHtml.headers()["content-type"]).toContain("text/html");
  const alternate = initialHtml.headers().link?.match(/<([^>]+)>; rel="alternate"; type="text\/markdown"/)?.[1];
  expect(alternate).toBe("/api/public/t/NVDA?format=markdown");
  const textPage = await request.get(alternate!);
  expect(textPage.headers()["content-type"]).toContain("text/markdown");
  expect(textPage.headers().vary?.toLowerCase().split(/,\s*/)).toContain("accept");
  const htmlAgain = await request.get(tickerPage, { headers: { Accept: "text/markdown" } });
  expect(htmlAgain.headers()["content-type"]).toContain("text/html");
});

test("company pages and embeds use the same sector eligibility as the public API", async ({ page }) => {
  await page.goto("/t/JPM/sbc");
  await expect(page).toHaveTitle(/Stock-Based Compensation, Dilution/);
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute("content", /True FCF/);
  await expect(page.getByText("True FCF is unavailable for JPM.", { exact: false })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "SBC", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "True FCF", exact: true })).toHaveCount(0);

  for (const [chart, heading] of [["true-fcf", "True FCF"], ["reverse-dcf", "Reverse DCF"], ["sankey", "Revenue Sankey"]]) {
    await page.goto(`/embed/JPM?chart=${chart}`);
    await expect(page.getByText(`${heading} is unavailable for JPM`, { exact: false })).toBeVisible();
  }
  await page.goto("/embed/NVDA?chart=reverse-dcf");
  await expect(page.getByRole("heading", { name: "Implied 10Y CAGR Sensitivity Matrix" })).toBeVisible();
});

test("REST and MCP reject invalid screener filters", async ({ request }) => {
  for (const [query, args] of [
    ["lens=cash-machins", { lens: "cash-machins" }],
    ["minTrueFcfMargin=invalid", { minTrueFcfMargin: "invalid" }],
    ["limit=3.5", { limit: 3.5 }],
  ]) {
    const rest = await request.get(`/api/public/screener?${query}`);
    expect(rest.status()).toBe(400);
    const { error } = await rest.json();
    const mcp = await request.post("/api/mcp", { data: {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "amber_screen_companies", arguments: args },
    } });
    expect(await mcp.json()).toMatchObject({ error: { code: -32602, message: error } });
  }
  const valid = await request.get("/api/public/screener?lens=cash-machines&limit=1");
  expect(valid.ok()).toBe(true);
  expect(await valid.json()).toMatchObject({ returned: 1 });
});

test("five-company comparison links display and share all five tickers", async ({ page, request }) => {
  const path = "/compare/NVDA-vs-MSFT-vs-AAPL-vs-GOOGL-vs-META";
  const comparison = await page.goto(path);
  expect(comparison?.status()).toBe(200);
  const table = page.getByRole("region", { name: "Side-by-side financial comparison table" }).getByRole("table");
  for (const ticker of ["NVDA", "MSFT", "AAPL", "GOOGL", "META"]) await expect(table).toContainText(ticker);

  const image = await request.get(`${path}/opengraph-image`);
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toContain("image/png");
  expect((await image.body()).length).toBeGreaterThan(1000);
});

test("MCP uses an empty notification response and refuses an unsupported SSE stream", async ({ request }) => {
  const path = "/api/mcp";
  const headers = { Accept: "application/json, text/event-stream" };
  const notification = { jsonrpc: "2.0", method: "notifications/initialized" };
  const options = { headers, data: { jsonrpc: "2.0", method: "initialize", id: 1 } };
  const initialize = await request.post(path, options);
  expect(await initialize.json()).toMatchObject({
    id: 1,
    result: { protocolVersion: "2025-03-26", capabilities: { tools: {} } },
  });
  const accepted = await request.post(path, { headers, data: notification });
  expect(accepted.status()).toBe(202);
  expect(await accepted.text()).toBe("");

  const stream = await request.get(path, { headers: { Accept: "text/event-stream" } });
  expect(stream.status()).toBe(405);
  expect((await request.get(path, { headers: { Accept: "application/json" } })).ok()).toBe(true);

  const list = await request.post(path, { headers, data: [notification, { jsonrpc: "2.0", method: "tools/list", id: 2 }] });
  expect(await list.json()).toEqual([expect.objectContaining({
    id: 2,
    result: { tools: expect.arrayContaining([expect.objectContaining({ name: "amber_get_recent_signals" })]) },
  })]);
  expect((await request.post(path, { ...options, headers: { ...headers, Origin: "https://other.example" } })).status())
    .toBe(403);
});

test("the feed offers RSS while digest signup is unavailable", async ({ page, request }) => {
  await page.goto("/feed");
  await expect(page.getByRole("link", { name: "Subscribe via RSS", exact: true })).toHaveAttribute("href", "/feed.xml");
  await expect(page.getByRole("button", { name: "Subscribe Free" })).toHaveCount(0);
  const signup = await request.post("/api/digest-subscribe", { data: { email: "fixture@example.test" } });
  expect(signup.status()).toBe(503);
  expect(await signup.json()).toMatchObject({ rssUrl: "/feed.xml" });
  const feed = await request.get("/feed.xml");
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");
});

test.describe("database-backed public data", () => {
  test.skip(!process.env.AMBER_TEST_POSTGRES_URL, "Requires disposable local Postgres.");

  test("public signals, screener lenses, and MCP use the same buy and filing data", async ({ request }) => {
    const buyers = await request.get("/api/public/screener?lens=insider-buys");
    expect(await buyers.json()).toMatchObject({ total_matches: 1, companies: [{ ticker: "MSFT" }] });
    const events = await request.get("/api/public/screener?lens=material-events");
    expect(await events.json()).toMatchObject({ total_matches: 1, companies: [{ ticker: "AAPL" }] });

    const signals = await request.get("/api/public/signals?ticker=MSFT&type=insiders&limit=1");
    expect(await signals.json()).toMatchObject({ filing_diffs: [], insider_buys: [{ id: "msft-buy", ticker: "MSFT" }] });
    const fractional = await request.get("/api/public/signals?ticker=MSFT&type=insiders&limit=1.5");
    expect(fractional.status()).toBe(400);

    for (const [name, args, expected] of [
      ["amber_screen_companies", { lens: "insider-buys" }, { companies: [{ ticker: "MSFT" }] }],
      ["amber_get_recent_signals", { ticker: "MSFT", type: "insiders", limit: 1 }, { insider_buys: [{ ticker: "MSFT" }] }],
    ] as const) {
      const tool = await request.post("/api/mcp", {
        headers: { Accept: "application/json, text/event-stream" },
        data: { jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } },
      });
      const { result } = await tool.json();
      expect(JSON.parse(result.content[0].text)).toMatchObject(expected);
    }
  });

  test("company JSON and Markdown include the closing quote's date", async ({ request }) => {
    const path = "/api/public/t/AUDP";
    const json = await request.get(path);
    expect(await json.json()).toMatchObject({ price_usd: 100, price_as_of: "2026-01-15" });
    const markdown = await request.get(`${path}?format=markdown`);
    expect(await markdown.text()).toContain("$100.00 (close 2026-01-15)");
  });
});
