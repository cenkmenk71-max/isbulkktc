import assert from "node:assert/strict";
import test from "node:test";
import { resolveLogoPresentation } from "../../src/components/jobs/employer-logo";

test("a near-square logo keeps the default square tile", () => {
  assert.deepEqual(resolveLogoPresentation(1), { ratio: null, variant: "" });
  assert.deepEqual(resolveLogoPresentation(1.2), { ratio: null, variant: "" });
});

test("an unknown aspect keeps the square tile until measured", () => {
  assert.deepEqual(resolveLogoPresentation(null), { ratio: null, variant: "" });
  assert.deepEqual(resolveLogoPresentation(Number.NaN), {
    ratio: null,
    variant: "",
  });
});

test("a wide wordmark widens the tile to its own ratio", () => {
  assert.deepEqual(resolveLogoPresentation(2.4), {
    ratio: 2.4,
    variant: "employer-logo-wide",
  });
});

test("an extremely wide banner is clamped to the readable tile width", () => {
  assert.deepEqual(resolveLogoPresentation(5.5), {
    ratio: 3,
    variant: "employer-logo-wide",
  });
});

test("portrait artwork narrows the tile but not into a sliver", () => {
  assert.deepEqual(resolveLogoPresentation(0.5), {
    ratio: 0.6,
    variant: "employer-logo-narrow",
  });
  assert.deepEqual(resolveLogoPresentation(0.2), {
    ratio: 0.6,
    variant: "employer-logo-narrow",
  });
});

test("the band boundaries switch presentation exactly once", () => {
  assert.equal(resolveLogoPresentation(1.7).variant, "employer-logo-wide");
  assert.equal(resolveLogoPresentation(1.69).variant, "");
  assert.equal(resolveLogoPresentation(0.6).variant, "employer-logo-narrow");
  assert.equal(resolveLogoPresentation(0.61).variant, "");
});
