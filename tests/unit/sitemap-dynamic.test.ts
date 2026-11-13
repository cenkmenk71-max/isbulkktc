import "./support/server-only-hook";
import assert from "node:assert/strict";
import test from "node:test";

/**
 * `src/app/sitemap.ts` must be generated per request, never cached.
 *
 * A cached sitemap is a build-time snapshot of the catalogue, while the `/jobs`
 * routes it links to are dynamic. The two drift apart: the sitemap keeps
 * advertising vacancies that were withdrawn (404s, which Google penalises) and
 * hides ones published since the last build. Nothing else pinned this, so a
 * revert to `export const revalidate = 3600` would silently reintroduce the
 * drift. The test imports and evaluates the real route (with `server-only`
 * neutralised by the shared hook) rather than grepping the source, so it
 * asserts the config the server will actually read.
 */
test("the sitemap route is force-dynamic so it cannot drift from the live catalogue", async () => {
  // The route module does not declare `revalidate`, so it is not on the module
  // type; read both segment-config values through a cast to assert the runtime
  // exports the server actually reads.
  const route = (await import("../../src/app/sitemap")) as {
    dynamic?: unknown;
    revalidate?: unknown;
  };

  assert.equal(
    route.dynamic,
    "force-dynamic",
    "sitemap must opt out of caching; a cached copy drifts from the dynamic /jobs routes",
  );
  assert.equal(
    route.revalidate,
    undefined,
    "a revalidate window re-introduces the stale snapshot the dynamic export removes",
  );
});
