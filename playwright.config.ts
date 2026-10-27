import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const port = new URL(baseURL).port || "3000";
const readinessURL = new URL("/tr?district=invalid", baseURL).toString();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: readinessURL,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      AUTH_OAUTH_PROVIDERS: process.env.PLAYWRIGHT_AUTH_OAUTH_PROVIDERS ?? "",
      NEXT_DIST_DIR: ".next-playwright",
      PORT: port,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
