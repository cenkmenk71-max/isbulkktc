import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

/**
 * The `NEXT_LOCALE` cookie's flags (issue #418, cookie audit §6).
 *
 * The locale middleware writes a per-request `NEXT_LOCALE` cookie on every
 * document navigation. Verified against the *real* middleware driven with the
 * app's own `src/i18n/routing.ts`, the emitted header is:
 *
 *   NEXT_LOCALE=de; Path=/; SameSite=lax
 *
 * — no `Secure`, no `HttpOnly`. `Secure` is the gap: production is HTTPS-only
 * (HSTS `includeSubDomains; preload`), so the value is not exposed on the wire
 * today, but a redirect that drops to HTTP — or a future mixed-content embed —
 * would send the visitor's locale choice in the clear. Every other cookie the
 * app writes carries `Secure` in production (the Supabase session cookie and the
 * OAuth-intent cookie in `session-cookie-flags.test.ts`, the consent cookie in
 * `consent-browser.ts`), so this one is inconsistent.
 *
 * Why not `HttpOnly` (the issue asks to confirm): the language switcher writes
 * this cookie from JavaScript. `src/components/layout/site-header.tsx` renders
 * `<Link … locale={code}>`, and `next-intl`'s `BaseLink` calls `syncLocaleCookie`
 * on click, which does `document.cookie = "NEXT_LOCALE=…"`. The client does not
 * *read* the cookie, but it *writes* it, and `document.cookie` cannot set
 * `HttpOnly` — so the flag is not a server-side one-liner; the client write path
 * has to change first. `Secure` has no such conflict.
 *
 * `src/i18n/routing.ts` is owned by LANE-İÇERİK; this lane only reads it and
 * proves the finding. The owner fixes it, then the `todo` below is removed.
 */

type Routing = Parameters<typeof createMiddleware>[0];

const routingUrl = new URL("../../src/i18n/routing.ts", import.meta.url).href;

/**
 * Import `src/i18n/routing.ts` fresh, with a cache-busting query so the module
 * body re-evaluates `process.env.NODE_ENV`. `defineRouting` bakes any
 * environment-conditional cookie option into the returned object at import
 * time, so a normal import would only ever see the value `NODE_ENV` had when the
 * suite started. This is what lets the production gate below observe a
 * `secure: process.env.NODE_ENV === "production"` fix.
 */
async function loadRouting(nodeEnv: string, tag: string): Promise<Routing> {
  const env = process.env as { NODE_ENV?: string };
  const previous = env.NODE_ENV;
  env.NODE_ENV = nodeEnv;
  try {
    const loaded = (await import(`${routingUrl}?${tag}`)) as { routing: Routing };
    return loaded.routing;
  } finally {
    env.NODE_ENV = previous;
  }
}

/**
 * The `Set-Cookie` values the middleware emits for one navigation.
 *
 * `secFetchDest` is sent verbatim (a missing header is a document-like request,
 * which the middleware still writes the cookie for). Only a non-document value
 * suppresses it.
 */
function localeCookies(
  routing: Routing,
  path: string,
  options: { secFetchDest?: string } = {},
): string[] {
  const headers: Record<string, string> = {
    "sec-fetch-dest": options.secFetchDest ?? "document",
  };
  const response = createMiddleware(routing)(
    new NextRequest(`https://isbulkktc.example.com${path}`, { headers }),
  );
  return response.headers.getSetCookie();
}

function nextLocaleCookie(cookies: string[]): string | undefined {
  return cookies.find((cookie) => cookie.startsWith("NEXT_LOCALE="));
}

// ---------------------------------------------------------------------------
// 1. Positive control: the middleware really does write the cookie, with the
//    shape the finding describes. If this stops matching, the drive is broken
//    and the finding needs re-reading — so it is pinned, not assumed.
// ---------------------------------------------------------------------------

test("the locale middleware writes NEXT_LOCALE on a document navigation", async () => {
  const cookies = localeCookies(await loadRouting("test", "shape"), "/de/blog");
  assert.deepEqual(
    cookies,
    ["NEXT_LOCALE=de; Path=/; SameSite=lax"],
    `the middleware's locale cookie shape changed: ${JSON.stringify(cookies)}`,
  );
});

test("the locale cookie is scoped to the document request only", async () => {
  const routing = await loadRouting("test", "scope");
  // A subresource request (script/image) must not be handed a cookie.
  assert.deepEqual(localeCookies(routing, "/de/blog", { secFetchDest: "script" }), []);
  // The value tracks the URL's locale prefix, so the cookie is not a constant.
  assert.match(nextLocaleCookie(localeCookies(routing, "/fa/rehber"))!, /^NEXT_LOCALE=fa;/);
});

// ---------------------------------------------------------------------------
// 2. Self-test for the production drive. The gate below only means something if
//    the harness can actually see a hardened config in production mode — this
//    proves the assertion flips on the `secure` option alone, so a green gate is
//    a real fix and not an artefact of the runner.
// ---------------------------------------------------------------------------

test("the production drive detects a Secure locale cookie (self-test)", async () => {
  const base = await loadRouting("test", "selftest");
  const hardened: Routing = { ...base, localeCookie: { secure: true } };
  const [cookie] = localeCookies(hardened, "/de/blog");
  assert.match(
    cookie,
    /;\s*Secure\b/i,
    `a routing config with secure:true did not produce a Secure cookie: ${cookie}`,
  );

  // And the unhardened config does not — so the gate below measures the option,
  // not a constant.
  assert.doesNotMatch(localeCookies(base, "/de/blog")[0], /;\s*Secure\b/i);
});

// ---------------------------------------------------------------------------
// 3. The finding. In production the cookie must be `Secure`. `todo` while the
//    gap is open (LANE-İÇERİK); the owner adds `localeCookie: { secure: … }` to
//    `defineRouting` and this passes on its own, ready to be promoted to a gate.
// ---------------------------------------------------------------------------

test(
  "in production the locale cookie is Secure",
  { todo: "LANE-İÇERİK: add `localeCookie: { secure: true }` (production) to defineRouting" },
  async () => {
    const cookies = localeCookies(await loadRouting("production", "prod"), "/de/blog");
    const cookie = nextLocaleCookie(cookies);
    assert.ok(cookie, "the middleware no longer sets NEXT_LOCALE on a document navigation");
    assert.match(cookie, /;\s*Secure\b/i, `NEXT_LOCALE is not Secure in production: ${cookie}`);
  },
);
