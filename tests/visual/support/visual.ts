import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * Visual-regression primitives shared by every spec in `tests/visual/**`.
 *
 * The comparison is deliberately hand-rolled on `sharp` rather than
 * `toHaveScreenshot`: the design gate needs one calibrated, documented metric
 * (per-channel delta + a diff-pixel ratio) instead of Playwright's defaults, and
 * the same code has to run under `tsx` for the baseline refresh script.
 */

/** Where reference images live. Committed; the diff artefacts are not. */
export const baselineDirectory = path.resolve(
  import.meta.dirname,
  "..",
  "baselines",
);

/** Where failing runs write the actual/diff pair for a human to inspect. */
export const artifactDirectory = path.resolve("test-results", "visual");

/**
 * A pixel counts as changed only when one of its RGB channels moves by more
 * than this. 26/255 (~10%) sits above anti-aliasing and WebP rounding noise but
 * far below any deliberate colour or spacing change, which measured 6-34% on
 * the calibration target (see `docs/lanes/08-qa.md`).
 */
export const channelThreshold = 26;

/**
 * Fraction of differing pixels that fails the test. Measured natural variance
 * across repeated renders of every target was 0.0000%; the smallest deliberate
 * change produced 6.2%. 0.1% therefore leaves three orders of magnitude of
 * headroom while still catching a one-pixel shift (measured 9.8%).
 */
export const maxDiffPixelRatio = 0.001;

const freezeStyles = `
  *,
  *::before,
  *::after {
    animation-play-state: paused !important;
    animation-delay: -0.001s !important;
    animation-duration: 0s !important;
    transition: none !important;
    caret-color: transparent !important;
  }

  /*
   * The cookie notice and its settings trigger are fixed to the viewport, so
   * whether they appear in an element capture depends on where the element
   * happened to scroll to — the footer and the first job card both sit under
   * them. They are site chrome, not the surface under test, so remove them
   * rather than let a capture depend on the visitor's stored consent.
   */
  .consent-card,
  .consent-settings-trigger {
    display: none !important;
  }
`;

/**
 * Removes every source of per-run variation before a screenshot: motion is
 * frozen, the reduced-motion branch is taken, webfonts are awaited and the
 * consent chrome is hidden.
 *
 * Must run *after* `page.goto`: an injected `<style>` belongs to the current
 * document, so a tag added before navigation is discarded with the previous
 * page and the freeze would silently not apply.
 */
export async function freezePage(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: freezeStyles });
  await page.evaluate(() => document.fonts.ready);
}

export type VisualTarget = {
  /** Stable id; also the baseline file name. */
  name: string;
  /** Served URL path. The default locale (`tr`) is unprefixed. */
  route: string;
  /** Element to capture, resolved against the page. */
  selector: string;
  /** Viewport the baseline was produced at. */
  viewport: { width: number; height: number };
  /** Why this target is worth guarding. */
  description: string;
};

type ComparisonResult = {
  ratio: number;
  diffPixels: number;
  totalPixels: number;
  width: number;
  height: number;
  sizeMismatch: string | null;
};

async function rawPixels(buffer: Buffer) {
  return sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
}

/**
 * Per-pixel comparison of two PNG buffers. Returns the fraction of pixels whose
 * largest channel delta exceeds `channelThreshold`, or a hard mismatch when the
 * geometry differs (a resized element is a regression, not noise).
 */
export async function comparePng(
  actual: Buffer,
  baseline: Buffer,
): Promise<ComparisonResult> {
  const a = await rawPixels(actual);
  const b = await rawPixels(baseline);

  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return {
      ratio: 1,
      diffPixels: a.info.width * a.info.height,
      totalPixels: a.info.width * a.info.height,
      width: a.info.width,
      height: a.info.height,
      sizeMismatch: `${b.info.width}x${b.info.height} baseline vs ${a.info.width}x${a.info.height} actual`,
    };
  }

  const { width, height, channels } = a.info;
  let diffPixels = 0;
  for (let i = 0; i < a.data.length; i += channels) {
    const delta = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
    if (delta > channelThreshold) diffPixels += 1;
  }

  const totalPixels = width * height;
  return {
    ratio: diffPixels / totalPixels,
    diffPixels,
    totalPixels,
    width,
    height,
    sizeMismatch: null,
  };
}

/** Renders the changed pixels in red over a faded copy of the actual image. */
async function buildDiffImage(actual: Buffer, baseline: Buffer) {
  const a = await rawPixels(actual);
  const b = await rawPixels(baseline);
  const { width, height, channels } = a.info;
  const out = Buffer.alloc(width * height * 3);

  for (let p = 0; p < width * height; p += 1) {
    const i = p * channels;
    const delta = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
    const changed = delta > channelThreshold;
    out[p * 3] = changed ? 255 : Math.round(a.data[i] * 0.25);
    out[p * 3 + 1] = changed ? 0 : Math.round(a.data[i + 1] * 0.25);
    out[p * 3 + 2] = changed ? 0 : Math.round(a.data[i + 2] * 0.25);
  }

  return sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

const shouldUpdateBaselines = () =>
  process.env.UPDATE_VISUAL_BASELINES === "1";

/**
 * Captures `locator` and compares it against `baselines/<name>.png`.
 *
 * A missing baseline fails the test with the command that creates it, so an
 * unwritten baseline can never pass silently. Set `UPDATE_VISUAL_BASELINES=1` to
 * (re)write the reference after a deliberate design change.
 */
export async function expectVisualMatch(
  locator: Locator,
  target: VisualTarget,
) {
  const baselinePath = path.join(baselineDirectory, `${target.name}.png`);
  const actual = await locator.screenshot({ animations: "disabled" });

  if (shouldUpdateBaselines()) {
    await mkdir(baselineDirectory, { recursive: true });
    await writeFile(baselinePath, actual);
    test.info().annotations.push({
      type: "baseline-updated",
      description: target.name,
    });
    return;
  }

  let baseline: Buffer;
  try {
    baseline = await readFile(baselinePath);
  } catch {
    throw new Error(
      `No visual baseline for "${target.name}". Create it with ` +
        `"UPDATE_VISUAL_BASELINES=1 <visual test command>" and commit ` +
        `tests/visual/baselines/${target.name}.png.`,
    );
  }

  const result = await comparePng(actual, baseline);
  if (result.sizeMismatch === null && result.ratio <= maxDiffPixelRatio) return;

  await mkdir(artifactDirectory, { recursive: true });
  const actualPath = path.join(artifactDirectory, `${target.name}.actual.png`);
  const diffPath = path.join(artifactDirectory, `${target.name}.diff.png`);
  await writeFile(actualPath, actual);
  await writeFile(diffPath, await buildDiffImage(actual, baseline));
  await test.info().attach(`${target.name}-actual`, {
    path: actualPath,
    contentType: "image/png",
  });
  await test.info().attach(`${target.name}-diff`, {
    path: diffPath,
    contentType: "image/png",
  });

  const detail = result.sizeMismatch
    ? `geometry changed: ${result.sizeMismatch}`
    : `${result.diffPixels}/${result.totalPixels} pixels changed ` +
      `(${(result.ratio * 100).toFixed(3)}% > ${(maxDiffPixelRatio * 100).toFixed(3)}%)`;

  expect(
    result.ratio,
    `${target.name} (${target.route} → ${target.selector}) regressed: ${detail}. ` +
      `Inspect ${diffPath}, then update the baseline if the change is intended.`,
  ).toBeLessThanOrEqual(maxDiffPixelRatio);
}
