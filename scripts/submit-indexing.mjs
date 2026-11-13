#!/usr/bin/env node
// Notifies Google's Indexing API about the site's JobPosting URLs.
//
// Why only job URLs: Google's Indexing API is documented to accept only
// `JobPosting` and `BroadcastEvent` pages. Sending other pages is accepted with
// HTTP 200 but has no documented effect, so this script filters the sitemap to
// the `/jobs/<slug>` detail pages (the ones that carry a `JobPosting` JSON-LD
// block) and never spends quota on anything else. It is additive to the
// sitemap: the sitemap remains the source of truth, and the Indexing API only
// shortens discovery time for new vacancies.
//
// Credentials: a short-lived `GOOGLE_ACCESS_TOKEN` (one-off run) or a
// `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN` triple (a
// scheduled run). With none set the script prints a notice and exits 0, so the
// scheduled workflow stays green until the owner adds the secret — the same
// contract as the IndexNow and push-dispatch jobs.
//
// Usage:
//   node scripts/submit-indexing.mjs
//   node scripts/submit-indexing.mjs --origin https://isbulkktc.com
//   node scripts/submit-indexing.mjs --limit 50
//   node scripts/submit-indexing.mjs --dry-run

import { pathToFileURL } from "node:url";

import {
  describeGoogleAuth,
  getAccessToken,
  hasScope,
  inspectAccessToken,
  resolveGoogleAuth,
} from "./google-auth.mjs";

const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const PUBLISH_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish";
// Google's default daily quota for the Indexing API is 200 URLs. The cap keeps a
// single run inside it even if the sitemap grows; the remainder is picked up on
// the next run, and the sitemap covers the rest regardless.
const DEFAULT_LIMIT = 200;

/** True when the module was launched directly, not imported by a test. */
export function isDirectRun(moduleUrl, argv1) {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}

/**
 * Whether a URL is a job-detail page the Indexing API accepts. Google documents
 * `JobPosting` as the supported type and the site serves those under
 * `/jobs/<slug>` (with the locale prefix, e.g. `/en/jobs/<slug>`); the list page
 * `/jobs` itself carries no JobPosting, so it is excluded. A slug is required —
 * the bare list route is not a job posting.
 */
export function isJobPostingUrl(url, origin) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.origin !== new URL(origin).origin) return false;
  // `/jobs/<slug>` with an optional non-default locale prefix. The default
  // locale is unprefixed (`localePrefix: "as-needed"`), so `/tr/jobs/...` never
  // appears in the sitemap and need not be matched.
  return /^\/(?:[a-z]{2}\/)?jobs\/[^/]+$/.test(parsed.pathname);
}

/** Extracts the `<loc>` values from a sitemap document, XML-decoded. */
export function sitemapLocs(xml) {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1].replace(/&amp;/g, "&").trim(),
  );
}

/** The job URLs from a sitemap, in sitemap order, capped at `limit`. */
export function selectJobUrls(locs, origin, limit = DEFAULT_LIMIT) {
  const jobs = locs.filter((loc) => isJobPostingUrl(loc, origin));
  return limit > 0 ? jobs.slice(0, limit) : jobs;
}

/**
 * Classifies one publish response. The API answers 200 with a metadata body on
 * success; 429 means the daily quota is spent (stop, do not retry — the sitemap
 * still covers discovery); 403 is almost always a missing scope or a property
 * the credential does not own; anything else is a per-URL failure.
 */
export function classifyPublish(status, body = {}) {
  if (status === 200 && body.urlNotificationMetadata) return { ok: true, state: "notified" };
  if (status === 429) return { ok: false, state: "quota", reason: "daily quota exhausted" };
  if (status === 403) {
    return { ok: false, state: "forbidden", reason: body.error?.message ?? "the credential lacks the indexing scope or does not own the property" };
  }
  return { ok: false, state: "failed", reason: body.error?.message ?? `HTTP ${status}` };
}

/**
 * Parses the CLI flags this script accepts. Kept pure so a test can pin the
 * `--limit` and `--dry-run` handling without spawning a process.
 */
export function parseArgs(argv, env = process.env) {
  const origin = argv.includes("--origin")
    ? argv[argv.indexOf("--origin") + 1]
    : "https://isbulkktc.com";
  const limitRaw = argv.includes("--limit") ? argv[argv.indexOf("--limit") + 1] : undefined;
  const limit = limitRaw === undefined ? DEFAULT_LIMIT : Number.parseInt(limitRaw, 10);
  return {
    origin,
    // The canonical host sits behind Cloudflare, whose bot protection challenges
    // datacenter egress such as GitHub's runners, so the sitemap is read from the
    // Vercel alias while the submitted URLs stay canonical. Same trick as
    // submit-indexnow.mjs.
    sitemapOrigin: env.INDEXING_SITEMAP_ORIGIN ?? origin,
    limit: Number.isFinite(limit) ? limit : DEFAULT_LIMIT,
    dryRun: argv.includes("--dry-run"),
  };
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function main() {
  const { origin, sitemapOrigin, limit, dryRun } = parseArgs(process.argv.slice(2));
  const auth = resolveGoogleAuth();
  console.log(`Google Indexing API submission for ${origin}`);
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
  if (!info.valid) {
    throw new Error(`The Google access token is not usable: ${info.error}`);
  }
  if (!hasScope(info.scopes, INDEXING_SCOPE)) {
    throw new Error(
      `The credential lacks ${INDEXING_SCOPE} (has: ${info.scopes.join(", ") || "none"}). ` +
        "Re-consent with the indexing scope.",
    );
  }

  const sitemapResponse = await fetch(new URL("/sitemap.xml", sitemapOrigin));
  if (!sitemapResponse.ok) {
    throw new Error(`Sitemap answered ${sitemapResponse.status} from ${sitemapOrigin}.`);
  }
  const locs = sitemapLocs(await sitemapResponse.text());
  const jobUrls = selectJobUrls(locs, origin, limit);
  if (jobUrls.length === 0) {
    console.log(`\nThe sitemap advertised ${locs.length} URLs but no job-detail pages. Nothing to submit.`);
    return;
  }
  console.log(`\n${jobUrls.length} job URL(s) selected from ${locs.length} sitemap entries.`);

  if (dryRun) {
    for (const url of jobUrls) console.log(`  would notify ${url}`);
    console.log("\nDry run — nothing sent.");
    return;
  }

  let notified = 0;
  const failures = [];
  for (const url of jobUrls) {
    const { status, body } = await fetchJson(PUBLISH_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
    });
    const verdict = classifyPublish(status, body);
    if (verdict.ok) {
      notified += 1;
      continue;
    }
    if (verdict.state === "quota") {
      console.log(`\nStopped after ${notified} notification(s): ${verdict.reason}. The sitemap still covers discovery.`);
      break;
    }
    failures.push(`${url}: ${verdict.reason}`);
    if (verdict.state === "forbidden") break;
  }

  console.log(`\nNotified ${notified}/${jobUrls.length} job URL(s).`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures.slice(0, 10)) console.error(`  ${failure}`);
    process.exitCode = 1;
  }
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
