import assert from "node:assert/strict";
import test from "node:test";
import {
  companyBrandTone,
  companyInitials,
  companyMarkStyle,
} from "../../src/lib/company-mark";

test("companyInitials keeps Turkish letters intact", () => {
  assert.equal(companyInitials("IŞIK İNŞAAT"), "Iİ");
  assert.equal(companyInitials("İnşaat & Tasarım Ltd."), "İT");
  assert.equal(companyInitials("Açelya Giyim"), "AG");
});

test("companyInitials skips punctuation-only words and numbers stay readable", () => {
  assert.equal(companyInitials("1001 Çeşit"), "1Ç");
  assert.equal(companyInitials("2H Design"), "2D");
  assert.equal(companyInitials("A.A.A athanasiou"), "AA");
});

test("companyInitials falls back to the first two characters of one-word names", () => {
  assert.equal(companyInitials("Akyürek"), "AK");
  assert.equal(companyInitials("  "), "");
});

test("companyBrandTone is stable for the same company name", () => {
  const first = companyBrandTone("Açelya Giyim");
  const second = companyBrandTone("açelya giyim");
  assert.deepEqual(first, second);
  assert.match(first.from, /^#[0-9a-f]{6}$/i);
  assert.match(first.to, /^#[0-9a-f]{6}$/i);
});

test("companyMarkStyle exposes the tone as CSS custom properties", () => {
  const style = companyMarkStyle("Baron's Sillage");
  assert.match(style["--mark-from"], /^#[0-9a-f]{6}$/i);
  assert.match(style["--mark-to"], /^#[0-9a-f]{6}$/i);
});
