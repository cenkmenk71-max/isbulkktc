import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeNextPath } from "@/lib/pwa/destination";

/**
 * Open-redirect boundary for the QR install route (`/[locale]/install?next=`).
 *
 * A QR code is printed on a poster, so `next` is attacker-influenced: anyone can
 * hand a victim a poster whose code points at `/install?next=...`. The whole
 * point of `sanitizeNextPath` is to keep the continuation inside this origin, so
 * the invariant under test is narrow and absolute: **the returned string, when
 * resolved by a browser, must stay on the current host.** That means it may
 * never begin with `//` (protocol-relative → host change), may never carry a
 * scheme, and may never contain a backslash.
 *
 * ## Finding (LANE-GÜVENLİK — resolved)
 *
 * `sanitizeNextPath` once re-derived its output with
 * `new URL(value, "https://next-path.invalid")` and returned
 * `resolved.pathname + search + hash` without re-checking it. The WHATWG URL
 * parser resolves `..` and `.` segments *before* the leading-slash check can see
 * them, so a path that hid a second slash behind a dot segment normalised into a
 * protocol-relative URL:
 *
 *     sanitizeNextPath("/..//evil.example")  ->  "//evil.example"   (was)
 *     sanitizeNextPath("/.//evil.example")   ->  "//evil.example"   (was)
 *
 * `new URL("//evil.example", "https://isbulkktc.com/install")` resolves to
 * `https://evil.example/`, so the "Continue to app" link on the install page (a
 * client-side `next-intl` `<Link href={destination}>`) became a cross-origin
 * navigation driven by a printed poster — a phishing vector.
 *
 * The owner of `src/lib/pwa/destination.ts` fixed it by re-validating the
 * normalised output (`normalized.startsWith("//") || normalized.includes("\\")
 * || forbiddenScheme.test(normalized)`) and rejecting it. The two tests that
 * used to carry a `todo` now assert the invariant as a gate. See
 * `docs/threat-model.md`.
 */

/** Shapes a returned continuation path must never take, whatever the input. */
function isHostChanging(value: string): boolean {
  if (value.startsWith("//")) return true; // protocol-relative
  if (value.includes("\\")) return true; // URL parser normalises `\` to `/`
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return true; // absolute scheme
  return false;
}

/** What a browser actually resolves the value to, relative to the install page. */
function resolvesOffOrigin(value: string, page: string): boolean {
  return new URL(value, page).origin !== new URL(page).origin;
}

const installPage = "https://isbulkktc.com/install";

// ---------------------------------------------------------------------------
// The sanitizer's intended contract — this half passes today.
// ---------------------------------------------------------------------------

test("same-origin paths survive and are normalised", () => {
  assert.equal(sanitizeNextPath("/jobs"), "/jobs");
  assert.equal(sanitizeNextPath("  /jobs  "), "/jobs");
  assert.equal(sanitizeNextPath("/jobs?x=1#y"), "/jobs?x=1#y");
  assert.equal(sanitizeNextPath("/../evil"), "/evil");
});

test("obvious host changes and foreign schemes are dropped", () => {
  for (const raw of [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "http://evil.example",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,x",
    "/\tevil",
    "/\nevil",
    "/\u0000/evil",
    "  //evil.example  ",
    undefined,
    null,
    "",
  ]) {
    assert.equal(sanitizeNextPath(raw), null, `expected ${JSON.stringify(raw)} to be rejected`);
  }
});

test("the install route and non-page handlers are not valid continuations", () => {
  for (const raw of ["/install", "/en/install", "/tr/install", "/api/x", "/auth/callback"]) {
    assert.equal(sanitizeNextPath(raw), null, `expected ${JSON.stringify(raw)} to be rejected`);
  }
});

// ---------------------------------------------------------------------------
// The invariant the sanitizer must hold: the *output* is never a host change.
// Both tests used to carry a `todo` while the bug was open; the owning lane
// re-validates the normalised output now, so they are gates.
// ---------------------------------------------------------------------------

test("the normalised output never becomes a protocol-relative or absolute URL", () => {
  const bypasses = [
    "/..//evil.example",
    "/.//evil.example",
    "/%2e//evil.example",
    "/%2e%2e//evil.example",
    "/.///evil.example",
    "/././/evil.example",
  ];

  for (const raw of bypasses) {
    const result = sanitizeNextPath(raw);
    if (result === null) continue;
    assert.ok(
      !isHostChanging(result),
      `sanitizeNextPath(${JSON.stringify(raw)}) returned ${JSON.stringify(result)}, ` +
        `which resolves to ${new URL(result, installPage).href} — off-origin`,
    );
    assert.ok(
      !resolvesOffOrigin(result, installPage),
      `sanitizeNextPath(${JSON.stringify(raw)}) escapes the origin`,
    );
  }
});

test("a fuzzed corpus of dot-and-slash prefixes never yields a host change", () => {
  const segments = ["", ".", "..", "%2e", "%2e%2e", "a", "%2f"];
  const seeds = ["//evil.example", "https://evil.example"];
  const offenders: string[] = [];

  for (const a of segments) {
    for (const b of segments) {
      for (const seed of seeds) {
        const raw = `/${a}/${b}/${seed}`;
        const result = sanitizeNextPath(raw);
        if (result !== null && resolvesOffOrigin(result, installPage)) {
          offenders.push(`${JSON.stringify(raw)} -> ${JSON.stringify(result)}`);
        }
      }
    }
  }

  assert.deepEqual(offenders, [], `inputs that escaped the origin: ${offenders.join("; ")}`);
});
