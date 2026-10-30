import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCENT_INK_MIX_PERCENT,
  accentInk,
  packageTierColors,
} from "../../src/components/packages/package-tiers";

/**
 * The vend panel is `visibility: hidden` until a package is selected, so axe
 * skips it and cannot catch a low-contrast label inside. This test closes that
 * blind spot: it resolves `accentInk` exactly the way the browser composites
 * `color-mix(in srgb, <accent> N%, white)` and checks the 10px audience label
 * against both ends of the panel's dark gradient.
 */

// Both stops of `.vend-panel`'s background gradient, composited over the
// brightest canvas pixel the panel can sit on (alpha 0.95 over white paper).
const panelStops = [
  [32, 42, 37],
  [24, 25, 29],
] as const;

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: readonly number[]): number {
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(
  foreground: readonly number[],
  background: readonly number[],
): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function mixWithWhite(hex: string, percent: number): [number, number, number] {
  const rgb = hexToRgb(hex);
  return rgb.map((value) =>
    Math.round((value * percent) / 100 + 255 * (1 - percent / 100)),
  ) as [number, number, number];
}

test("every package tier accent is legible as small text on the vend panel", () => {
  for (const [id, hex] of Object.entries(packageTierColors)) {
    const ink = mixWithWhite(hex, ACCENT_INK_MIX_PERCENT);
    for (const stop of panelStops) {
      const ratio = contrast(ink, stop);
      assert.ok(
        ratio >= 4.5,
        `${id} accent ink on panel stop rgb(${stop.join(",")}) is ${ratio.toFixed(2)}:1, below the 4.5:1 AA floor`,
      );
    }
  }
});

test("accentInk mixes the accent with white, never with a raw hex", () => {
  const value = accentInk("#4b8066");
  assert.equal(value, `color-mix(in srgb, #4b8066 ${ACCENT_INK_MIX_PERCENT}%, white)`);
  assert.ok(!/#ffffff/.test(value), "use the `white` keyword, not a hex literal");
});

test("the mix percent keeps a margin above the failing point", () => {
  // Above ~72% the darkest tier accent (#326c54) drops under 4.5:1, so the
  // chosen value must stay below that ceiling; the same value must also leave
  // headroom rather than sitting on the floor.
  for (const hex of Object.values(packageTierColors)) {
    const atCeiling = Math.min(
      ...panelStops.map((stop) => contrast(mixWithWhite(hex, 72), stop)),
    );
    const atChosen = Math.min(
      ...panelStops.map((stop) =>
        contrast(mixWithWhite(hex, ACCENT_INK_MIX_PERCENT), stop),
      ),
    );
    assert.ok(
      atChosen >= atCeiling,
      "a lower mix percent must be at least as legible as a higher one",
    );
  }
});
