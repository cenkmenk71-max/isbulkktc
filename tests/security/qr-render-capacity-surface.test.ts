import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import QRCode from "qrcode";

import { buildInstallQrUrl, buildQrRenderOptions } from "@/lib/pwa/qr";
import { maxQrVersion, minQrVersion } from "@/lib/pwa/campaign";

/**
 * The `/api/qr` render capacity boundary (this round's finding, handed to the
 * route owner).
 *
 * `src/app/api/qr/route.ts` serialises the payload `buildInstallQrUrl` returns
 * straight through `QRCode.toString`/`toBuffer` with no error path. That is only
 * safe while the payload always fits in a QR symbol. It does not:
 *
 *  - `next` is capped at 2048 **characters** (`src/lib/pwa/destination.ts:23`),
 *    and the cap is byte-blind, so a 2047-character multi-byte path
 *    (percent-encoded 3x by `URLSearchParams`) is 12 314 bytes — past the
 *    2 953-byte ceiling of version 40 at error-correction M, so *every* version
 *    throws `The amount of data is too big to be stored in a QR Code`.
 *  - `version` accepts any integer 1..40 (`src/lib/pwa/campaign.ts`), so a caller
 *    can pin a symbol smaller than the payload needs — `?next=/jobs&version=1`
 *    throws `The chosen QR Code version cannot contain this amount of data` for a
 *    42-byte payload.
 *
 * Neither is validated against capacity, so the route answers an unhandled throw
 * (500) on attacker-influenced input. It is not a compromise — there is no
 * injection, no data disclosure and no denial of service (one cheap request) —
 * but it is the failure path of a public, cacheable route, and it returns a
 * generic framework error instead of a controlled status.
 *
 * The boundary is proven here at the `qrcode` level, which is exactly where the
 * route breaks. The route file cannot be imported from this suite: it pulls in
 * `server-only` (via `getAppBaseUrl`), and `bun run test:security` runs `tsx`
 * without the `react-server` condition, so a functional route test would need a
 * runner change owned by LANE-INFRA. The static half below pins the missing
 * error path in the route itself.
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

test("the payload builder accepts a `next` the generator cannot encode (finding)", async () => {
  // 2047 characters is inside the 2048-character cap, so `sanitizeNextPath`
  // passes it through — but `é` percent-encodes to three bytes each.
  const body = payload(`next=/${"é".repeat(2046)}`);
  assert.ok(
    body.length > 2048,
    "the accepted `next` must survive into a payload longer than the character cap",
  );
  assert.ok(
    Buffer.byteLength(body, "utf8") > version40MByteCapacity,
    `a payload past the version-40 ceiling must be reachable through the public route (got ${Buffer.byteLength(body, "utf8")} bytes)`,
  );
  assert.notEqual(
    await renderOutcome(body, null),
    null,
    "the oversized payload must currently throw when rendered",
  );
});

test("a pinned `version` smaller than the payload needs throws (finding)", async () => {
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

test("the accepted version range starts below what even the default payload needs (finding)", async () => {
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
    "some accepted version below the payload's minimum must throw (finding: the route accepts it)",
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

test("the route renders without an error path (finding)", () => {
  // The static half: prove the route has no try/catch (or capacity check) around
  // the generator, so the throw escapes to a 500. When the owner adds one, this
  // flips red and the assertion should be replaced by the functional route test.
  const route = readFileSync(new URL("../../src/app/api/qr/route.ts", import.meta.url), "utf8");
  assert.ok(
    route.includes("QRCode.toString"),
    "the route must still be the file under test",
  );
  assert.ok(
    !/\btry\b/.test(route),
    "the QR route must guard its generator with a try/catch (finding: it does not)",
  );
});

test("the capacity detector is not vacuous (self-test)", async () => {
  // A guard that always reports "fine" would pass the boundary tests by
  // accident. Prove the render helper really sees a throw and really sees a
  // success, so the two findings above cannot be produced by a broken detector.
  const short = payload("next=/jobs");
  assert.equal(await renderOutcome(short, null), null, "a short payload must render");
  const huge = "x".repeat(version40MByteCapacity + 1);
  assert.notEqual(
    await renderOutcome(huge, null),
    null,
    "a payload past every version must throw — otherwise the detector is blind",
  );
});
