import assert from "node:assert/strict";
import { describe, test } from "node:test";
import sharp from "sharp";
import {
  channelThreshold,
  comparePng,
  maxDiffPixelRatio,
} from "../visual/support/visual";

/**
 * The visual gate is only as trustworthy as its metric, and the metric is pure
 * arithmetic that needs no browser. These tests pin the three ways a comparison
 * can be wrong: it misses a change, it invents one, or it compares two images of
 * different geometry as if they matched.
 */

const size = { width: 40, height: 20 };

function solid(red: number, green = 0, blue = 0) {
  const pixels = Buffer.alloc(size.width * size.height * 3);
  for (let p = 0; p < size.width * size.height; p += 1) {
    pixels[p * 3] = red;
    pixels[p * 3 + 1] = green;
    pixels[p * 3 + 2] = blue;
  }
  return sharp(pixels, { raw: { ...size, channels: 3 } })
    .png()
    .toBuffer();
}

describe("comparePng", () => {
  test("an identical pair reports no difference", async () => {
    const image = await solid(120, 120, 120);
    const result = await comparePng(image, image);
    assert.equal(result.ratio, 0);
    assert.equal(result.diffPixels, 0);
    assert.equal(result.sizeMismatch, null);
  });

  test("a change below the channel threshold is ignored as noise", async () => {
    const before = await solid(120);
    const after = await solid(120 + channelThreshold);
    const result = await comparePng(after, before);
    assert.equal(
      result.ratio,
      0,
      "a delta at the threshold must not count as changed",
    );
  });

  test("a change above the channel threshold is counted", async () => {
    const before = await solid(0);
    const after = await solid(channelThreshold + 5);
    const result = await comparePng(after, before);
    assert.equal(result.ratio, 1, "every pixel changed");
    assert.equal(result.diffPixels, size.width * size.height);
  });

  test("a small real change still exceeds the failing ratio", async () => {
    const before = await solid(0);
    // Recolour a single row: 1/20 of the image, well above the 0.1% budget.
    const changed = await sharp(await solid(0))
      .raw()
      .toBuffer();
    const row = Buffer.alloc(size.width * 3, 200);
    row.copy(changed, 0, 0, row.length);
    const after = await sharp(changed, { raw: { ...size, channels: 3 } })
      .png()
      .toBuffer();

    const result = await comparePng(after, before);
    assert.equal(result.diffPixels, size.width);
    assert.ok(
      result.ratio > maxDiffPixelRatio,
      `one changed row must fail (${result.ratio} vs ${maxDiffPixelRatio})`,
    );
  });

  test("different geometry is a hard mismatch, not a ratio", async () => {
    const before = await solid(10);
    const after = await sharp({
      create: { width: 41, height: 20, channels: 3, background: "#000000" },
    })
      .png()
      .toBuffer();
    const result = await comparePng(after, before);
    assert.equal(result.ratio, 1);
    assert.ok(
      result.sizeMismatch !== null,
      "a resized element must be reported as a geometry change",
    );
  });
});
