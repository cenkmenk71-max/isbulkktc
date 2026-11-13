#!/usr/bin/env node
// Reads the Search Console state of the deployed site through the Google
// Search Console API, so the "is it indexed, and did the sitemap land?" question
// is answered by the same source Google answers it with — not by a `site:`
// guess, which is only a rough signal and cannot tell a not-yet-crawled URL from
// an excluded one.
//
// It reports four things:
//
//   1. Properties — the Search Console properties the credential can read, and
//      its permission level on each. A missing property means the credential is
//      pointed at the wrong account, which no other check would reveal.
//   2. Sitemaps — submitted, last downloaded, and the per-type error/warning
//      counts. A sitemap that was submitted but never downloaded is a real
//      finding, not a pass.
//   3. Coverage — a URL-inspection verdict per sampled URL: Google's index
//      verdict, the robots and indexing states, and whether Google's canonical
//      matches the one the page declares. Disagreement is the one thing a
//      sitemap check cannot see.
//   4. Search analytics — clicks, impressions and position over the window, so
//      the run records what the site is actually getting rather than only that
//      it is technically reachable.
//
// Credentials: `GOOGLE_ACCESS_TOKEN` (a one-off run) or the
// `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN` triple (a
// scheduled run). With none set the script prints a notice and exits 0, so a
// scheduled job stays green until the owner adds the secret — the same contract
// as `submit-indexing.mjs` and `push-dispatch.yml`.
//
// Usage:
//   node scripts/verify-search-console.mjs
//   node scripts/verify-search-console.mjs --site sc-domain:example.com
//   node scripts/verify-search-console.mjs --sample 12 --days 28

import { pathToFileURL } from "node:url";

import {
  describeGoogleAuth,
  getAccessToken,
  hasScope,
  inspectAccessToken,
  resolveGoogleAuth,
} from "./google-auth.mjs";

const WEBMASTERS_SCOPE = "https://www.googleapis.com/auth/webmasters";
const SITES_ENDPOINT = "https://searchconsole.googleapis.com/webmasters/v3/sites";
const DEFAULT_SITE = "sc-domain:isbulkktc.com";
const DEFAULT_ORIGIN = "https://isbulkktc.com";
const DEFAULT_SAMPLE = 6;
const DEFAULT_DAYS = 28;

/** True when the module was launched directly, not imported by a test. */
export function isDirectRun(moduleUrl, argv1) {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}

/**
 * Parses the CLI flags. Kept pure so a test can pin the defaults and the
 * `--sample`/`--days` handling without spawning a process.
 */
export function parseArgs(argv, env = process.env) {
  const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const sample = Number.parseInt(value("--sample") ?? String(DEFAULT_SAMPLE), 10);
  const days = Number.parseInt(value("--days") ?? String(DEFAULT_DAYS), 10);
  return {
    site: value("--site") ?? env.SEARCH_CONSOLE_SITE ?? DEFAULT_SITE,
    origin: (value("--origin") ?? env.SEARCH_CONSOLE_ORIGIN ?? DEFAULT_ORIGIN).replace(/\/$/, ""),
    // The canonical host sits behind Cloudflare, whose bot protection challenges
    // datacenter egress such as GitHub's runners. The sitemap can be read from
    // the Vercel alias instead while the inspected URLs stay canonical. Same
    // trick as submit-indexing.mjs.
    sitemapOrigin: (value("--sitemap-origin") ?? env.SEARCH_CONSOLE_SITEMAP_ORIGIN ?? value("--origin") ?? env.SEARCH_CONSOLE_ORIGIN ?? DEFAULT_ORIGIN).replace(/\/$/, ""),
    sample: Number.isFinite(sample) && sample > 0 ? sample : DEFAULT_SAMPLE,
    days: Number.isFinite(days) && days > 0 ? days : DEFAULT_DAYS,
    now: env.SEARCH_CONSOLE_NOW ? new Date(env.SEARCH_CONSOLE_NOW) : new Date(),
  };
}

/** The API URL for one site's resource, with the site URL percent-encoded. */
export function siteEndpoint(base, site, suffix = "") {
  return `${base}/${encodeURIComponent(site)}${suffix}`;
}

/**
 * True when `site` is one of the properties the credential can read. Both a
 * domain property (`sc-domain:example.com`) and a URL-prefix property
 * (`https://example.com/`) are valid; the check is exact because Search Console
 * treats them as distinct resources.
 */
export function hasProperty(sites, site) {
  return Array.isArray(sites) && sites.some((entry) => entry.siteUrl === site);
}

/** The `YYYY-MM-DD` date `days` before `now`, in UTC. */
export function windowStart(now, days) {
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 10);
}

/** The `YYYY-MM-DD` date of `now`, in UTC. */
export function windowEnd(now) {
  return now.toISOString().slice(0, 10);
}

/**
 * Summarises the sitemap list into a verdict. A sitemap that was submitted but
 * never downloaded is reported as `pending`, not `ok`: Search Console accepted
 * the file but Google has not read it, so counting it as a pass would hide the
 * exact failure the check exists to catch. Errors and warnings are named when
 * present; a sitemap with neither is `ok`.
 */
export function classifySitemaps(sitemaps) {
  const list = Array.isArray(sitemaps) ? sitemaps : [];
  if (list.length === 0) {
    return { state: "missing", detail: "no sitemap is registered for this property" };
  }
  const problems = [];
  let pending = 0;
  let lastDownloaded = null;
  for (const sitemap of list) {
    const errors = Number.parseInt(sitemap.errors ?? "0", 10) || 0;
    const warnings = Number.parseInt(sitemap.warnings ?? "0", 10) || 0;
    if (errors > 0) problems.push(`${sitemap.path}: ${errors} error(s)`);
    else if (warnings > 0) problems.push(`${sitemap.path}: ${warnings} warning(s)`);
    if (!sitemap.lastDownloaded) pending += 1;
    else if (!lastDownloaded || sitemap.lastDownloaded > lastDownloaded) {
      lastDownloaded = sitemap.lastDownloaded;
    }
  }
  if (problems.length > 0) {
    return { state: "problem", detail: problems.join("; "), lastDownloaded };
  }
  if (pending > 0) {
    return {
      state: "pending",
      detail: `${pending} sitemap(s) submitted but not yet downloaded by Google`,
      lastDownloaded,
    };
  }
  const urls = list.reduce((total, sitemap) => {
    const submitted = Number.parseInt(sitemap.contents?.[0]?.submitted ?? "0", 10) || 0;
    return total + submitted;
  }, 0);
  return {
    state: "ok",
    detail: `${list.length} sitemap(s), ${urls} submitted URL(s), last downloaded ${lastDownloaded ?? "unknown"}`,
    lastDownloaded,
  };
}

/**
 * Turns one URL-inspection result into a verdict. The important comparison is
 * the canonical: when Google picks a canonical other than the one the page
 * declares, the page competes with a URL the site never intended to promote.
 * `NEUTRAL` ("URL is unknown to Google") is a `warn`, not a `fail` — a URL that
 * was just published is legitimately not indexed yet, and the Indexing API is
 * the tool for that, not a red build.
 */
export function classifyInspection(result) {
  const index = result?.indexStatusResult ?? {};
  const verdict = index.verdict ?? "VERDICT_UNSPECIFIED";
  const coverage = index.coverageState ?? "unknown";
  const googleCanonical = index.googleCanonical ?? null;
  const userCanonical = index.userCanonical ?? null;
  const robots = index.robotsTxtState ?? null;
  const indexing = index.indexingState ?? null;

  const canonicalMismatch =
    Boolean(googleCanonical && userCanonical) &&
    googleCanonical.replace(/\/$/, "") !== userCanonical.replace(/\/$/, "");

  if (verdict === "FAIL" || robots === "DISALLOWED" || indexing === "BLOCKED") {
    return { state: "fail", detail: `${coverage} (robots ${robots ?? "?"}, indexing ${indexing ?? "?"})` };
  }
  if (canonicalMismatch) {
    return { state: "fail", detail: `Google chose ${googleCanonical}, the page declares ${userCanonical}` };
  }
  if (verdict === "PASS") {
    return { state: "pass", detail: `${coverage}; canonical ${googleCanonical ?? userCanonical ?? "n/a"}` };
  }
  if (verdict === "NEUTRAL" || verdict === "VERDICT_UNSPECIFIED") {
    return { state: "warn", detail: `${coverage} (not indexed yet — expected for a new URL)` };
  }
  return { state: "warn", detail: `${verdict}: ${coverage}` };
}

/** Sums the clicks and impressions of a search-analytics response. */
export function summariseAnalytics(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let clicks = 0;
  let impressions = 0;
  let positionWeighted = 0;
  for (const row of list) {
    const rowClicks = Number(row.clicks) || 0;
    const rowImpressions = Number(row.impressions) || 0;
    clicks += rowClicks;
    impressions += rowImpressions;
    positionWeighted += (Number(row.position) || 0) * rowImpressions;
  }
  return {
    rows: list.length,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? positionWeighted / impressions : 0,
  };
}

/**
 * Picks up to `size` sitemap URLs to inspect, evenly spaced and always
 * including the first (the home page, which should always be indexed). Kept
 * pure and exported so the sampling cannot silently become "the first N", which
 * would only ever inspect the pages most likely to pass.
 */
export function sampleLocs(locs, size) {
  const list = Array.isArray(locs) ? locs : [];
  if (list.length === 0) return [];
  if (list.length <= size) return [...list];
  const step = Math.max(1, Math.floor(list.length / size));
  const picked = [];
  for (let i = 0; i < list.length && picked.length < size; i += step) {
    picked.push(list[i]);
  }
  return picked;
}

/** Extracts the `<loc>` values from a sitemap document, XML-decoded. */
export function sitemapLocs(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1].replace(/&amp;/g, "&").trim(),
  );
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function main() {
  const { site, origin, sitemapOrigin, sample, days, now } = parseArgs(process.argv.slice(2));
  const auth = resolveGoogleAuth();
  console.log(`Search Console audit for ${site}`);
  console.log(`Credential: ${describeGoogleAuth(auth)}`);

  if (auth.mode === "unconfigured") {
    console.log(
      "\nNot configured — set GOOGLE_ACCESS_TOKEN (one-off) or GOOGLE_CLIENT_ID + " +
        "GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (scheduled) to enable this job. Skipping.",
    );
    return;
  }

  const accessToken = await getAccessToken(auth);
  const info = await inspectAccessToken(accessToken);
  if (!info.valid) throw new Error(`The Google access token is not usable: ${info.error}`);
  if (!hasScope(info.scopes, WEBMASTERS_SCOPE)) {
    throw new Error(
      `The credential lacks ${WEBMASTERS_SCOPE} (has: ${info.scopes.join(", ") || "none"}).`,
    );
  }
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  let failures = 0;

  const sites = await fetchJson(SITES_ENDPOINT, { headers });
  const entries = sites.body.siteEntry ?? [];
  if (!hasProperty(entries, site)) {
    console.log(`\n  FAIL properties  ${site} is not among the readable properties`);
    failures += 1;
  } else {
    const level = entries.find((entry) => entry.siteUrl === site).permissionLevel;
    console.log(`\n  PASS properties  ${site} (${level}); ${entries.length} propert(y/ies) readable`);
  }

  const sitemaps = await fetchJson(siteEndpoint(SITES_ENDPOINT, site, "/sitemaps"), { headers });
  const sitemapVerdict = classifySitemaps(sitemaps.body.sitemap);
  const sitemapLabel = { ok: "PASS", problem: "FAIL", pending: "WARN", missing: "FAIL" }[sitemapVerdict.state];
  console.log(`  ${sitemapLabel} sitemaps    ${sitemapVerdict.detail}`);
  if (sitemapVerdict.state === "problem" || sitemapVerdict.state === "missing") failures += 1;

  const sitemapResponse = await fetch(`${sitemapOrigin}/sitemap.xml`);
  const locs = sitemapResponse.ok ? sitemapLocs(await sitemapResponse.text()) : [];
  const probes = sampleLocs(locs, sample);
  if (probes.length === 0) {
    console.log("  WARN inspection  no sitemap URLs to inspect (the sitemap was not reachable from here)");
  }
  for (const url of probes) {
    const { body } = await fetchJson("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      headers,
      body: JSON.stringify({ inspectionUrl: url, siteUrl: site }),
    });
    const verdict = classifyInspection(body.inspectionResult);
    const label = { pass: "PASS", warn: "WARN", fail: "FAIL" }[verdict.state];
    if (verdict.state === "fail") failures += 1;
    console.log(`  ${label} inspect     ${url.replace(origin, "") || "/"} — ${verdict.detail}`);
  }

  const analytics = await fetchJson(siteEndpoint(SITES_ENDPOINT, site, "/searchAnalytics/query"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      startDate: windowStart(now, days),
      endDate: windowEnd(now),
      dimensions: ["query"],
      rowLimit: 100,
    }),
  });
  const summary = summariseAnalytics(analytics.body.rows);
  console.log(
    `  INFO analytics   ${summary.rows} quer(y/ies) in the last ${days} day(s): ` +
      `${summary.clicks} click(s), ${summary.impressions} impression(s), ` +
      `CTR ${(summary.ctr * 100).toFixed(1)}%, avg position ${summary.position.toFixed(1)}`,
  );

  console.log(`\n${failures} failure(s)`);
  process.exitCode = failures > 0 ? 1 : 0;
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
