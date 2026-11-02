#!/usr/bin/env node
/**
 * Derives the installable-app icons from the brand source artwork.
 *
 * `public/images/isbul-logo-source.png` is the official 1536x1536 export: the
 * dark waveform mark on a flat white canvas. Re-exporting it by hand is how the
 * existing 32px/180px favicons drifted out of sync, so every install icon is
 * generated here instead and committed.
 *
 * Three treatments, because the platforms disagree about backgrounds:
 *  - `any` icons keep the canvas tone (#F5F2EB) so the mark is legible against
 *    a light browser chrome and the icon still reads on a dark launcher.
 *  - `maskable` icons need the mark inside the central 80% safe circle, which
 *    Android may crop to a circle, squircle or rounded square. The mark is
 *    scaled to 54% of the canvas so nothing important is clipped.
 *  - the Apple touch icon must be fully opaque (iOS paints transparent pixels
 *    black) and is deliberately not rounded, because iOS applies its own mask.
 *
 * Run with `node scripts/generate-pwa-icons.mjs`; `tests/unit/pwa-assets.test.ts`
 * asserts the committed files keep the sizes and opacity this script promises.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const source = "public/images/isbul-logo-source.png";
const outputDir = "public/icons";

// Sampled from the source export: the ink is #151515 on a pure white canvas.
const canvasTone = { r: 0xf5, g: 0xf2, b: 0xeb, alpha: 1 };

// Ink bounding box inside the 1536px source (measured, see the audit note in
// docs/decisions). Trimming to it makes the mark's optical size independent of
// the whitespace the designer left around the artwork.
const inkBounds = { left: 164, top: 428, width: 1204, height: 680 };

const targets = [
  { file: "icon-192.png", size: 192, markWidthRatio: 0.72 },
  { file: "icon-512.png", size: 512, markWidthRatio: 0.72 },
  { file: "maskable-192.png", size: 192, markWidthRatio: 0.54 },
  { file: "maskable-512.png", size: 512, markWidthRatio: 0.54 },
  { file: "apple-touch-icon.png", size: 180, markWidthRatio: 0.72 },
];

async function buildIcon({ size, markWidthRatio }) {
  const markWidth = Math.round(size * markWidthRatio);
  const mark = await sharp(source)
    .extract(inkBounds)
    .resize({ width: markWidth, fit: "inside", withoutEnlargement: false })
    .toBuffer();
  const { height: markHeight } = await sharp(mark).metadata();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: canvasTone,
    },
  })
    .composite([
      {
        input: mark,
        left: Math.round((size - markWidth) / 2),
        top: Math.round((size - markHeight) / 2),
      },
    ])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

await mkdir(outputDir, { recursive: true });

for (const target of targets) {
  const buffer = await buildIcon(target);
  const destination = path.join(outputDir, target.file);
  await writeFile(destination, buffer);
  const { width, height, hasAlpha } = await sharp(buffer).metadata();
  console.log(
    `${destination}: ${width}x${height} alpha=${Boolean(hasAlpha)} ${buffer.length} bytes`,
  );
}
