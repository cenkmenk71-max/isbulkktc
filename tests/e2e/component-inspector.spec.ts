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

  // The POST route is what the overlay actually calls. A chain that starts with
  // Next.js internals must still resolve to the app's own component.
  const chained = await page.request.post("/api/devtools/component", {
    data: {
      chain: ["SegmentViewNode", "LayoutRouter", "SiteHeader"],
      id: "",
      classes: [],
    },
  });
  expect(chained.status()).toBe(200);
  const chainedPayload = (await chained.json()) as {
    found: boolean;
    name: string;
    location: { file: string };
  };
  expect(chainedPayload.found).toBe(true);
  expect(chainedPayload.name).toBe("SiteHeader");
  expect(chainedPayload.location.file).toBe("src/components/layout/site-header.tsx");

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

test("component inspector resolves React Server Components by DOM hints", async ({
  page,
}) => {
  const probe = await page.request.post("/api/devtools/component", {
    data: { chain: [], id: "", classes: [] },
  });
  if (probe.status() === 404) {
    // Production build: the inspector is unavailable, so there is nothing to check.
    return;
  }

  await page.goto("/?inspect=1");

  // `HomeJobSearch` is a server component, so it has no fiber in the browser.
  // Only the id/class fallback can locate it.
  const hero = page.locator("#home-job-search-title");
  await expect(hero).toBeVisible();
  await hero.scrollIntoViewIfNeeded();
  const box = await hero.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 4, box!.y + 4);

  const panel = page.locator(".component-inspector-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("HomeJobSearch");
  await expect(panel).toContainText("src/components/home/home-job-search.tsx");
});
