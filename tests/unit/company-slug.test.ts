import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizeSlug,
  normalizeSlugInput,
  slugifyCompanyName,
} from "../../src/features/companies/company-slug";

test("builds an ASCII identifier from a Turkish company name", () => {
  assert.equal(slugifyCompanyName("Şahin İnşaat"), "sahin-insaat");
  assert.equal(slugifyCompanyName("Çiçek Çay Bahçesi"), "cicek-cay-bahcesi");
  assert.equal(slugifyCompanyName("Özkan Yazılım A.Ş."), "ozkan-yazilim-a-s");
});

test("produces a value accepted by the companies.slug constraint", () => {
  const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  for (const name of [
    "Şahin İnşaat",
    "ABC  Ltd.",
    "  Boşluklu   Ad  ",
    "123 456",
    "A",
    "Ünïcödé Şirket",
    "Şirket--Adı",
  ]) {
    const slug = slugifyCompanyName(name);
    assert.ok(
      pattern.test(slug),
      `${JSON.stringify(name)} -> ${JSON.stringify(slug)}`,
    );
    assert.ok(slug.length >= 2 && slug.length <= 80, slug);
  }
});

test("falls back when the name has no usable characters", () => {
  assert.equal(slugifyCompanyName(""), "sirket");
  assert.equal(slugifyCompanyName("!!!"), "sirket");
  assert.equal(slugifyCompanyName("A"), "sirket");
});

test("clamps long names at a word boundary", () => {
  const slug = slugifyCompanyName(
    "Kuzey Kıbrıs Türk Cumhuriyeti Yazılım Danışmanlık ve Ticaret Limited Şirketi",
  );
  assert.ok(slug.length <= 80, slug);
  assert.ok(!slug.endsWith("-"), slug);
  assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test("sanitizes partially typed input without forcing a minimum length", () => {
  assert.equal(normalizeSlugInput(""), "");
  assert.equal(normalizeSlugInput("a"), "a");
  assert.equal(normalizeSlugInput("Şahin"), "sahin");
  assert.equal(normalizeSlugInput("Şahin İnşaat"), "sahin-insaat");
  assert.equal(normalizeSlugInput("a  b"), "a-b");
  assert.equal(normalizeSlugInput("--abc"), "abc");
  assert.equal(normalizeSlugInput("a..b"), "a-b");
  // A trailing hyphen is kept while typing so the next segment can be added.
  assert.equal(normalizeSlugInput("A.Ş."), "a-s-");
});

test("finalizes a slug into a value the server schema accepts", () => {
  assert.equal(finalizeSlug("A.Ş."), "a-s");
  assert.equal(finalizeSlug("a-b-"), "a-b");
  assert.equal(finalizeSlug("sahin-insaat"), "sahin-insaat");
  assert.equal(finalizeSlug("--abc--"), "abc");
});
