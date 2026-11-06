import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * `dangerouslySetInnerHTML` is the one React escape hatch that turns a string
 * into live DOM. Every use in `src/**` is safe today, but nothing pinned the
 * shape that makes them safe, so a refactor could hand it database-backed
 * content — a job description, a support message — and ship a stored XSS with
 * every gate green. That is the exact class the live-support work (#398) is
 * about to add: a member- or staff-authored message body rendered in a panel.
 *
 * Two shapes are allowed, and only two:
 *
 *  - **JSON-LD** (`<script type="application/ld+json">`): the payload is
 *    `JSON.stringify(...)` of structured data, and `<` must be escaped
 *    (`\u003c`) so a `</script>` inside a string cannot close the tag early and
 *    spill the rest of the document into the parser.
 *  - **A static script**: `__html` is a string/template literal written in the
 *    source (the GA bootstrap). A bare identifier or member expression — the
 *    shape a data value arrives in — is rejected.
 *
 * The rules are checked against a pure function so the self-test can prove each
 * one is non-vacuous on a synthetic source, independent of what `src/**`
 * happens to contain.
 */

const srcDir = new URL("../../src/", import.meta.url);

/** Every non-test `.ts`/`.tsx` under `src/**`, with its source. */
function sourceFiles(): { file: string; source: string }[] {
  return (readdirSync(srcDir, { recursive: true }) as string[])
    .filter(
      (entry) =>
        /\.(ts|tsx)$/.test(entry) &&
        !/\.test\.(ts|tsx)$/.test(entry) &&
        !entry.endsWith(".d.ts"),
    )
    .sort()
    .map((entry) => ({
      file: `src/${entry}`,
      source: readFileSync(new URL(entry, srcDir), "utf8"),
    }));
}

/** The balanced `{ … }` attribute region that starts at the first `{` after `at`. */
function attributeBlock(source: string, at: number): string {
  const open = source.indexOf("{", at);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

/**
 * The rule violations in `source`. Empty means compliant.
 *
 * Pure on purpose: the self-test feeds it a compliant and a violating snippet so
 * the two rules are proven to reject what they claim to, not merely to pass.
 */
export function inlineScriptViolations(
  source: string,
  file = "<source>",
): string[] {
  const problems: string[] = [];
  const needle = "dangerouslySetInnerHTML";
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) break;
    from = at + needle.length;

    // The nearest `<script` opening before this attribute decides the shape.
    const scriptIdx = source.lastIndexOf("<script", at);
    const openTag = scriptIdx === -1 ? "" : source.slice(scriptIdx, at);
    const isJsonLd = /type\s*=\s*["']application\/ld\+json["']/.test(openTag);

    const block = attributeBlock(source, at);
    const htmlIdx = block.indexOf("__html");
    // `__html` is followed by `: <expression>`; the colon is not part of it.
    const value =
      htmlIdx === -1
        ? ""
        : block.slice(htmlIdx + "__html".length).replace(/^\s*:\s*/, "");

    if (isJsonLd) {
      // A JSON-LD block must neutralise `<`, or a string containing `</script>`
      // closes the tag and the remainder is parsed as HTML.
      if (!/\.replace\(\s*\/</.test(block)) {
        problems.push(
          `${file}: a JSON-LD dangerouslySetInnerHTML does not escape '<' (add .replace(/</g, "\\u003c"))`,
        );
      }
    } else {
      const first = value.trimStart()[0];
      if (first !== "`" && first !== '"' && first !== "'") {
        problems.push(
          `${file}: dangerouslySetInnerHTML.__html is not a static string literal; a value expression can carry untrusted content`,
        );
      }
    }
  }
  return problems;
}

test("no dangerouslySetInnerHTML in src/** violates the inline-script rules", () => {
  const problems = sourceFiles().flatMap(({ file, source }) =>
    inlineScriptViolations(source, file),
  );
  assert.deepStrictEqual(problems, []);
});

test("the scan is non-vacuous: it reaches the known inline-script sites", () => {
  const files = sourceFiles().map((entry) => entry.file);
  for (const known of [
    "src/app/[locale]/(public)/jobs/[slug]/page.tsx",
    "src/content/ai-visibility/json-ld.tsx",
    "src/components/analytics/google-analytics.tsx",
  ]) {
    assert.ok(files.includes(known), `${known} is not scanned`);
  }
  const total = sourceFiles().filter(({ source }) =>
    source.includes("dangerouslySetInnerHTML"),
  ).length;
  assert.ok(total > 0, "no dangerouslySetInnerHTML found at all — the scan is blind");
});

test("self-test: a JSON-LD block without the '<' escape is rejected", () => {
  const bad = `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />`;
  assert.equal(inlineScriptViolations(bad).length, 1);
  const good = `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\\\u003c") }} />`;
  assert.deepStrictEqual(inlineScriptViolations(good), []);
});

test("self-test: a non-JSON-LD block fed a value expression is rejected", () => {
  const bad = `<div dangerouslySetInnerHTML={{ __html: thread.body }} />`;
  assert.equal(inlineScriptViolations(bad).length, 1);
  const good =
    "<Script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];` }} />";
  assert.deepStrictEqual(inlineScriptViolations(good), []);
});
