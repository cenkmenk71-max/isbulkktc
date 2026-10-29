#!/usr/bin/env node
/**
 * Turns the high-resolution uploads in `assets-src/district-photos/` into the
 * web assets the homepage hero and the signature banner actually ship.
 *
 * Drop the originals there using any of the keys below in the file name (any of
 * .jpg/.jpeg/.png/.webp), then run `npm run optimize:district-photos`. Sources
 * are only ever downscaled: a file smaller than the target is left untouched so
 * a low-resolution upload cannot be silently upscaled into a blurry asset.
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourceDir = "assets-src/district-photos";

// `match` is tested against a normalised file name; `target` is the shipping
// path the app imports. `neededWidth` is the CSS pixel width the element
// occupies at DPR 2 — the smallest source that still looks sharp there.
const targets = [
  { key: "girne", match: /girne|kyrenia/, out: "public/images/Girne.webp", neededWidth: 3840 },
  { key: "gazimagusa", match: /gazimagusa|magusa|famagusta/, out: "public/images/Gazimağusa.webp", neededWidth: 3840 },
  { key: "guzelyurt", match: /guzelyurt|morphou/, out: "public/images/güzelyurt.jpg", neededWidth: 3840 },
  { key: "iskele", match: /iskele|trikomo/, out: "public/images/iskele.jpg", neededWidth: 3840 },
  { key: "lefkosa", match: /lefkosa|nicosia/, out: "public/images/lefkoşa.jpeg", neededWidth: 3840 },
  { key: "lefke", match: /lefke/, out: "public/images/lefke.jpg", neededWidth: 3840 },
  { key: "signature-strip", match: /metal|feature.?strip|signature/, out: "public/images/homepage-metal-feature-strip.png", neededWidth: 3072 },
];

const maxEdge = 3840;
const allowed = /\.(jpe?g|png|webp)$/i;

function normalize(value) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-");
}

async function encode(pipeline, out) {
  const ext = path.extname(out).toLowerCase();
  if (ext === ".webp") return pipeline.webp({ quality: 92, effort: 6 }).toBuffer();
  if (ext === ".png") return pipeline.png({ compressionLevel: 9 }).toBuffer();
  return pipeline
    .jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

const entries = await readdir(sourceDir).catch(() => []);
const sources = entries.filter((name) => allowed.test(name));

if (sources.length === 0) {
  console.log(`No uploads found in ${sourceDir}/.`);
  console.log("Add the originals there and run this script again.\n");
  for (const { key, out, neededWidth } of targets) {
    console.log(`  ${key.padEnd(16)} -> ${out}  (needs >= ${neededWidth}px wide)`);
  }
  process.exit(0);
}

let failures = 0;
for (const target of targets) {
  const match = sources.find((name) => target.match.test(normalize(name)));
  if (!match) {
    console.log(`  SKIP  ${target.key}: no upload matched`);
    failures += 1;
    continue;
  }

  const input = path.join(sourceDir, match);
  const image = sharp(input, { failOn: "error" });
  const meta = await image.metadata();
  const longest = Math.max(meta.width, meta.height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;

  let pipeline = image.rotate();
  if (scale < 1) {
    pipeline = pipeline.resize({
      width: Math.round(meta.width * scale),
      height: Math.round(meta.height * scale),
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const buffer = await encode(pipeline, target.out);
  await writeFile(target.out, buffer);

  const outMeta = await sharp(buffer).metadata();
  const width = outMeta.width;
  const ok = width >= target.neededWidth;
  if (!ok) failures += 1;

  const before = (await stat(input)).size / 1024;
  const after = buffer.length / 1024;
  console.log(
    `  ${ok ? "OK  " : "WARN"}  ${target.key.padEnd(16)} ` +
      `${meta.width}x${meta.height} (${before.toFixed(0)}KB) -> ` +
      `${width}x${outMeta.height} (${after.toFixed(0)}KB) ` +
      `[needs ${target.neededWidth}px]`,
  );
}

if (failures > 0) {
  console.log(
    `\n${failures} image(s) still below the DPR2 target. Upload a larger original.`,
  );
  process.exitCode = 1;
} else {
  console.log("\nAll district photos meet the DPR2 target.");
}
