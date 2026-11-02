"use client";

import { useSyncExternalStore } from "react";

/**
 * Holds the deferred `beforeinstallprompt` event.
 *
 * The event fires once, early, on the page the visitor landed on — not
 * necessarily the page with the install button. A module-level store lets the
 * runtime component capture it and the install page consume it later.
 *
 * `prompt()` may be called only once per event and only from a user gesture.
 * `consumeInstallPrompt()` therefore removes the event as it hands it over, so a
 * second click can never call a spent prompt (which rejects).
 */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function captureInstallPrompt(event: Event): void {
  deferredPrompt = event as BeforeInstallPromptEvent;
  emit();
}

export function clearInstallPrompt(): void {
  deferredPrompt = null;
  emit();
}

export function consumeInstallPrompt(): BeforeInstallPromptEvent | null {
  const event = deferredPrompt;
  deferredPrompt = null;
  emit();
  return event;
}

export function markAppInstalled(): void {
  installed = true;
  deferredPrompt = null;
  emit();
}

export function isAppInstalled(): boolean {
  return installed;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallPromptSnapshot(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function getServerInstallPromptSnapshot(): null {
  return null;
}

/** React binding; returns the pending prompt or null. */
export function useInstallPrompt(): BeforeInstallPromptEvent | null {
  return useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPromptSnapshot,
    getServerInstallPromptSnapshot,
  );
}

const dismissedStorageKey = "isbulk-install-dismissed-at";

/**
 * Records that the visitor dismissed the prompt so a return visit shows the
 * quieter secondary affordance instead of the same primary button.
 */
export function rememberInstallDismissal(): void {
  try {
    window.localStorage.setItem(dismissedStorageKey, String(Date.now()));
  } catch {
    // Storage can be unavailable in private mode; the UI still works, it just
    // cannot remember the dismissal.
  }
}

export function wasInstallDismissed(): boolean {
  try {
    return window.localStorage.getItem(dismissedStorageKey) !== null;
  } catch {
    return false;
  }
}
