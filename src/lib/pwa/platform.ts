/**
 * Platform and capability detection for the install journey.
 *
 * Capabilities come first and user-agent strings are a last resort, because a
 * UA string is a claim the client makes about itself while a capability is
 * something the browser demonstrates. The one question that genuinely needs the
 * UA is *which* iOS browser is being used, because Safari, a third-party
 * WebKit browser and an in-app web view require different, mutually wrong
 * instructions ("tap Share" is absent in a Chrome iOS toolbar).
 *
 * Nothing here is treated as truth on its own: the install UI always keeps a
 * manual path visible, so a wrong guess degrades to generic instructions
 * instead of a dead end.
 */

export type PlatformFamily = "android" | "ios" | "ipados" | "desktop" | "unknown";
export type IosBrowser = "safari" | "third-party" | "in-app" | "unknown";

export type PlatformSnapshot = {
  family: PlatformFamily;
  iosBrowser: IosBrowser;
  isIos: boolean;
  /** Running as an installed app (any of the display modes a launcher sets). */
  isStandalone: boolean;
  /** Safari's pre-standard property; the only signal older iOS exposes. */
  isLegacyStandalone: boolean;
  isTouchDevice: boolean;
  supportsServiceWorker: boolean;
  supportsPush: boolean;
  supportsBadging: boolean;
  prefersReducedMotion: boolean;
};

export const standaloneMediaQuery = "(display-mode: standalone)";

/** Read `display-mode` from the media query list, not from `matchMedia` globals. */
export function isStandaloneDisplay(matchMedia: (q: string) => MediaQueryList): boolean {
  return ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some(
    (mode) => matchMedia(`(display-mode: ${mode})`).matches,
  );
}

function detectFamily(userAgent: string, maxTouchPoints: number): PlatformFamily {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipod/i.test(userAgent)) return "ios";
  if (/ipad/i.test(userAgent)) return "ipados";
  // iPadOS 13+ reports a desktop "Macintosh" UA; the only reliable tell is a
  // touch-capable Mac. Checking it here keeps the tablet on the iOS journey.
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ipados";
  if (userAgent.length === 0) return "unknown";
  return "desktop";
}

function detectIosBrowser(userAgent: string): IosBrowser {
  // In-app web views first: they contain other browser tokens (a Facebook
  // in-app view reports Safari) but cannot install at all, so they must win.
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|MicroMessenger|GSA\/|CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent)) {
    if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(userAgent)) return "third-party";
    return "in-app";
  }
  if (/Safari/i.test(userAgent)) return "safari";
  return "unknown";
}

export function readPlatform(scope: {
  userAgent: string;
  maxTouchPoints: number;
  matchMedia: (query: string) => MediaQueryList;
  legacyStandalone?: boolean;
  navigator?: { serviceWorker?: unknown; PushManager?: unknown; setAppBadge?: unknown };
}): PlatformSnapshot {
  const family = detectFamily(scope.userAgent, scope.maxTouchPoints);
  const isIos = family === "ios" || family === "ipados";
  const isLegacyStandalone = scope.legacyStandalone === true;

  return {
    family,
    iosBrowser: isIos ? detectIosBrowser(scope.userAgent) : "unknown",
    isIos,
    isStandalone: isStandaloneDisplay(scope.matchMedia) || isLegacyStandalone,
    isLegacyStandalone,
    isTouchDevice: scope.maxTouchPoints > 0,
    supportsServiceWorker: Boolean(scope.navigator?.serviceWorker),
    supportsPush:
      Boolean(scope.navigator?.serviceWorker) &&
      typeof scope.navigator?.PushManager === "function",
    supportsBadging: typeof scope.navigator?.setAppBadge === "function",
    prefersReducedMotion: scope.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

/**
 * Browser-side convenience wrapper around `readPlatform`.
 */
export function readPlatformInBrowser(): PlatformSnapshot {
  if (typeof window === "undefined") {
    return {
      family: "unknown",
      iosBrowser: "unknown",
      isIos: false,
      isStandalone: false,
      isLegacyStandalone: false,
      isTouchDevice: false,
      supportsServiceWorker: false,
      supportsPush: false,
      supportsBadging: false,
      prefersReducedMotion: true,
    };
  }
  return readPlatform({
    userAgent: window.navigator.userAgent,
    maxTouchPoints: window.navigator.maxTouchPoints ?? 0,
    matchMedia: (query) => window.matchMedia(query),
    legacyStandalone: (window.navigator as { standalone?: boolean }).standalone,
    navigator: window.navigator,
  });
}

/**
 * Environment snapshot for `useSyncExternalStore`.
 *
 * `getSnapshot` must return a referentially stable value between renders or the
 * store is treated as changing on every read and React loops. The detection
 * result is therefore cached in a module variable and only recomputed by the
 * subscription when a signal that actually matters changes: the standalone
 * display mode flipping (an install completed while the page was open) or a
 * `resize`, which is how a browser reports a rotation or a window resize that
 * moves the `(max-width)`/`(pointer)` media queries.
 */
export type InstallEnvironment = {
  platform: PlatformSnapshot | null;
  installDismissedBefore: boolean;
  reducedMotion: boolean;
};

// Duplicated from `install-prompt.ts` rather than imported, so this module stays
// free of the `"use client"` store and can be read by a server component.
const installDismissedStorageKey = "isbulk-install-dismissed-at";

function wasInstallDismissedInBrowser(): boolean {
  try {
    return window.localStorage.getItem(installDismissedStorageKey) !== null;
  } catch {
    // Storage is unavailable in some private modes; treat it as "not dismissed".
    return false;
  }
}

let environmentCache: InstallEnvironment | null = null;

function computeEnvironment(): InstallEnvironment {
  return {
    platform: readPlatformInBrowser(),
    installDismissedBefore: wasInstallDismissedInBrowser(),
    reducedMotion:
      typeof window === "undefined"
        ? true
        : window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

export function getInstallEnvironmentSnapshot(): InstallEnvironment {
  if (environmentCache === null) environmentCache = computeEnvironment();
  return environmentCache;
}

const serverEnvironment: InstallEnvironment = {
  platform: null,
  installDismissedBefore: false,
  reducedMotion: true,
};

export function getServerInstallEnvironmentSnapshot(): InstallEnvironment {
  return serverEnvironment;
}

export function subscribeInstallEnvironment(listener: () => void): () => void {
  const refresh = () => {
    environmentCache = computeEnvironment();
    listener();
  };
  const media = window.matchMedia(standaloneMediaQuery);
  media.addEventListener("change", refresh);
  window.addEventListener("resize", refresh);
  return () => {
    media.removeEventListener("change", refresh);
    window.removeEventListener("resize", refresh);
  };
}

/**
 * Which iOS instructions actually match the browser on screen.
 *
 * `steps` is a key into the `Install` message namespace rather than a string, so
 * the copy stays translatable and this module stays pure.
 */
export type IosInstructionVariant = "safari" | "third-party" | "in-app" | "unknown";

export function iosInstructionVariant(snapshot: PlatformSnapshot): IosInstructionVariant {
  if (!snapshot.isIos) return "unknown";
  return snapshot.iosBrowser;
}
