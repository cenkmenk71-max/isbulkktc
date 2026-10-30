"use client";

import {
  consentChangedEvent,
  consentCookieMaxAgeSeconds,
  consentCookieName,
  consentOpenEvent,
  consentStorageKey,
  legacyConsentStorageKey,
  parseConsent,
  serializeConsent,
  encodeConsentCookie,
  consentStateFromCookie,
  undecidedConsent,
  type ConsentDecision,
  type ConsentState,
} from "./consent";

/**
 * Browser-side persistence for the consent decision.
 *
 * `useSyncExternalStore` compares snapshots by reference, so the parsed object
 * is cached and only rebuilt when the underlying value changes. Without the
 * cache React would see a new object on every read and loop forever.
 */
let cachedKey: string | null = null;
let cachedState: ConsentState | null = null;

function readRaw(): string | null {
  try {
    const current = window.localStorage.getItem(consentStorageKey);
    if (current !== null) return current;

    // One-time migration from the v2 key so a returning visitor keeps their
    // choice instead of being asked again.
    const legacy = window.localStorage.getItem(legacyConsentStorageKey);
    if (legacy !== null) {
      window.localStorage.setItem(consentStorageKey, legacy);
      window.localStorage.removeItem(legacyConsentStorageKey);
      return legacy;
    }
    return null;
  } catch {
    // Storage can throw in private mode or when disabled; treat as undecided.
    return null;
  }
}

/** The compact `ib_consent` cookie, if the visitor has one. */
function readCookie(): string | null {
  const prefix = `${consentCookieName}=`;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

export function getConsentSnapshot(): ConsentState {
  const raw = readRaw();
  const cookie = readCookie();
  const key = `${raw ?? "\u0000"}|${cookie ?? "\u0000"}`;
  if (cachedState === null || cachedKey !== key) {
    cachedKey = key;
    const fromStorage = parseConsent(raw);
    // The cookie is a second, independent channel: a visitor whose
    // localStorage was cleared (or is unavailable in private mode) still keeps
    // their decision instead of being asked again.
    cachedState = fromStorage.decided
      ? fromStorage
      : (consentStateFromCookie(cookie) ?? fromStorage);
  }
  return cachedState;
}

export function getServerConsentSnapshot(): ConsentState {
  // Must be referentially stable: `useSyncExternalStore` compares the server
  // snapshot across calls, and a fresh object each time makes React warn about
  // a potential infinite loop during hydration.
  return undecidedConsent;
}

export function subscribeToConsent(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(consentChangedEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(consentChangedEvent, onChange);
  };
}

function writeCookie(value: string): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${consentCookieName}=${value}; Path=/; Max-Age=${consentCookieMaxAgeSeconds}; SameSite=Lax${secure}`;
}

function clearCookie(): void {
  // The clearing cookie must carry the same Path/Secure attributes as the one it
  // replaces, otherwise the browser keeps the original and withdrawal fails.
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${consentCookieName}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

export function persistConsent(decision: ConsentDecision): ConsentState {
  const raw = serializeConsent(decision);
  try {
    window.localStorage.setItem(consentStorageKey, raw);
  } catch {
    // A storage failure must not block the cookie/event path below.
  }
  writeCookie(encodeConsentCookie(decision));
  cachedKey = null;
  cachedState = null;
  const next = getConsentSnapshot();
  window.dispatchEvent(new Event(consentChangedEvent));
  return next;
}

/** Withdraws consent entirely: clears both channels and re-asks on next load. */
export function resetConsent(): ConsentState {
  try {
    window.localStorage.removeItem(consentStorageKey);
    window.localStorage.removeItem(legacyConsentStorageKey);
  } catch {
    // ignore
  }
  clearCookie();
  cachedKey = null;
  cachedState = null;
  const next = getServerConsentSnapshot();
  window.dispatchEvent(new Event(consentChangedEvent));
  return next;
}

/** Opens the banner from anywhere (e.g. the `/cookies` manage button). */
export function requestConsentPanel(): void {
  window.dispatchEvent(new Event(consentOpenEvent));
}
