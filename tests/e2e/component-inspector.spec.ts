import { expect, test } from "@playwright/test";

/**
 * The component inspector is a development-only tool. CI serves a production
 * build, so this spec pins both halves of that contract: the overlay must never
 * appear in a shipped build, and when it is available it must resolve a real
 * source location.
 */
test("component inspector is dev-only and resolves real source locations", async ({
  page,
}) => {
  const probe = await page.request.get(
    "/api/devtools/component?name=SiteHeader",
  );

  if (probe.status() === 404) {
    // Production build: the route is disabled, so nothing may reach the page.
    await page.goto("/?inspect=1");
    await expect(page.locator("[data-component-inspector]")).toHaveCount(0);
    await expect(page.locator("#component-inspector-root")).toHaveCount(0);
    return;
  }

  expect(probe.status()).toBe(200);
  const payload = (await probe.json()) as {
    found: boolean;
    location: { file: string; line: number };
  };
  expect(payload.found).toBe(true);
  expect(payload.location.file).toMatch(/^src\/.*\.tsx$/);
  expect(payload.location.line).toBeGreaterThan(0);

  await page.goto("/?inspect=1");
  const toggle = page.locator(".component-inspector-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.locator(".brand-wordmark").first().click({ force: true });
  const panel = page.locator(".component-inspector-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("src/components/brand/logo.tsx");

  // The picker must intercept the click instead of following the brand link.
  await expect(page).toHaveURL(/\/?\?inspect=1$/);

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
