import assert from "node:assert/strict";
import test from "node:test";

// The Turnstile loader must survive a failed first download. The bug this pins:
// the loader used to reuse any `<script id="cf-turnstile-script">` left in the
// DOM. A settled element never fires `load`/`error` again, so after one network
// failure the retry attached its listeners to that dead element and the promise
// never settled — the widget never rendered, and a captcha-protected form could
// never be submitted. The fix removes the old element and starts fresh.
//
// This drives the real `loadTurnstileScript` with a minimal DOM stub: the module
// only touches `document.getElementById`, `document.createElement`,
// `document.head.appendChild` and `window.turnstile`.

type Listener = () => void;

class FakeScript {
  id = "";
  src = "";
  async = false;
  defer = false;
  private listeners = new Map<string, Listener[]>();

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  /** Fires every listener for `type`; mirrors a settled (once) listener. */
  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  remove(): void {
    fakeDocument.scripts = fakeDocument.scripts.filter((s) => s !== this);
  }
}

const fakeDocument = {
  scripts: [] as FakeScript[],
  getElementById(id: string): FakeScript | null {
    return this.scripts.find((s) => s.id === id) ?? null;
  },
  createElement(): FakeScript {
    return new FakeScript();
  },
  head: {
    appendChild(script: FakeScript): void {
      fakeDocument.scripts.push(script);
    },
  },
};

function installGlobals(): void {
  fakeDocument.scripts = [];
  (globalThis as unknown as { document: unknown }).document = fakeDocument;
  (globalThis as unknown as { window: unknown }).window = {};
}

/** Loads a fresh copy of the module so its module-level `scriptPromise` resets. */
async function freshLoader() {
  const loaded = await import(`./turnstile?cacheBust=${Math.random()}`);
  return loaded.loadTurnstileScript as () => Promise<void>;
}

test("a failed download can be retried instead of hanging forever", async () => {
  installGlobals();
  const load = await freshLoader();

  // First attempt: the script errors (offline, blocked by CSP, …).
  const first = load();
  const firstScript = fakeDocument.scripts.at(-1);
  assert.ok(firstScript, "the first attempt must append a script");
  firstScript.fire("error");
  await assert.rejects(first, /could not be loaded/);

  // The failed element must not be left behind to poison the retry.
  assert.equal(
    fakeDocument.scripts.length,
    0,
    "the failed script element must be removed",
  );

  // Second attempt: a fresh element loads. This is what the old code broke —
  // it reused the settled element, so neither `load` nor `error` ever fired.
  const second = load();
  const secondScript = fakeDocument.scripts.at(-1);
  assert.ok(secondScript, "the retry must append a new script");
  assert.notEqual(secondScript, firstScript, "the retry must use a fresh element");

  let settled = false;
  second.then(() => {
    settled = true;
  });
  secondScript.fire("load");
  await second;
  assert.equal(settled, true, "the retry must settle after the script loads");
});

test("a second call while a download is in flight reuses the same promise", async () => {
  installGlobals();
  const load = await freshLoader();

  const a = load();
  const b = load();
  assert.equal(a, b, "concurrent callers share one download");

  const script = fakeDocument.scripts.at(-1);
  assert.equal(fakeDocument.scripts.length, 1, "only one script is appended");
  script!.fire("load");
  await Promise.all([a, b]);
});

test("an already-loaded Turnstile resolves without touching the DOM", async () => {
  installGlobals();
  (globalThis as unknown as { window: { turnstile?: unknown } }).window = {
    turnstile: { render: () => "id", reset: () => {} },
  };
  const load = await freshLoader();

  await load();
  assert.equal(fakeDocument.scripts.length, 0, "no script appended when ready");
});
