import assert from "node:assert/strict";
import test from "node:test";

/**
 * The response-header security controls in `next.config.ts`.
 *
 * `next.config.ts` is the only place this app sets CSP, HSTS, `X-Frame-Options`
 * and the rest of the header set, and it is not owned by any lane's test layer —
 * so nothing pinned it. A refactor that dropped a header, widened the CSP
 * `script-src`, or re-enabled `X-Powered-By` would ship with every gate green.
 *
 * These tests **import and evaluate the real config** rather than grepping the
 * source, so they assert the headers the server will actually send, not that a
 * string appears in a file. `headers()` is called the way Next.js calls it, and
 * the two groups (the global set and the Vercel-alias noindex rule) are read
 * from the result.
 */

type Header = { key: string; value: string };
type HeaderGroup = { source: string; has?: { type: string; value: string }[]; headers: Header[] };
type RemotePattern = {
  protocol?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
};
type LocalPattern = { pathname?: string; search?: string };

async function loadConfig(): Promise<{
  headers: () => Promise<HeaderGroup[]>;
  poweredByHeader: boolean;
  images: { remotePatterns?: RemotePattern[]; localPatterns?: LocalPattern[] };
}> {
  const mod = await import(new URL("../../next.config.ts", import.meta.url).href);
  return mod.default;
}

const config = await loadConfig();
const groups = await config.headers();

/** The global header group: `source: "/(.*)"` with no `has` matcher. */
const globalGroup = groups.find((group) => group.source === "/(.*)" && !group.has);
assert.ok(globalGroup, "the global header group (source '/(.*)', no `has`) is missing");

const headerValue = (key: string): string | undefined =>
  globalGroup!.headers.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value;

test("the global group sends the full defensive header set", () => {
  const required: Record<string, RegExp> = {
    "x-content-type-options": /^nosniff$/i,
    "x-frame-options": /^(sameorigin|deny)$/i,
    "referrer-policy": /strict-origin-when-cross-origin/i,
    "strict-transport-security": /max-age=\d{6,}/i,
    "content-security-policy": /default-src/i,
    "cross-origin-opener-policy": /^same-origin$/i,
    "cross-origin-resource-policy": /^same-origin$/i,
    "x-permitted-cross-domain-policies": /^none$/i,
    "permissions-policy": /camera=\(\)/i,
  };

  const missing: string[] = [];
  for (const [key, pattern] of Object.entries(required)) {
    const value = headerValue(key);
    if (value === undefined) missing.push(`${key} (absent)`);
    else if (!pattern.test(value)) missing.push(`${key} = ${JSON.stringify(value)}`);
  }
  assert.deepEqual(missing, [], `header controls that regressed: ${missing.join("; ")}`);
});

test("the CSP locks down the high-value directives", () => {
  const csp = headerValue("content-security-policy");
  assert.ok(csp, "Content-Security-Policy is missing");

  // Valued directives: the directive name followed by a source list.
  const valuedDirectives: Record<string, RegExp> = {
    "default-src": /'self'/,
    "base-uri": /'self'/,
    "object-src": /'none'/,
    "frame-ancestors": /'self'/,
    "form-action": /'self'/,
  };
  // Valueless directives: presence alone is the control.
  const bareDirectives = ["upgrade-insecure-requests"];

  const failures: string[] = [];
  for (const [directive, pattern] of Object.entries(valuedDirectives)) {
    const found = new RegExp(`(?:^|;\\s*)${directive}\\s+([^;]*)`).exec(csp);
    if (!found) failures.push(`${directive} (absent)`);
    else if (!pattern.test(found[1])) failures.push(`${directive} ${JSON.stringify(found[1].trim())}`);
  }
  for (const directive of bareDirectives) {
    if (!new RegExp(`(?:^|;\\s*)${directive}(?:\\s*;|\\s*$)`).test(csp)) {
      failures.push(`${directive} (absent)`);
    }
  }
  assert.deepEqual(failures, [], `CSP directives that regressed: ${failures.join("; ")}`);
});

test("the CSP script-src does not allow a wildcard or a bare scheme", () => {
  const csp = headerValue("content-security-policy")!;
  const scriptSrc = /(?:^|;\s*)script-src\s+([^;]*)/.exec(csp)?.[1] ?? "";
  assert.ok(scriptSrc.length > 0, "script-src is absent from the CSP");
  // A bare `*` or `https:` would let any origin run script; only explicit hosts
  // and the two inline tokens this app needs are acceptable.
  assert.ok(!/(^|\s)\*(\s|$)/.test(scriptSrc), `script-src allows any host: ${scriptSrc}`);
  assert.ok(!/(^|\s)https:(\s|$)/.test(scriptSrc), `script-src allows any https host: ${scriptSrc}`);
  assert.ok(!/'unsafe-eval'/.test(scriptSrc), `script-src allows unsafe-eval: ${scriptSrc}`);
});

test("the framework does not advertise itself", () => {
  assert.equal(
    config.poweredByHeader,
    false,
    "poweredByHeader must stay false so X-Powered-By is not sent",
  );
});

test("the Vercel alias group keeps the app out of search indexes", () => {
  const aliasGroup = groups.find((group) =>
    group.has?.some((matcher) => matcher.type === "host" && matcher.value.includes("vercel")),
  );
  assert.ok(aliasGroup, "the Vercel-alias host group is missing");
  const robots = aliasGroup!.headers.find((header) => header.key.toLowerCase() === "x-robots-tag");
  assert.ok(robots, "the Vercel-alias group no longer sets X-Robots-Tag");
  assert.match(robots!.value, /noindex/i, "the alias must be noindex");
  assert.match(robots!.value, /nofollow/i, "the alias must be nofollow");
});

// ---------------------------------------------------------------------------
// The service worker's cache header.
//
// `/sw.js` is served from `public/`, so the origin's `public, max-age=0,
// must-revalidate` was raised by Cloudflare's edge to 30 days
// (`max-age=2628000`) — the zone's Browser Cache TTL overrides an origin
// `max-age=0`. A new service worker (a `CACHE_VERSION` bump) would then take
// days to reach a PWA user, who keeps running the old one. `no-cache` makes the
// edge revalidate on every request. See `docs/cloudflare.md` SW-01.
// ---------------------------------------------------------------------------

test("the service worker is served no-cache", () => {
  const swGroup = groups.find((group) => group.source === "/sw.js" && !group.has);
  assert.ok(swGroup, "no `/sw.js` header rule — the edge can cache the service worker stale");

  const cacheControl = swGroup!.headers.find(
    (header) => header.key.toLowerCase() === "cache-control",
  );
  assert.ok(cacheControl, "the `/sw.js` rule sets no Cache-Control");
  assert.match(
    cacheControl!.value,
    /\bno-cache\b/i,
    "the service worker Cache-Control must include `no-cache` so the edge revalidates",
  );
  assert.doesNotMatch(
    cacheControl!.value,
    /max-age\s*=\s*[1-9]/i,
    "the service worker must not carry a positive max-age (the edge raises it to 30 days)",
  );
});

// ---------------------------------------------------------------------------
// The Next.js image optimizer's remote allowlist.
//
// `images.remotePatterns` is the server-side allowlist for `/ _next/image`:
// Next fetches the `url` query parameter on the server and returns the bytes, so
// a pattern that is too wide (`hostname: "**"`, or a bare `pathname: "/**"` on a
// host an attacker controls) turns the optimizer into an SSRF/DoS proxy. Nothing
// pinned this list — a new entry with `hostname: "**"` would ship with every gate
// green, exactly as an unpinned header would.
// ---------------------------------------------------------------------------

test("every image remote pattern pins an exact https host and an https protocol", () => {
  const patterns = config.images?.remotePatterns ?? [];
  assert.ok(patterns.length > 0, "images.remotePatterns is empty — the optimizer has no allowlist");

  const offenders: string[] = [];
  for (const pattern of patterns) {
    const host = pattern.hostname ?? "";
    // A wildcard host (or a bare `*`) lets the optimizer fetch any origin.
    if (!host || host.includes("*")) {
      offenders.push(`hostname ${JSON.stringify(pattern.hostname)}`);
      continue;
    }
    // The protocol must be pinned to https; `http`/omitted allows plaintext.
    if (pattern.protocol !== "https") {
      offenders.push(`${host} protocol ${JSON.stringify(pattern.protocol)}`);
      continue;
    }
    // A non-empty port/search is fine, but a wildcard path is not a narrowing.
    if (pattern.pathname === undefined) {
      offenders.push(`${host} has no pathname (matches any path)`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `image remote patterns that are not narrowed to an exact https host: ${offenders.join("; ")}`,
  );
});

test("no image remote pattern points at a private or loopback host", () => {
  const patterns = config.images?.remotePatterns ?? [];
  const offenders = patterns
    .map((pattern) => pattern.hostname ?? "")
    .filter((host) =>
      /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/i.test(host) ||
      host.startsWith("[") ||
      /\.(local|internal)$/i.test(host),
    );
  assert.deepEqual(offenders, [], `image remote patterns on internal hosts: ${offenders.join(", ")}`);
});

// ---------------------------------------------------------------------------
// The image optimizer's *local* allowlist.
//
// `/_next/image?url=` is fetched on the server. Without `images.localPatterns`
// a relative same-origin path resolves to any route, so the optimizer returned
// that route's content — `?url=%2Fblog` served HTML, `%2Fapi%2Fbuild-info`
// JSON, `%2Fllms.txt` text (Cloudflare edge audit tur-11, issue #324). The
// allowlist makes every non-image path a 400 `INVALID_IMAGE_OPTIMIZE_REQUEST`.
// These tests drive Next's own matcher so they assert the decision the server
// will make, not a re-implementation.
// ---------------------------------------------------------------------------

type LocalMatcher = {
  hasLocalMatch: (
    patterns: LocalPattern[] | undefined,
    urlPathAndQuery: string,
  ) => boolean;
};

async function loadLocalMatcher(): Promise<LocalMatcher> {
  // Next's compiled matcher is the authority the image-optimizer route calls.
  return import("next/dist/shared/lib/match-local-pattern.js");
}

const { hasLocalMatch } = await loadLocalMatcher();
const localPatterns = config.images?.localPatterns;

test("the optimizer only allows real local image paths", () => {
  assert.ok(
    localPatterns && localPatterns.length > 0,
    "images.localPatterns is missing — the optimizer will serve any same-origin route",
  );

  // Real images the app renders must still be optimizable.
  for (const allowed of [
    "/images/Girne.webp",
    "/images/about-hero.webp",
    "/images/account-gallery/girne-night.webp",
    "/images/güzelyurt.jpg",
    "/images/lefkoşa.jpeg",
    "/images/homepage-metal-feature-strip.png",
    "/images/og-cover.webp",
    "/logos/ChIJ-3DQ1Att3hQRrIITDNnXwtU.webp",
  ]) {
    assert.equal(
      hasLocalMatch(localPatterns, allowed),
      true,
      `${allowed} must be allowed (a real image would break otherwise)`,
    );
  }

  // Every non-image path the audit found must now be rejected.
  for (const rejected of [
    "/blog",
    "/about",
    "/contact",
    "/api/build-info",
    "/llms.txt",
    "/feed.xml",
    "/.well-known/security.txt",
    "/",
    "/jobs",
    "/en",
    "/profile/dashboard",
    "/company/dashboard",
    "/login",
    "/robots.txt",
    "/sitemap.xml",
    "/.env",
    "/.git/config",
    "/wp-login.php",
  ]) {
    assert.equal(
      hasLocalMatch(localPatterns, rejected),
      false,
      `${rejected} must be rejected — the optimizer returned its content`,
    );
  }
});

test("the local allowlist rejects encoded traversal under an image prefix (#356)", () => {
  // `hasLocalMatch` compares the *encoded* path (`URL.pathname` keeps `%25`),
  // while the optimizer decodes it once more before fetching. A plain
  // `/images/**` therefore matched `/images/%252e%252e/blog` but the fetch went
  // to `/blog`. Gating on an image extension rejects every encoded traversal.
  for (const traversal of [
    "/images/../blog",
    "/images/%2e%2e/blog",
    "/images/%252e%252e/blog",
    "/images/%25252e%25252e/blog",
    "/images/%2e%2e/%2e%2e/jobs",
    "/images/%252e%252e/%252e%252e/jobs",
    "/logos/%252e%252e/blog",
  ]) {
    assert.equal(
      hasLocalMatch(localPatterns, traversal),
      false,
      `${traversal} must be rejected — the fetch decodes it to a non-image route`,
    );
  }
});

test("every local pattern requires an image extension (self-test)", () => {
  // Guards the guard: the extension gate is what closes the encoded-traversal
  // bypass, so no local pattern may be a bare prefix.
  for (const pattern of localPatterns ?? []) {
    assert.match(
      pattern.pathname ?? "",
      /\.@\((?:[a-z]+\|)*[a-z]+\)$/,
      `the local pattern ${JSON.stringify(pattern.pathname)} does not require an image extension`,
    );
  }
});

test("the local allowlist rejects a query string on an image path", () => {
  // `search: ""` pins an exact (empty) query, closing the enumeration surface
  // Next 16 warns about. A versioned local image would need its own entry.
  assert.equal(
    hasLocalMatch(localPatterns, "/images/Girne.webp?v=1"),
    false,
    "a query string on a local image path must not be allowed",
  );
});

test("the local matcher rejects everything when the allowlist is absent (self-test)", () => {
  // Guards the premise: without the config, Next allows every local path — the
  // bug. If this ever changed, the finding would need re-reading.
  assert.equal(hasLocalMatch(undefined, "/blog"), true);
});
