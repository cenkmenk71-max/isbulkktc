import assert from "node:assert/strict";
import test from "node:test";
import {
  isStandaloneDisplay,
  readPlatform,
  type PlatformSnapshot,
} from "../../src/lib/pwa/platform";
import { urlBase64ToUint8Array } from "../../src/lib/pwa/web-push-client";

/**
 * Platform detection drives which install instructions are shown, so a wrong
 * answer is a wrong instruction. These cases pin the two things that matter:
 * capabilities are read from what the browser exposes, and the only question
 * that uses the user agent — which iOS browser this is — distinguishes the
 * toolbar that will actually be on screen.
 */

function fakeMatchMedia(matches: Record<string, boolean>) {
  return (query: string): MediaQueryList =>
    ({ matches: matches[query] ?? false }) as MediaQueryList;
}

function detect(userAgent: string, overrides: Partial<Parameters<typeof readPlatform>[0]> = {}) {
  return readPlatform({
    userAgent,
    maxTouchPoints: 0,
    matchMedia: fakeMatchMedia({}),
    ...overrides,
  });
}

const safariIphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const chromeIos =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const chromeAndroid =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36";
const instagramIos =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0.0.0";
const desktopChrome =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Safari/537.36";

test("Android, iPhone and desktop user agents map to the right family", () => {
  assert.equal(detect(chromeAndroid).family, "android");
  assert.equal(detect(safariIphone).family, "ios");
  assert.equal(detect(desktopChrome).family, "desktop");
});

test("an iPad reporting a desktop Macintosh user agent is still iPadOS", () => {
  // iPadOS 13+ reports "Macintosh"; the touch-point count is the only tell.
  assert.equal(
    detect("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", {
      maxTouchPoints: 5,
    }).family,
    "ipados",
  );
  assert.equal(
    detect("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", {
      maxTouchPoints: 0,
    }).family,
    "desktop",
  );
});

test("iOS browsers are told apart, because their toolbars differ", () => {
  assert.equal(detect(safariIphone).iosBrowser, "safari");
  // A third-party WebKit browser has no Share button in the Safari position.
  assert.equal(detect(chromeIos).iosBrowser, "third-party");
  // An in-app web view cannot add to the home screen at all, and it reports
  // "Safari" in its user agent — so the in-app check has to win.
  assert.equal(detect(instagramIos).iosBrowser, "in-app");
});

test("standalone display is read from the media query, not the user agent", () => {
  assert.equal(
    isStandaloneDisplay(fakeMatchMedia({ "(display-mode: standalone)": true })),
    true,
  );
  assert.equal(
    isStandaloneDisplay(fakeMatchMedia({ "(display-mode: minimal-ui)": true })),
    true,
  );
  assert.equal(isStandaloneDisplay(fakeMatchMedia({})), false);
});

test("the legacy navigator.standalone flag is honoured for older iOS", () => {
  const snapshot = detect(safariIphone, { legacyStandalone: true });
  assert.equal(snapshot.isStandalone, true);
  assert.equal(snapshot.isLegacyStandalone, true);
});

test("capabilities are reported from the objects the browser exposes", () => {
  const withApis: PlatformSnapshot = detect(desktopChrome, {
    navigator: {
      serviceWorker: {},
      PushManager: function PushManager() {},
      setAppBadge: () => Promise.resolve(),
    },
  });
  assert.equal(withApis.supportsServiceWorker, true);
  assert.equal(withApis.supportsPush, true);
  assert.equal(withApis.supportsBadging, true);

  const withoutApis = detect(desktopChrome);
  assert.equal(withoutApis.supportsServiceWorker, false);
  assert.equal(withoutApis.supportsPush, false);
  assert.equal(withoutApis.supportsBadging, false);
});

test("a service worker without PushManager is not reported as push-capable", () => {
  // iOS Safari in a tab: service workers exist, PushManager does not.
  const snapshot = detect(safariIphone, { navigator: { serviceWorker: {} } });
  assert.equal(snapshot.supportsServiceWorker, true);
  assert.equal(snapshot.supportsPush, false);
});

test("an empty user agent is unknown rather than a guess", () => {
  assert.equal(detect("").family, "unknown");
});

/**
 * The VAPID public key has to be converted before it can be used, and the
 * conversion is where a base64url key silently breaks.
 */

test("a real VAPID public key converts to the 65-byte uncompressed point", () => {
  // 0x04 followed by 32+32 bytes, base64url, no padding — the shape web-push emits.
  const raw = new Uint8Array(65);
  raw[0] = 0x04;
  for (let index = 1; index < 65; index += 1) raw[index] = index;
  const base64Url = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const bytes = urlBase64ToUint8Array(base64Url);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 0x04);
  assert.deepEqual(Array.from(bytes), Array.from(raw));
});

test("a key that is not an uncompressed point is rejected", () => {
  assert.throws(() => urlBase64ToUint8Array(""));
  // A compressed point (33 bytes) is a valid key format but not one the Push API
  // accepts for `applicationServerKey`, so it must fail loudly here.
  const compressed = Buffer.from(new Uint8Array(33).fill(2)).toString("base64url");
  assert.throws(() => urlBase64ToUint8Array(compressed));
});
