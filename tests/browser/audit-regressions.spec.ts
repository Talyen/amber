import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const session = {
  session: { id: "browser-test-session", userId: "browser-test-owner", expiresAt: "2099-01-01T00:00:00Z" },
  user: { id: "browser-test-owner", name: "Fixture", email: "browser@example.test", emailVerified: true },
};

test("Valuation Studio clears private thesis state on sign-out and reload", async ({ page }) => {
  let signedIn = true;
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: signedIn ? session : null }));
  await page.route("**/api/auth/sign-out", (route) => {
    signedIn = false;
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/account/profile", (route) => route.fulfill({ json: { user: { handle: "Test Owner" } } }));
  await page.route("**/api/valuation-presets*", (route) => route.fulfill({ json: { authenticated: true, preset: null } }));
  await page.addInitScript(({ owner }) => {
    localStorage.setItem("amber-valuation-presets-v1", JSON.stringify({
      NVDA: {
        ticker: "NVDA", lens: "fcf", revGrowth: 15, targetMargin: 30, exitMultiple: 22,
        owner, thesisNote: "Private fixture note", isPublic: false, updatedAt: "2026-11-25T00:00:00Z",
      },
    }));
  }, { owner: session.user.id });

  await page.goto("/t/NVDA?tab=dcf&model=scenario");
  const note = page.getByRole("textbox", { name: "Optional thesis note" });
  await expect(note).toHaveValue("Private fixture note");
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(note).toHaveValue("");
  await page.reload();
  await expect(note).toHaveValue("");
});

test("a guest dollar draft survives reload without entering the share URL", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/portfolio?h=NVDA:60,MSFT:40");
  await page.getByRole("button", { name: "Dollar Value", exact: true }).click();
  const dollars = page.getByRole("spinbutton", { name: "NVDA dollar allocation" });
  await dollars.fill("12345");
  await dollars.blur();
  await page.reload();
  await expect(dollars).toHaveValue("12345");
  await page.getByRole("button", { name: "Copy weights link", exact: true }).click();
  await expect(page.getByRole("status").getByText("Link copied")).toBeVisible();
  const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(link.searchParams.get("h")).toMatch(/^NVDA:[\d.]+,MSFT:[\d.]+$/);
  expect(link.search).not.toContain("12345");
});

test("an account portfolio remains on the working URL and loads again after reload", async ({ page }) => {
  let accountReads = 0;
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: session }));
  await page.route("**/api/portfolio", (route) => {
    accountReads++;
    return route.fulfill({
      json: {
        authenticated: true,
        portfolio: { inputMode: "dollars", holdings: [{ ticker: "NVDA", value: 6789 }] },
      },
    });
  });
  await page.goto("/portfolio");
  const dollars = page.getByRole("spinbutton", { name: "NVDA dollar allocation" });
  await expect(dollars).toHaveValue("6789");
  await expect(page).toHaveURL(/\/portfolio$/);
  await page.reload();
  await expect(dollars).toHaveValue("6789");
  expect(accountReads).toBe(2);
});

test("portfolio saving waits for an account read and recovers from a failed read", async ({ page }) => {
  let reads = 0;
  const writes: unknown[] = [];
  const saved = { inputMode: "dollars", holdings: [{ ticker: "NVDA", value: 6789 }] };
  const firstRead = Promise.withResolvers<void>();
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: session }));
  await page.route("**/api/portfolio", async (route) => {
    if (route.request().method() === "PUT") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    if (++reads === 1) {
      await firstRead.promise;
      return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    }
    return route.fulfill({ json: { authenticated: true, portfolio: saved } });
  });
  await page.goto("/portfolio");
  const save = page.getByRole("button", { name: "Save Portfolio", exact: true });
  await expect(page.getByText("Loading your saved portfolio…")).toBeVisible();
  await expect(save).toHaveCount(0);
  firstRead.resolve();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Could not load your saved portfolio.");
  await expect(save).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "NVDA dollar allocation" })).toHaveValue("6789");
  await save.click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  expect(writes).toEqual([saved]);
});

test("the portfolio add link preserves saved holdings and an empty portfolio can be saved", async ({ page }) => {
  let holdings = [{ ticker: "NVDA", value: 6789 }];
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: session }));
  await page.route("**/api/portfolio", (route) => {
    if (route.request().method() === "PUT") {
      holdings = route.request().postDataJSON().holdings;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: {
      authenticated: true,
      portfolio: { inputMode: "dollars", holdings },
    } });
  });
  await page.goto("/portfolio?add=MSFT");
  await expect(page.getByRole("spinbutton", { name: "NVDA dollar allocation" })).toHaveValue("6789");
  await expect(page.getByRole("spinbutton", { name: "MSFT dollar allocation" })).toHaveValue("10000");
  await page.getByRole("button", { name: "Remove NVDA" }).click();
  await page.getByRole("button", { name: "Remove MSFT" }).click();
  const saving = page.waitForRequest((request) => request.url().endsWith("/api/portfolio") && request.method() === "PUT");
  await page.getByRole("button", { name: "Save Portfolio", exact: true }).click();
  expect((await saving).postDataJSON()).toEqual({ inputMode: "dollars", holdings: [] });
  await expect(page).toHaveURL(/\/portfolio$/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Save Portfolio", exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: /dollar allocation/ })).toHaveCount(0);
});

test("a bank opens the earnings scenario and rejects industrial assumptions from an old link", async ({ page }) => {
  await page.goto("/t/JPM?tab=dcf&model=reverse&lens=fcf&rev=40&m=55&exit=40");
  await expect(page.getByRole("button", { name: "Earnings (P/E)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reverse DCF/ })).toHaveCount(0);
  await expect(page.getByText("This thesis uses an unavailable valuation model.", { exact: false })).toBeVisible();
});

test("editing a superseded thesis allows a new revision without retrying the old one", async ({ page }) => {
  const writes: { thesisNote: string; saveId: string }[] = [];
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: session }));
  await page.route("**/api/valuation-presets*", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { authenticated: true, preset: null, history: [] } });
    }
    const payload = route.request().postDataJSON();
    writes.push(payload);
    return route.fulfill({ json: {
      ok: true,
      preset: writes.length === 1 ? { ...payload, thesisNote: "Newer revision from another tab" } : payload,
    } });
  });
  await page.goto("/t/NVDA?tab=dcf&model=scenario");
  await expect(page.getByLabel("Showcase this thesis on my public investor profile")).toBeVisible();
  const note = page.getByRole("textbox", { name: "Optional thesis note" });
  const save = page.getByRole("button", { name: "Save Thesis", exact: true });
  await note.fill("Old revision");
  await save.click();
  await expect(page.getByText("A newer thesis is saved", { exact: false })).toBeVisible();
  await expect(save).toBeDisabled();
  await note.fill("New deliberate revision");
  await save.click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  expect(writes.map(({ thesisNote }) => thesisNote)).toEqual(["Old revision", "New deliberate revision"]);
  expect(writes[0].saveId).not.toBe(writes[1].saveId);
});

test("navigation search shows the financial metrics available in homepage search", async ({ page }) => {
  await page.goto("/");
  const option = page.getByRole("option").filter({ hasText: "NVDA" }).first();
  await page.getByRole("button", { name: /Search \d+ SEC-verified companies/ }).click();
  await page.getByRole("combobox", { name: "Search companies" }).fill("NVDA");
  await expect(option).toContainText(/True FCF\$[\d.]+[TBMK]SBC \/ Rev[\d.]+%/);
  const heroText = await option.innerText();

  await page.getByRole("button", { name: "Close search", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("button", { name: "Search tickers", exact: true }).click();
  await page.getByRole("combobox", { name: "Search companies" }).fill("NVDA");
  await expect.poll(() => option.innerText()).toBe(heroText);
});

test("a CSV import keeps zero allocations and reports skipped short positions", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByLabel("Import brokerage CSV").setInputFiles({
    name: "weights.csv", mimeType: "text/csv",
    buffer: Buffer.from("Symbol,Weight\nNVDA,0%\nMSFT,40%\nAAPL,-5%"),
  });
  await expect(page.getByRole("status")).toContainText("Skipped rows with negative allocation (AAPL).");
  await expect(page.getByRole("slider", { name: "NVDA relative weight", exact: true })).toHaveValue("0");
  await expect(page.getByRole("slider", { name: "MSFT relative weight", exact: true })).toHaveValue("40");
  await expect(page.getByRole("slider", { name: "AAPL relative weight", exact: true })).toHaveCount(0);
});

test("CSV and quick paste reject an oversized selection without changing the portfolio", async ({ page }) => {
  const companies = JSON.parse(readFileSync("src/data/generated/companies.json", "utf8")) as { ticker: string }[];
  const tickers = companies.slice(0, 41).map(({ ticker }) => ticker);
  await page.goto("/portfolio?h=NVDA:100");
  const table = page.getByRole("region", { name: "Portfolio holdings breakdown" }).getByRole("table");
  await expect(table.getByRole("slider")).toHaveCount(1);
  await expect(table.getByRole("slider", { name: "NVDA relative weight" })).toBeVisible();
  await page.getByLabel("Import brokerage CSV").setInputFiles({
    name: "too-many.csv", mimeType: "text/csv",
    buffer: Buffer.from(["Symbol,Weight", ...tickers.map((ticker) => `${ticker},1%`)].join("\n")),
  });
  await expect(page.getByRole("status")).toContainText("A portfolio can contain up to 40 holdings.");
  await expect(table.getByRole("slider")).toHaveCount(1);

  await page.getByRole("button", { name: "Dismiss holdings message" }).click();
  await page.getByRole("button", { name: "Quick Paste" }).click();
  await page.getByRole("textbox", { name: "Quick paste portfolio tickers" }).fill(tickers.join(","));
  await page.getByRole("button", { name: "Apply Portfolio" }).click();
  await expect(page.getByRole("status")).toContainText("A portfolio can contain up to 40 holdings.");
  await expect(table.getByRole("slider", { name: "NVDA relative weight" })).toBeVisible();
  await expect(table.getByRole("slider")).toHaveCount(1);
});

test("the Thesis Journal keeps offline saves through reload and syncs a retry without duplicates", async ({ page }) => {
  const preset = {
    ticker: "NVDA", lens: "fcf", revGrowth: 12, targetMargin: 20, exitMultiple: 18,
    thesisNote: "Older synced fixture note", updatedAt: "2000-01-01T00:00:00Z",
  };
  const history = [{ ...preset, id: "older", createdAt: preset.updatedAt }];
  const saveIds: string[] = [];
  let offline = true;
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: session }));
  await page.route("**/api/valuation-presets*", (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      saveIds.push(payload.saveId);
      if (offline) return route.fulfill({ status: 503, json: {} });
      const entry = {
        ...preset, thesisNote: payload.thesisNote,
        id: JSON.stringify([session.user.id, payload.ticker, payload.saveId]),
        createdAt: payload.updatedAt,
      };
      history.unshift(entry);
      return route.fulfill({ json: { historyEntry: entry } });
    }
    return route.fulfill({ json: { authenticated: true, preset, history } });
  });

  await page.goto("/t/NVDA?tab=dcf&model=scenario");
  const note = page.getByRole("textbox", { name: "Optional thesis note" });
  await expect(note).toHaveValue(preset.thesisNote);
  await note.fill("New local fixture note");
  const failedSave = page.waitForResponse((response) => response.url().endsWith("/api/valuation-presets") &&
    response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save Thesis", exact: true }).click();
  expect((await failedSave).status()).toBe(503);

  await page.reload();
  await expect(note).toHaveValue("New local fixture note");
  await page.getByRole("button", { name: /Thesis Journal/ }).click();
  await expect(page.getByText("“New local fixture note”", { exact: true })).toBeVisible();
  await expect(page.getByText("“Older synced fixture note”", { exact: true })).toBeVisible();

  offline = false;
  await page.getByRole("button", { name: "Save Thesis", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();
  expect(saveIds).toHaveLength(2);
  expect(saveIds[1]).toBe(saveIds[0]);
  await expect(page.getByText("“New local fixture note”", { exact: true })).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: /Thesis Journal/ }).click();
  await expect(page.getByText("“New local fixture note”", { exact: true })).toHaveCount(1);
  await expect(page.getByText("“Older synced fixture note”", { exact: true })).toBeVisible();
});

test("changing thesis visibility creates a different save after an uncertain request", async ({ page }) => {
  const writes: { isPublic: boolean; saveId: string }[] = [];
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ json: session }));
  await page.route("**/api/valuation-presets*", (route) => {
    if (route.request().method() === "PUT") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: 503, json: {} });
    }
    return route.fulfill({ json: { preset: null } });
  });
  await page.goto("/t/NVDA?tab=dcf&model=scenario");
  const publicity = page.getByRole("checkbox", { name: "Showcase this thesis on my public investor profile" });
  const save = page.getByRole("button", { name: "Save Thesis", exact: true });
  await publicity.check();
  await save.click();
  await expect(page.getByRole("status")).toContainText("Saved on this device");
  await page.reload();
  await expect(publicity).toBeChecked();
  await publicity.uncheck();
  await save.click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes.map(({ isPublic }) => isPublic)).toEqual([true, false]);
  expect(writes[0].saveId).not.toEqual(writes[1].saveId);
});

test("Compare suppresses inapplicable cash flow consistently and exports the compact data", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/compare/JPM-vs-NVDA");
  const trueFcf = page.getByRole("row", { name: /True FCF \(FCF − SBC\)/ });
  await expect(trueFcf.getByRole("cell").first()).toHaveText("—");
  const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "5-Year Historical Trajectory" }) });
  await expect(history.getByRole("img", { name: "5-year True FCF Margin comparison chart" })).toBeVisible();
  await expect(history.getByText("JPM", { exact: true })).toHaveCount(0);
  const menu = page.getByRole("button", { name: /Share \/ Export|Copied MD/ });
  await menu.click();
  await page.getByRole("menuitem", { name: "Copy Markdown table" }).click();
  await expect(menu).toHaveText("Copied MD");
  const markdown = await page.evaluate(() => navigator.clipboard.readText());
  expect(markdown).toMatch(/\| \*\*True FCF \(FCF − SBC\)\*\* \| — \| \*\*\$[\d.]+[TBMK]\*\* \|/);

  await menu.click();
  const csv = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download CSV" }).click();
  expect((await csv).suggestedFilename()).toBe("amber-compare-jpm-nvda.csv");

  await menu.click();
  const png = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export PNG card" }).click();
  expect((await png).suggestedFilename()).toBe("amber-compare-jpm-nvda.png");
});
