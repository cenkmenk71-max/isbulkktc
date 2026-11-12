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
 * Two root-level files are also derived here, because the browser and search
 * engines request those exact paths by convention even when the `<link>` tags
 * point elsewhere:
 *  - `public/favicon.ico` — a multi-resolution ICO (16/32/48) wrapping PNGs.
 *    `sharp` cannot write ICO, so the container is assembled by hand below.
 *  - `public/apple-touch-icon.png` — the same 180px mark as
 *    `public/icons/apple-touch-icon.png`, served at the path Safari probes when
 *    a page has no explicit `<link rel="apple-touch-icon">`.
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

/**
 * Assembles a multi-resolution ICO from PNG-encoded frames.
 *
 * The ICO container is a 6-byte header (`reserved=0`, `type=1`, image count),
 * then one 16-byte directory entry per frame, then the frame payloads. Each
 * entry stores width/height as a single byte where `0` means 256, a `planes`/
 * `bpp` pair, the payload length and the payload's byte offset. Encoding the
 * frames as PNG (rather than a DIB) is allowed since Vista and is what every
 * modern browser reads; it keeps the container tiny and reuses the same
 * `buildIcon` output as the PNG favicons.
 */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const directory = Buffer.alloc(frames.length * 16);
  let offset = header.length + directory.length;

  frames.forEach(({ size, data }, index) => {
    const entry = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 0);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...frames.map((frame) => frame.data)]);
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

// Safari probes `/apple-touch-icon.png` at the site root when a page declares no
// explicit touch icon. Keep the root copy byte-identical to the one under
// `/icons` so the two can never drift.
const appleTouchIcon = await buildIcon({ size: 180, markWidthRatio: 0.72 });
await writeFile("public/apple-touch-icon.png", appleTouchIcon);
console.log(`public/apple-touch-icon.png: 180x180 ${appleTouchIcon.length} bytes`);

const faviconSizes = [16, 32, 48];
const faviconFrames = [];
for (const size of faviconSizes) {
  faviconFrames.push({ size, data: await buildIcon({ size, markWidthRatio: 0.72 }) });
}
const favicon = buildIco(faviconFrames);
await writeFile("public/favicon.ico", favicon);
console.log(
  `public/favicon.ico: ${faviconSizes.join("/")} ${favicon.length} bytes`,
);
