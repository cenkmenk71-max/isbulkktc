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
