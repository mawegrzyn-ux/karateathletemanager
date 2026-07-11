import { test, expect } from "@playwright/test";

// Read-only smoke checks meant to run right after a deploy. Nothing here
// creates, edits, or deletes data — safe to run against production.

test("API health check responds ok", async ({ request, baseURL }) => {
  const res = await request.get(`${baseURL}/api/health`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("uploads path reaches the API, not nginx's static-asset cache rule", async ({
  request,
  baseURL,
}) => {
  // Regression check: nginx prefers a matching regex location over a
  // plain prefix one unless the prefix has ^~, so a bogus upload path
  // with an image extension must still reach Express (the route's own
  // authorize() middleware runs before the file even gets looked up, so
  // an unauthenticated request gets a 401, not a 404 — either is fine
  // here, what matters is a JSON error body). If it's ever swallowed by
  // the "cache static assets" rule again, this request gets nginx's bare
  // static-file response instead and .json() throws.
  const res = await request.get(
    `${baseURL}/api/uploads/files/__smoke-test-missing__.png`
  );
  expect([401, 404]).toContain(res.status());
  const body = await res.json();
  expect(body.error?.message).toBeTruthy();
});

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test("register page renders", async ({ page }) => {
  await page.goto("/register");
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("visiting the app unauthenticated redirects to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

const smokeEmail = process.env.SMOKE_TEST_EMAIL;
const smokePassword = process.env.SMOKE_TEST_PASSWORD;

test.describe("authenticated smoke check", () => {
  test.skip(
    !smokeEmail || !smokePassword,
    "SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD not set — skipping authenticated checks"
  );

  test("logs in and sees the bottom nav with no console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/login");
    await page.fill('input[type="email"]', smokeEmail!);
    await page.fill('input[type="password"]', smokePassword!);
    await page.click('button[type="submit"]');

    await expect(page.locator("nav")).toBeVisible();
    await expect(page.getByText("More", { exact: true })).toBeVisible();

    expect(consoleErrors, `console errors: ${consoleErrors.join("; ")}`).toEqual(
      []
    );
  });
});
