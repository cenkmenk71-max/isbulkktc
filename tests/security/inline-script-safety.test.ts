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
 *  - **A static script**: `__html` is built only from string/template literals
 *    written in the source, joined by `+` (the GA bootstrap). A bare identifier,
 *    member expression, call, or a template-literal *hole* (`` `<p>${body}</p>` ``)
 *    — the shapes a data value arrives in — is rejected.
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

/** Index just past the closing quote, or -1 when the literal is unterminated. */
function scanQuoted(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return -1;
}

/** Index of the `}` that closes the `{` at `open`, or -1 when unbalanced. */
function matchBrace(source: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const end = scanQuoted(source, i, ch);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    if (ch === "`") {
      const template = scanTemplate(source, i);
      if (!template) return -1;
      i = template.end;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/**
 * The template literal at `start`: where it ends and the raw `${ … }` holes it
 * carries. `null` when it is unterminated.
 */
function scanTemplate(
  source: string,
  start: number,
): { end: number; holes: string[] } | null {
  const holes: string[] = [];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") return { end: i + 1, holes };
    if (ch === "$" && source[i + 1] === "{") {
      const close = matchBrace(source, i + 1);
      if (close < 0) return null;
      holes.push(source.slice(i + 2, close));
      i = close + 1;
      continue;
    }
    i += 1;
  }
  return null;
}

/**
 * True when the `__html` expression is built only from string/template literals
 * joined by `+` — the shape a value written in the source takes.
 *
 * A template literal's `${ … }` holes are *code*, so each is checked in turn:
 * `` `<p>${thread.body}</p>` `` is rejected because the hole carries a member
 * expression, the exact stored-XSS shape this rule exists to catch. A bare
 * literal check on the leading character missed this: the value starts with a
 * backtick, so it looked static while interpolating untrusted data. The scan
 * stops at the `}` that closes the enclosing attribute object.
 *
 * A hole that names a **build-time constant** is allowed — `staticNames` holds
 * the module-scope `const`s initialised from a literal or `process.env.*` (the
 * GA bootstrap interpolates `measurementId`, a validated `NEXT_PUBLIC_*` value,
 * which is not request data). Anything derived at runtime — a member
 * expression, a call, an unknown identifier — is rejected.
 */
function isStaticMarkup(value: string, staticNames: Set<string>): boolean {
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === "}") return true; // the attribute object closed — expression ended
    if (
      ch === " " ||
      ch === "\t" ||
      ch === "\n" ||
      ch === "\r" ||
      ch === "+" ||
      ch === "," // a trailing comma before the closing brace is formatting, not code
    ) {
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = scanQuoted(value, i, ch);
      if (end < 0) return false;
      i = end;
      continue;
    }
    if (ch === "/" && value[i + 1] === "/") {
      // A line comment is formatting; it may contain backticks (the GA
      // bootstrap documents `?ga_debug=1` between its concatenated literals).
      const newline = value.indexOf("\n", i);
      if (newline < 0) return true;
      i = newline + 1;
      continue;
    }
    if (ch === "/" && value[i + 1] === "*") {
      const close = value.indexOf("*/", i + 2);
      if (close < 0) return true;
      i = close + 2;
      continue;
    }
    if (ch === "`") {
      const template = scanTemplate(value, i);
      if (!template) return false;
      if (template.holes.some((hole) => !isStaticMarkup(hole, staticNames))) return false;
      i = template.end;
      continue;
    }
    // A bare identifier that names a build-time constant is static; a member
    // expression (`thread.body`) or a call (`render(x)`) fails on the next
    // character, and an unknown identifier fails here.
    const ident = /^[A-Za-z_$][\w$]*/.exec(value.slice(i))?.[0];
    if (ident && staticNames.has(ident)) {
      i += ident.length;
      continue;
    }
    return false; // live code: an identifier, member expression, call, …
  }
  return true;
}

/** Module-scope `const`s whose initialiser is a build-time value, not runtime data. */
function buildTimeConstants(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g)) {
    const initializer = match[2].trim();
    if (/^(?:"[^"]*"|'[^']*'|`[^`$]*`|process\.env\.[A-Za-z0-9_]+)$/.test(initializer)) {
      names.add(match[1]);
    }
  }
  return names;
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
  const staticNames = buildTimeConstants(source);
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
      if (!isStaticMarkup(value, staticNames)) {
        problems.push(
          `${file}: dangerouslySetInnerHTML.__html is not a static string literal; a value expression (or a template-literal hole) can carry untrusted content`,
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

test("self-test: a template literal that interpolates a value is rejected", () => {
  // The regression this pins: the value starts with a backtick, so a check on
  // the *first character* alone called it static while the `${ … }` hole
  // carried member access — the stored-XSS shape (a message body, a job
  // description) the rule exists to catch. The hole is code; it must be scanned.
  for (const bad of [
    "<div dangerouslySetInnerHTML={{ __html: `<p>${thread.body}</p>` }} />",
    "<div dangerouslySetInnerHTML={{ __html: `<b>${job.description}</b>` }} />",
    "<div dangerouslySetInnerHTML={{ __html: `prefix ${render(message)}` }} />",
    "<div dangerouslySetInnerHTML={{ __html: `${user.name}` }} />",
    // Interpolated inside a concatenation of otherwise-static literals.
    "<div dangerouslySetInnerHTML={{ __html: `<p>` + `${thread.body}` + `</p>` }} />",
  ]) {
    assert.equal(
      inlineScriptViolations(bad).length,
      1,
      `expected a finding for: ${bad}`,
    );
  }

  // Static concatenations of literals — the GA bootstrap's shape — stay allowed,
  // including a hole whose own content is a written literal (recursively static).
  for (const good of [
    "<Script dangerouslySetInnerHTML={{ __html: `a` + \"b\" + 'c' }} />",
    "<div dangerouslySetInnerHTML={{ __html: `${'<p>hi</p>'}` }} />",
    // A build-time constant (module-scope `const` from a literal / env) is not
    // request data, so interpolating it is the GA bootstrap's real shape.
    "const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;\n" +
      "<Script dangerouslySetInnerHTML={{ __html: `gtag('config','${measurementId}')` }} />",
  ]) {
    assert.deepStrictEqual(inlineScriptViolations(good), [], `expected no finding for: ${good}`);
  }

  // A name that is *not* a build-time constant — a component prop or state — is
  // runtime data and must still be rejected even inside a template hole.
  const runtimeValue =
    "function Panel({ body }: { body: string }) {\n" +
    "  return <div dangerouslySetInnerHTML={{ __html: `${body}` }} />;\n" +
    "}";
  assert.equal(inlineScriptViolations(runtimeValue).length, 1);
});
