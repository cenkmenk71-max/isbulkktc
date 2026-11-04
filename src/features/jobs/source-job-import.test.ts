import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSourceJobSlug,
  decodeHtmlEntities,
  htmlToPlainText,
} from "./source-job-import";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

test("buildSourceJobSlug terminates when the company suffix fills the length limit", () => {
  // Regression: the counter disambiguator was clamped away once the slug sat at
  // 100 characters, so every candidate collapsed back to an already-taken string
  // and the `while` loop never exited (the importer hung instead of completing).
  const title = "a".repeat(60);
  const company = "b".repeat(23);
  const first = buildSourceJobSlug("iskibris", title, company, new Set());
  const taken = new Set([first]);
  const second = buildSourceJobSlug("iskibris", title, company, taken);
  taken.add(second);
  const third = buildSourceJobSlug("iskibris", title, company, taken);

  assert.notEqual(third, second);
  assert.match(third, slugPattern);
});

test("buildSourceJobSlug yields a unique, constraint-valid slug for every length", () => {
  const title = "a".repeat(60);
  for (let companyLength = 1; companyLength <= 140; companyLength += 1) {
    const company = "b".repeat(companyLength);
    const taken = new Set<string>();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const slug = buildSourceJobSlug("isbulkibris", title, company, taken);
      assert.ok(
        !taken.has(slug),
        `slug ${slug} was reused (companyLength=${companyLength})`,
      );
      assert.ok(
        slug.length >= 2 && slug.length <= 100,
        `slug ${slug} broke the 2-100 length bound (companyLength=${companyLength})`,
      );
      assert.match(slug, slugPattern);
      taken.add(slug);
    }
  }
});

test("buildSourceJobSlug never leaves a trailing hyphen when the company is unsluggable", () => {
  const slug = buildSourceJobSlug(
    "iskibris",
    "Garson",
    "***",
    new Set(["source-iskibris-garson"]),
  );
  assert.match(slug, slugPattern);
});

test("decodeHtmlEntities keeps out-of-range numeric references instead of throwing", () => {
  // Scraped markup carries mangled references; `String.fromCodePoint` throws a
  // RangeError on these, which aborted the whole text extraction.
  assert.equal(decodeHtmlEntities("&#x110000;"), "&#x110000;");
  assert.equal(decodeHtmlEntities("&#99999999999;"), "&#99999999999;");
  assert.equal(decodeHtmlEntities("&#xD800;"), "&#xD800;");
  assert.doesNotThrow(() => htmlToPlainText("<p>&#x110000; metin</p>"));
});

test("decodeHtmlEntities still decodes valid references", () => {
  assert.equal(decodeHtmlEntities("&#304;ş &#x130;"), "İş İ");
  assert.equal(decodeHtmlEntities("&amp; &lt; &gt; &quot;"), '& < > "');
});
