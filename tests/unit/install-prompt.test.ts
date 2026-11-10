import assert from "node:assert/strict";
import test from "node:test";

import {
  captureInstallPrompt,
  clearInstallPrompt,
  consumeInstallPrompt,
  getInstallPromptSnapshot,
  getServerInstallPromptSnapshot,
  isAppInstalled,
  markAppInstalled,
  rememberInstallDismissal,
  subscribeInstallPrompt,
  wasInstallDismissed,
} from "../../src/lib/pwa/install-prompt";

/**
 * The deferred-install-prompt store.
 *
 * The invariant that matters is documented on `consumeInstallPrompt`: `prompt()`
 * may be called only once per `beforeinstallprompt` event and only from a user
 * gesture, so the store must remove the event as it hands it over. If it did not,
 * a second click would call a spent prompt and reject — the install CTA would
 * break on the second tap. That, the subscriber fan-out and the dismissal memory
 * are the behaviours pinned here.
 *
 * `install-prompt.ts` has no reset export and its `installed` flag is monotonic,
 * so the `isAppInstalled()` test asserts the transition only.
 */

/** A `beforeinstallprompt`-shaped event; the store only passes it through. */
function fakePromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  return {
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome }),
  } as unknown as Event;
}

/** Installs a `window` with a Map-backed `localStorage`, restored afterwards. */
function withStorage(run: (store: Map<string, string>) => void): void {
  const store = new Map<string, string>();
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  };
  try {
    run(store);
  } finally {
    if (original === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = original;
    }
  }
}

test("the captured prompt is handed over exactly once", () => {
  const event = fakePromptEvent();
  captureInstallPrompt(event);
  assert.equal(getInstallPromptSnapshot(), event);

  const handedOver = consumeInstallPrompt();
  assert.equal(handedOver, event, "the first consume returns the captured event");
  // The store must not keep it: a second click would call a spent prompt.
  assert.equal(consumeInstallPrompt(), null);
  assert.equal(getInstallPromptSnapshot(), null);
});

test("clearInstallPrompt drops the pending event without consuming it", () => {
  captureInstallPrompt(fakePromptEvent());
  clearInstallPrompt();
  assert.equal(getInstallPromptSnapshot(), null);
  assert.equal(consumeInstallPrompt(), null, "a cleared prompt is not handed over");
});

test("subscribers are notified on capture, clear and consume", () => {
  let notifications = 0;
  const unsubscribe = subscribeInstallPrompt(() => {
    notifications += 1;
  });
  try {
    captureInstallPrompt(fakePromptEvent());
    clearInstallPrompt();
    captureInstallPrompt(fakePromptEvent());
    consumeInstallPrompt();
    assert.equal(notifications, 4);
  } finally {
    unsubscribe();
  }

  // After unsubscribing, further changes must not reach the listener.
  const before = notifications;
  captureInstallPrompt(fakePromptEvent());
  clearInstallPrompt();
  assert.equal(notifications, before);
});

test("the server snapshot is always null so SSR and client markup agree", () => {
  captureInstallPrompt(fakePromptEvent());
  assert.equal(getServerInstallPromptSnapshot(), null);
  clearInstallPrompt();
});

test("marking the app installed reports it and drops a pending prompt", () => {
  captureInstallPrompt(fakePromptEvent());
  markAppInstalled();
  assert.equal(isAppInstalled(), true);
  assert.equal(getInstallPromptSnapshot(), null, "an installed app has nothing to prompt");
});

test("a dismissal is remembered across visits", () => {
  withStorage(() => {
    assert.equal(wasInstallDismissed(), false, "a first visit has no dismissal on record");
    rememberInstallDismissal();
    assert.equal(wasInstallDismissed(), true);
  });
});

test("the dismissal memory degrades safely when storage is unavailable", () => {
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => {
        throw new Error("storage disabled in private mode");
      },
      setItem: () => {
        throw new Error("storage disabled in private mode");
      },
    },
  };
  try {
    // Private-mode storage throws on access; the UI must keep working.
    assert.doesNotThrow(() => rememberInstallDismissal());
    assert.equal(wasInstallDismissed(), false);
  } finally {
    if (original === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = original;
    }
  }
});
