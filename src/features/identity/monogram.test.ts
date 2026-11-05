import assert from "node:assert/strict";
import test from "node:test";

import { monogramFor } from "./monogram";

// The account panel shows one letter when the account has no provider picture.
// The old rule used `displayName.slice(0, 1)`, which takes the first UTF-16 unit
// and so halves an astral character: a name starting with an emoji or a
// Deseret / CJK-extension letter rendered a lone surrogate, i.e. a replacement
// glyph, instead of the intended letter.

test("the monogram is a whole code point, never half a surrogate pair", () => {
  // Astral first characters must come back intact (one code point, two units).
  for (const [name, expected] of [
    ["😀 Kahraman", "😀"],
    ["𐐷x", "𐐏"],
    ["𝐀bc", "𝐀"],
  ] as const) {
    const monogram = monogramFor(name);
    assert.equal(monogram, expected, `${name} -> ${JSON.stringify(monogram)}`);
    assert.equal([...monogram].length, 1, `${name} produced a partial character`);
    // A lone surrogate (half a pair) is the bug: it is not a well-formed string.
    assert.ok(
      !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(monogram),
      `${name} produced a lone surrogate`,
    );
  }
});

test("ordinary names keep their first letter, upper-cased", () => {
  assert.equal(monogramFor("ayşe"), "A");
  assert.equal(monogramFor("İbrahim"), "İ");
  assert.equal(monogramFor("محمد"), "م");
  assert.equal(monogramFor("  Ada  "), " ");
});

test("an empty name yields an empty monogram rather than throwing", () => {
  assert.equal(monogramFor(""), "");
});
