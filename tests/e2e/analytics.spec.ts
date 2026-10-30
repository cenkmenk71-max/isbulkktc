import { expect, test } from "@playwright/test";

// The tag only exists when a measurement id is configured at build/run time.
// `next.config.ts` and `.env.example` document the variable; CI passes a
// throwaway id so this guard actually runs there instead of silently skipping.
const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";
const configured = /^G-[A-Z0-9]+$/.test(measurementId);

test.describe("Google Analytics consent gate", () => {
  test.skip(
    !configured,
    "NEXT_PUBLIC_GA_MEASUREMENT_ID is not configured for this run",
  );

  test("gtag.js loads only after the visitor grants analytics consent", async ({
    page,
  }) => {
    const scriptRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("googletagmanager.com/gtag/js")) {
        scriptRequests.push(request.url());
      }
    });

    await page.goto("/tr");

    // A fresh context has no stored decision, so the notice is shown and the
    // tag must not be present yet: analytics needs an explicit opt-in.
    await expect(
      page.getByRole("button", { name: "Tümünü kabul et" }),
    ).toBeVisible();
    await expect(
      page.locator('script[src*="googletagmanager.com/gtag/js"]'),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => typeof window.gtag),
      "gtag must be undefined before consent",
    ).toBe("undefined");

    await page.getByRole("button", { name: "Tümünü kabul et" }).click();

    // The inline bootstrap defines `gtag` and the loader tag is injected with
    // the configured measurement id. Asserting the DOM node (not a successful
    // network load) keeps the check independent of Google's availability.
    await expect
      .poll(() => page.evaluate(() => typeof window.gtag))
      .toBe("function");

    const loader = page.locator(
      'script[src*="googletagmanager.com/gtag/js"]',
    );
    await expect(loader).toHaveCount(1);
    await expect(loader).toHaveAttribute(
      "src",
      `https://www.googletagmanager.com/gtag/js?id=${measurementId}`,
    );

    // `config` runs with `send_page_view: false`; the component sends the
    // page_view itself once the script is ready. Both must reach dataLayer.
    const dataLayer = await page.evaluate(() =>
      (window.dataLayer ?? []).map((entry) =>
        Array.from(entry as ArrayLike<unknown>).join(" "),
      ),
    );
    expect(dataLayer.join(" | ")).toContain(`config ${measurementId}`);

    expect(scriptRequests.length).toBeGreaterThan(0);
  });

  test("rejecting consent never injects the tag", async ({ page }) => {
    const scriptRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("googletagmanager.com/gtag/js")) {
        scriptRequests.push(request.url());
      }
    });

    await page.goto("/tr");
    await page.getByRole("button", { name: "Tümünü reddet" }).click();

    // The notice closes and no analytics script may appear afterwards.
    await expect(
      page.getByRole("button", { name: "Tümünü kabul et" }),
    ).toHaveCount(0);
    await page.waitForTimeout(1_000);
    await expect(
      page.locator('script[src*="googletagmanager.com/gtag/js"]'),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => typeof window.gtag),
      "gtag must stay undefined after a rejection",
    ).toBe("undefined");
    expect(scriptRequests).toEqual([]);
  });
});
