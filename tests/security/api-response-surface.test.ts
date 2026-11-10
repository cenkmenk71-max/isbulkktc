import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import { GET as buildInfoGet } from "@/app/api/build-info/route";

/**
 * The response surface of the App Router API routes (issue #424, findings
 * M-01..M-04, handed over by the edge layer).
 *
 * the edge layer measured the live origin and found four things that looked
 * like origin bugs. Reproducing them locally against the production standalone
 * server shows they are **not** repo code — they are Vercel platform behaviour
 * for a prerendered (`force-static`) response:
 *
 *  - M-01: `GET /api/build-info` answers `access-control-allow-origin: *` in
 *    production. The local standalone server sends **no** ACAO at all, and the
 *    repository contains no `Access-Control-Allow-Origin` anywhere. Vercel adds
 *    it (and a long cache) to responses it treats as static assets — the same
 *    header is on `/robots.txt`, `/sitemap.xml` and `/_next/static/*`, and it is
 *    absent from HTML pages and `force-dynamic` routes.
 *  - M-02: page routes answer `200` to `PUT`/`DELETE`/`PATCH` (the framework
 *    serves the document for any method). This is Next.js behaviour, and a
 *    blanket "reject non-GET on page routes" fix would break **Server Actions**,
 *    which POST to a page path with a `Next-Action` header.
 *  - M-03/M-04: error responses and missing `_next/static` assets carry Vercel's
 *    default cache header (`public, max-age=0, must-revalidate` /
 *    `max-age=31536000`). Both are absent locally, where no platform layer sits
 *    in front.
 *
 * What *is* ours, and what this file pins, is the part the platform exposes: the
 * build identity must stay the only thing that endpoint returns, and no source
 * file may start adding a cross-origin grant of its own. The tests below are
 * gates (they fail the run), not `todo`s.
 */

const srcDir = new URL("../../src/", import.meta.url);

function walk(directory: URL): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = new URL(entry, directory);
    if (statSync(path).isDirectory()) files.push(...walk(new URL(`${entry}/`, directory)));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path.pathname);
  }
  return files;
}

const sourceFiles = walk(srcDir);

function relative(path: string): string {
  return path.slice(path.indexOf("/src/") + 1);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

// ---------------------------------------------------------------------------
// 1. The build identity is the only thing `/api/build-info` returns.
//
// The endpoint is deliberately public — the post-deploy guard polls it to prove
// the live alias serves the commit that was just pushed. The risk is not the
// commit SHA (the repository is public, so the SHA is already public); it is
// that the payload grows a field. `{ ...process.env }` or a debug field would
// turn a build fingerprint into a secret leak, and the platform's ACAO makes
// such a leak readable from any origin. Pin the exact key set.
// ---------------------------------------------------------------------------

const COMMIT_PATTERN = /^(unknown|[0-9a-f]{7,40})$/;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/i;

function assertBuildIdentityShape(payload: unknown): void {
  assert.equal(typeof payload, "object", "build-info must return a JSON object");
  assert.notEqual(payload, null, "build-info must not return null");
  const record = payload as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(record).sort(),
    ["commit", "environment"],
    "build-info must expose exactly the commit and environment — a new key is a " +
      "new leak the platform's ACAO makes cross-origin readable",
  );
  assert.match(
    String(record.commit),
    COMMIT_PATTERN,
    `commit must be a git SHA or "unknown", got: ${JSON.stringify(record.commit)}`,
  );
  assert.match(
    String(record.environment),
    ENVIRONMENT_PATTERN,
    `environment must be a short token, got: ${JSON.stringify(record.environment)}`,
  );
}

test("GET /api/build-info returns only the build identity", async () => {
  const response = buildInfoGet();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assertBuildIdentityShape(await response.json());
});

test("GET /api/build-info forbids shared caching in its own response", () => {
  // The endpoint is `force-static`, so Vercel serves it from the static layer.
  // The route's own `no-store` is the only lever that stops a stale build
  // identity being cached at the edge; if it is dropped, the post-deploy guard
  // would poll a stale commit forever.
  const cacheControl = buildInfoGet().headers.get("cache-control");
  assert.ok(cacheControl, "build-info must set Cache-Control");
  assert.match(cacheControl, /no-store/, `build-info must be no-store, got: ${cacheControl}`);
});

test("the build-identity shape guard rejects an added field (self-test)", () => {
  // Prove the assertion above is not vacuous: a payload with an extra key — the
  // exact shape a `{ ...process.env }` regression would produce — must fail.
  assert.doesNotThrow(() => assertBuildIdentityShape({ commit: "abc1234", environment: "production" }));
  assert.throws(() =>
    assertBuildIdentityShape({
      commit: "abc1234",
      environment: "production",
      SUPABASE_SERVICE_ROLE_KEY: "leaked",
    }),
  );
  assert.throws(() => assertBuildIdentityShape({ commit: "abc1234" }));
});

// ---------------------------------------------------------------------------
// 2. No repository file adds a cross-origin grant.
//
// M-01's ACAO is platform-added (proven locally: no ACAO without Vercel). That
// is only a safe conclusion while the repository stays free of its own ACAO. If
// a future route adds `Access-Control-Allow-Origin: *` — the usual copy-paste
// "make the API callable" fix — the finding stops being platform noise and
// becomes a real, code-owned exposure. This gate makes that change fail.
// ---------------------------------------------------------------------------

const ACAO_PATTERN = /access-control-allow-origin/i;

test("no source or config file sets Access-Control-Allow-Origin", () => {
  const configFiles = ["next.config.ts", "vercel.json", "middleware.ts"];
  const offenders: string[] = [];
  for (const path of sourceFiles) {
    if (ACAO_PATTERN.test(read(path))) offenders.push(relative(path));
  }
  for (const name of configFiles) {
    try {
      if (ACAO_PATTERN.test(readFileSync(new URL(`../../${name}`, import.meta.url), "utf8"))) {
        offenders.push(name);
      }
    } catch {
      // The file does not exist; nothing to inspect.
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a repository file now sets a cross-origin grant — M-01 is no longer platform-only: ${offenders.join(", ")}`,
  );
});

test("the cross-origin grant matcher sees a real grant (self-test)", () => {
  // Non-vacuous: the header can be spelled as a string key or a `headers.set`
  // call, and the match is case-insensitive.
  assert.equal(ACAO_PATTERN.test('{ "Access-Control-Allow-Origin": "*" }'), true);
  assert.equal(ACAO_PATTERN.test('headers.set("access-control-allow-origin", origin)'), true);
  assert.equal(ACAO_PATTERN.test("Cache-Control: no-store"), false);
});

// ---------------------------------------------------------------------------
// 3. A `force-static` route must not be silently shared-cacheable (M-01 root).
//
// The platform's ACAO and long TTL are attached to responses it classifies as
// static, which is driven by `export const dynamic = "force-static"`. Any route
// that opts into that classification must also opt out of shared caching in its
// own response. `/api/build-info` is the only one today; this fires the moment a
// second appears without the paired `no-store`.
// ---------------------------------------------------------------------------

const ROUTE_PATTERN = /\/src\/app\/api\/.+\/route\.tsx?$/;

const routeFiles = sourceFiles.filter((path) => ROUTE_PATTERN.test(path));

test("every API route declares its caching intent", () => {
  assert.ok(routeFiles.length >= 6, `expected the API routes to be discovered, found ${routeFiles.length}`);
  const undeclared = routeFiles.filter((path) => !/export\s+const\s+dynamic\s*=/.test(read(path)));
  assert.deepEqual(
    undeclared.map(relative),
    [],
    "an API route inherits Next.js's default caching; declare `dynamic` explicitly",
  );
});

test("a force-static route also forbids shared caching in its response", () => {
  const forceStatic = routeFiles.filter((path) =>
    /export\s+const\s+dynamic\s*=\s*["']force-static["']/.test(read(path)),
  );
  assert.ok(forceStatic.length >= 1, "expected at least one force-static route (build-info)");
  const unguarded = forceStatic.filter((path) => !/no-store/.test(read(path)));
  assert.deepEqual(
    unguarded.map(relative),
    [],
    "a force-static route is served by the static layer (platform ACAO + long TTL) " +
      "but does not set `Cache-Control: no-store`",
  );
});
