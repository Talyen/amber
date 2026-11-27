import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const markdown = { Accept: "text/markdown" };
const html = { Accept: "text/html" };

test("the homepage negotiates Markdown without changing the browser document", async ({ request }) => {
  for (const [accept, type] of [
    [markdown, "text/markdown"],
    [html, "text/html"],
    [{ Accept: "text/markdown;q=0, text/html;q=0.5" }, "text/html"],
    [{ Accept: "text/markdown;q=0.2, text/html;q=0.8" }, "text/html"],
    [{ Accept: "text/markdown;q=0.8, text/html;q=0.2" }, "text/markdown"],
    [{ Accept: "*/*" }, "text/html"],
  ] as const) {
    const result = await request.get("/", { headers: accept });
    expect(result.status()).toBe(200);
    expect(result.headers()["content-type"]).toContain(type);
    const body = await result.text();
    if (type === "text/markdown") {
      expect(result.headers().vary?.toLowerCase().split(/,\s*/)).toContain("accept");
      expect(result.headers()["cache-control"]).toContain("no-store");
      expect(body).toMatch(/^# Amber Stock Screener/);
      expect(body).toContain("/developers)");
    } else {
      expect(body).toMatch(/<!DOCTYPE html>/i);
    }
  }

  const head = await request.head("/", { headers: markdown });
  expect(head.headers()["content-type"]).toContain("text/markdown");
  expect(await head.text()).toBe("");
});

test("unmatched document routes keep a 404 and link to recovery in Markdown", async ({ request }) => {
  for (const path of ["/__ora-404-probe-amber", "/docs/unknown-agent-page", "/nested/missing"]) {
    for (const headers of [markdown, html]) {
      const result = await request.get(path, { headers });
      expect(result.status()).toBe(404);
      expect(result.headers()["content-type"]).toContain(headers.Accept);
      if (headers === markdown) {
        expect(result.headers().vary?.toLowerCase().split(/,\s*/)).toContain("accept");
        expect(await result.text()).toMatch(/Page not found[\s\S]+\/sitemap\.xml[\s\S]+\/llms\.txt/);
      }
    }
  }
  expect((await request.get("/docs", { headers: markdown })).status()).toBe(200);
  expect((await request.get("/t/NVDA", { headers: markdown })).status()).toBe(200);
});

test.describe("server-rendered discovery", () => {
  test.use({ javaScriptEnabled: false });

  test("the homepage and trust pages have crawlable content and metadata", async ({ page, request }) => {
    const response = await request.get("/", { headers: html });
    const source = (await response.text()).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
    const text = source.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(text.length / source.length).toBeGreaterThanOrEqual(0.05);

    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
    const levels = await main.getByRole("heading").evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
    expect(levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1)).toBe(true);
    await expect(main.getByRole("heading", { name: "Stock screener and fundamental stock research" })).toBeVisible();
    await expect(main.getByRole("link", { name: "Amber API documentation", exact: true })).toHaveAttribute("href", "/docs");
    await expect(main.getByRole("link", { name: "Amber MCP server", exact: true })).toHaveAttribute("href", "/mcp");
    await expect(main.getByRole("link", { name: "developer portal", exact: true })).toHaveAttribute("href", "/developers");
    await expect(main.getByRole("link", { name: "GitHub", exact: true })).toHaveAttribute("href", "https://github.com/Talyen/amber");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/);
    await expect(page.locator("meta[property='og:image']")).toHaveAttribute("content", /opengraph-image/);
    await expect(page.locator("meta[property='og:type']")).toHaveAttribute("content", "website");
    await expect(page.locator("meta[name=keywords]")).toHaveAttribute("content", /stock screener/);
    const nodes = JSON.parse(await page.locator("script[type='application/ld+json']").first().textContent() ?? "[]");
    expect(nodes).toContainEqual(expect.objectContaining({
      "@type": "Organization", contactPoint: expect.objectContaining({ email: "research@amberstocks.com" }),
    }));

    for (const path of ["/about", "/contact", "/privacy", "/docs", "/developers", "/mcp"]) {
      expect((await page.goto(path))?.status()).toBe(200);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      expect((await page.getByRole("main").innerText()).length).toBeGreaterThanOrEqual(500);
      await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", new RegExp(`${path}$`));
    }
  });
});

test("agent instructions, crawl discovery and REST contracts agree with real responses", async ({ request }) => {
  const llms = await request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/markdown");
  const index = await llms.text();
  expect(index).toMatch(/^# Amber\n\n> [^\n]+\n/);
  expect(index).toContain("## When to use Amber");
  for (const path of ["/developers", "/docs", "/mcp", "/api/mcp", "/openapi.json", "/api/v1/t/NVDA", "/api/v1/screener", "/api/v1/signals"]) {
    expect(index).toContain(path);
  }

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toMatch(/Allow: \/api\/v1\//);
  expect(robots).toMatch(/Disallow: \/api\//);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/developers", "/mcp", "/docs", "/about", "/contact", "/privacy"]) {
    expect(sitemap).toContain(`${path}</loc>`);
  }
  const mcp = await request.get("/api/mcp");
  expect(await mcp.json()).toMatchObject({ transport: "streamable-http", tools: expect.any(Array) });

  const specResponse = await request.get("/openapi.json");
  expect(specResponse.status()).toBe(200);
  const spec = await specResponse.json();
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.security).toEqual([]);
  expect(spec.info.description).toMatch(/Deprecation.*Sunset.*90 days/);
  const routes = [
    ["/api/v1/t/{ticker}", "/api/v1/t/NVDA", "CompanyFundamentalsResponse"],
    ["/api/v1/screener", "/api/v1/screener?limit=1", "ScreenerResponse"],
    ["/api/v1/signals", "/api/v1/signals?limit=1", "SignalsResponse"],
  ] as const;
  for (const [template, path, schemaName] of routes) {
    const replies = spec.paths[template].get.responses;
    expect(replies["200"].content["application/json"].schema.$ref).toBe(`#/components/schemas/${schemaName}`);
    for (const [status, reply] of Object.entries<{ content: { "application/json": { schema: { $ref: string } } } }>(replies)) {
      if (Number(status) >= 400) {
        expect(reply.content["application/json"].schema.$ref).toBe("#/components/schemas/ErrorResponse");
      }
    }

    const result = await request.get(path);
    expect(result.status()).toBe(200);
    expect(result.headers()["x-api-version"]).toBe("1.0");
    expect(result.headers()["ratelimit-policy"]).toBe("public-api;q=120;w=60");
    expect(result.headers()["ratelimit"]).toMatch(/^public-api;r=\d+;t=\d+$/);
    expect(result.headers()["cache-control"]).toContain("no-store");
    const payload = await result.json();
    expect(Object.keys(payload).sort()).toEqual([...spec.components.schemas[schemaName].required].sort());
    const legacy = await request.get(path.replace("/api/v1/", "/api/public/"));
    expect(await legacy.json()).toEqual(payload);
  }
  const company = await request.get("/api/v1/t/NVDA", { headers: markdown });
  expect(company.headers()["content-type"]).toContain("text/markdown");
  expect(await company.text()).toContain("NVDA");
});

test("REST request errors stay JSON even when an agent asks for Markdown", async ({ request }) => {
  for (const [path, status, code] of [
    ["/api", 404, "endpoint_not_found"],
    ["/api/v1/no-endpoint", 404, "endpoint_not_found"],
    ["/api/v1/t/DOES-NOT-EXIST", 404, "ticker_not_found"],
    ["/api/v1/screener?limit=0", 400, "invalid_screener_filter"],
    ["/api/v1/signals?type=unknown", 400, "invalid_signal_query"],
  ] as const) {
    const response = await request.get(path, { headers: markdown });
    expect(response.status()).toBe(status);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(await response.json()).toMatchObject({ code, message: expect.any(String), resolution: expect.any(String) });
  }
  const unsupported = await request.get("/api/v1/signals", { headers: { "X-API-Version": "9" } });
  expect(unsupported.status()).toBe(400);
  expect(await unsupported.json()).toMatchObject({ code: "unsupported_api_version" });
  const method = await request.post("/api/v1/screener");
  expect(method.status()).toBe(405);
  expect(method.headers().allow).toBe("GET, HEAD, OPTIONS");
  expect(await method.json()).toMatchObject({ code: "method_not_allowed" });
  const preflight = await request.fetch("/api/v1/screener", { method: "OPTIONS" });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()["access-control-allow-headers"]).toBe("X-API-Version");
});

test("the shared Postgres quota permits the last request, then returns a retryable 429", async ({ request }) => {
  test.skip(!process.env.AMBER_TEST_POSTGRES_URL, "Requires disposable local Postgres.");
  const db = new Client({ connectionString: process.env.AMBER_BROWSER_TEST_DATABASE_URL });
  const ip = "192.0.2.42";
  const credentials = "postgresql://fixture:fixture@db.amber-test.invalid/fixture";
  const headers = { "x-vercel-forwarded-for": ip };
  await db.connect();
  try {
    const now = Math.floor(Date.now() / 1000);
    if (now % 60 > 55) await new Promise((resolve) => setTimeout(resolve, (60 - now % 60) * 1000));
    const window = Math.floor(Date.now() / 60_000) * 60;
    const key = createHmac("sha256", credentials).update(`${window}:${ip}`).digest("hex");
    await db.query("INSERT INTO api_rate_windows (window_start, client_key, used) VALUES ($1, $2, 119)", [window, key]);
    const last = await request.get("/api/public/screener?limit=1", { headers });
    expect(last.status()).toBe(200);
    expect(last.headers()["ratelimit-remaining"]).toBe("0");
    const result = await request.get("/api/v1/signals?limit=1", { headers });
    expect(result.status()).toBe(429);
    expect(result.headers()["retry-after"]).toBe(result.headers()["ratelimit-reset"]);
    expect(Number(result.headers()["retry-after"])).toBeGreaterThan(0);
    expect(await result.json()).toMatchObject({ code: "rate_limit_exceeded", resolution: expect.stringContaining("Retry-After") });
  } finally {
    await db.end();
  }
});
