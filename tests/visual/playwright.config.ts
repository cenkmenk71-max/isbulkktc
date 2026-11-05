import { defineConfig, devices } from "@playwright/test";
import nextEnv from "@next/env";

// The test process reads the app's env files itself, mirroring
// `playwright.config.ts`; `bun run test:visual` does not export them.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
  info: () => {},
  error: () => {},
});

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const port = new URL(baseURL).port || "3000";
const readinessURL = new URL("/tr?district=invalid", baseURL).toString();

/**
 * Visual regression runs as its own Playwright project so it can be invoked
 * without the E2E suite and, more importantly, so it can be skipped from the
 * `e2e` CI shards until a baseline exists for every target. When it is wired
 * into CI it runs against the same production standalone server as E2E.
 *
 * `snapshotPathTemplate` keeps Playwright from writing its own `-snapshots`
 * directory: the comparison and its artefacts are owned by
 * `support/visual.ts`, which stores references in `tests/visual/baselines/`.
 */
export default defineConfig({
  testDir: ".",
  testMatch: ["**/*.spec.ts"],
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "../../test-results/visual-playwright",
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      // The committed baselines were produced on the same software renderer CI
      // uses; this only absorbs the last byte of anti-aliasing noise if a
      // `toHaveScreenshot` assertion is ever added.
      maxDiffPixelRatio: 0.001,
    },
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Freeze motion and fonts the same way the harness does, so a stray
    // assertion outside `support/visual.ts` stays deterministic too.
    reducedMotion: "reduce",
    launchOptions: {
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
      name: "visual-chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    // The production standalone server, in CI and locally alike. A baseline
    // captured from `next dev` does not match the built output: four of the
    // sixteen targets (the search form, footer, first job card and sign-in
    // form) differed by 0.4-1.3% between the two, well over the 0.1% budget.
    // Build first (`bun run build`, then copy `.next/static` and `public` into
    // `.next/standalone` as CI does) or point `PLAYWRIGHT_BASE_URL` at a server
    // that already serves the production build.
    command: "node .next/standalone/server.js",
    url: readinessURL,
    env: {
      NEXT_PUBLIC_APP_URL: baseURL,
      AUTH_OAUTH_PROVIDERS: process.env.PLAYWRIGHT_AUTH_OAUTH_PROVIDERS ?? "",
      PORT: port,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
