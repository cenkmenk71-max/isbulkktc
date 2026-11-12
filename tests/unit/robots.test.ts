import "./support/server-only-hook";
import assert from "node:assert/strict";
import test from "node:test";

import { routing } from "../../src/i18n/routing";

/**
 * `src/app/robots.ts` is the one place the crawl policy is defined, and nothing
 * pinned it. The rule is deliberately narrow — only non-HTML infrastructure may
 * be disallowed, because a Disallow stops a crawler before it can read the
 * `noindex` meta tag that is supposed to keep an account page out of the index.
 * The test imports and evaluates the real route (with `server-only` neutralised
 * by the shared hook) rather than grepping the source, so it asserts the file
 * the server will actually serve.
 */
test("robots.txt disallows only non-HTML infrastructure and advertises the sitemap", async () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://isbulkktc.com";
  const { default: robots } = await import("../../src/app/robots");

  const result = robots();
  // `rules` is a single rule object here; the route does not emit the array form.
  const rules = result.rules as {
    userAgent: string;
    allow: string;
    disallow: string[];
  };
  assert.equal(rules.userAgent, "*");
  assert.equal(rules.allow, "/");

  const disallow = rules.disallow;

  // Cloudflare's email-obfuscation links point at `/cdn-cgi/l/email-protection#…`,
  // which the origin answers with 404; the prefix must be disallowed.
  for (const path of ["/api/", "/cdn-cgi/", "/auth/"]) {
    assert.ok(disallow.includes(path), `robots.txt must disallow ${path}`);
  }

  // `localePrefix: "as-needed"` serves the callback under every non-default
  // locale prefix, so each one needs its own explicit rule.
  for (const locale of routing.locales.filter((l) => l !== routing.defaultLocale)) {
    assert.ok(
      disallow.includes(`/${locale}/auth/`),
      `robots.txt must disallow the prefixed callback /${locale}/auth/`,
    );
  }

  // Account pages must never appear here: they rely on their `noindex` meta tag,
  // which a Disallow would prevent the crawler from ever seeing.
  for (const pagePath of ["/login", "/register", "/profile", "/admin", "/company/dashboard"]) {
    assert.ok(
      disallow.every((rule) => !pagePath.startsWith(rule)),
      `robots.txt must not disallow the account page ${pagePath}`,
    );
  }

  assert.equal(result.sitemap, "https://isbulkktc.com/sitemap.xml");
  assert.equal(result.host, "https://isbulkktc.com");
});
