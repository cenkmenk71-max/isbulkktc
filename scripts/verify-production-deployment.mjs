#!/usr/bin/env node
// Verifies that a production deployment is actually live and serving the commit
// that was just pushed. Vercel's Git integration deploys `main` on push, but a
// build can fail, an alias can stay pinned to the previous deployment, or the
// app can boot and then error at request time — and none of that turns CI red.
// This guard closes that gap: it polls the live site's build identity until the
// expected commit is served, then smoke-tests the public routes.
//
// Usage:
//   node scripts/verify-production-deployment.mjs --expect <sha> [--url <origin>]
//
// Environment:
//   VERCEL_TOKEN        optional; when set, also confirms the production alias
//                       points at a deployment built from the expected commit
//   VERCEL_TEAM_SLUG    optional; default "orijin1"
//   VERCEL_PROJECT      optional; default "isbulkktc"
//   DEPLOY_TIMEOUT_SEC  optional; how long to wait for the commit (default 900)
//   DEPLOY_POLL_SEC     optional; seconds between polls (default 20)
//
// Exits non-zero when the commit never appears, a route is unhealthy, or the
// alias points elsewhere. Writes a Markdown summary when GITHUB_STEP_SUMMARY is set.

import { appendFile } from "node:fs/promises";

const API = "https://api.vercel.com";

/** Routes every deploy must serve with a 2xx. Cheap, public, and stable.
 * The default locale (`tr`) is unprefixed under `localePrefix: "as-needed"`, so
 * `/jobs` is the canonical path — `/tr/jobs` would 308-redirect and, followed or
 * not, tells us nothing new. One non-default locale is included so the intl
 * routing layer is exercised too. */
export const SMOKE_ROUTES = ["/", "/jobs", "/companies", "/contact", "/en"];

/** The build identity a deployment reports through `/api/build-info`. */
export function buildInfoMatches(expectedCommit, body) {
  const expected = normalizeCommit(expectedCommit);
  if (!expected) return { ok: false, reason: "no expected commit provided" };
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "build-info returned no JSON object" };
  }
  const actual = normalizeCommit(body.commit);
  if (!actual || actual === "unknown") {
    return { ok: false, reason: "deployment does not report a commit yet" };
  }
  // Either side may be the abbreviated form, so accept a prefix match.
  const matches = actual.startsWith(expected) || expected.startsWith(actual);
  if (!matches) {
    return { ok: false, reason: `serving ${actual.slice(0, 8)}, expected ${expected.slice(0, 8)}` };
  }
  return { ok: true, reason: `serving ${actual.slice(0, 8)}` };
}

/** Lower-case, trim, and require at least 7 hex characters to be meaningful. */
export function normalizeCommit(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(trimmed) ? trimmed : "";
}

/** Aggregate per-route HTTP results into an overall pass/fail verdict. */
export function summarizeSmokeResults(results) {
  const failed = results.filter((result) => !result.ok);
  return {
    ok: failed.length === 0,
    passed: results.length - failed.length,
    failed,
  };
}

/** A route is healthy only on a 2xx with a non-trivial body. */
export function evaluateRouteResponse(route, status, bodyLength) {
  if (status < 200 || status >= 300) {
    return { route, ok: false, reason: `HTTP ${status}` };
  }
  if (!Number.isFinite(bodyLength) || bodyLength < 100) {
    return { route, ok: false, reason: `body too small (${bodyLength} bytes)` };
  }
  return { route, ok: true, reason: `HTTP ${status}` };
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  return { status: response.status, body };
}

async function waitForCommit(origin, expectedCommit, timeoutSec, pollSec) {
  const deadline = Date.now() + timeoutSec * 1000;
  let last = { ok: false, reason: "no attempt made" };
  for (;;) {
    try {
      const { status, body } = await fetchJson(`${origin}/api/build-info`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (status === 200) {
        last = buildInfoMatches(expectedCommit, body);
        if (last.ok) return last;
      } else {
        last = { ok: false, reason: `build-info HTTP ${status}` };
      }
    } catch (error) {
      last = { ok: false, reason: `request failed: ${error.message}` };
    }
    if (Date.now() >= deadline) return { ...last, timedOut: true };
    console.log(`  waiting: ${last.reason} (retrying in ${pollSec}s)`);
    await sleep(pollSec);
  }
}

async function smokeTest(origin) {
  const results = [];
  for (const route of SMOKE_ROUTES) {
    try {
      const response = await fetch(`${origin}${route}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      const body = await response.text();
      results.push(evaluateRouteResponse(route, response.status, body.length));
    } catch (error) {
      results.push({ route, ok: false, reason: `request failed: ${error.message}` });
    }
  }
  return results;
}

// Confirms the production alias resolves to a deployment whose commit matches.
// Vercel reports `meta.githubCommitSha` on the deployment the alias serves.
async function verifyAliasCommit(token, teamSlug, projectName, expectedCommit) {
  const teams = await fetchJson(`${API}/v2/teams?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const team = (teams.body?.teams ?? []).find((entry) => entry.slug === teamSlug);
  if (!team) return { ok: false, reason: `no team with slug "${teamSlug}"` };

  const project = await fetchJson(
    `${API}/v9/projects/${encodeURIComponent(projectName)}?teamId=${team.id}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const liveUid = project.body?.targets?.production?.id;
  if (!liveUid) return { ok: false, reason: "project has no production target" };

  const detail = await fetchJson(
    `${API}/v13/deployments/${liveUid}?teamId=${team.id}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const actual = normalizeCommit(detail.body?.meta?.githubCommitSha);
  const expected = normalizeCommit(expectedCommit);
  if (actual && expected && actual === expected) {
    return { ok: true, reason: `alias ${liveUid} built from ${actual.slice(0, 8)}` };
  }
  return {
    ok: false,
    reason: `alias ${liveUid} built from ${actual ? actual.slice(0, 8) : "unknown"}, expected ${expected.slice(0, 8)}`,
  };
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const expectedCommit = argValue("--expect") ?? process.env.GITHUB_SHA;
  const origin = (
    argValue("--url") ??
    process.env.PRODUCTION_URL ??
    "https://isbulkktc.com"
  ).replace(/\/$/, "");
  const timeoutSec = Number.parseInt(
    process.env.DEPLOY_TIMEOUT_SEC ?? "900",
    10,
  );
  const pollSec = Number.parseInt(process.env.DEPLOY_POLL_SEC ?? "20", 10);

  if (!normalizeCommit(expectedCommit)) {
    throw new Error(
      "No commit to verify. Pass --expect <sha> or set GITHUB_SHA.",
    );
  }

  console.log(`Verifying ${origin} serves ${expectedCommit.slice(0, 8)}…`);
  const commitCheck = await waitForCommit(
    origin,
    expectedCommit,
    timeoutSec,
    pollSec,
  );

  const summary = [
    "## Production deploy verification",
    "",
    `- origin: \`${origin}\``,
    `- expected commit: \`${expectedCommit.slice(0, 8)}\``,
    `- build identity: ${commitCheck.ok ? "✅" : "❌"} ${commitCheck.reason}`,
  ];

  const failures = [];
  if (!commitCheck.ok) {
    failures.push(`build identity: ${commitCheck.reason}`);
  }

  let smoke = { ok: false, passed: 0, failed: [] };
  if (commitCheck.ok) {
    const results = await smokeTest(origin);
    smoke = summarizeSmokeResults(results);
    summary.push(
      `- smoke routes: ${smoke.ok ? "✅" : "❌"} ${smoke.passed}/${results.length} healthy`,
    );
    for (const result of results) {
      summary.push(`  - \`${result.route}\`: ${result.reason}`);
    }
    for (const failure of smoke.failed) {
      failures.push(`route ${failure.route}: ${failure.reason}`);
    }
  } else {
    summary.push("- smoke routes: skipped (build identity not confirmed)");
  }

  const token = process.env.VERCEL_TOKEN;
  if (token && commitCheck.ok) {
    const alias = await verifyAliasCommit(
      token,
      process.env.VERCEL_TEAM_SLUG ?? "orijin1",
      process.env.VERCEL_PROJECT ?? "isbulkktc",
      expectedCommit,
    );
    summary.push(`- production alias: ${alias.ok ? "✅" : "❌"} ${alias.reason}`);
    if (!alias.ok) failures.push(`alias: ${alias.reason}`);
  }

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    await appendFile(summaryFile, `${summary.join("\n")}\n`);
  }
  console.log(summary.join("\n"));

  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("\nProduction is serving the expected commit.");
  }
}

// Only run when invoked directly, so the pure helpers stay importable in tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
