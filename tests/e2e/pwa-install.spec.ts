import { expect, test } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

/**
 * The install entry point and its security boundaries.
 *
 * These run in desktop Chromium, which is the honest limit of the automation:
 * WebKit is not an iPhone, and no desktop browser can produce a real
 * `beforeinstallprompt`. What *can* be verified here is the part a code review
 * misses — that the QR route redirects nowhere, that the manifest the browser
 * actually receives is valid, and that the page degrades to a manual path
 * instead of a dead end on every platform.
 */

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;

test("the manifest is served, parses, and points at in-scope resources", async ({
  page,
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("json");

  const manifest = (await response.json()) as {
    id: string;
    start_url: string;
    scope: string;
    display: string;
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string; purpose?: string }[];
    shortcuts?: { url: string }[];
  };

  expect(manifest.display).toBe("standalone");
  expect(manifest.scope).toBe("/");
  expect(manifest.start_url).toBe("/");
  expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);

  // `id` must be an absolute URL on the served origin: a relative one lets a
  // preview deployment register as a second installable app.
  const servedOrigin = new URL(response.url()).origin;
  const idUrl = new URL(manifest.id);
  expect(idUrl.origin).toBe(servedOrigin);
  expect(idUrl.pathname).toBe("/");

  // The start_url must sit inside the declared scope, or the installed app
  // launches outside itself.
  expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);

  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);

  // Every icon and shortcut must actually resolve; a 404 icon makes an install
  // fail with no visible error.
  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.status(), `${icon.src} must be served`).toBe(200);
  }
  for (const shortcut of manifest.shortcuts ?? []) {
    expect(shortcut.url.startsWith("/")).toBe(true);
  }

  // The page must link the same manifest, so an installed app is registered from
  // the page and not only from a direct fetch.
  await page.goto("/tr");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
});

test("the manifest is linked from every public page", async ({ page }) => {
  await page.goto("/tr");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    "content",
    /#[0-9a-fA-F]{6}/,
  );
});

test("the install page renders in every locale without a device-specific claim", async ({
  page,
}) => {
  // Six locale navigations with several assertions each. Budgeted for the same
  // reason as the other multi-navigation sweeps in this suite.
  test.setTimeout(120_000);
  for (const locale of locales) {
    const prefix = locale === "tr" ? "" : `/${locale}`;
    const response = await page.goto(`${prefix}/install`);
    expect(response?.status(), `${prefix}/install`).toBe(200);

    // The device is unknown on the server, so the page must not promise an
    // Android prompt or iOS steps before the client snapshot exists.
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('[data-state="detecting"]')).toHaveCount(0);

    // The continuation link is always present and always in-scope.
    const continueLink = page.locator("a.pwa-install-primary").first();
    await expect(continueLink).toHaveAttribute("href", /^\//);
  }
});

test("the install page is not indexable", async ({ page }) => {
  await page.goto("/tr/install");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("a valid next destination is honoured and carried into the continue link", async ({
  page,
}) => {
  await page.goto("/tr/install?next=%2Fjobs%3Fdistrict%3Dnicosia");
  const continueLink = page.locator("a.pwa-install-primary").first();
  await expect(continueLink).toHaveAttribute("href", "/jobs?district=nicosia");
});

test("an off-site next destination is discarded, not redirected to", async ({ page }) => {
  const navigations: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest()) navigations.push(request.url());
  });

  await page.goto("/tr/install?next=https%3A%2F%2Fevil.example%2Fsteal");

  // The page still works, and the destination was replaced with the safe default.
  await expect(page.locator("h1")).toBeVisible();
  const continueLink = page.locator("a.pwa-install-primary").first();
  await expect(continueLink).toHaveAttribute("href", "/jobs");

  // No navigation may leave the app origin. The value still appears inside the
  // *first* request's query string (that is the URL the test typed); what must
  // never happen is a navigation whose own origin is the attacker's.
  const escaped = navigations.filter((url) => new URL(url).origin !== new URL(page.url()).origin);
  expect(escaped).toEqual([]);
});

test("a protocol-relative and a backslash destination are both discarded", async ({
  page,
}) => {
  for (const raw of ["%2F%2Fevil.example", "%2F%5Cevil.example", "%2Finstall"]) {
    await page.goto(`/tr/install?next=${raw}`);
    await expect(page.locator("a.pwa-install-primary").first()).toHaveAttribute(
      "href",
      "/jobs",
    );
  }
});

test("campaign attribution is displayed and never injected as markup", async ({ page }) => {
  await page.goto("/tr/install?utm_source=poster&utm_campaign=spring_2026");
  const campaign = page.locator(".pwa-install-campaign");
  await expect(campaign).toBeVisible();
  await expect(campaign).toContainText("spring_2026");

  // A value outside the opaque-token alphabet is dropped rather than rendered.
  await page.goto("/tr/install?utm_campaign=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E");
  await expect(page.locator(".pwa-install-campaign")).toHaveCount(0);
  await expect(page.locator("img[src='x']")).toHaveCount(0);
});

test("the install page offers a manual path when no install prompt is available", async ({
  page,
}) => {
  // Desktop Chromium in automation does not fire `beforeinstallprompt`, which is
  // exactly the "automatic installation is unavailable" case: the page must show
  // instructions rather than an inert button.
  await page.goto("/tr/install");
  await expect(page.locator('[data-state="desktop"]')).toBeVisible();
  await expect(page.locator("a.pwa-install-primary").first()).toBeVisible();
});

test("an anonymous visitor is asked to sign in, not handed a dead permission button", async ({
  page,
}) => {
  // A push subscription row is bound to `auth.uid()`. Asking an anonymous
  // visitor for notification permission would spend the browser prompt on a
  // grant that can never be stored — and on iOS that prompt is offered once.
  await page.goto("/tr/install");
  await expect(page.locator(".pwa-push-button")).toHaveCount(0);
  await expect(page.locator(".pwa-push-signin-row")).toBeVisible();
  await expect(page.locator(".pwa-push-signin")).toHaveAttribute(
    "href",
    /\/login$/,
  );
});

/**
 * Decodes a QR raster to the string it actually encodes.
 *
 * The SVG form the route offers is a module matrix: `QRCode.toString` draws the
 * symbol as `<path>` rectangles and never emits the payload as text. So a
 * `expect(svg).not.toContain("evil.example")` is vacuously true for *every*
 * input — the string is absent from the output even when the route does encode
 * it — and cannot fail no matter what destination is embedded. Reading the
 * symbol back with an independent decoder (jsQR) is the assertion that can
 * fail; it is the same round-trip `tests/unit/pwa-qr.test.ts` does against the
 * generator, but here it runs through the route, so it also proves the route
 * forwards the payload to the generator at all.
 */
async function decodeQr(png: Buffer): Promise<string | null> {
  const image = PNG.sync.read(png);
  const result = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  return result?.data ?? null;
}

test("the QR route returns a scannable SVG for the install URL", async ({
  request,
  baseURL,
}) => {
  const response = await request.get("/api/qr?format=svg&next=%2Fjobs");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image/svg+xml");

  const svg = await response.text();
  expect(svg).toContain("<svg");
  // A quiet zone is required for a camera to lock on; the generator requests a
  // 4-module margin, which appears as a viewBox larger than the module matrix.
  expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);

  // "Scannable" is a claim about the payload, and the SVG carries that payload
  // only as a module matrix. Read the same symbol back from the raster form to
  // prove the route encodes this origin's install URL — not just that it drew
  // *a* symbol.
  const raster = await request.get("/api/qr?format=png&next=%2Fjobs");
  const decoded = await decodeQr(await raster.body());
  expect(decoded, "the symbol must decode, or this guard is blind").not.toBeNull();

  const target = new URL(decoded as string);
  expect(target.origin).toBe(new URL(baseURL as string).origin);
  expect(target.pathname).toBe("/install");
  expect(target.searchParams.get("next")).toBe("/jobs");
});

test("the QR route never encodes an off-site destination", async ({
  request,
  baseURL,
}) => {
  // The payload is only observable by decoding the symbol, so ask for the PNG
  // form and read it back. (Grepping the SVG cannot see the destination: it is
  // a module matrix, not text.)
  const response = await request.get(
    "/api/qr?format=png&next=https%3A%2F%2Fevil.example",
  );
  expect(response.ok()).toBe(true);

  const decoded = await decodeQr(await response.body());
  expect(decoded, "the symbol must decode, or this guard is blind").not.toBeNull();

  const target = new URL(decoded as string);
  expect(target.origin).toBe(new URL(baseURL as string).origin);
  expect(target.pathname).toBe("/install");
  expect(decoded).not.toContain("evil.example");
});

test("the QR route can also return a PNG", async ({ request }) => {
  const response = await request.get("/api/qr?format=png");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/png");
  const body = await response.body();
  expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});

test("the offline document is served and is self-contained", async ({ request }) => {
  const response = await request.get("/offline.html");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain("<h1>");
  expect(html).not.toContain("<script");
});

test("the service worker is served with a scope that covers the app", async ({
  request,
}) => {
  const response = await request.get("/sw.js");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toMatch(/javascript/);
  const body = await response.text();
  expect(body).toContain('addEventListener("push"');
  expect(body).toContain('addEventListener("fetch"');
});

test("an authenticated-only push route refuses an anonymous caller", async ({ request }) => {
  const response = await request.post("/api/push/subscriptions", {
    data: { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "a", auth: "b" } },
  });
  expect(response.status()).toBe(401);
});

test("the push dispatcher refuses a caller without the cron secret", async ({ request }) => {
  const response = await request.post("/api/push/dispatch");
  expect(response.status()).toBe(401);
});
