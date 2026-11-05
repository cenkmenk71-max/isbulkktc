import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The visual layer is token-driven, so a "micro" styling change is only safe if
 * the tokens themselves hold their contract. These tests guard the three things
 * that quietly break a design system: a token that loses its value, a foreground
 * colour that drops below WCAG contrast, and new hardcoded hex values leaking in
 * beside the palette instead of joining it.
 */

const cssPath = new URL("../../src/styles/global.css", import.meta.url);
const css = readFileSync(cssPath, "utf8");

function themeBlock(): string {
  const lines = css.split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith("@theme"));
  assert.notEqual(start, -1, "@theme block is missing from global.css");
  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    depth += (lines[index].match(/{/g) ?? []).length;
    depth -= (lines[index].match(/}/g) ?? []).length;
    if (index > start && depth === 0) {
      return lines.slice(start, index + 1).join("\n");
    }
  }
  throw new Error("@theme block is never closed");
}

// Fail fast if the @theme block is malformed before any lookup runs.
themeBlock();

/**
 * Palette values live in `@theme`; the semantic aliases (`--radius-*`,
 * `--type-*`, `--leading-copy`, `--tracking-display`) live in `:root`, so a
 * lookup searches the whole sheet.
 */
function token(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  assert.ok(match, `${name} is not declared in global.css`);
  return match[1].trim();
}

function hexToRgb(value: string): [number, number, number] {
  const hex = value.replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(value: string): number {
  const [red, green, blue] = hexToRgb(value);
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  );
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const canvases = {
  canvas: token("--color-crayon-50"),
  surface: token("--color-crayon-surface"),
  highlight: token("--color-crayon-highlight"),
} as const;

const inkTokens = [
  "--color-vanadium-950",
  "--color-vanadium-800",
  "--color-vanadium-700",
  "--color-vanadium-600",
  "--color-shade-green-800",
] as const;

test("every text ink token clears WCAG AA on every canvas", () => {
  for (const inkName of inkTokens) {
    const ink = token(inkName);
    for (const [canvasName, canvas] of Object.entries(canvases)) {
      const ratio = contrast(ink, canvas);
      assert.ok(
        ratio >= 4.5,
        `${inkName} (${ink}) on ${canvasName} (${canvas}) is ${ratio.toFixed(2)}:1, below the 4.5:1 AA floor`,
      );
    }
  }
});

test("button and status pairings clear their WCAG floors", () => {
  const white = "#ffffff";
  for (const greenName of [
    "--color-shade-green-800",
    "--color-shade-green-600",
  ] as const) {
    const green = token(greenName);
    const ratio = contrast(white, green);
    assert.ok(
      ratio >= 3,
      `white on ${greenName} (${green}) is ${ratio.toFixed(2)}:1, below the 3:1 UI floor`,
    );
  }

  const statusPairs = [
    ["--color-status-success", "--color-status-success-bg"],
    ["--color-status-warning", "--color-status-warning-bg"],
    ["--color-status-error", "--color-status-error-bg"],
  ] as const;
  for (const [foregroundName, backgroundName] of statusPairs) {
    const ratio = contrast(token(foregroundName), token(backgroundName));
    assert.ok(
      ratio >= 4.5,
      `${foregroundName} on ${backgroundName} is ${ratio.toFixed(2)}:1, below the 4.5:1 AA floor`,
    );
  }
});

test("the palette keeps its canonical scale anchors", () => {
  // These values are the load-bearing ends of the Vanadium, Crayon, and Shade
  // Green scales. If one moves, it is a deliberate rebrand, not a tweak: update
  // the anchors here so the change is visible in review.
  assert.equal(token("--color-vanadium-950"), "#171b1a");
  assert.equal(token("--color-crayon-50"), "#f5f2eb");
  assert.equal(token("--color-crayon-surface"), "#faf8f3");
  assert.equal(token("--color-shade-green-800"), "#194435");
});

/**
 * The semantic brand aliases are what the product actually paints with — `--green`
 * alone is referenced over a hundred times (buttons, links, focus rings). Pinning
 * the palette *anchors* above is not enough: those anchors can stay put while an
 * alias silently points somewhere else, which repaints the whole brand with no
 * test failing. #191 is exactly this failure in another surface (the email shell
 * carried a "matches the app's --green token" comment over a value that did not
 * match), so the alias→anchor mapping is asserted rather than assumed.
 */
test("the semantic brand aliases resolve to their documented palette anchors", () => {
  const aliases = {
    "--green": "--color-shade-green-800",
    "--green-hover": "--color-shade-green-900",
    "--green-deep": "--color-shade-green-950",
    "--green-mid": "--color-shade-green-600",
    "--green-soft": "--color-shade-green-100",
    "--green-pale": "--color-shade-green-200",
    "--green-highlight": "--color-shade-green-300",
    "--ink": "--color-vanadium-950",
    "--ink-2": "--color-vanadium-800",
    "--ink-3": "--color-vanadium-700",
    "--ink-4": "--color-vanadium-600",
    "--line": "--color-vanadium-200",
  } as const;

  for (const [alias, anchor] of Object.entries(aliases)) {
    assert.equal(
      token(alias).replace(/\s+/g, ""),
      `var(${anchor})`,
      `${alias} must resolve to ${anchor}; a different shade repaints the brand with no other guard noticing.`,
    );
  }
});

/**
 * A card that fades in from `opacity: 0` also fades every label inside it. When
 * that label clears AA by a hair (the auth submit's brand blue does), the
 * mid-flight composite drops below 4.5:1 and the visitor sees a real flash of
 * failing contrast — even though the settled state passes axe. `consent-card-in`
 * was fixed for this once; `editorial-page-enter` carried the same defect on the
 * sign-in, register and password-recovery cards. Guard the rule, not the two
 * names: resolve each entrance animation from its selector and require that the
 * keyframe it plays declares no `opacity`.
 */
function ruleBody(selector: string): string {
  const match = new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`).exec(
    css,
  );
  assert.ok(match, `${selector} rule is missing from global.css`);
  return match[1];
}

function keyframesBody(name: string): string {
  const start = css.search(new RegExp(`@keyframes\\s+${name}\\b`));
  assert.notEqual(start, -1, `@keyframes ${name} is missing from global.css`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  throw new Error(`@keyframes ${name} is never closed`);
}

test("card entrance animations never fade opacity under AA-fragile labels", () => {
  for (const selector of [
    ".editorial-page-layout",
    ".consent-card",
    ".packages-hero-copy",
  ]) {
    const shorthand = /animation:\s*([^;]+);/.exec(ruleBody(selector));
    assert.ok(shorthand, `${selector} must keep its entrance animation`);
    const name = shorthand[1].trim().split(/\s+/)[0];
    const frames = keyframesBody(name);
    assert.doesNotMatch(
      frames,
      /opacity\s*:/,
      `${selector}'s ${name} entrance must not animate opacity: a partly transparent card measures its inner text against the page behind it and drops below the AA floor for the length of the animation.`,
    );
  }
});

test("typography tokens stay defined and sane", () => {
  const radiusTokens = [
    "--radius-sm",
    "--radius-md",
    "--radius-lg",
    "--radius-xl",
  ] as const;
  const radii = radiusTokens.map((name) => {
    const raw = token(name);
    const parsed = Number.parseFloat(raw);
    assert.ok(Number.isFinite(parsed) && parsed > 0, `${name} is not a length`);
    return parsed;
  });
  const sorted = [...radii].sort((a, b) => a - b);
  assert.deepEqual(radii, sorted, "radius scale must grow sm < md < lg < xl");

  const leading = Number.parseFloat(token("--leading-copy"));
  assert.ok(leading >= 1.5, "--leading-copy must stay readable for body copy");

  const tracking = Number.parseFloat(token("--tracking-display"));
  assert.ok(
    tracking <= -0.02 && tracking >= -0.08,
    "--tracking-display must stay in the tight-but-legible display range",
  );

  for (const sizeName of [
    "--type-body",
    "--type-supporting",
    "--type-label",
    "--type-caption",
  ] as const) {
    const size = Number.parseFloat(token(sizeName));
    assert.ok(
      Number.isFinite(size) && size >= 0.625 && size <= 1.25,
      `${sizeName} (${size}rem) is outside the intended UI range`,
    );
  }
});

test("hardcoded hex values do not grow beyond the recorded baseline", () => {
  const baseline = JSON.parse(
    readFileSync(
      new URL("./design-token-drift.baseline.json", import.meta.url),
      "utf8",
    ),
  ) as { lines: string[] };

  const lines = css.split("\n");
  const start = lines.findIndex((line) => line.trim().startsWith("@theme"));
  let depth = 0;
  let end = -1;
  for (let index = start; index < lines.length; index += 1) {
    depth += (lines[index].match(/{/g) ?? []).length;
    depth -= (lines[index].match(/}/g) ?? []).length;
    if (index > start && depth === 0) {
      end = index;
      break;
    }
  }

  const hexPattern = /#[0-9a-fA-F]{3,8}\b/;
  const outside = new Set<string>();
  lines.forEach((line, index) => {
    if (index >= start && index <= end) {
      return;
    }
    if (hexPattern.test(line)) {
      outside.add(line.trim());
    }
  });

  const allowed = new Set(baseline.lines);
  const added = [...outside].filter((line) => !allowed.has(line)).sort();
  assert.deepEqual(
    added,
    [],
    `New hardcoded hex values appeared outside @theme. Add a token in @theme instead:\n${added.join("\n")}`,
  );
});

/**
 * Every `animation-name` a rule plays must resolve to a declared `@keyframes`.
 * `.packages-hero-copy` asked for `packages-rise-in` for the whole life of the
 * packages page, but the keyframe was never declared, so the hero copy just
 * appeared with no entrance and nothing failed. A dangling reference is silent
 * by construction, so assert the whole set instead of trusting review to catch
 * it: collect every animation name used by a rule (first identifier of the
 * `animation`/`animation-name` value) and require each to have a `@keyframes`.
 */
test("every animation a rule plays has a matching @keyframes", () => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const declared = new Set(
    [...withoutComments.matchAll(/@keyframes\s+([\w-]+)/g)].map(
      (match) => match[1],
    ),
  );

  const referenced = new Set<string>();
  for (const [, value] of withoutComments.matchAll(
    /(?:^|[\s;{])animation(?:-name)?\s*:\s*([^;{}]+);/g,
  )) {
    // The value can carry several comma-separated animations. Split on commas
    // that are not inside a function such as `cubic-bezier(0.22, 1, 0.36, 1)`,
    // or the function's arguments read as extra animation names. The name is
    // the leading custom-ident of each animation.
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of value) {
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      if (char === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    parts.push(current);

    for (const part of parts) {
      const name = part.trim().split(/\s+/)[0];
      // A name is a custom-ident; durations, easing keywords and functions are
      // not, so skipping non-idents keeps the check to real animation names.
      // `none` and the CSS-wide keywords are not animation names either.
      if (
        /^(none|inherit|initial|unset|revert|revert-layer)$/.test(name)
      ) {
        continue;
      }
      if (/^[a-zA-Z_][\w-]*$/.test(name)) referenced.add(name);
    }
  }

  const missing = [...referenced].filter((name) => !declared.has(name)).sort();
  assert.deepEqual(
    missing,
    [],
    `These animations are played by a rule but have no @keyframes declaration, so they never run:\n${missing.join("\n")}`,
  );
});

/**
 * The global reduced-motion reset must neutralise the *delay* as well as the
 * duration. `hero-copy-enter` starts at `opacity: 0` and fills `backwards`, so a
 * visitor who asks for reduced motion still sees the hero headline blank for the
 * length of its `animation-delay` (0.16s / 0.28s) unless the delay is zeroed
 * too: a zeroed duration does not skip the wait, it only collapses the motion
 * that comes after it. The same holds for `transition-delay`. Resolve the reset
 * from the `prefers-reduced-motion` block rather than matching a literal string
 * so the guard follows the rule if it moves.
 */
test("the reduced-motion reset zeroes animation and transition delays", () => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const start = withoutComments.indexOf(
    "@media (prefers-reduced-motion: reduce)",
  );
  assert.notEqual(start, -1, "the reduced-motion reset is missing");
  const open = withoutComments.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let index = open; index < withoutComments.length; index += 1) {
    if (withoutComments[index] === "{") depth += 1;
    else if (withoutComments[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }
  const reset = withoutComments.slice(open, end);

  for (const property of [
    "animation-duration",
    "animation-delay",
    "transition-duration",
    "transition-delay",
  ]) {
    assert.match(
      reset,
      new RegExp(`${property}\\s*:\\s*0(?:\\.01ms|ms|s)?\\s*!important`),
      `the reduced-motion reset must zero ${property}: a delayed entrance holds its start state (often opacity:0) for the whole delay even when the duration is collapsed.`,
    );
  }
});
