import assert from "node:assert/strict";
import test from "node:test";

import { getArticles } from "@/content/editorial";
import { getGuides } from "@/content/guides";
import { routing, type AppLocale } from "@/i18n/routing";

import { resolveLanguageHref, languageOptionHref, slugSiblings } from "./language-links";

/**
 * The language menu carries a slug-only copy of the translated guide and
 * article slugs so it can build correct links without importing the content
 * modules into every page's client bundle (issue #144). These tests pin that
 * copy against the content modules, so a new guide or a renamed slug fails here
 * instead of shipping a dead language link.
 */

test("the slug manifest matches the guide and article content modules", () => {
  for (const locale of routing.locales) {
    assert.deepEqual(
      slugSiblings("rehber", locale).map((entry) => entry.slug),
      getGuides(locale).map((guide) => guide.slug),
      `rehber slugs drifted from getGuides('${locale}')`,
    );
    assert.deepEqual(
      slugSiblings("blog", locale).map((entry) => entry.slug),
      getArticles(locale).map((article) => article.slug),
      `blog slugs drifted from getArticles('${locale}')`,
    );
  }
});

test("switching locale on a translated guide keeps the reader on that guide", () => {
  // The production bug: the German guide's menu emitted the Turkish slug under
  // the English prefix, and /en/rehber/arbeit-finden-in-nordzypern answered 404.
  assert.equal(
    resolveLanguageHref(
      "/rehber/arbeit-finden-in-nordzypern",
      "en",
    ),
    "/rehber/finding-a-job-in-northern-cyprus",
  );
  assert.equal(
    resolveLanguageHref("/rehber/finding-a-job-in-northern-cyprus", "tr"),
    "/rehber/kktc-is-bulma-rehberi",
  );
});

test("switching locale on a translated article keeps the reader on that article", () => {
  assert.equal(
    resolveLanguageHref("/blog/arbeitsmarkt-nordzypern-ueberblick", "en"),
    "/blog/northern-cyprus-job-market-outlook",
  );
});

test("a locale switch from the same locale is a no-op path", () => {
  // The menu also renders a link for the current locale; it must stay put.
  assert.equal(
    resolveLanguageHref("/rehber/arbeit-finden-in-nordzypern", "de"),
    "/rehber/arbeit-finden-in-nordzypern",
  );
});

test("routes without a translated slug keep their pathname unchanged", () => {
  for (const pathname of ["/", "/jobs", "/companies", "/jobs/some-listing"]) {
    assert.equal(resolveLanguageHref(pathname, "en"), pathname);
  }
});

test("an unknown slug under a content section falls back to the pathname", () => {
  assert.equal(
    resolveLanguageHref("/rehber/not-a-real-guide", "en"),
    "/rehber/not-a-real-guide",
  );
});

test("a nested path under a content section is left alone", () => {
  assert.equal(
    resolveLanguageHref("/rehber/arbeit-finden-in-nordzypern/extra", "en"),
    "/rehber/arbeit-finden-in-nordzypern/extra",
  );
});

test("the resolved href resolves for every locale pair on every guide", () => {
  const locales = routing.locales;
  for (const locale of locales) {
    for (const guide of getGuides(locale)) {
      for (const target of locales) {
        const href = resolveLanguageHref(`/rehber/${guide.slug}`, target);
        const expected = slugSiblings("rehber", target).map(
          (entry) => entry.slug,
        );
        // A resolved link must name a real slug in the target locale, never a
        // slug borrowed from the source locale.
        assert.ok(
          expected.includes(href.split("/").pop() as string),
          `${locale} → ${target} produced ${href}, not a ${target} guide`,
        );
      }
    }
  }
});

test("every locale is covered by the manifest", () => {
  for (const locale of routing.locales as readonly AppLocale[]) {
    assert.ok(slugSiblings("rehber", locale).length > 0);
    assert.ok(slugSiblings("blog", locale).length > 0);
  }
});

/**
 * The language menu used to hand its href to next-intl's `Link` with
 * `locale={code}`, which forces a prefix even for the default locale. Under
 * `localePrefix: "as-needed"` that made `tr` link to `/tr/...` on every page,
 * and `src/proxy.ts` answers a prefixed default-locale path with a 308 — one
 * redirecting link per page, which is the "Yönlendirmeli sayfa" bucket in Search
 * Console. `languageOptionHref` owns the prefix instead, so `tr` is bare.
 */
test("the default locale links to its bare, canonical pathname", () => {
  for (const pathname of ["/", "/jobs", "/companies", "/rehber/kktc-is-bulma-rehberi"]) {
    assert.equal(
      languageOptionHref(pathname, "tr"),
      pathname === "/" ? "/" : pathname,
      `tr must not be prefixed for ${pathname}`,
    );
    assert.ok(
      !languageOptionHref(pathname, "tr").startsWith("/tr"),
      `a /tr prefix would 308 on ${pathname}`,
    );
  }
});

test("non-default locales keep their prefix", () => {
  assert.equal(languageOptionHref("/jobs", "en"), "/en/jobs");
  assert.equal(languageOptionHref("/jobs", "fa"), "/fa/jobs");
  assert.equal(languageOptionHref("/companies", "de"), "/de/companies");
});

test("the root pathname is the prefix itself, never a trailing slash", () => {
  // `/en/` answers 308 to `/en`; the menu must emit the canonical form directly.
  assert.equal(languageOptionHref("/", "tr"), "/");
  assert.equal(languageOptionHref("/", "en"), "/en");
  for (const locale of routing.locales) {
    const href = languageOptionHref("/", locale);
    const expected = locale === "tr" ? "/" : `/${locale}`;
    assert.equal(href, expected);
    assert.ok(!href.endsWith("//"), `${locale} must not double the slash`);
    assert.ok(href.length === 1 || !href.endsWith("/"), `${locale} must not trail a slash`);
  }
});

test("a translated guide keeps its sibling slug under the target prefix", () => {
  assert.equal(
    languageOptionHref("/rehber/arbeit-finden-in-nordzypern", "en"),
    "/en/rehber/finding-a-job-in-northern-cyprus",
  );
  assert.equal(
    languageOptionHref("/rehber/finding-a-job-in-northern-cyprus", "tr"),
    "/rehber/kktc-is-bulma-rehberi",
  );
});

