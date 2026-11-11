import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The live-support launcher shares the bottom inline-end corner with the
 * consent pill, the offline strip and the update toast. All three sit higher in
 * the stack, so without a layout contract they swallow the launcher's pointer
 * events and make it untappable — the exact bug #398 reported.
 *
 * These tests pin the geometry, not the pixels: whatever the stacking numbers
 * become, a visitor must be able to hit the launcher, the open panel must clear
 * the pill, and the widget must yield to the undecided notice and come back.
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// A visitor who has already answered the cookie notice, so the bottom corner is
// the decided pill rather than the full card.
async function seedDecidedConsent(page: Page) {
  await page.context().addCookies([
    { name: "ib_consent", value: "0:0", url: baseURL },
  ]);
}

const launcher = (page: Page) => page.locator(".support-widget__launcher");
const panel = (page: Page) => page.locator(".support-widget__panel");
const consentPill = (page: Page) => page.locator(".consent-settings-trigger");

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value, "expected the element to have a layout box").not.toBeNull();
  return value!;
}

async function expectClearOf(above: Locator, below: Locator) {
  const [a, b] = [await box(above), await box(below)];
  // `above` must sit entirely above `below` (a 1px slack absorbs subpixel
  // rounding), so neither overlaps the other.
  expect(
    a.y + a.height,
    "the launcher must clear the overlay it shares the corner with",
  ).toBeLessThanOrEqual(b.y + 1);
}

/**
 * `next dev` mounts a fixed dev overlay in the bottom corner; the production
 * build CI serves does not. Hide it so these tests measure the app's own
 * stacking rather than the tooling's.
 */
async function stripDevOverlay(page: Page) {
  await page.addStyleTag({
    content:
      "nextjs-portal,[data-nextjs-dev-overlay],[data-nextjs-toast]{display:none !important}",
  });
}

async function goto(page: Page, path: string) {
  await page.goto(path);
  await stripDevOverlay(page);
}

/** The element actually painted at the launcher's centre. */
function hitAtLauncherCentre(page: Page) {
  return page.evaluate(() => {
    const node = document.querySelector(".support-widget__launcher");
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const top = document.elementFromPoint(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    return {
      insideWidget: node.contains(top) || top === node,
      tag: top?.tagName ?? null,
      className: typeof top?.className === "string" ? top.className : null,
    };
  });
}

test("the launcher is tappable above the decided-consent pill", async ({
  page,
}) => {
  await seedDecidedConsent(page);
  await goto(page, "/tr");
  await expect(consentPill(page)).toBeVisible();

  // A real click runs Playwright's actionability check: if the pill intercepts
  // the pointer, the click times out instead of silently succeeding.
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
});

test("the open panel clears the consent pill", async ({ page }) => {
  await seedDecidedConsent(page);
  await goto(page, "/tr");
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();

  await expectClearOf(panel(page), consentPill(page));

  // The composer is the last thing in the panel; if it is visible and clickable
  // the pill is not covering the panel's controls.
  const submit = page.locator(".support-widget__submit");
  await expect(submit).toBeVisible();
});

test("the widget yields to the undecided notice and returns after a decision", async ({
  page,
}) => {
  await goto(page, "/tr");
  const card = page.getByRole("dialog", { name: "Çerez tercihleri" });
  await expect(card).toBeVisible();
  // While the notice is up it owns the corner; the launcher must not sit under
  // it as an invisible, untappable control.
  await expect(page.locator(".support-widget")).toBeHidden();

  await card.getByRole("button", { name: "Tümünü reddet" }).click();
  await expect(card).toHaveCount(0);

  await expect(launcher(page)).toBeVisible();
  await expectClearOf(launcher(page), consentPill(page));
});

test("the launcher lifts above the offline strip", async ({ page }) => {
  await seedDecidedConsent(page);
  await goto(page, "/tr");
  await expect(launcher(page)).toBeVisible();

  await page.context().setOffline(true);
  await expect(page.locator(".pwa-offline-banner")).toBeVisible();

  await expectClearOf(launcher(page), page.locator(".pwa-offline-banner"));
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
});

test("the launcher lifts above the update toast", async ({ page }) => {
  await seedDecidedConsent(page);
  await goto(page, "/tr");
  await expect(launcher(page)).toBeVisible();

  // The toast only appears when the service worker reports an update, which is
  // not reproducible on demand. Inject its real markup so the stacking contract
  // is exercised regardless of the update lifecycle.
  await page.evaluate(() => {
    const toast = document.createElement("div");
    toast.className = "pwa-update-toast";
    toast.setAttribute("role", "status");
    toast.innerHTML =
      '<p class="pwa-update-copy">Yeni sürüm hazır.</p>' +
      '<div class="pwa-update-actions">' +
      '<button type="button" class="pwa-update-primary">Güncelle</button>' +
      '<button type="button" class="pwa-update-secondary">Sonra</button></div>';
    document.body.appendChild(toast);
  });

  await expectClearOf(launcher(page), page.locator(".pwa-update-toast"));
});

test("the launcher is keyboard-reachable and opens the panel", async ({
  page,
}) => {
  await seedDecidedConsent(page);
  await goto(page, "/tr");

  const trigger = launcher(page);
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toBeVisible();

  await page.keyboard.press("Escape").catch(() => {});
});

test("the launcher stays tappable in a right-to-left locale", async ({
  page,
}) => {
  await seedDecidedConsent(page);
  await goto(page, "/fa");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const hit = await hitAtLauncherCentre(page);
  expect(hit?.insideWidget, "the launcher must own its centre point").toBe(true);

  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  // In RTL the launcher mirrors to the inline-start corner; the pill mirrors
  // with it, so the two must still clear each other.
  await expectClearOf(panel(page), consentPill(page));
});
