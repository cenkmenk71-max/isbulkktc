import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyPublish,
  isDirectRun,
  isJobPostingUrl,
  parseArgs,
  selectJobUrls,
  sitemapLocs,
} from "./submit-indexing.mjs";

const ORIGIN = "https://isbulkktc.com";

test("isJobPostingUrl accepts locale-prefixed job detail pages only", () => {
  assert.equal(isJobPostingUrl(`${ORIGIN}/jobs/waiter`, ORIGIN), true);
  assert.equal(isJobPostingUrl(`${ORIGIN}/en/jobs/waiter`, ORIGIN), true);
  assert.equal(isJobPostingUrl(`${ORIGIN}/de/jobs/source-acme-chef`, ORIGIN), true);
});

test("isJobPostingUrl rejects the list route, other pages and off-origin URLs", () => {
  // The list page carries no JobPosting JSON-LD, so it must not be submitted.
  assert.equal(isJobPostingUrl(`${ORIGIN}/jobs`, ORIGIN), false);
  assert.equal(isJobPostingUrl(`${ORIGIN}/en/jobs`, ORIGIN), false);
  assert.equal(isJobPostingUrl(`${ORIGIN}/jobs/waiter/extra`, ORIGIN), false);
  assert.equal(isJobPostingUrl(`${ORIGIN}/companies`, ORIGIN), false);
  assert.equal(isJobPostingUrl(`${ORIGIN}/blog/waiter`, ORIGIN), false);
  // A lookalike host must not pass: origin is compared exactly, not by prefix.
  assert.equal(isJobPostingUrl("https://isbulkktc.com.evil.example/jobs/x", ORIGIN), false);
  assert.equal(isJobPostingUrl("not a url", ORIGIN), false);
});

test("sitemapLocs extracts and XML-decodes every <loc>", () => {
  const xml = `<urlset>
    <url><loc>https://isbulkktc.com/jobs/a?x=1&amp;y=2</loc></url>
    <url><loc>https://isbulkktc.com/jobs/b</loc></url>
  </urlset>`;
  assert.deepEqual(sitemapLocs(xml), [
    "https://isbulkktc.com/jobs/a?x=1&y=2",
    "https://isbulkktc.com/jobs/b",
  ]);
});

test("selectJobUrls keeps only job detail pages, in sitemap order", () => {
  const locs = [
    `${ORIGIN}/`,
    `${ORIGIN}/jobs/a`,
    `${ORIGIN}/en/jobs/b`,
    `${ORIGIN}/jobs`,
    `${ORIGIN}/companies`,
  ];
  assert.deepEqual(selectJobUrls(locs, ORIGIN), [`${ORIGIN}/jobs/a`, `${ORIGIN}/en/jobs/b`]);
});

test("selectJobUrls caps the batch at the limit and treats 0 as unlimited", () => {
  const locs = Array.from({ length: 5 }, (_, i) => `${ORIGIN}/jobs/j${i}`);
  assert.equal(selectJobUrls(locs, ORIGIN, 2).length, 2);
  assert.equal(selectJobUrls(locs, ORIGIN, 0).length, 5);
});

test("classifyPublish reads success, quota and forbidden distinctly", () => {
  assert.deepEqual(classifyPublish(200, { urlNotificationMetadata: { url: "x" } }), {
    ok: true,
    state: "notified",
  });
  // 429 is the daily quota; the caller stops rather than retrying.
  assert.equal(classifyPublish(429, {}).state, "quota");
  const forbidden = classifyPublish(403, { error: { message: "scope" } });
  assert.equal(forbidden.state, "forbidden");
  assert.equal(forbidden.reason, "scope");
  // A 200 without the metadata body is not a success.
  assert.equal(classifyPublish(200, {}).ok, false);
});

test("classifyPublish falls back to the status when the body carries no message", () => {
  const verdict = classifyPublish(500, {});
  assert.equal(verdict.ok, false);
  assert.equal(verdict.state, "failed");
  assert.match(verdict.reason, /500/);
});

test("parseArgs defaults to the canonical origin and the daily quota cap", () => {
  const args = parseArgs([], {});
  assert.equal(args.origin, "https://isbulkktc.com");
  assert.equal(args.sitemapOrigin, "https://isbulkktc.com");
  assert.equal(args.limit, 200);
  assert.equal(args.dryRun, false);
});

test("parseArgs reads --origin, --limit and --dry-run", () => {
  const args = parseArgs(["--origin", "https://example.com", "--limit", "10", "--dry-run"], {});
  assert.equal(args.origin, "https://example.com");
  assert.equal(args.limit, 10);
  assert.equal(args.dryRun, true);
});

test("parseArgs lets the sitemap be read from a different origin than the submitted one", () => {
  const args = parseArgs([], { INDEXING_SITEMAP_ORIGIN: "https://isbulkktc-amber.vercel.app" });
  assert.equal(args.origin, "https://isbulkktc.com");
  assert.equal(args.sitemapOrigin, "https://isbulkktc-amber.vercel.app");
});

test("parseArgs falls back to the cap when --limit is not a number", () => {
  assert.equal(parseArgs(["--limit", "lots"], {}).limit, 200);
});

test("isDirectRun matches only the launched script, never a bare file:// path", () => {
  const url = "file:///repo/scripts/submit-indexing.mjs";
  assert.equal(isDirectRun(url, "/repo/scripts/submit-indexing.mjs"), true);
  // A path with a space must still match via pathToFileURL's encoding.
  const spaced = "file:///repo/a%20b/submit-indexing.mjs";
  assert.equal(isDirectRun(spaced, "/repo/a b/submit-indexing.mjs"), true);
  assert.equal(isDirectRun(url, undefined), false);
  assert.equal(isDirectRun(url, "/repo/scripts/other.mjs"), false);
});

// The workflow is the only thing that runs this script on a schedule, so it has
// to agree with the script on two points that fail silently otherwise: it must
// pass the canonical origin (not the Vercel alias, which would submit
// non-canonical URLs) and it must not require a secret that the script reads
// under a different name. Both are grep-level pins over the committed YAML.
const workflowYaml = readFileSync(
  new URL("../.github/workflows/submit-indexing.yml", import.meta.url),
  "utf8",
);

test("the indexing workflow submits the canonical origin, reading the sitemap from the alias", () => {
  // `--origin` must be the canonical host so the notified URLs match the
  // canonical sitemap entries; the alias is only the sitemap *read* source.
  assert.match(workflowYaml, /--origin https:\/\/isbulkktc\.com/);
  assert.match(workflowYaml, /INDEXING_SITEMAP_ORIGIN/);
});

test("the indexing workflow stays green when the credential is absent", () => {
  // The script exits 0 with a notice when unconfigured, so the workflow must
  // gate on the refresh token rather than run the script unconditionally and
  // fail — the same contract as submit-indexnow.yml.
  assert.match(workflowYaml, /GOOGLE_REFRESH_TOKEN/);
  assert.match(workflowYaml, /steps\.config\.outputs\.configured/);
});

test("the indexing workflow declares least-privilege permissions", () => {
  assert.match(workflowYaml, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(workflowYaml, /\bcontents: write\b/);
});
