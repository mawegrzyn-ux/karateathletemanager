import { defineConfig, devices } from "@playwright/test";

// Runs against a live deployment (default) or a local dev server —
// point SMOKE_BASE_URL at whichever you want to exercise. These are
// read-only smoke checks: no test creates, edits, or deletes real data.
const baseURL = process.env.SMOKE_BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Sandboxed dev environments pin a browser build outside the
    // package's own download path — point at it if set, otherwise let
    // Playwright use whatever `playwright install` fetched.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
