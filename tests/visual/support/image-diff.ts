import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export type RawImage = {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
};

export type DiffResult = {
  width: number;
  height: number;
  totalPixels: number;
  diffPixels: number;
  ratio: number;
};

/** Decodes any sharp-supported buffer to a fixed 4-channel (RGBA) raster. */
export async function toRgba(input: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 4 };
}

/**
 * Pixel diff with a per-channel tolerance.
 *
 * A pixel counts as changed only when at least one channel differs by more than
 * `channelTolerance`. Without the slack, sub-pixel text antialiasing shifts by
 * a single level on some runs and every glyph edge is reported, which is exactly
 * the noise a visual gate has to sit above to stay trustworthy.
 */
export function diffRgba(
  actual: RawImage,
  baseline: RawImage,
  channelTolerance: number,
): DiffResult {
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    throw new Error(
      `image dimensions differ: actual ${actual.width}x${actual.height} vs baseline ${baseline.width}x${baseline.height}`,
    );
  }

  const totalPixels = actual.width * actual.height;
  let diffPixels = 0;
  for (let i = 0; i < actual.data.length; i += 4) {
    const dr = Math.abs(actual.data[i] - baseline.data[i]);
    const dg = Math.abs(actual.data[i + 1] - baseline.data[i + 1]);
    const db = Math.abs(actual.data[i + 2] - baseline.data[i + 2]);
    const da = Math.abs(actual.data[i + 3] - baseline.data[i + 3]);
    if (
      dr > channelTolerance ||
      dg > channelTolerance ||
      db > channelTolerance ||
      da > channelTolerance
    ) {
      diffPixels += 1;
    }
  }

  return {
    width: actual.width,
    height: actual.height,
    totalPixels,
    diffPixels,
    ratio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
  };
}

/**
 * Renders the changed pixels in red over a desaturated copy of the baseline, so
 * a failing shot points at *where* it moved instead of only *how much*.
 *
 * The "changed" test must stay identical to `diffRgba`'s, alpha included: an
 * alpha-only change counts toward the failure ratio, so a renderer that only
 * looked at RGB would leave those pixels dimmed and the diff image would
 * contradict the number printed beside it.
 */
export async function renderDiff(
  actual: RawImage,
  baseline: RawImage,
  channelTolerance: number,
): Promise<Buffer> {
  const out = Buffer.from(baseline.data);
  for (let i = 0; i < actual.data.length; i += 4) {
    const dr = Math.abs(actual.data[i] - baseline.data[i]);
    const dg = Math.abs(actual.data[i + 1] - baseline.data[i + 1]);
    const db = Math.abs(actual.data[i + 2] - baseline.data[i + 2]);
    const da = Math.abs(actual.data[i + 3] - baseline.data[i + 3]);
    if (
      dr > channelTolerance ||
      dg > channelTolerance ||
      db > channelTolerance ||
      da > channelTolerance
    ) {
      out[i] = 255;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 255;
    } else {
      // Dim the unchanged background so the red reads clearly.
      out[i] = Math.round(out[i] * 0.35);
      out[i + 1] = Math.round(out[i + 1] * 0.35);
      out[i + 2] = Math.round(out[i + 2] * 0.35);
    }
  }
  return sharp(out, {
    raw: { width: baseline.width, height: baseline.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

export async function readBaseline(baselinePath: string): Promise<RawImage> {
  const buffer = await readFile(baselinePath);
  return toRgba(buffer);
}

export async function writeBaseline(
  baselinePath: string,
  png: Buffer,
): Promise<void> {
  await mkdir(path.dirname(baselinePath), { recursive: true });
  await writeFile(baselinePath, png);
}

export async function writeArtifact(
  artifactPath: string,
  png: Buffer,
): Promise<void> {
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, png);
}
