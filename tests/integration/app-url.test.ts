import assert from "node:assert/strict";
import test from "node:test";

import { installBoundaryMocks } from "./support/harness";

installBoundaryMocks();

/**
 * `getAppBaseUrl` — the single origin every absolute URL in the app is built on.
 *
 * It is the base for canonical `<link>`s (`src/lib/seo.ts`), the sitemap, the
 * RSS feed, `security.txt`, auth email callbacks and the mailer's links. None of
 * those were tested through it: `tests/security/qr-render-capacity-surface.test.ts`
 * only *names* it in a comment as the reason the QR route cannot be imported, and
 * the SEO/E2E suites assert on rendered URLs, never on the validator itself.
 *
 * The two ways this can go wrong are silent in production and both are the kind
 * of mistake that is invisible until it is indexed or exploited:
 *
 *  - a bad value (a path, a query, embedded credentials, a non-loopback `http:`
 *    origin) must be rejected loudly rather than becoming the prefix of every
 *    canonical URL and auth callback;
 *  - a *missing* value in production must throw, because the alternative is
 *    emitting `http://localhost:3000` canonicals that nothing surfaces.
 *
 * The module body runs as written; only `server-only` is neutralised by the
 * harness (there is no bundler here to select its `react-server` export).
 */

const appUrl = () => import("@/server/config/app-url");

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

// Every test controls the origin and the node env; a leaked value would make the
// next test pass or fail for the wrong reason.
const originEnv = { NEXT_PUBLIC_APP_URL: undefined, APP_URL: undefined } as const;

async function baseUrl(
  vars: Record<string, string | undefined>,
  nodeEnv = "test",
): Promise<URL> {
  const restore = withEnv({ ...originEnv, ...vars, NODE_ENV: nodeEnv });
  try {
    const { getAppBaseUrl } = await appUrl();
    return getAppBaseUrl();
  } finally {
    restore();
  }
}

async function baseUrlError(
  vars: Record<string, string | undefined>,
  nodeEnv = "test",
): Promise<Error> {
  const restore = withEnv({ ...originEnv, ...vars, NODE_ENV: nodeEnv });
  try {
    const { getAppBaseUrl } = await appUrl();
    assert.throws(() => getAppBaseUrl(), "expected getAppBaseUrl to throw");
    try {
      getAppBaseUrl();
    } catch (error) {
      return error as Error;
    }
    throw new Error("unreachable");
  } finally {
    restore();
  }
}

test("a missing origin falls back to the loopback default outside production", async () => {
  const url = await baseUrl({});
  assert.equal(url.href, "http://localhost:3000/");
});

test("a missing origin in production throws instead of emitting localhost canonicals", async () => {
  const error = await baseUrlError({}, "production");
  assert.match(error.message, /NEXT_PUBLIC_APP_URL \(or APP_URL\) must be configured in production/);
});

test("a configured HTTPS origin is returned with its trailing slash", async () => {
  const url = await baseUrl({ NEXT_PUBLIC_APP_URL: "https://isbulkktc.com" });
  assert.equal(url.href, "https://isbulkktc.com/");
});

test("NEXT_PUBLIC_APP_URL takes precedence over APP_URL", async () => {
  const url = await baseUrl({
    NEXT_PUBLIC_APP_URL: "https://public.example",
    APP_URL: "https://server-only.example",
  });
  assert.equal(url.origin, "https://public.example");
});

test("APP_URL is used when the public variable is absent", async () => {
  const url = await baseUrl({ APP_URL: "https://server-only.example" });
  assert.equal(url.origin, "https://server-only.example");
});

test("HTTP is allowed only for a loopback host", async () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const url = await baseUrl({ NEXT_PUBLIC_APP_URL: `http://${host}:3000` });
    assert.equal(url.protocol, "http:");
    assert.equal(url.port, "3000");
  }
});

test("a non-loopback HTTP origin is rejected", async () => {
  const error = await baseUrlError({ NEXT_PUBLIC_APP_URL: "http://isbulkktc.com" });
  assert.match(error.message, /must be an HTTPS origin/);
});

test("an origin carrying credentials is rejected", async () => {
  const error = await baseUrlError({
    NEXT_PUBLIC_APP_URL: "https://user:pass@isbulkktc.com",
  });
  assert.match(error.message, /must be an HTTPS origin/);
});

test("a non-root path is rejected", async () => {
  const error = await baseUrlError({ NEXT_PUBLIC_APP_URL: "https://isbulkktc.com/tr" });
  assert.match(error.message, /must be an HTTPS origin/);
});

test("a query string is rejected", async () => {
  const error = await baseUrlError({ NEXT_PUBLIC_APP_URL: "https://isbulkktc.com/?a=1" });
  assert.match(error.message, /must be an HTTPS origin/);
});

test("a fragment is rejected", async () => {
  const error = await baseUrlError({ NEXT_PUBLIC_APP_URL: "https://isbulkktc.com/#top" });
  assert.match(error.message, /must be an HTTPS origin/);
});

test("a value that is not a URL throws rather than being silently accepted", async () => {
  const restore = withEnv({ NEXT_PUBLIC_APP_URL: "not a url", APP_URL: undefined, NODE_ENV: "test" });
  try {
    const { getAppBaseUrl } = await appUrl();
    assert.throws(() => getAppBaseUrl(), TypeError);
  } finally {
    restore();
  }
});
