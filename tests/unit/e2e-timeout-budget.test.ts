import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * A Playwright test that sweeps many routes must declare its own timeout.
 *
 * The suite's default budget is 60s (`playwright.config.ts`). A test that loops a
 * navigation over a list of routes spends its whole runtime inside one 60s
 * envelope, so its headroom shrinks with every route added — and the failure it
 * produces under a loaded CI runner is a bare timeout that names no route.
 * `seo.spec.ts` already budgets its multi-navigation sweeps at 120-180s; the
 * unbudgeted ones were the ones that fell over.
 *
 * Measured on an idle machine, one such test ("sector cards use the matching
 * optimized photos in both locales") ran 24.8s in one run and 42.5s in another —
 * a 1.7x spread against a fixed 60s ceiling. That is the flake this pins: not a
 * wrong assertion, but a test whose runtime is a function of machine load.
 *
 * The rule is deliberately narrow so it stays a gate rather than noise: a test is
 * flagged only when a navigation happens **inside a `for...of` loop over an array
 * of four or more items** (a literal, or a named `const` array). Loops over one
 * or two routes, and loops that only assert without navigating, are not flagged.
 */

const e2eDirectory = new URL("../e2e/", import.meta.url);

/** The design guard owns its own budget; it is not a route sweep. */
const exemptFiles = new Set(["accessibility.spec.ts"]);

function e2eFiles(): { name: string; source: string }[] {
  return readdirSync(e2eDirectory)
    .filter((name) => name.endsWith(".spec.ts") && !exemptFiles.has(name))
    .sort()
    .map((name) => ({ name, source: readFileSync(new URL(name, e2eDirectory), "utf8") }));
}

/** Number of top-level items in a `const <name> = [ ... ]` declaration. */
function namedArrayLength(source: string, name: string): number | null {
  const match = source.match(
    new RegExp(`const ${name}\\s*(?::[^=]+)?=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const)?;`),
  );
  if (!match) return null;
  const body = match[1];
  let depth = 0;
  let items = 1;
  let seen = false;
  for (const character of body) {
    if ("[{(".includes(character)) depth += 1;
    else if ("]})".includes(character)) depth -= 1;
    else if (character === "," && depth === 0) items += 1;
    if (!/\s/.test(character)) seen = true;
  }
  return seen ? items : 0;
}

/** Number of items in a literal `[a, b, c]` iterable. */
function literalLength(expression: string): number | null {
  const match = expression.trim().match(/^\[([\s\S]*)\]$/);
  if (!match) return null;
  return match[1].split(",").filter((entry) => entry.trim().length > 0).length;
}

/** The `{ ... }` block following the `for (...) {` that ends at `openBraceIndex`. */
function loopBody(source: string, openBraceIndex: number): string {
  let depth = 1;
  let index = openBraceIndex + 1;
  while (index < source.length && depth > 0) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth -= 1;
    index += 1;
  }
  return source.slice(openBraceIndex + 1, index - 1);
}

type TestBlock = { title: string; line: number; body: string };

// Matches `test(` at any indentation (a `test.describe(...)` block indents its
// children) and any quote style, but not `test.skip(`/`test.fixme(`/`test.describe(`:
// the group after `test(` must be the opening quote itself.
const testStartPattern = /^[ \t]*test\(\s*(["`])([^"`\n]*)\1/gm;

function testBlocks(source: string): TestBlock[] {
  const starts = [...source.matchAll(testStartPattern)].map((match) => ({
    title: match[2],
    index: match.index ?? 0,
    line: source.slice(0, match.index ?? 0).split("\n").length,
  }));
  return starts.map((start, position) => {
    const end = position + 1 < starts.length ? starts[position + 1].index : source.length;
    return { title: start.title, line: start.line, body: source.slice(start.index, end) };
  });
}

/** Whether `block` navigates inside a `for...of` loop over >= 4 items. */
function isRouteSweep(source: string, block: string): boolean {
  // Matches `for (const x of ...)` and the destructuring form
  // `for (const { a, b } of ...)`; both appear in the suite.
  for (const match of block.matchAll(/for \(const (?:\{[^}]*\}|\w+) of (\[[^\]]*\]|[\w.]+)\)/g)) {
    const body = loopBody(block, match.index! + match[0].length - 1);
    if (!/\.goto\(|\.get\(/.test(body)) continue;

    const iterable = match[1];
    const length = iterable.startsWith("[")
      ? literalLength(iterable)
      : namedArrayLength(source, iterable);
    if (length !== null && length >= 4) return true;
  }
  return false;
}

test("every multi-route E2E sweep declares its own timeout", () => {
  const offenders: string[] = [];

  for (const { name, source } of e2eFiles()) {
    for (const block of testBlocks(source)) {
      if (!isRouteSweep(source, block.body)) continue;
      if (/test\.setTimeout\(/.test(block.body)) continue;
      offenders.push(`${name}:${block.line} ${block.title}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a route sweep without test.setTimeout runs inside the 60s default and ` +
      `times out anonymously under load:\n${offenders.join("\n")}`,
  );
});

test("the sweep detector still recognises a real sweep and ignores a narrow one", () => {
  // A guard that silently matches nothing is the failure mode this whole suite
  // exists to prevent (see the integration-layer note in docs/lanes/08-qa.md), so
  // the detector is exercised against a positive and a negative fixture.
  const routes = `const publicRoutes = ["/a", "/b", "/c", "/d"] as const;\n`;
  const sweep = `${routes}test("sweeps", async ({ page }) => {\n  for (const route of publicRoutes) { await page.goto(route); }\n});`;
  const narrow = `${routes}test("narrow", async ({ page }) => {\n  for (const route of ["/a", "/b"]) { await page.goto(route); }\n});`;

  const sweepBlock = testBlocks(sweep)[0];
  const narrowBlock = testBlocks(narrow)[0];
  assert.equal(isRouteSweep(sweep, sweepBlock.body), true, "a 4-route sweep must be detected");
  assert.equal(isRouteSweep(narrow, narrowBlock.body), false, "a 2-route loop must not be flagged");
});

test("a sweep nested in test.describe is still detected", () => {
  // `testBlocks` once matched `test(` only at column 0, so a test written inside
  // a `test.describe(...)` was invisible — and worse, its source was swallowed
  // into the previous matched block, whose `test.setTimeout` then masked the
  // unguarded sweep. `analytics.spec.ts` already nests two tests this way.
  const routes = `const publicRoutes = ["/a", "/b", "/c", "/d", "/e", "/f"] as const;\n`;
  const nested = `${routes}test.describe("seo", () => {\n  test("sweeps every route", async ({ page }) => {\n    for (const route of publicRoutes) { await page.goto(route); }\n  });\n});`;
  const blocks = testBlocks(nested);
  assert.equal(blocks.length, 1, "the nested test must be seen as a block");
  assert.equal(blocks[0].title, "sweeps every route");
  assert.equal(isRouteSweep(nested, blocks[0].body), true, "a nested 6-route sweep must be flagged");

  // A previous block's `setTimeout` must not leak into the nested block's body,
  // which is what made the blind spot silent rather than loud.
  const masked = `${routes}test("outer", async ({ page }) => {\n  test.setTimeout(120_000);\n  for (const route of publicRoutes) { await page.goto(route); }\n});\ntest.describe("seo", () => {\n  test("inner", async ({ page }) => {\n    for (const route of publicRoutes) { await page.goto(route); }\n  });\n});`;
  const inner = testBlocks(masked).find((block) => block.title === "inner")!;
  assert.equal(
    /test\.setTimeout\(/.test(inner.body),
    false,
    "the outer block's budget must not appear in the inner block's body",
  );
});

test("test.skip and test.describe are not mistaken for test blocks", () => {
  const source = `test.skip("skipped", async () => {});\ntest.describe("group", () => {\n  test.fixme("todo", async () => {});\n});\ntest("real", async () => {});`;
  const titles = testBlocks(source).map((block) => block.title);
  assert.deepEqual(titles, ["real"]);
});
