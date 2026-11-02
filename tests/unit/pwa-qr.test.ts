import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import {
  buildInstallQrUrl,
  buildQrRenderOptions,
  qrColors,
  qrErrorCorrectionLevel,
  qrQuietZoneModules,
} from "@/lib/pwa/qr";

/**
 * QR round-trip verification.
 *
 * The claim worth testing is not "the route returned 200" but "a camera can read
 * this code and it says the right thing". So each case renders the real payload
 * through the real generator, rasterises it to pixels, and decodes those pixels
 * with an independent decoder (jsQR). A change to the margin, the colour pair,
 * or the error-correction level that makes the symbol unscannable fails here
 * rather than on a printed poster.
 */

const decode = async (text: string): Promise<string | null> => {
  const options = buildQrRenderOptions({ requestedVersion: null });
  const png = await QRCode.toBuffer(text, { ...options, type: "png", width: 512 });
  const image = PNG.sync.read(png);
  const result = jsQR(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  );
  return result?.data ?? null;
};

test("a rendered QR code decodes back to the exact install URL", async () => {
  const url = buildInstallQrUrl({
    origin: "https://isbulkktc.com",
    searchParams: new URLSearchParams(),
  });
  assert.equal(url, "https://isbulkktc.com/install?next=%2Fjobs");
  assert.equal(await decode(url), url);
});

test("a campaign QR decodes with its attribution intact", async () => {
  const url = buildInstallQrUrl({
    origin: "https://isbulkktc.com",
    searchParams: new URLSearchParams(
      "next=%2Fjobs%3Fdistrict%3Dnicosia&utm_source=poster&utm_medium=print&utm_campaign=spring_2026&utm_id=qr_04",
    ),
  });
  const decoded = await decode(url);
  assert.equal(decoded, url);

  const parsed = new URL(decoded ?? "");
  assert.equal(parsed.pathname, "/install");
  assert.equal(parsed.searchParams.get("next"), "/jobs?district=nicosia");
  assert.equal(parsed.searchParams.get("utm_campaign"), "spring_2026");
  assert.equal(parsed.searchParams.get("utm_id"), "qr_04");
});

test("an off-site destination never reaches the encoded symbol", async () => {
  const url = buildInstallQrUrl({
    origin: "https://isbulkktc.com",
    searchParams: new URLSearchParams("next=https%3A%2F%2Fevil.example%2Fsteal"),
  });
  const decoded = await decode(url);
  assert.equal(decoded, "https://isbulkktc.com/install?next=%2Fjobs");
  assert.ok(!decoded?.includes("evil.example"));
});

test("the encoded origin is always this deployment's own install route", async () => {
  for (const origin of ["https://isbulkktc.com", "https://isbulkktc.vercel.app"]) {
    const url = buildInstallQrUrl({ origin, searchParams: new URLSearchParams() });
    const parsed = new URL(await decode(url) ?? "");
    assert.equal(parsed.origin, origin);
    assert.equal(parsed.pathname, "/install");
  }
});

test("the render options keep a scannable quiet zone and contrast", async () => {
  const options = buildQrRenderOptions({ requestedVersion: null });
  assert.equal(options.margin, qrQuietZoneModules);
  assert.ok(options.margin >= 4, "the QR spec requires a 4-module quiet zone");
  assert.equal(options.errorCorrectionLevel, qrErrorCorrectionLevel);
  assert.equal(options.color.dark, qrColors.dark);
  assert.equal(options.color.light, qrColors.light);

  // Luminance ratio of the two brand colours must clear the ~3:1 that scanner
  // binarisers tolerate; the brand pair is far past that, and this pins it.
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => {
      const value = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const dark = luminance(qrColors.dark);
  const light = luminance(qrColors.light);
  const ratio = (Math.max(dark, light) + 0.05) / (Math.min(dark, light) + 0.05);
  assert.ok(ratio > 7, `QR contrast ratio ${ratio.toFixed(1)} is too low`);
});

test("a requested symbol version is honoured only when it is valid", () => {
  assert.equal(buildQrRenderOptions({ requestedVersion: 10 }).version, 10);
  assert.equal(buildQrRenderOptions({ requestedVersion: null }).version, undefined);
  assert.equal(buildQrRenderOptions({ requestedVersion: 0 }).version, undefined);
  assert.equal(buildQrRenderOptions({ requestedVersion: 41 }).version, undefined);
  assert.equal(buildQrRenderOptions({ requestedVersion: 1.5 }).version, undefined);
});

/**
 * Negative control. Without this, a decoder that always returned the expected
 * string (or a harness that silently ignored the pixels) would make every test
 * above pass. A washed-out symbol must fail to decode, which proves the harness
 * is actually reading the raster.
 */
test("the decode harness rejects an unreadable symbol", async () => {
  const text = buildInstallQrUrl({
    origin: "https://isbulkktc.com",
    searchParams: new URLSearchParams(),
  });
  const washedOut = await QRCode.toBuffer(text, {
    errorCorrectionLevel: "M",
    margin: 4,
    type: "png",
    width: 512,
    color: { dark: "#c9c6c0", light: "#fffdf8" },
  });
  const image = PNG.sync.read(washedOut);
  const result = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  assert.equal(result, null, "a low-contrast symbol must not be readable");
});
