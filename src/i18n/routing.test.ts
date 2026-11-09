import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

/**
 * `NEXT_LOCALE` must be `Secure` in production (issue #469, cookie audit §6).
 *
 * The locale middleware writes this cookie on every document navigation. The
 * `tests/security/locale-cookie-flags.test.ts` gate for it is a `todo`, and a
 * `todo` test that fails is reported as todo — not a failure — so it would not
 * catch a regression. This test is a plain gate: it fails loudly if `secure`
 * leaves `src/i18n/routing.ts`.
 *
 * `defineRouting` bakes environment-conditional options into the object at
 * import time, so each case is imported fresh with a cache-busting query while
 * `NODE_ENV` is set. The assertion is driven through the real middleware, not a
 * hand-built config, so it measures the shipped `routing` export.
 */
const routingUrl = new URL("./routing.ts", import.meta.url).href;

async function nextLocaleCookie(nodeEnv: string, tag: string): Promise<string> {
  const env = process.env as { NODE_ENV?: string };
  const previous = env.NODE_ENV;
  env.NODE_ENV = nodeEnv;
  try {
    const { routing } = (await import(`${routingUrl}?${tag}`)) as {
      routing: Parameters<typeof createMiddleware>[0];
    };
    const response = createMiddleware(routing)(
      new NextRequest("https://isbulkktc.example.com/de/blog", {
        headers: { "sec-fetch-dest": "document" },
      }),
    );
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("NEXT_LOCALE="));
    assert.ok(cookie, "the locale middleware no longer sets NEXT_LOCALE");
    return cookie;
  } finally {
    env.NODE_ENV = previous;
  }
}

test("the locale cookie is Secure in production and plain elsewhere", async () => {
  assert.match(
    await nextLocaleCookie("production", "prod"),
    /;\s*Secure\b/i,
    "NEXT_LOCALE must be Secure in production (#469)",
  );
  assert.doesNotMatch(
    await nextLocaleCookie("development", "dev"),
    /;\s*Secure\b/i,
    "a Secure cookie is dropped on http://localhost, so it must not be set off production",
  );
});

test("the locale cookie keeps next-intl's name and SameSite", async () => {
  const cookie = await nextLocaleCookie("production", "shape");
  assert.match(cookie, /^NEXT_LOCALE=de;/, cookie);
  assert.match(cookie, /;\s*SameSite=lax\b/i, cookie);
});
