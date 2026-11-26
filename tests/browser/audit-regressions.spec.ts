import { expect, test } from "@playwright/test";

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
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
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
