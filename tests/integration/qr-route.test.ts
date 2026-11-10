import assert from "node:assert/strict";
import test from "node:test";

import jsQR from "jsqr";
import { PNG } from "pngjs";
import sharp from "sharp";

import { installBoundaryMocks } from "./support/harness";

installBoundaryMocks();

/**
 * `GET /api/qr` — the install poster generator.
 *
 * The route is the only place in the app that emits a QR symbol, and the symbol
 * is printed: a poster that encodes the wrong origin or a stale destination
 * cannot be corrected after the fact. It had **no behavioural test at all** —
 * `tests/unit/pwa-qr.test.ts` proves the generator and the payload builder,
 * `tests/security/qr-render-capacity-surface.test.ts` pins the missing error path
 * as *source text*, and the E2E install spec exercises the page, never this
 * route. So nothing asserted that the route wires `getAppBaseUrl()` into the
 * payload, that the format negotiation picks the right `Content-Type`, or that a
 * caller cannot smuggle its own `format`/`version` parameters into the encoded
 * URL.
 *
 * The route body, `buildInstallQrUrl`, `sanitizeNextPath`, `parseInstallCampaign`
 * and `buildQrRenderOptions` all run as written; the harness only neutralises
 * `server-only` (there is no bundler here to select its `react-server` export).
 *
 * A QR assertion is only worth anything if the symbol is actually read back, so
 * the PNG branch is rasterised and decoded with an independent decoder (jsQR),
 * exactly as `pwa-qr.test.ts` does. The SVG branch is checked for its contract
 * (status, content type, cache header, a well-formed `<svg>` document) — its
 * payload is the same string the PNG test decodes.
 */

const route = () => import("@/app/api/qr/route");

/** Set env for one call and restore it exactly, deleting what did not exist. */
function withEnv(vars: Record<string, string | undefined>): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

const APP_ORIGIN = "https://isbulkktc.com";

function get(query = ""): Promise<Response> {
  return route().then(({ GET }) =>
    GET(new Request(`${APP_ORIGIN}/api/qr${query}`)),
  );
}

/** Rasterise and decode a PNG response with an independent decoder. */
async function decodePng(response: Response): Promise<string | null> {
  const image = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
  const result = jsQR(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  );
  return result?.data ?? null;
}

/** Rasterise an SVG response through sharp, then decode it the same way. */
async function decodeSvg(response: Response): Promise<string | null> {
  const png = await sharp(Buffer.from(await response.text())).png().toBuffer();
  const image = PNG.sync.read(png);
  const result = jsQR(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  );
  return result?.data ?? null;
}

// ---------------------------------------------------------------------------
// Format negotiation and the response contract
// ---------------------------------------------------------------------------

test("the default response is an SVG document with the public cache contract", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    const response = await get("?next=%2Fjobs");
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("content-type"),
      "image/svg+xml; charset=utf-8",
    );
    assert.equal(response.headers.get("cache-control"), "public, max-age=3600");

    const svg = await response.text();
    assert.match(svg, /^<svg[\s>]/, "the SVG branch must return a real SVG document");
    assert.match(svg, /<\/svg>\s*$/);

    // Read the symbol back, not just its envelope: a well-formed `<svg>` that
    // encodes the wrong URL would still satisfy the checks above.
    assert.equal(
      await decodeSvg(new Response(svg)),
      "https://isbulkktc.com/install?next=%2Fjobs",
    );
  } finally {
    restore();
  }
});

test("`format=png` answers a PNG with an inline download name", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    const response = await get("?format=png");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(
      response.headers.get("content-disposition"),
      'inline; filename="isbulkktc-install-qr.png"',
    );
    assert.equal(response.headers.get("cache-control"), "public, max-age=3600");

    // PNG signature, so the branch is not answering an SVG mislabelled as PNG.
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    assert.deepEqual(
      Array.from(bytes.slice(0, 8)),
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
  } finally {
    restore();
  }
});

test("an unknown format falls back to SVG rather than failing", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    for (const format of ["svg", "PNG", "jpg", ""]) {
      const response = await get(`?format=${format}`);
      assert.equal(response.status, 200, `format=${JSON.stringify(format)}`);
      assert.equal(
        response.headers.get("content-type"),
        "image/svg+xml; charset=utf-8",
        `format=${JSON.stringify(format)} must not select the PNG branch`,
      );
    }
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// The encoded payload — read back from the pixels
// ---------------------------------------------------------------------------

test("the PNG symbol decodes to the install URL on the configured origin", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    const decoded = await decodePng(await get("?format=png"));
    assert.equal(decoded, "https://isbulkktc.com/install?next=%2Fjobs");
  } finally {
    restore();
  }
});

test("the encoded origin follows the configured app origin, not a hardcoded host", async () => {
  const restore = withEnv({
    NEXT_PUBLIC_APP_URL: "https://staging.isbulkktc.example",
    APP_URL: undefined,
  });
  try {
    const decoded = await decodePng(await get("?format=png"));
    const parsed = new URL(decoded ?? "");
    assert.equal(parsed.origin, "https://staging.isbulkktc.example");
    assert.equal(parsed.pathname, "/install");
  } finally {
    restore();
  }
});

test("the APP_URL fallback reaches the symbol when the public variable is absent", async () => {
  const restore = withEnv({
    NEXT_PUBLIC_APP_URL: undefined,
    APP_URL: "https://server-only.isbulkktc.example",
  });
  try {
    const decoded = await decodePng(await get("?format=png"));
    assert.equal(new URL(decoded ?? "").origin, "https://server-only.isbulkktc.example");
  } finally {
    restore();
  }
});

test("campaign attribution survives into the encoded symbol", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    const decoded = await decodePng(
      await get(
        "?format=png&next=%2Fjobs%3Fdistrict%3Dnicosia&utm_source=poster&utm_medium=print&utm_campaign=spring_2026&utm_id=qr_04",
      ),
    );
    const parsed = new URL(decoded ?? "");
    assert.equal(parsed.pathname, "/install");
    assert.equal(parsed.searchParams.get("next"), "/jobs?district=nicosia");
    assert.equal(parsed.searchParams.get("utm_source"), "poster");
    assert.equal(parsed.searchParams.get("utm_medium"), "print");
    assert.equal(parsed.searchParams.get("utm_campaign"), "spring_2026");
    assert.equal(parsed.searchParams.get("utm_id"), "qr_04");
  } finally {
    restore();
  }
});

test("an off-site `next` never reaches the symbol — it is replaced by the default destination", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    for (const hostile of [
      "https%3A%2F%2Fevil.example%2Fsteal",
      "%2F%2Fevil.example",
      "%2F%5Cevil.example",
      "%2F..%2F%2Fevil.example",
    ]) {
      const decoded = await decodePng(await get(`?format=png&next=${hostile}`));
      const parsed = new URL(decoded ?? "");
      assert.equal(parsed.origin, APP_ORIGIN, `next=${hostile}`);
      assert.equal(parsed.pathname, "/install", `next=${hostile}`);
      assert.equal(
        parsed.searchParams.get("next"),
        "/jobs",
        `next=${hostile} must fall back to the default destination`,
      );
      assert.ok(!(decoded ?? "").includes("evil.example"), `next=${hostile}`);
    }
  } finally {
    restore();
  }
});

test("the request's own `format` and `version` parameters never leak into the payload", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    const decoded = await decodePng(await get("?format=png&version=10&next=%2Fjobs"));
    const parsed = new URL(decoded ?? "");
    assert.equal(parsed.searchParams.get("format"), null);
    assert.equal(parsed.searchParams.get("version"), null);
    assert.equal(decoded, "https://isbulkktc.com/install?next=%2Fjobs");
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// Symbol sizing
// ---------------------------------------------------------------------------

test("a valid requested version is honoured and still decodes", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    const response = await get("?format=png&version=10");
    assert.equal(response.status, 200);
    assert.equal(
      await decodePng(response),
      "https://isbulkktc.com/install?next=%2Fjobs",
    );
  } finally {
    restore();
  }
});

test("a version outside the supported range falls back to auto-sizing", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    for (const version of ["0", "41", "abc", "", "-1"]) {
      const response = await get(`?format=png&version=${version}`);
      assert.equal(response.status, 200, `version=${JSON.stringify(version)}`);
      assert.equal(
        await decodePng(response),
        "https://isbulkktc.com/install?next=%2Fjobs",
        `version=${JSON.stringify(version)} must not pin an unrenderable symbol`,
      );
    }
  } finally {
    restore();
  }
});

/**
 * Failure path (was finding #544, now fixed).
 *
 * `buildQrRenderOptions` passes any version in 1..40 straight to the generator,
 * and `Number.parseInt` truncates `1.5` to `1`. The default `/install?next=/jobs`
 * payload needs version 3, so `?version=1` and `?version=2` used to reach
 * `QRCode` with a symbol too small to hold the data and throw **unhandled** — a
 * 500 from a public, cacheable route. The route now drops an unrenderable pin and
 * auto-sizes, so the request still answers a scannable symbol (the same fallback
 * an out-of-range version gets) instead of a 500.
 */
test("a too-small pinned version falls back to auto-sizing instead of a 500", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    for (const version of ["1", "2", "1.5", "2.9"]) {
      const response = await get(`?format=png&version=${version}`);
      assert.equal(response.status, 200, `version=${version} must not 500`);
      assert.equal(
        await decodePng(response),
        "https://isbulkktc.com/install?next=%2Fjobs",
        `version=${version} must still encode the install URL`,
      );
    }
  } finally {
    restore();
  }
});

/**
 * The other half of #544: a `next` the 2048-*character* cap lets through but
 * that percent-encodes past version 40's byte ceiling. No version can hold it,
 * so auto-sizing also throws — the route must answer a controlled status, never
 * a 500.
 */
test("a payload past every version's capacity answers a controlled status", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    const response = await get(`?format=png&next=/${"%C3%A9".repeat(680)}`);
    assert.ok(
      response.status >= 400 && response.status < 500,
      `an unencodable payload must answer a 4xx, got ${response.status}`,
    );
  } finally {
    restore();
  }
});

test("both formats encode the same payload", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: APP_ORIGIN, APP_URL: undefined });
  try {
    const pngPayload = await decodePng(await get("?format=png&next=%2Fjobs"));
    const svgPayload = await decodeSvg(await get("?next=%2Fjobs"));
    assert.equal(pngPayload, "https://isbulkktc.com/install?next=%2Fjobs");
    assert.equal(svgPayload, pngPayload);
  } finally {
    restore();
  }
});
