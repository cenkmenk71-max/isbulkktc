import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The four auth routes are `noindex` and carried no metadata of their own, so
// they inherited the locale layout's `Meta` block: every one of them published
// the *home page* title, description and social card. The tab read
// "İşBul KKTC — KKTC ve Kuzey Kıbrıs İş İlanları" on /login, and a sign-in link
// shared in a chat unfurled as the home page.
//
// `createAuthPageMetadata` builds the page's own block from the same copy the
// body renders. These tests pin the contract that was missing.

const seo = new URL("../../lib/seo.ts", import.meta.url);

function source(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

test("the helper carries title, description, robots, canonical and both cards", () => {
  const src = source("./auth-metadata.ts");

  // A noindex page still needs the noindex directive.
  assert.match(src, /robots:\s*noIndexMetadata\.robots/, "must keep robots noindex");
  // Absolute string canonical: a URL instance is treated by Next as a base and
  // re-resolved against the request pathname (see src/lib/seo.ts).
  assert.match(src, /canonicalUrl\s*=\s*`\$\{baseUrl\.origin\}/, "canonical must be an absolute string");
  assert.doesNotMatch(
    src,
    /canonical:\s*(new URL|getLocalizedPageUrl)/,
    "canonical must not be a URL instance or a resolved helper",
  );
  // The social block must be the page's own copy, not the layout's.
  assert.match(src, /openGraph:\s*\{[\s\S]*?title,/, "openGraph must use the page title");
  assert.match(src, /twitter:\s*\{[\s\S]*?title,/, "twitter must use the page title");
  // Shared brand assets, so an auth card cannot drift from the rest of the site.
  assert.match(src, /getDefaultSocialImage\(/, "must use the shared social image");
  assert.match(src, /openGraphLocales\[input\.locale\]/, "must use the shared og:locale map");
});

test("a heading written as a sentence becomes a title without the full stop", () => {
  const src = source("./auth-metadata.ts");
  assert.match(src, /input\.title\.replace\(\/\\\.\$\/,\s*""\)/, "must drop one trailing stop");
});

test("every auth route defines its own generateMetadata and no bare metadata export", () => {
  const routes = [
    ["login", "/login"],
    ["register", "/register"],
    ["forgot-password", "/forgot-password"],
    ["reset-password", "/reset-password"],
  ] as const;

  for (const [route, pathname] of routes) {
    const src = source(`../../app/[locale]/(auth)/${route}/page.tsx`);
    assert.match(
      src,
      /export async function generateMetadata/,
      `${route} must define its own generateMetadata`,
    );
    assert.match(
      src,
      new RegExp(`createAuthPageMetadata\\(\\{[\\s\\S]*?pathname:\\s*"${pathname}"`),
      `${route} must pass its pathname (${pathname})`,
    );
    // The old shape: a bare `export const metadata = noIndexMetadata` inherits the
    // layout's title/description, which is exactly the bug.
    assert.doesNotMatch(
      src,
      /export const metadata = noIndexMetadata/,
      `${route} must not rely on the layout metadata`,
    );
  }
});

test("the login route derives its title from the audience's own copy", () => {
  const src = source("../../app/[locale]/(auth)/login/page.tsx");
  assert.match(src, /copy\(`\$\{audience\}\.title`\)/, "login title must follow the audience");
  assert.match(
    src,
    /copy\(`\$\{audience\}\.description`\)/,
    "login description must follow the audience",
  );
});

test("noIndexMetadata still carries only the robots directive", () => {
  // If it ever grew a title, the helper above would be silently redundant.
  const src = readFileSync(seo, "utf8");
  const block = src.slice(src.indexOf("export const noIndexMetadata"));
  const body = block.slice(0, block.indexOf("};"));
  assert.match(body, /robots:/);
  assert.doesNotMatch(body, /title:/, "noIndexMetadata must not grow a title");
  assert.doesNotMatch(body, /description:/, "noIndexMetadata must not grow a description");
});
