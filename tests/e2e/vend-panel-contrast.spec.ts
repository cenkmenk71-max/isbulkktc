import { expect, test } from "@playwright/test";

import {
  accentInk,
  packageTierColors,
} from "@/components/packages/package-tiers";

/**
 * The vend pricing panel is `visibility: hidden` until a package is selected,
 * and once it is open its text sits on a gradient with `backdrop-filter`. axe
 * cannot resolve that background, so it reports the panel's contrast as
 * "incomplete" rather than a violation — the six-locale accessibility suite is
 * green while the 10px audience label measured 3.23:1. This spec forces the
 * panel into the state the component sets when it opens and asserts the
 * rendered ink clears AA, closing the blind spot axe cannot reach.
 */

// Both stops of `.vend-panel`'s gradient composited over the brightest canvas
// pixel the panel can cover. Worst case, so a passing assertion holds anywhere.
const panelStops = [
  [32, 42, 37],
  [24, 25, 29],
] as const;

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: readonly number[]): number {
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

test("the vend panel audience label becomes measurable once the panel opens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/packages", { waitUntil: "domcontentloaded" });

  // Mirror `selectPackage()`'s scene-unavailable branch: the same attributes
  // and custom property the component toggles when the panel opens.
  await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(".packages-vend-stage");
    if (!stage) throw new Error("vend stage not found");
    stage.style.setProperty("--vend-p", "1");
    stage.toggleAttribute("data-shown", true);
    stage.toggleAttribute("data-open", true);
  });

  await expect(page.locator(".vend-panel-audience").first()).toBeVisible();
});

test("every tier accent clears AA once the browser resolves the ink", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/packages", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>(".packages-vend-stage");
    if (!stage) throw new Error("vend stage not found");
    stage.style.setProperty("--vend-p", "1");
    stage.toggleAttribute("data-shown", true);
    stage.toggleAttribute("data-open", true);
  });

  const label = page.locator(".vend-panel-audience").first();
  await expect(label).toBeVisible();

  const tiers = Object.entries(packageTierColors);
  expect(tiers.length).toBeGreaterThan(1);

  for (const [tier, color] of tiers) {
    // The panel renders `accentInk(plan.color)` inline; apply the same value to
    // the live label so the browser resolves the actual `color-mix` output.
    const resolved = await label.evaluate((node, ink) => {
      node.setAttribute("style", `color: ${ink}`);
      const value = getComputedStyle(node).color;
      const srgb = value.match(/color\(srgb ([^)]+)\)/);
      if (srgb) {
        const [r, g, b] = srgb[1].split(/\s+/).map(Number);
        return [r * 255, g * 255, b * 255];
      }
      const rgb = value.match(/rgba?\(([^)]+)\)/);
      if (!rgb) throw new Error(`unparsed colour: ${value}`);
      return rgb[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3).map(Number);
    }, accentInk(color));

    for (const stop of panelStops) {
      const ratio = contrast(resolved, stop);
      expect(
        ratio,
        `${tier}: rgb(${resolved.map((v) => Math.round(v)).join(",")}) on rgb(${stop.join(",")}) is ${ratio.toFixed(2)}:1, below 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});
