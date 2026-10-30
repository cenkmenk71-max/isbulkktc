import { defineConfig, devices } from "@playwright/test";
import nextEnv from "@next/env";

// The test process reads the app's env files itself: `npm run test:e2e` does not
// export them, so `SUPABASE_SERVICE_ROLE_KEY` stayed empty and the console spec
// skipped itself locally. CI already exports the values, and loadEnvConfig never
// overrides a variable that is already set.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
  info: () => {},
  error: () => {},
});

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const port = new URL(baseURL).port || "3000";
const readinessURL = new URL("/tr?district=invalid", baseURL).toString();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // The visual-motion E2E tests assert animated states; tests for reduced motion
    // explicitly emulate that preference so the suite is deterministic in CI.
    reducedMotion: "no-preference",
    launchOptions: {
      // GitHub-hosted Linux runners may not expose a physical GPU. Use Chromium's
      // software WebGL implementation so the 3D scene and fallback path are exercised.
      args: [
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      // The visual test suite includes an H.264 MP4 background. The branded
      // Chrome channel provides the media codecs that stock Playwright Chromium omits.
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: process.env.CI ? "node .next/standalone/server.js" : "npm run dev",
    url: readinessURL,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      AUTH_OAUTH_PROVIDERS: process.env.PLAYWRIGHT_AUTH_OAUTH_PROVIDERS ?? "",
      ...(process.env.CI ? {} : { NEXT_DIST_DIR: ".next-playwright" }),
      PORT: port,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
