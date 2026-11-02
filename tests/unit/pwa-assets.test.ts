import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

/**
 * Asset and service-worker contracts for the installable app.
 *
 * These are the assertions a hand-edit is most likely to break and a browser
 * will not report: an icon that stops being square, an Apple touch icon that
 * regains transparency (iOS paints those black), an offline document that starts
 * depending on the network it is meant to replace, and a service worker that
 * loses the privacy rules that keep signed-in data out of the cache.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const iconFiles = [
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/maskable-192.png",
  "public/icons/maskable-512.png",
  "public/icons/apple-touch-icon.png",
];

/** PNG dimensions live in the IHDR chunk: 8-byte signature, then width/height. */
function pngSize(path: string): { width: number; height: number; colorType: number } {
  const bytes = readFileSync(new URL(`../../${path}`, import.meta.url));
  const signature = bytes.subarray(0, 8).toString("hex");
  assert.equal(signature, "89504e470d0a1a0a", `${path} is not a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colorType: bytes[25],
  };
}

test("every manifest icon exists at the size it advertises", () => {
  const expected: Record<string, number> = {
    "public/icons/icon-192.png": 192,
    "public/icons/icon-512.png": 512,
    "public/icons/maskable-192.png": 192,
    "public/icons/maskable-512.png": 512,
    "public/icons/apple-touch-icon.png": 180,
  };

  for (const [path, size] of Object.entries(expected)) {
    const { width, height } = pngSize(path);
    assert.equal(width, size, `${path} width`);
    assert.equal(height, size, `${path} height`);
  }
});

test("the icons are square and non-trivial in size", () => {
  for (const path of iconFiles) {
    const { width, height } = pngSize(path);
    assert.equal(width, height, `${path} must be square`);
    assert.ok(statSync(new URL(`../../${path}`, import.meta.url)).size > 500, path);
  }
});

test("the Apple touch icon is fully opaque", () => {
  // iOS composites the touch icon onto black, so a transparent pixel becomes a
  // black pixel. PNG colour type 3 (indexed) or 2 (truecolour) with no alpha
  // chunk is the cheap structural check; the alpha chunk would be `tRNS`.
  const { colorType } = pngSize("public/icons/apple-touch-icon.png");
  assert.ok([0, 2, 3].includes(colorType), `unexpected colour type ${colorType}`);
  const raw = readFileSync(
    new URL("../../public/icons/apple-touch-icon.png", import.meta.url),
  );
  assert.equal(raw.includes(Buffer.from("tRNS")), false, "touch icon has a transparency chunk");
});

test("the offline document makes no network request of its own", () => {
  const html = read("public/offline.html");
  // No stylesheet, script, font or image reference: the document is served
  // precisely when the network is gone.
  assert.equal(/<link[^>]+rel=["']stylesheet["']/i.test(html), false);
  assert.equal(/<script/i.test(html), false);
  assert.equal(/<img/i.test(html), false);
  assert.equal(/@import/i.test(html), false);
  assert.equal(/url\(\s*["']?https?:/i.test(html), false);
  // It must still be a usable page: a heading and a way back.
  assert.match(html, /<h1>/);
  assert.match(html, /href="\/jobs"/);
});

test("the offline document respects the notch", () => {
  const html = read("public/offline.html");
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
});

test("the service worker never caches authenticated or private responses", () => {
  const sw = read("public/sw.js");
  // The privacy rules are the reason this worker is hand-written; losing one
  // would put a signed-in user's data in a URL-keyed cache.
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /url\.pathname\.startsWith\("\/auth\/"\)/);
  assert.match(sw, /url\.searchParams\.has\("_rsc"\)/);
  assert.match(sw, /request\.headers\.get\("RSC"\)/);
  assert.match(sw, /request\.headers\.get\("Next-Router-Prefetch"\)/);
  assert.match(sw, /request\.method !== "GET"/);
  assert.match(sw, /url\.origin === self\.location\.origin/);
});

test("the service worker keeps navigations network-first with an offline fallback", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /async function networkFirstNavigation/);
  assert.match(sw, /const OFFLINE_URL = "\/offline\.html"/);
  assert.match(sw, /caches\.match\(OFFLINE_URL\)/);
  // The caches are versioned and old ones are deleted on activate.
  assert.match(sw, /CACHE_VERSION/);
  assert.match(sw, /caches\.delete\(name\)/);
  // Storage is bounded, so the cache cannot grow without limit.
  assert.match(sw, /MAX_PAGE_ENTRIES/);
  assert.match(sw, /trimCache/);
});

test("the service worker shows a notification for every push, as iOS requires", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /showNotification/);
  // Notification destinations are restricted to same-origin relative paths.
  assert.match(sw, /payload\.url\.startsWith\("\/"\)/);
  assert.match(sw, /!payload\.url\.startsWith\("\/\/"\)/);
  assert.match(sw, /addEventListener\("notificationclick"/);
  assert.match(sw, /addEventListener\("pushsubscriptionchange"/);
});

test("activation is never forced from inside the worker", () => {
  const sw = read("public/sw.js");
  // `skipWaiting` must only run in response to the page's explicit message, so
  // a deploy cannot swap the shell out from under a half-filled form.
  const skipWaitingCalls = sw.match(/skipWaiting\(\)/g) ?? [];
  assert.equal(skipWaitingCalls.length, 1, "skipWaiting must have exactly one call site");
  assert.match(sw, /event\.data\.type === "SKIP_WAITING"/);
  const installHandler = sw.slice(
    sw.indexOf('addEventListener("install"'),
    sw.indexOf('addEventListener("activate"'),
  );
  assert.equal(installHandler.includes("skipWaiting"), false);
});

test("the install page is excluded from the sitemap and marked noindex", () => {
  const page = read("src/app/[locale]/install/page.tsx");
  assert.match(page, /robots: \{ index: false, follow: true \}/);
});
