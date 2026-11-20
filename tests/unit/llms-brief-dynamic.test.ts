import "./support/server-only-hook";
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * `/llms.txt` and `/llms-full.txt` must be rendered per request, never cached.
 *
 * The briefs advertise the district/employment-type facet pages that currently
 * hold at least one live vacancy — a facet with none answers `noindex`. A cached
 * copy keeps pointing an answer engine at a page the site tells crawlers to skip
 * once the last vacancy of a facet is withdrawn, which is the same drift the
 * sitemap route opts out of. These routes read `computeLandingAvailability` from
 * the live catalogue, so they must opt out of caching too.
 *
 * The test imports and evaluates the real route modules (with `server-only`
 * neutralised by the shared hook) rather than grepping the source, so it asserts
 * the config the server will actually read.
 */
for (const [path, sourcePath] of [
  ["../../src/app/llms.txt/route", "../../src/app/llms.txt/route.ts"],
  ["../../src/app/llms-full.txt/route", "../../src/app/llms-full.txt/route.ts"],
] as const) {
  test(`${path} is force-dynamic and sends a no-store response`, async () => {
    const route = (await import(path)) as {
      dynamic?: unknown;
      revalidate?: unknown;
      GET?: unknown;
    };

    assert.equal(
      route.dynamic,
      "force-dynamic",
      "the brief must opt out of caching; a cached copy advertises facets that went noindex",
    );
    assert.equal(
      route.revalidate,
      undefined,
      "a revalidate window re-introduces the stale snapshot the dynamic export removes",
    );
    assert.equal(typeof route.GET, "function", "the route must export a GET handler");
    const source = readFileSync(new URL(sourcePath, import.meta.url), "utf8");
    assert.match(
      source,
      /"Cache-Control":\s*"no-store"/,
      "dynamic rendering alone does not prevent shared HTTP caches from retaining a stale facet list",
    );
    assert.doesNotMatch(source, /"Cache-Control":\s*"public,\s*max-age=/);
  });
}
