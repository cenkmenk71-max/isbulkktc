import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyInspection,
  classifySitemaps,
  hasProperty,
  isDirectRun,
  parseArgs,
  sampleLocs,
  siteEndpoint,
  sitemapLocs,
  summariseAnalytics,
  windowEnd,
  windowStart,
} from "./verify-search-console.mjs";

const SITE = "sc-domain:isbulkktc.com";

test("parseArgs defaults to the domain property and a 28-day window", () => {
  const args = parseArgs([], { SEARCH_CONSOLE_NOW: "2026-11-12T08:00:00Z" });
  assert.equal(args.site, SITE);
  assert.equal(args.origin, "https://isbulkktc.com");
  assert.equal(args.sample, 6);
  assert.equal(args.days, 28);
});

test("parseArgs reads --site, --origin, --sample and --days and trims a trailing slash", () => {
  const args = parseArgs(
    ["--site", "https://example.com/", "--origin", "https://example.com/", "--sample", "3", "--days", "7"],
    {},
  );
  assert.equal(args.site, "https://example.com/");
  assert.equal(args.origin, "https://example.com");
  assert.equal(args.sample, 3);
  assert.equal(args.days, 7);
});

test("parseArgs falls back to the defaults when a numeric flag is not a number", () => {
  const args = parseArgs(["--sample", "many", "--days", "0"], {});
  assert.equal(args.sample, 6);
  assert.equal(args.days, 28);
});

test("parseArgs lets the sitemap be read from a different origin than the inspected one", () => {
  const args = parseArgs([], { SEARCH_CONSOLE_SITEMAP_ORIGIN: "https://isbulkktc-amber.vercel.app" });
  assert.equal(args.origin, "https://isbulkktc.com");
  assert.equal(args.sitemapOrigin, "https://isbulkktc-amber.vercel.app");
  // Without an override the sitemap is read from the canonical origin.
  assert.equal(parseArgs([], {}).sitemapOrigin, "https://isbulkktc.com");
});

test("siteEndpoint percent-encodes the site so a domain property resolves", () => {
  assert.equal(
    siteEndpoint("https://searchconsole.googleapis.com/webmasters/v3/sites", SITE, "/sitemaps"),
    "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aisbulkktc.com/sitemaps",
  );
});

test("hasProperty matches a domain and a URL-prefix property exactly", () => {
  const sites = [
    { siteUrl: "sc-domain:isbulkktc.com", permissionLevel: "siteOwner" },
    { siteUrl: "https://isbulkktc.com/", permissionLevel: "siteFullUser" },
  ];
  assert.equal(hasProperty(sites, "sc-domain:isbulkktc.com"), true);
  assert.equal(hasProperty(sites, "https://isbulkktc.com/"), true);
  // A different property must not be accepted just because it shares a substring.
  assert.equal(hasProperty(sites, "sc-domain:example.com"), false);
  assert.equal(hasProperty(undefined, SITE), false);
});

test("windowStart and windowEnd produce UTC dates", () => {
  const now = new Date("2026-11-12T08:00:00Z");
  assert.equal(windowEnd(now), "2026-11-12");
  assert.equal(windowStart(now, 28), "2026-10-15");
});

test("classifySitemaps passes a downloaded sitemap with no errors or warnings", () => {
  const verdict = classifySitemaps([
    {
      path: "https://isbulkktc.com/sitemap.xml",
      lastDownloaded: "2026-11-12T12:56:40Z",
      errors: "0",
      warnings: "0",
      contents: [{ type: "web", submitted: "207" }],
    },
  ]);
  assert.equal(verdict.state, "ok");
  assert.match(verdict.detail, /207/);
});

test("classifySitemaps treats a submitted-but-never-downloaded sitemap as pending, not ok", () => {
  const verdict = classifySitemaps([{ path: "https://isbulkktc.com/sitemap.xml", errors: "0", warnings: "0" }]);
  assert.equal(verdict.state, "pending");
});

test("classifySitemaps fails on errors and warns on warnings, naming the file", () => {
  const errored = classifySitemaps([{ path: "https://isbulkktc.com/sitemap.xml", errors: "2", warnings: "0" }]);
  assert.equal(errored.state, "problem");
  assert.match(errored.detail, /2 error/);
  const warned = classifySitemaps([{ path: "https://isbulkktc.com/sitemap.xml", errors: "0", warnings: "1" }]);
  assert.equal(warned.state, "problem");
  assert.match(warned.detail, /1 warning/);
});

test("classifySitemaps reports a missing sitemap distinctly", () => {
  assert.equal(classifySitemaps([]).state, "missing");
  assert.equal(classifySitemaps(undefined).state, "missing");
});

test("classifyInspection passes a submitted-and-indexed page with a matching canonical", () => {
  const verdict = classifyInspection({
    indexStatusResult: {
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      robotsTxtState: "ALLOWED",
      indexingState: "INDEXING_ALLOWED",
      googleCanonical: "https://isbulkktc.com/",
      userCanonical: "https://isbulkktc.com/",
    },
  });
  assert.equal(verdict.state, "pass");
});

test("classifyInspection fails when Google's canonical differs from the page's", () => {
  const verdict = classifyInspection({
    indexStatusResult: {
      verdict: "PASS",
      coverageState: "Duplicate, Google chose different canonical",
      googleCanonical: "https://isbulkktc.com/tr/jobs/x",
      userCanonical: "https://isbulkktc.com/jobs/x",
    },
  });
  assert.equal(verdict.state, "fail");
  assert.match(verdict.detail, /chose .*tr\/jobs/);
});

test("classifyInspection fails on a disallowed or blocked page even when the verdict is not FAIL", () => {
  const disallowed = classifyInspection({
    indexStatusResult: { verdict: "PASS", coverageState: "Excluded", robotsTxtState: "DISALLOWED" },
  });
  assert.equal(disallowed.state, "fail");
  const blocked = classifyInspection({
    indexStatusResult: { verdict: "NEUTRAL", coverageState: "Blocked", indexingState: "BLOCKED" },
  });
  assert.equal(blocked.state, "fail");
});

test("classifyInspection warns, never fails, on a URL Google does not know yet", () => {
  const verdict = classifyInspection({
    indexStatusResult: { verdict: "NEUTRAL", coverageState: "URL is unknown to Google" },
  });
  assert.equal(verdict.state, "warn");
  assert.match(verdict.detail, /unknown/);
});

test("classifyInspection tolerates a trailing slash difference in the canonical", () => {
  const verdict = classifyInspection({
    indexStatusResult: {
      verdict: "PASS",
      coverageState: "Submitted and indexed",
      googleCanonical: "https://isbulkktc.com/jobs/x/",
      userCanonical: "https://isbulkktc.com/jobs/x",
    },
  });
  assert.equal(verdict.state, "pass");
});

test("summariseAnalytics sums clicks and impressions and weights position by impressions", () => {
  const summary = summariseAnalytics([
    { clicks: 3, impressions: 10, position: 5 },
    { clicks: 1, impressions: 30, position: 10 },
  ]);
  assert.equal(summary.clicks, 4);
  assert.equal(summary.impressions, 40);
  assert.equal(summary.ctr, 0.1);
  // (5*10 + 10*30) / 40 = 8.75
  assert.equal(summary.position, 8.75);
});

test("summariseAnalytics is safe on an empty response", () => {
  const summary = summariseAnalytics(undefined);
  assert.deepEqual(summary, { rows: 0, clicks: 0, impressions: 0, ctr: 0, position: 0 });
});

test("sampleLocs always includes the home page and spreads across the list", () => {
  const locs = Array.from({ length: 20 }, (_, i) => `https://isbulkktc.com/p${i}`);
  const picked = sampleLocs(locs, 4);
  assert.equal(picked.length, 4);
  assert.equal(picked[0], locs[0]);
  // Not the first four: the sample must reach beyond the most likely-to-pass URLs.
  assert.notDeepEqual(picked, locs.slice(0, 4));
});

test("sampleLocs returns the whole list when it is smaller than the sample", () => {
  assert.deepEqual(sampleLocs(["a", "b"], 6), ["a", "b"]);
  assert.deepEqual(sampleLocs([], 6), []);
});

test("sitemapLocs extracts and XML-decodes every <loc>", () => {
  const xml = `<urlset>
    <url><loc>https://isbulkktc.com/jobs/a?x=1&amp;y=2</loc></url>
    <url><loc>https://isbulkktc.com/jobs/b</loc></url>
  </urlset>`;
  assert.deepEqual(sitemapLocs(xml), ["https://isbulkktc.com/jobs/a?x=1&y=2", "https://isbulkktc.com/jobs/b"]);
});

test("isDirectRun matches only the launched script", () => {
  const url = "file:///repo/scripts/verify-search-console.mjs";
  assert.equal(isDirectRun(url, "/repo/scripts/verify-search-console.mjs"), true);
  assert.equal(isDirectRun(url, undefined), false);
  assert.equal(isDirectRun(url, "/repo/scripts/other.mjs"), false);
});
