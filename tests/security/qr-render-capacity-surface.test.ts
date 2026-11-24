import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import QRCode from "qrcode";

import { buildInstallQrUrl, buildQrRenderOptions } from "@/lib/pwa/qr";
import { maxQrVersion, minQrVersion } from "@/lib/pwa/campaign";

/**
 * Generator-capacity boundary probes for the public `/api/qr` route.
 *
 * The qrcode library throws when a payload exceeds version 40 or a caller pins
 * a version too small for the payload. Those generator exceptions are expected
 * inputs to the route's recovery logic, not uncaught production errors:
 * `route.ts` retries an undersized pin with automatic sizing and returns a
 * controlled 414/no-store response when the payload cannot fit any symbol.
 * `tests/integration/qr-route.test.ts` imports the actual route and verifies
 * both branches, including decoding PNG/SVG responses with jsQR.
 *
 * This file keeps the lower-level capacity conditions observable and guards
 * the route's recovery branch against accidental removal.
 */

// Capacity of version 40 at error-correction M (2953 bytes); a payload past it
// cannot be rendered at any version, which is the `next`-length half.
const version40MByteCapacity = 2953;

function payload(search: string): string {
  return buildInstallQrUrl({
    origin: "https://isbulkktc.com",
    searchParams: new URLSearchParams(search),
  });
}

/** Renders like the route does, returning the throw instead of failing the run. */
async function renderOutcome(body: string, version: number | null): Promise<string | null> {
  const options = buildQrRenderOptions({ requestedVersion: version });
  try {
    await QRCode.toString(body, { ...options, type: "svg" });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

test("a byte-oversized `next` reaches the generator capacity boundary", async () => {
  // 2047 characters is inside the 2048-character cap, so `sanitizeNextPath`
  // passes it through — but `é` percent-encodes to three bytes each.
  const body = payload(`next=/${"é".repeat(2046)}`);
  assert.ok(
    body.length > 2048,
    "the encoded request URL must exceed the QR generator byte ceiling",
  );
  assert.ok(
    Buffer.byteLength(body, "utf8") > version40MByteCapacity,
    `a payload past the version-40 ceiling must be reachable through the public route (got ${Buffer.byteLength(body, "utf8")} bytes)`,
  );
  assert.notEqual(
    await renderOutcome(body, null),
    null,
    "the raw generator must reject this payload so the route can return its controlled 414",
  );
});

test("a pinned version below payload capacity is rejected by the raw generator", async () => {
  // A perfectly ordinary payload (42 bytes) — only the caller-chosen version is
  // too small, and nothing rejects it before the generator.
  const body = payload("next=/jobs");
  assert.ok(
    minQrVersion === 1 && maxQrVersion === 40,
    "the accepted version range must be the full 1..40 the finding assumes",
  );
  const message = await renderOutcome(body, 1);
  assert.ok(
    message !== null && /chosen QR Code version cannot contain/i.test(message),
    `a too-small pinned version must throw (got ${JSON.stringify(message)})`,
  );
});

test("the default payload needs a later QR version, exercising auto-size fallback", async () => {
  // `buildQrRenderOptions` passes through any version in 1..40, but the default
  // `/install?next=/jobs` payload needs version 3: the route advertises a range
  // whose low end can never render. Pin the exact boundary so a capacity check
  // that starts honouring it flips this red.
  const body = payload("next=/jobs");
  const outcomes: (string | null)[] = [];
  for (let version = minQrVersion; version <= maxQrVersion; version += 1) {
    outcomes.push(await renderOutcome(body, version));
  }
  const firstRendering = outcomes.findIndex((message) => message === null) + minQrVersion;
  assert.ok(
    firstRendering > minQrVersion,
    "some supported versions cannot contain this payload and must trigger route auto-sizing",
  );
  for (let version = minQrVersion; version < firstRendering; version += 1) {
    assert.notEqual(
      outcomes[version - minQrVersion],
      null,
      `version ${version} is accepted but cannot render the default payload`,
    );
  }
  for (let version = firstRendering; version <= maxQrVersion; version += 1) {
    assert.equal(
      outcomes[version - minQrVersion],
      null,
      `version ${version} must render the default payload`,
    );
  }
});

test("the route retries undersized pins and returns a controlled 414 when no symbol fits", () => {
  const route = readFileSync(
    new URL("../../src/app/api/qr/route.ts", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const renderStart = route.indexOf("async function render(");
  const renderEnd = route.indexOf("\n}\n\nexport async function GET", renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart, "the route render helper must remain present");
  const renderSource = route.slice(renderStart, renderEnd);
  assert.match(renderSource, /try/);
  assert.match(renderSource, /catch/);
  assert.match(
    renderSource,
    /attempt\(\{\s*\.\.\.options,\s*version:\s*undefined\s*\}\)/,
    "a pinned version that is too small must retry with automatic sizing",
  );

  const handlerStart = route.indexOf("const rendered = await render");
  const handler = route.slice(handlerStart);
  assert.match(handler, /status:\s*414/);
  assert.match(handler, /"Cache-Control":\s*"no-store"/);
});

test("the capacity detector is not vacuous (self-test)", async () => {
  // A guard that always reports "fine" would pass the boundary tests by
  // accident. Prove the render helper really sees a throw and really sees a
  // success, so the generator capacity boundary cannot be produced by a broken detector.
  const short = payload("next=/jobs");
  assert.equal(await renderOutcome(short, null), null, "a short payload must render");
  const huge = "x".repeat(version40MByteCapacity + 1);
  assert.notEqual(
    await renderOutcome(huge, null),
    null,
    "a payload past every version must throw — otherwise the detector is blind",
  );
});
