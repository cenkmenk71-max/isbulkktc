import { expect, test, type Page } from "@playwright/test";

/**
 * The consent surface is the one place the site must prove it does not track a
 * visitor before being asked. These tests pin the parts a code review cannot:
 * that nothing loads pre-consent, that both storage channels agree, that a
 * decision survives a reload without the notice flashing back, and that
 * withdrawing consent is possible.
 */

const consentCard = (page: Page) => page.getByRole("dialog", { name: "Çerez tercihleri" });
const settingsTrigger = (page: Page) => page.getByRole("button", { name: "Analitik tercihleri" });

async function readConsentState(page: Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("isbulkkktc-cookie-consent-v3");
    const cookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("ib_consent="));
    return { raw, cookie: cookie ? cookie.slice("ib_consent=".length) : null };
  });
}

test("a fresh visitor is asked and no analytics request is made beforehand", async ({
  page,
}) => {
  const analyticsRequests: string[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) {
      analyticsRequests.push(request.url());
    }
  });

  await page.goto("/tr");

  await expect(consentCard(page)).toBeVisible();
  // Nothing was stored and nothing non-essential was fetched.
  const state = await readConsentState(page);
  expect(state.raw).toBeNull();
  expect(state.cookie).toBeNull();
  expect(analyticsRequests).toEqual([]);
});

test("reject all stores an explicit denial in both channels", async ({ page }) => {
  await page.goto("/tr");
  await consentCard(page).getByRole("button", { name: "Tümünü reddet" }).click();

  await expect(consentCard(page)).toHaveCount(0);
  await expect(settingsTrigger(page)).toBeVisible();

  const state = await readConsentState(page);
  expect(state.cookie).toBe("0:0");
  const stored = JSON.parse(state.raw ?? "{}");
  expect(stored).toMatchObject({ analytics: false, marketing: false, version: 3 });
});

test("accept all grants both optional categories", async ({ page }) => {
  await page.goto("/tr");
  await consentCard(page).getByRole("button", { name: "Tümünü kabul et" }).click();

  await expect(consentCard(page)).toHaveCount(0);
  const state = await readConsentState(page);
  expect(state.cookie).toBe("1:1");
  expect(JSON.parse(state.raw ?? "{}")).toMatchObject({
    analytics: true,
    marketing: true,
  });
});

test("save preferences stores the exact toggled combination", async ({ page }) => {
  await page.goto("/tr");
  const card = consentCard(page);

  // Turn analytics on, leave marketing off.
  await card.getByRole("switch", { name: "Analitik" }).click();
  await card.getByRole("button", { name: "Tercihleri kaydet" }).click();

  await expect(card).toHaveCount(0);
  const state = await readConsentState(page);
  expect(state.cookie).toBe("1:0");
  expect(JSON.parse(state.raw ?? "{}")).toMatchObject({
    analytics: true,
    marketing: false,
  });
});

test("a decision survives a reload without the notice flashing back", async ({ page }) => {
  await page.goto("/tr");
  await consentCard(page).getByRole("button", { name: "Tümünü reddet" }).click();
  await expect(consentCard(page)).toHaveCount(0);

  // Re-navigate: the server render must not emit the notice before hydration
  // reads storage, otherwise it reappears for a visitor who already decided.
  await page.goto("/tr", { waitUntil: "domcontentloaded" });
  // Assert the absence *after* the client has read storage. Checking only at
  // `domcontentloaded` would pass before anything mounted, which proves nothing.
  await page.waitForSelector(".consent-settings-trigger", { state: "attached" });
  await expect(consentCard(page)).toHaveCount(0);
  await expect(settingsTrigger(page)).toBeVisible();
});

test("the policy page can reopen and withdraw the decision", async ({ page }) => {
  await page.goto("/tr");
  await consentCard(page).getByRole("button", { name: "Tümünü kabul et" }).click();
  await expect(consentCard(page)).toHaveCount(0);

  await page.goto("/tr/cookies");
  await page
    .getByRole("button", { name: "Çerez tercihlerini yönet" })
    .click();

  const card = consentCard(page);
  await expect(card).toBeVisible();
  // The reopened panel shows the stored choice, not a blank draft.
  await expect(card.getByRole("switch", { name: "Analitik" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await card.getByRole("button", { name: "Onayı geri çek" }).click();

  // Withdrawal clears both channels and re-asks, so the notice stays on screen
  // in its undecided state instead of vanishing silently.
  await expect(card.getByRole("button", { name: "Tümünü kabul et" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Onayı geri çek" })).toHaveCount(0);

  const state = await readConsentState(page);
  expect(state.raw).toBeNull();
  expect(state.cookie).toBeNull();
});

test("the decision is shared across locales", async ({ page }) => {
  await page.goto("/tr");
  await consentCard(page).getByRole("button", { name: "Tümünü reddet" }).click();
  await expect(consentCard(page)).toHaveCount(0);

  await page.goto("/de");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await readConsentState(page)).cookie).toBe("0:0");
});

test("the cookie alone keeps the decision when localStorage is cleared", async ({ page }) => {
  await page.goto("/tr");
  await consentCard(page).getByRole("button", { name: "Tümünü kabul et" }).click();
  await expect(consentCard(page)).toHaveCount(0);

  // Simulate a visitor whose localStorage was cleared (or is unavailable in
  // private mode) while the cookie survives: the second channel must carry the
  // decision, otherwise they are asked again despite having chosen.
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/tr", { waitUntil: "domcontentloaded" });

  // Wait for hydration first. `toHaveCount(0)` would pass *before* the client
  // reads storage, so asserting it immediately proves nothing — the notice has
  // simply not mounted yet.
  await page.waitForSelector(".consent-settings-trigger", { state: "attached" });
  await expect(consentCard(page)).toHaveCount(0);

  const state = await readConsentState(page);
  expect(state.raw).toBeNull();
  expect(state.cookie).toBe("1:1");
});
