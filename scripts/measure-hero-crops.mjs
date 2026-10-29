// Reports the focal point each district hero photo should use.
//
// The homepage hero band is ~1.11:1 on phones and 2.3-3.0:1 on desktop, so a
// landscape source is cropped on X on phones and a portrait source is cropped
// on Y on desktop. For each source we slide the visible window across the axis
// that actually gets cropped at each breakpoint and pick the offset whose
// gradient energy is highest, biased toward the centre so a busy edge cannot
// win. The output is the `object-position` pair pasted into global.css.
//
// Run: node scripts/measure-hero-crops.mjs
import sharp from "sharp";

const SOURCES = [
  ["girne", "Girne.webp"],
  ["gazimagusa", "Gazimağusa.webp"],
  ["guzelyurt", "güzelyurt.jpg"],
  ["iskele", "iskele.jpg"],
  ["lefkosa", "lefkoşa.jpeg"],
  ["lefke", "lefke.jpg"],
];

const PHONE_BOX = 1.11;
const DESKTOP_BOXES = [2.28, 3.04];
const CENTRE_BIAS = 0.12;
const BLEND_TO_CENTRE = 0.8;
const MIN = 0.15;
const MAX = 0.9;

async function energyProfile(file, axis) {
  const { data, info } = await sharp(`public/images/${file}`)
    .resize(400, null, { fit: "inside" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = axis === "x" ? info.width : info.height;
  const profile = new Float64Array(bins);
  for (let y = 1; y < info.height - 1; y++) {
    for (let x = 1; x < info.width - 1; x++) {
      const gx = data[y * info.width + x + 1] - data[y * info.width + x - 1];
      const gy = data[(y + 1) * info.width + x] - data[(y - 1) * info.width + x];
      profile[axis === "x" ? x : y] += Math.hypot(gx, gy);
    }
  }
  return { profile, bins };
}

function bestOffset(profile, keep, bins) {
  const span = bins - keep;
  if (span <= 0) return 0.5;
  let best = 0.5;
  let bestScore = -Infinity;
  for (let start = 0; start <= span; start++) {
    let energy = 0;
    for (let i = start; i < start + keep; i++) energy += profile[i];
    const position = start / span;
    const score = energy * (1 - CENTRE_BIAS * Math.abs(position - 0.5) * 2);
    if (score > bestScore) {
      bestScore = score;
      best = position;
    }
  }
  return best;
}

const clamp = (value) => Math.min(MAX, Math.max(MIN, value));

for (const [slug, file] of SOURCES) {
  const { width, height } = await sharp(`public/images/${file}`).metadata();
  const ratio = width / height;
  const xProfile = await energyProfile(file, "x");
  const yProfile = await energyProfile(file, "y");

  const xCrops = [PHONE_BOX]
    .filter((box) => box < ratio)
    .map((box) =>
      bestOffset(
        xProfile.profile,
        Math.max(1, Math.round(xProfile.bins * (box / ratio))),
        xProfile.bins,
      ),
    );
  const yCrops = DESKTOP_BOXES.filter((box) => box > ratio).map((box) =>
    bestOffset(
      yProfile.profile,
      Math.max(1, Math.round(yProfile.bins * (ratio / box))),
      yProfile.bins,
    ),
  );

  const average = (values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0.5;
  const blend = (value) => clamp(BLEND_TO_CENTRE * value + (1 - BLEND_TO_CENTRE) * 0.5);
  const x = Math.round(blend(average(xCrops)) * 100);
  const y = Math.round(blend(average(yCrops)) * 100);

  console.log(
    `${slug.padEnd(11)} ${width}x${height} (${ratio.toFixed(2)}) -> object-position: ${x}% ${y}%`,
  );
}
