import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  evaluateIndexNowKey,
  evaluateIndexability,
  extractPageSignals,
  findCanonical,
  findMetaContents,
  hasLocalePrefix,
  isDeploymentDisabled,
  isDirectRun,
  isPathAllowed,
  isSameOrigin,
  parseRobots,
  parseSitemap,
  sampleUrls,
  stripRobotsAgent,
  unmeasurableReason,
  validateHreflang,
  validateLoc,
  verdictForPage,
} from "./verify-indexing.mjs";

const ORIGIN = "https://isbulkktc.com";

test("robots parsing reads groups, rules and sitemaps past comments and blanks", () => {
  const robots = parseRobots(
    [
      "# a comment",
      "User-Agent: *",
      "Allow: /",
      "Disallow: /api/   # trailing comment",
      "",
      "User-agent: Googlebot",
      "Disallow: /private/",
      "Sitemap: https://isbulkktc.com/sitemap.xml",
    ].join("\n"),
  );
  assert.equal(robots.groups.length, 2);
  assert.deepEqual(robots.groups[0].agents, ["*"]);
  assert.deepEqual(robots.groups[0].rules, [
    { type: "allow", path: "/" },
    { type: "disallow", path: "/api/" },
  ]);
  assert.deepEqual(robots.sitemaps, ["https://isbulkktc.com/sitemap.xml"]);
});

test("robots path matching honours wildcards, the end-anchor and specificity", () => {
  const robots = parseRobots(
    ["User-Agent: *", "Disallow: /*.pdf$", "Disallow: /api/", "Allow: /api/public/"].join("\n"),
  );
  assert.equal(isPathAllowed(robots, "/files/report.pdf"), false);
  assert.equal(isPathAllowed(robots, "/files/report.pdf?x=1"), true); // `$` anchors the end
  assert.equal(isPathAllowed(robots, "/api/jobs"), false);
  assert.equal(isPathAllowed(robots, "/api/public/jobs"), true); // longer allow wins
  assert.equal(isPathAllowed(robots, "/"), true); // no matching rule
});

test("an empty Disallow allows everything and a missing group is permissive", () => {
  const robots = parseRobots(["User-Agent: *", "Disallow:"].join("\n"));
  assert.equal(isPathAllowed(robots, "/anything"), true);
  assert.equal(isPathAllowed(parseRobots(""), "/anything"), true);
});

test("sitemap parsing reads locs, lastmod and hreflang alternates", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url>
<loc>https://isbulkktc.com/</loc>
<xhtml:link rel="alternate" hreflang="tr" href="https://isbulkktc.com/" />
<xhtml:link rel="alternate" hreflang="x-default" href="https://isbulkktc.com/" />
<lastmod>2026-11-05T16:08:07.000Z</lastmod>
</url>
</urlset>`;
  const parsed = parseSitemap(xml);
  assert.equal(parsed.isIndex, false);
  assert.equal(parsed.urls.length, 1);
  assert.equal(parsed.urls[0].loc, "https://isbulkktc.com/");
  assert.equal(parsed.urls[0].lastmod, "2026-11-05T16:08:07.000Z");
  assert.deepEqual(parsed.urls[0].alternates, [
    { hreflang: "tr", href: "https://isbulkktc.com/" },
    { hreflang: "x-default", href: "https://isbulkktc.com/" },
  ]);
});

test("sitemap index documents are recognised and their children listed", () => {
  const xml = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://isbulkktc.com/sitemap-jobs.xml</loc></sitemap>
</sitemapindex>`;
  const parsed = parseSitemap(xml);
  assert.equal(parsed.isIndex, true);
  assert.deepEqual(parsed.childSitemaps, ["https://isbulkktc.com/sitemap-jobs.xml"]);
});

test("a <loc> must be absolute, on-origin and free of the default-locale prefix", () => {
  assert.equal(validateLoc("https://isbulkktc.com/jobs", ORIGIN).ok, true);
  assert.equal(validateLoc("", ORIGIN).ok, false);
  assert.equal(validateLoc("/jobs", ORIGIN).ok, false); // not absolute
  assert.equal(validateLoc("https://other.example/jobs", ORIGIN).ok, false);
  assert.equal(validateLoc("https://isbulkktc.com/jobs#x", ORIGIN).ok, false);
  assert.equal(validateLoc("https://isbulkktc.com/tr", ORIGIN).ok, false);
  assert.equal(validateLoc("https://isbulkktc.com/tr/jobs", ORIGIN).ok, false);
  // A non-default locale prefix is the canonical form and stays valid.
  assert.equal(validateLoc("https://isbulkktc.com/en", ORIGIN).ok, true);
});

test("a single-locale entry with no alternates is valid, not a defect", () => {
  // Regression: a page that exists in one language only (its localized
  // duplicates canonicalise back to it) must not be forced to carry hreflang.
  const verdict = validateHreflang([], `${ORIGIN}/jobs/source-x`, ORIGIN);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.single, true);
  assert.deepEqual(verdict.problems, []);
});

test("hreflang validation requires the full set, x-default and a self-reference", () => {
  const locales = ["tr", "en", "ru", "el", "fa", "de"];
  const full = [
    ...locales.map((l) => ({ hreflang: l, href: `${ORIGIN}/${l}` })),
    { hreflang: "x-default", href: ORIGIN },
  ];
  const loc = `${ORIGIN}/en`;
  // The default locale's URL is the origin; make the self-reference match.
  const selfAware = full.map((a) => (a.hreflang === "en" ? { ...a, href: loc } : a));
  assert.equal(validateHreflang(selfAware, loc, ORIGIN).ok, true);

  const missing = validateHreflang(selfAware.filter((a) => a.hreflang !== "de"), loc, ORIGIN);
  assert.equal(missing.ok, false);
  assert.ok(missing.problems.some((p) => p.includes('"de"')));

  const noDefault = validateHreflang(selfAware.filter((a) => a.hreflang !== "x-default"), loc, ORIGIN);
  assert.equal(noDefault.ok, false);
  assert.ok(noDefault.problems.some((p) => p.includes("x-default")));

  const noSelf = validateHreflang(
    selfAware.map((a) => (a.hreflang === "en" ? { ...a, href: `${ORIGIN}/xx` } : a)),
    loc,
    ORIGIN,
  );
  assert.equal(noSelf.ok, false);
  assert.ok(noSelf.problems.some((p) => p.includes("self-referential")));

  const unknown = validateHreflang(
    [...selfAware, { hreflang: "fr", href: `${ORIGIN}/fr` }],
    loc,
    ORIGIN,
  );
  assert.equal(unknown.ok, false);
  assert.ok(unknown.problems.some((p) => p.includes("unknown hreflang")));
});

test("hasLocalePrefix distinguishes default, non-default and unprefixed paths", () => {
  assert.equal(hasLocalePrefix("/jobs/x"), false);
  assert.equal(hasLocalePrefix("/en/jobs/x"), true);
  assert.equal(hasLocalePrefix("/de"), true);
  assert.equal(hasLocalePrefix("/tr/jobs"), false); // default locale is not a "locale prefix"
  assert.equal(hasLocalePrefix("/"), false);
});

test("page signals are read from either attribute order", () => {
  const a = extractPageSignals(
    '<link rel="canonical" href="https://isbulkktc.com/en"><meta name="robots" content="noindex,follow">',
  );
  assert.equal(a.canonical, "https://isbulkktc.com/en");
  assert.equal(a.metaRobots, "noindex,follow");
  const b = extractPageSignals('<link href="https://isbulkktc.com" rel="canonical">');
  assert.equal(b.canonical, "https://isbulkktc.com");
  assert.equal(b.metaRobots, null);
  // Both directives are read and combined, so a `noindex` in either is visible.
  const c = extractPageSignals(
    '<meta name="robots" content="index, follow"><meta name="googlebot" content="noindex">',
  );
  assert.match(c.metaRobots, /noindex/);
});

test("meta directives are read in either attribute order and either quote style", () => {
  // Attribute order and quote style are not significant in HTML; assuming
  // `name` before `content` or double quotes only misses a real `noindex`.
  assert.equal(extractPageSignals('<meta name="robots" content="noindex">').metaRobots, "noindex");
  assert.equal(extractPageSignals('<meta content="noindex" name="robots">').metaRobots, "noindex");
  assert.equal(extractPageSignals("<meta name='robots' content='noindex'>").metaRobots, "noindex");
  assert.equal(
    extractPageSignals('<meta name="description" content="x"><meta name="robots" content="NOINDEX">')
      .metaRobots,
    "noindex",
  );
  assert.equal(extractPageSignals('<meta name="robots">').metaRobots, null);
  assert.equal(
    extractPageSignals('<meta name="google-site-verification" content="abc">').siteVerification,
    "abc",
  );
});

test("indexability rejects noindex, missing/relative/off-origin/default-locale canonicals and mismatches", () => {
  const loc = "https://isbulkktc.com/en";
  const base = { status: 200, loc, origin: ORIGIN };
  assert.equal(
    evaluateIndexability({ ...base, canonical: loc, metaRobots: null }).ok,
    true,
  );
  assert.equal(evaluateIndexability({ ...base, status: 404, canonical: loc }).state, "unreachable");
  assert.equal(evaluateIndexability({ ...base, canonical: loc, metaRobots: "noindex" }).state, "noindex");
  assert.equal(
    evaluateIndexability({ ...base, canonical: loc, xRobotsTag: "noindex" }).state,
    "noindex",
  );
  assert.equal(evaluateIndexability({ ...base, canonical: null }).state, "no-canonical");
  assert.equal(evaluateIndexability({ ...base, canonical: "/en" }).state, "relative-canonical");
  assert.equal(
    evaluateIndexability({ ...base, canonical: "https://other.example/en" }).state,
    "off-origin-canonical",
  );
  assert.equal(
    evaluateIndexability({ ...base, canonical: "https://isbulkktc.com/tr/jobs" }).state,
    "default-locale-canonical",
  );
  assert.equal(
    evaluateIndexability({ ...base, canonical: "https://isbulkktc.com/jobs" }).state,
    "canonical-mismatch",
  );
});

test("the IndexNow key is only valid when the served body matches", () => {
  const key = "isbulkktcada1d9ce6917a3363df4ff8fccc7629a";
  assert.equal(evaluateIndexNowKey({ status: 200, body: key, key }).ok, true);
  assert.equal(evaluateIndexNowKey({ status: 200, body: `${key}\n`, key }).ok, true); // trims
  assert.equal(evaluateIndexNowKey({ status: 200, body: "other", key }).state, "mismatch");
  assert.equal(evaluateIndexNowKey({ status: 404, body: "", key }).state, "unreachable");
  assert.equal(evaluateIndexNowKey({ status: 0, body: "", key, error: "ETIMEDOUT" }).state, "unreachable");
});

test("a disabled deployment is not evidence about indexing", () => {
  // Vercel's blocked-account state: 402 with `x-vercel-error: DEPLOYMENT_DISABLED`.
  assert.equal(isDeploymentDisabled(402, ""), true);
  assert.equal(isDeploymentDisabled(200, "DEPLOYMENT_DISABLED"), true);
  assert.equal(isDeploymentDisabled(200, " deployment_disabled "), true);
  assert.equal(isDeploymentDisabled(200, "NOT_FOUND"), false);
  assert.equal(isDeploymentDisabled(500, ""), false);

  // The site's outage is reported as unmeasurable (skip), not as a robots/sitemap
  // failure — a 402 for the whole origin says nothing about the crawl surface.
  assert.match(unmeasurableReason(402, "Payment required\n\nDEPLOYMENT_DISABLED", ""), /disabled/);
  assert.match(unmeasurableReason(200, "", "DEPLOYMENT_DISABLED"), /disabled/);
  // A genuine challenge still skips, and a normal answer is measurable.
  assert.match(unmeasurableReason(403, "", ""), /challenge/);
  assert.match(unmeasurableReason(200, "Just a moment...", ""), /challenge/);
  assert.equal(unmeasurableReason(200, "<html>ok</html>", ""), null);
  assert.equal(unmeasurableReason(404, "not found", ""), null);
});

test("isSameOrigin rejects a lookalike host a prefix test would accept", () => {
  assert.equal(isSameOrigin(`${ORIGIN}/sitemap.xml`, ORIGIN), true);
  // The prefix trap: both of these `startsWith("https://isbulkktc.com")`.
  assert.equal(isSameOrigin("https://isbulkktc.com.evil.example/sitemap.xml", ORIGIN), false);
  assert.equal(isSameOrigin("https://isbulkktc.com.au/sitemap.xml", ORIGIN), false);
  assert.equal(isSameOrigin("http://isbulkktc.com/sitemap.xml", ORIGIN), false); // scheme differs
  assert.equal(isSameOrigin("not a url", ORIGIN), false);
});

test("verdictForPage consults the X-Robots-Tag header, not just the meta tag", () => {
  // Regression: the page fetch read the header but `checkPages` passed a
  // hardcoded `null`, so a header-only `noindex` was invisible to the live run.
  const loc = `${ORIGIN}/en`;

  const html = `<link rel="canonical" href="${loc}">`;
  assert.equal(
    verdictForPage({ status: 200, body: html, xRobotsTag: null, loc, origin: ORIGIN }).ok,
    true,
  );
  const headerOnly = verdictForPage({
    status: 200,
    body: html,
    xRobotsTag: "noindex",
    loc,
    origin: ORIGIN,
  });
  assert.equal(headerOnly.ok, false);
  assert.equal(headerOnly.state, "noindex");
  // A header that only repeats `index, follow` is not a block.
  assert.equal(
    verdictForPage({ status: 200, body: html, xRobotsTag: "index, follow", loc, origin: ORIGIN }).ok,
    true,
  );
});

test("sampling keeps the first URL and respects the size", () => {
  const urls = Array.from({ length: 100 }, (_, i) => ({ loc: `${ORIGIN}/p${i}` }));
  const sample = sampleUrls(urls, 8);
  assert.ok(sample.length <= 8);
  assert.equal(sample[0], `${ORIGIN}/p0`);
  assert.deepEqual(sampleUrls([{ loc: `${ORIGIN}/only` }], 8), [`${ORIGIN}/only`]);
});

test("a robots `none` directive blocks indexing, like noindex", () => {
  // Regression: `none` is Google's shorthand for `noindex, nofollow`, so a page
  // carrying it must not read as indexable just because the literal `noindex`
  // is absent.
  const loc = `${ORIGIN}/en`;
  const base = { status: 200, loc, origin: ORIGIN };
  assert.equal(evaluateIndexability({ ...base, canonical: loc, metaRobots: "none" }).state, "noindex");
  assert.equal(evaluateIndexability({ ...base, canonical: loc, xRobotsTag: "none" }).state, "noindex");
  // A value that merely *contains* `none` as a substring must not trip it.
  assert.equal(evaluateIndexability({ ...base, canonical: loc, metaRobots: "noindex, none" }).state, "noindex");
  assert.equal(evaluateIndexability({ ...base, canonical: loc, metaRobots: "nofollow" }).ok, true);
});

test("a googlebot-only noindex blocks indexing, and the site's index hint does not", () => {
  // Regression: the site emits `<meta name="googlebot" content="index, follow…">`
  // on every page. Reading only the `robots` tag meant a `googlebot`-only
  // `noindex` was invisible — and, worse, the verifier could not see the
  // `googlebot` tag the site actually ships.
  const loc = `${ORIGIN}/en`;
  const canonical = `<link rel="canonical" href="${loc}">`;
  const noindex = verdictForPage({
    status: 200,
    body: `${canonical}<meta name="googlebot" content="noindex">`,
    xRobotsTag: null,
    loc,
    origin: ORIGIN,
  });
  assert.equal(noindex.ok, false);
  assert.equal(noindex.state, "noindex");

  const siteDefault = verdictForPage({
    status: 200,
    body: `${canonical}<meta name="googlebot" content="index, follow, max-snippet:-1, max-image-preview:large">`,
    xRobotsTag: null,
    loc,
    origin: ORIGIN,
  });
  assert.equal(siteDefault.ok, true);

  // Both tags together: the most restrictive wins, so a robots `noindex` beside
  // an indexable googlebot hint is still noindex.
  const combined = verdictForPage({
    status: 200,
    body: `${canonical}<meta name="robots" content="noindex"><meta name="googlebot" content="index, follow">`,
    xRobotsTag: null,
    loc,
    origin: ORIGIN,
  });
  assert.equal(combined.state, "noindex");
});

test("the canonical link is read in either attribute order and quote style", () => {
  // Regression: the old regexes assumed `rel` before `href` with double quotes,
  // so `<link href=… rel=canonical>` (Next's emission order) read as no canonical.
  assert.equal(findCanonical(`<link rel="canonical" href="${ORIGIN}/en">`), `${ORIGIN}/en`);
  assert.equal(findCanonical(`<link href="${ORIGIN}/en" rel="canonical">`), `${ORIGIN}/en`);
  assert.equal(findCanonical(`<link rel='canonical' href='${ORIGIN}/en'>`), `${ORIGIN}/en`);
  // A `rel` token list that includes `canonical` counts.
  assert.equal(findCanonical(`<link rel="alternate canonical" href="${ORIGIN}/en">`), `${ORIGIN}/en`);
  // An unrelated rel must not be mistaken for the canonical.
  assert.equal(findCanonical(`<link rel="alternate" href="${ORIGIN}/de">`), null);
  assert.equal(findCanonical("<link rel=\"stylesheet\" href=\"/x.css\">"), null);
  // `data-rel` contains `rel` but is a different attribute; a word-boundary
  // match accepted it and read an unrelated link as the canonical.
  assert.equal(findCanonical(`<link data-rel="canonical" href="https://evil.example/x">`), null);
  assert.equal(extractPageSignals(`<link href="${ORIGIN}/en" rel="canonical">`).canonical, `${ORIGIN}/en`);
});

test("a preview-only `none` does not block indexing, but a bare `none` does", () => {
  // Regression: the check matched `\bnone\b` anywhere, so the documented
  // `max-image-preview:none` / `max-video-preview:none` values — which limit
  // previews, not indexing — read as `noindex` and failed a healthy page.
  const loc = `${ORIGIN}/en`;
  const base = { status: 200, canonical: loc, loc, origin: ORIGIN };
  assert.equal(evaluateIndexability({ ...base, metaRobots: "index, follow, max-image-preview:none" }).ok, true);
  assert.equal(evaluateIndexability({ ...base, metaRobots: "index, follow, max-video-preview:none" }).ok, true);
  assert.equal(
    evaluateIndexability({ ...base, metaRobots: "max-snippet:-1, max-image-preview:large" }).ok,
    true,
  );
  // A bare `none` directive still blocks, in either separator position.
  assert.equal(evaluateIndexability({ ...base, metaRobots: "none" }).state, "noindex");
  assert.equal(evaluateIndexability({ ...base, metaRobots: "index, none" }).state, "noindex");
  assert.equal(evaluateIndexability({ ...base, xRobotsTag: "none" }).state, "noindex");
  // `noimageindex` contains `none`? No — it contains `noimage`, so it must not block.
  assert.equal(evaluateIndexability({ ...base, metaRobots: "noimageindex" }).ok, true);
});

test("robots directives are combined across every matching meta tag", () => {
  // Regression: only the first tag of each name was read, so a second
  // `<meta name="robots" content="noindex">` (Google: "the search engine will
  // use the sum of the negative rules") was invisible and the page read as
  // indexable.
  const loc = `${ORIGIN}/en`;
  const html = `<link rel="canonical" href="${loc}">`;
  const verdict = verdictForPage({
    status: 200,
    body: `${html}<meta name="robots" content="index, follow"><meta name="robots" content="noindex">`,
    xRobotsTag: null,
    loc,
    origin: ORIGIN,
  });
  assert.equal(verdict.state, "noindex");

  // A `googlebot-news` noindex governs news results alone; it must NOT block web
  // indexing, or the check would fail a page web search still indexes.
  const news = verdictForPage({
    status: 200,
    body: `${html}<meta name="googlebot" content="index, follow"><meta name="googlebot-news" content="noindex">`,
    xRobotsTag: null,
    loc,
    origin: ORIGIN,
  });
  assert.equal(news.ok, true);

  // Both `robots` tags are returned, in document order.
  assert.deepEqual(
    findMetaContents('<meta name="robots" content="index"><meta name="robots" content="noindex">', "robots"),
    ["index", "noindex"],
  );
});

test("an X-Robots-Tag that names a crawler still blocks on its rules", () => {
  // Regression: `X-Robots-Tag: googlebot: noindex` is a documented form. The
  // leading `googlebot:` is a user-agent name, not a rule; it must be dropped
  // rather than folded into the directive list.
  const loc = `${ORIGIN}/en`;
  const base = { status: 200, canonical: loc, loc, origin: ORIGIN };
  assert.equal(evaluateIndexability({ ...base, xRobotsTag: "googlebot: noindex" }).state, "noindex");
  assert.equal(evaluateIndexability({ ...base, xRobotsTag: "googlebot: index, follow" }).ok, true);
  // A rule that carries a colon (`unavailable_after: <date>`) must not be mistaken
  // for a user-agent prefix.
  assert.equal(stripRobotsAgent("unavailable_after: 25 Jun 2010 15:00:00 PST"), "unavailable_after: 25 Jun 2010 15:00:00 PST");
  assert.equal(stripRobotsAgent("googlebot: nofollow"), "nofollow");
  assert.equal(stripRobotsAgent("noindex"), "noindex");
  assert.equal(stripRobotsAgent(null), "");
});

test("the most specific user-agent group wins, and equal groups combine", () => {
  // Regression: `selectGroup` returned the first group whose token was a
  // substring of the crawler name, so a short earlier `bot` group shadowed a
  // later `googlebot` group — Google instead picks the most specific token.
  const shadowed = parseRobots(
    ["User-agent: bot", "Disallow: /private/", "", "User-agent: googlebot", "Allow: /private/"].join("\n"),
  );
  assert.equal(isPathAllowed(shadowed, "/private/x", "Googlebot"), true);
  assert.equal(isPathAllowed(shadowed, "/private/x", "SomeBot"), false);

  // Regression: several groups for the same agent are combined into one rule
  // set, so a `Disallow` in the second group still applies.
  const combined = parseRobots(
    ["User-agent: googlebot", "Disallow: /a/", "", "User-agent: googlebot", "Disallow: /b/"].join("\n"),
  );
  assert.equal(isPathAllowed(combined, "/a/x", "Googlebot"), false);
  assert.equal(isPathAllowed(combined, "/b/x", "Googlebot"), false);
  assert.equal(isPathAllowed(combined, "/c/x", "Googlebot"), true);

  // A specific group beats the global `*` group entirely.
  const specificWins = parseRobots(
    ["User-agent: *", "Disallow: /", "", "User-agent: googlebot", "Allow: /"].join("\n"),
  );
  assert.equal(isPathAllowed(specificWins, "/jobs", "Googlebot"), true);
  assert.equal(isPathAllowed(specificWins, "/jobs", "Bingbot"), false);

  // `googlebot*` and `googlebot/1.2` are the same token as `googlebot`.
  assert.equal(
    isPathAllowed(parseRobots("User-agent: googlebot*\nDisallow: /x/"), "/x/y", "Googlebot"),
    false,
  );
  assert.equal(
    isPathAllowed(parseRobots("User-agent: googlebot/1.2\nDisallow: /x/"), "/x/y", "Googlebot/2.1"),
    false,
  );
});

test("the direct-run guard fires even when the script path holds a space or #", () => {
  // The naive `file://${argv[1]}` guard never equals `import.meta.url` when the
  // path holds a space or `#`, so `node`-invoked runs exited 0 having verified
  // nothing. `pathToFileURL` percent-encodes both, so the guard matches.
  const url = "file:///tmp/verify%23guard%20x/verify-indexing.mjs";
  assert.equal(isDirectRun(url, "/tmp/verify#guard x/verify-indexing.mjs"), true);
  assert.equal(isDirectRun("file:///repo/scripts/verify-indexing.mjs", "/repo/scripts/verify-indexing.mjs"), true);
  assert.equal(isDirectRun(url, undefined), false);
  assert.equal(isDirectRun(url, ""), false);
  assert.equal(isDirectRun("file:///repo/scripts/other.mjs", "/repo/scripts/verify-indexing.mjs"), false);
});

test("the IndexNow key is read by name==body, never by filename order (#309)", () => {
  // `submit-indexnow.mjs` was fixed to delegate to `readIndexNowKey`, but this
  // verifier kept picking the key with `entries.find()` — the alphabetically
  // first shape-matching `.txt`. A second such file (e.g. `security.txt`) would
  // then be checked against its own body, and since the tool fetches the file it
  // *chose*, a wrong-but-consistent pair reports a **false PASS**. Pin the shared
  // helper so the two IndexNow call sites cannot drift apart again.
  const source = readFileSync(
    new URL("./verify-indexing.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /import \{ readIndexNowKey \} from "\.\/indexnow-key\.mjs"/,
    "verify-indexing.mjs must delegate key selection to readIndexNowKey",
  );
  assert.doesNotMatch(
    source,
    /entries\.find\(/,
    "verify-indexing.mjs must not select the key by filename order",
  );
});
