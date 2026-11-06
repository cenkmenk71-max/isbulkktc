import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatStepNumber } from "./home-journeys";

/**
 * The journey step markers were the last literal-digit surface on the home page:
 * both cards rendered a hardcoded `0{index + 1}` string, so `/fa` showed Latin
 * `01`/`02`/`03` beside Persian copy (issue #361 class, found in the audit for
 * the home journey section). `Intl.NumberFormat(locale)` fixes it because `fa`
 * defaults to the Persian numbering system; every Latin locale keeps `01`.
 */

const LATIN_DIGITS = /[0-9]/;

test("journey step markers follow the locale's numeral system", () => {
  for (const locale of ["tr", "en", "ru", "el", "de"] as const) {
    const markers = [0, 1, 2].map((index) => formatStepNumber(locale, index));
    assert.deepEqual(markers, ["01", "02", "03"], `${locale} keeps Latin 01`);
  }

  const persian = [0, 1, 2].map((index) => formatStepNumber("fa", index));
  assert.deepEqual(persian, ["۰۱", "۰۲", "۰۳"]);
  for (const marker of persian) {
    assert.doesNotMatch(marker, LATIN_DIGITS, "fa marker must not use Latin digits");
  }
});

test("the journey cards render every marker through formatStepNumber", () => {
  const source = readFileSync(
    new URL("./home-journeys.tsx", import.meta.url),
    "utf8",
  );

  // Two journeys, three steps each, one call site per journey.
  const calls = source.match(/formatStepNumber\(locale, index\)/g) ?? [];
  assert.equal(calls.length, 2, "both journey cards must format their markers");

  // The old shape built the marker by concatenating a zero with the index, which
  // no locale-aware formatter can intercept.
  assert.doesNotMatch(
    source,
    /0\{index\s*\+\s*1\}/,
    "step markers must not be built from a hardcoded zero-prefixed string",
  );
});
