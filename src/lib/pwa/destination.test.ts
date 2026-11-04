import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeNextPath } from "./destination";

/**
 * Regression guard for the normalisation bypass: the input checks reject a
 * leading `//`, but `new URL` resolves `..`/`.` segments *before* the output is
 * built, so a dot segment can hide a second slash and the returned path becomes
 * protocol-relative. `sanitizeNextPath("/..//host")` returned `"//host"`, which a
 * browser resolves to a different origin. The output is now re-validated.
 *
 * The install page resolves whatever this returns, so the invariant is narrow:
 * the result must never be a host change.
 */
const installPage = "https://isbulkktc.com/install";

function resolvesOffOrigin(value: string): boolean {
  return new URL(value, installPage).origin !== new URL(installPage).origin;
}

test("a dot segment cannot smuggle a protocol-relative output", () => {
  for (const raw of [
    "/..//evil.example",
    "/.//evil.example",
    "/%2e//evil.example",
    "/%2e%2e//evil.example",
    "/.///evil.example",
    "/././/evil.example",
    "/a/..///evil.example",
  ]) {
    assert.equal(sanitizeNextPath(raw), null, `${raw} should be rejected`);
  }
});

test("a fuzzed corpus of dot-and-slash prefixes never escapes the origin", () => {
  const segments = ["", ".", "..", "%2e", "%2e%2e", "a", "%2f"];
  const seeds = ["//evil.example", "https://evil.example"];

  for (const a of segments) {
    for (const b of segments) {
      for (const seed of seeds) {
        const result = sanitizeNextPath(`/${a}/${b}/${seed}`);
        assert.ok(
          result === null || !resolvesOffOrigin(result),
          `/${a}/${b}/${seed} -> ${result} escapes the origin`,
        );
      }
    }
  }
});

test("dot segments inside a legitimate path still normalise", () => {
  assert.equal(sanitizeNextPath("/jobs/../profile"), "/profile");
  assert.equal(sanitizeNextPath("/../jobs"), "/jobs");
});
