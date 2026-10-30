#!/usr/bin/env node
// Verifies that a production deployment is actually live and serving the commit
// that was just pushed. Vercel's Git integration deploys `main` on push, but a
// build can fail, an alias can stay pinned to the previous deployment, or the
// app can boot and then error at request time — and none of that turns CI red.
//
// Two independent channels, either of which can confirm the deploy:
//
//   1. Vercel API (authoritative, needs VERCEL_TOKEN) — reads the deployment the
//      production alias currently points at (`targets.production.id`) and checks
//      its `meta.githubCommitSha`. This never touches the public origin, so it is
//      immune to edge/WAF behaviour.
//   2. HTTP build identity — polls `GET /api/build-info` on the live origin.
//
// Why both: the site sits behind Cloudflare, which answers requests from
// datacenter IP ranges (including GitHub-hosted runners) with **403**. That is
// not an outage, so a 403 on the HTTP channel is treated as "blocked", never as
// a failure — the Vercel API channel carries the verdict. If the HTTP channel is
// reachable it still smoke-tests the public routes.
//
// Usage:
//   node scripts/verify-production-deployment.mjs --expect <sha> [--url <origin>]
//
// Environment:
//   VERCEL_TOKEN        enables the authoritative Vercel API check (preferred)
//   VERCEL_TEAM_SLUG    default "orijin1"
//   VERCEL_PROJECT      default "isbulkktc"
//   DEPLOY_TIMEOUT_SEC  how long to wait for the commit (default 900)
//   DEPLOY_POLL_SEC     seconds between polls (default 20)
//
// Exits non-zero only on a real problem: the commit never promotes, or a
// reachable route is unhealthy. Writes a Markdown summary when
// GITHUB_STEP_SUMMARY is set.

import { appendFile } from "node:fs/promises";

const API = "https://api.vercel.com";

/** Routes every deploy must serve with a 2xx when the origin is reachable.
 * The default locale (`tr`) is unprefixed under `localePrefix: "as-needed"`, so
 * `/jobs` is canonical (`/tr/jobs` 308-redirects). `/en` exercises intl routing. */
export const SMOKE_ROUTES = ["/", "/jobs", "/companies", "/contact", "/en"];

/** Lower-case, trim, and require at least 7 hex characters to be meaningful. */
export function normalizeCommit(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(trimmed) ? trimmed : "";
}

/**
 * A run is superseded when a newer commit has landed on the branch tip: the
 * production alias will move to that newer commit, so this run would poll for a
 * commit that is never promoted and fail on a healthy site. Two pushes landing
 * back-to-back is enough to hit this, so it must be skipped, not failed.
 */
export function isSuperseded(expectedCommit, tipCommit) {
  const expected = normalizeCommit(expectedCommit);
  const tip = normalizeCommit(tipCommit);
  if (!expected || !tip) return false; // cannot tell — verify rather than skip
  return !(tip.startsWith(expected) || expected.startsWith(tip));
}

/** The build identity a deployment reports through `/api/build-info`. */
export function buildInfoMatches(expectedCommit, body) {
  const expected = normalizeCommit(expectedCommit);
  if (!expected) return { ok: false, reason: "no expected commit provided" };
  if (!body || typeof body !== "object") {
    return { ok: false, reason: "build-info returned no JSON object" };
  }
  const actual = normalizeCommit(body.commit);
  if (!actual) {
    return { ok: false, reason: "deployment does not report a commit yet" };
  }
  // Either side may be the abbreviated form, so accept a prefix match.
  if (!(actual.startsWith(expected) || expected.startsWith(actual))) {
    return {
      ok: false,
      reason: `serving ${actual.slice(0, 8)}, expected ${expected.slice(0, 8)}`,
    };
  }
  return { ok: true, reason: `serving ${actual.slice(0, 8)}` };
}

/**
 * Classify an HTTP status from the public origin.
 * `blocked` is the key one: Cloudflare fronts the site and answers datacenter IP
 * ranges (GitHub runners included) with 403. That says nothing about the app, so
 * it must never be read as "down".
 */
export function classifyHttpStatus(status) {
  if (status === 403 || status === 429) return "blocked";
  if (status >= 200 && status < 300) return "ok";
  return "error";
}

/** A route is healthy only on a 2xx with a non-trivial body; blocked is skipped. */
export function evaluateRouteResponse(route, status, bodyLength) {
  const kind = classifyHttpStatus(status);
  if (kind === "blocked") {
    return {
      route,
      ok: true,
      skipped: true,
      reason: `HTTP ${status} (edge/WAF blocked the runner)`,
    };
  }
  if (kind === "error") {
    return { route, ok: false, reason: `HTTP ${status}` };
  }
  if (!Number.isFinite(bodyLength) || bodyLength < 100) {
    return { route, ok: false, reason: `body too small (${bodyLength} bytes)` };
  }
  return { route, ok: true, reason: `HTTP ${status}` };
}

/** Aggregate per-route results. Skipped routes are reported, not counted as failures. */
export function summarizeSmokeResults(results) {
  const failed = results.filter((result) => !result.ok);
  const skipped = results.filter((result) => result.ok && result.skipped);
  return {
    ok: failed.length === 0,
    passed: results.length - failed.length - skipped.length,
    skipped: skipped.length,
    failed,
  };
}

/**
 * Decide the outcome from the two channels. Either channel confirming the commit
 * is enough; the HTTP channel is allowed to be blocked without failing the run.
 */
export function decideVerification({ vercel, http }) {
  if (vercel.ok) return { verified: true, method: "vercel-api", reason: vercel.reason };
  if (http.ok) return { verified: true, method: "http", reason: http.reason };
  if (http.blocked && !vercel.configured) {
    return {
      verified: false,
      reason:
        "could not verify: the edge blocked the HTTP probe and no Vercel token is configured (set VERCEL_TOKEN)",
    };
  }
  return {
    verified: false,
    reason: `vercel: ${vercel.reason}; http: ${http.reason}`,
  };
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// Bound every request so a stalled connection cannot hang the poll loop past its
// deadline (Node's fetch has no default timeout).
const REQUEST_TIMEOUT_MS = 20_000;

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
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
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the team and project ids once; reused by every poll. */
async function resolveVercelContext(token, teamSlug, projectName) {
  const teams = await fetchJson(`${API}/v2/teams?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const team = (teams.body?.teams ?? []).find((entry) => entry.slug === teamSlug);
  if (!team) throw new Error(`no team with slug "${teamSlug}"`);
  const project = await fetchJson(
    `${API}/v9/projects/${encodeURIComponent(projectName)}?teamId=${team.id}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!project.body?.id) throw new Error(`no project "${projectName}"`);
  return { teamId: team.id, projectId: project.body.id };
}

/**
 * Read the commit the production alias is currently serving. `targets.production.id`
 * is the deployment the alias points at, so this is authoritative even while a
 * newer build is still in flight.
 */
async function checkVercelAlias(context, token, expectedCommit) {
  const project = await fetchJson(
    `${API}/v9/projects/${context.projectId}?teamId=${context.teamId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const liveUid = project.body?.targets?.production?.id;
  if (!liveUid) return { configured: true, ok: false, reason: "no production alias yet" };

  const detail = await fetchJson(
    `${API}/v13/deployments/${liveUid}?teamId=${context.teamId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const state = detail.body?.readyState;
  if (state !== "READY") {
    return {
      configured: true,
      ok: false,
      reason: `production deployment is ${state ?? "unknown"}`,
    };
  }
  const actual = normalizeCommit(detail.body?.meta?.githubCommitSha);
  const expected = normalizeCommit(expectedCommit);
  if (actual && expected && (actual.startsWith(expected) || expected.startsWith(actual))) {
    return { configured: true, ok: true, reason: `alias built from ${actual.slice(0, 8)}` };
  }
  return {
    configured: true,
    ok: false,
    reason: `alias built from ${actual ? actual.slice(0, 8) : "unknown"}, expected ${expected.slice(0, 8)}`,
  };
}

/** Poll `GET /api/build-info` on the live origin. */
async function checkHttpBuildInfo(origin, expectedCommit) {
  try {
    const { status, body } = await fetchJson(`${origin}/api/build-info`, {
      headers: { "Cache-Control": "no-cache" },
      redirect: "manual",
    });
    if (classifyHttpStatus(status) === "blocked") {
      return {
        ok: false,
        blocked: true,
        reason: `build-info HTTP ${status} (edge/WAF blocked the runner)`,
      };
    }
    if (status !== 200) {
      return { ok: false, blocked: false, reason: `build-info HTTP ${status}` };
    }
    return { ...buildInfoMatches(expectedCommit, body), blocked: false };
  } catch (error) {
    return { ok: false, blocked: false, reason: `request failed: ${error.message}` };
  }
}

async function smokeTest(origin) {
  const results = [];
  for (const route of SMOKE_ROUTES) {
    try {
      // `redirect: "manual"` matters: following a redirect can land on an SSO or
      // login page that answers 200, which would make an unreachable app look
      // healthy. An unexpected 3xx is reported instead.
      const response = await fetch(`${origin}${route}`, {
        headers: { "Cache-Control": "no-cache" },
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await response.text();
      results.push(evaluateRouteResponse(route, response.status, body.length));
    } catch (error) {
      results.push({ route, ok: false, reason: `request failed: ${error.message}` });
    }
  }
  return results;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const expectedCommit = argValue("--expect") ?? process.env.GITHUB_SHA;
  const tipCommit = argValue("--tip") ?? process.env.BRANCH_TIP_SHA;
  const origin = (
    argValue("--url") ??
    process.env.PRODUCTION_URL ??
    "https://isbulkktc.com"
  ).replace(/\/$/, "");
  const timeoutSec = Number.parseInt(process.env.DEPLOY_TIMEOUT_SEC ?? "900", 10);
  const pollSec = Number.parseInt(process.env.DEPLOY_POLL_SEC ?? "20", 10);
  const token = process.env.VERCEL_TOKEN;

  if (!normalizeCommit(expectedCommit)) {
    throw new Error("No commit to verify. Pass --expect <sha> or set GITHUB_SHA.");
  }

  // A newer commit already owns the branch tip, so production is heading there
  // and this run would wait for a commit that is never promoted. Skipping keeps
  // back-to-back pushes from painting a healthy site red.
  if (isSuperseded(expectedCommit, tipCommit)) {
    const message = [
      "## Production deploy verification",
      "",
      `- skipped: \`${expectedCommit.slice(0, 8)}\` was superseded by \`${normalizeCommit(tipCommit).slice(0, 8)}\``,
      "- the newer push verifies production instead",
    ].join("\n");
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
    }
    console.log(message);
    return;
  }

  let context = null;
  if (token) {
    try {
      context = await resolveVercelContext(
        token,
        process.env.VERCEL_TEAM_SLUG ?? "orijin1",
        process.env.VERCEL_PROJECT ?? "isbulkktc",
      );
    } catch (error) {
      console.warn(`Vercel API unavailable (${error.message}); falling back to HTTP only.`);
    }
  }

  console.log(`Verifying ${origin} serves ${expectedCommit.slice(0, 8)}…`);

  const deadline = Date.now() + timeoutSec * 1000;
  let vercel =
    token && context
      ? { configured: true, ok: false, reason: "not checked yet" }
      : { configured: false, ok: false, reason: "VERCEL_TOKEN not set" };
  let http = { ok: false, blocked: false, reason: "not checked yet" };

  for (;;) {
    if (context && !vercel.ok) {
      try {
        vercel = await checkVercelAlias(context, token, expectedCommit);
      } catch (error) {
        vercel = {
          configured: true,
          ok: false,
          reason: `Vercel API error: ${error.message}`,
        };
      }
    }
    if (!http.ok) {
      http = await checkHttpBuildInfo(origin, expectedCommit);
    }

    if (decideVerification({ vercel, http }).verified || Date.now() >= deadline) break;

    console.log(
      `  waiting: vercel=${vercel.reason}; http=${http.reason} (retrying in ${pollSec}s)`,
    );
    await sleep(pollSec);
  }

  const decision = decideVerification({ vercel, http });
  const summary = [
    "## Production deploy verification",
    "",
    `- origin: \`${origin}\``,
    `- expected commit: \`${expectedCommit.slice(0, 8)}\``,
    `- verdict: ${decision.verified ? "✅" : "❌"} ${decision.reason}`,
    `- confirmed via: ${decision.verified ? decision.method : "—"}`,
    `- Vercel API: ${vercel.configured ? (vercel.ok ? "✅" : "❌") : "⏭️"} ${vercel.reason}`,
    `- HTTP build identity: ${http.blocked ? "⏭️ blocked" : http.ok ? "✅" : "❌"} ${http.reason}`,
  ];

  const failures = [];
  if (!decision.verified) {
    failures.push(decision.reason);
  } else {
    // Smoke-test the origin only when it is reachable. A Cloudflare 403 for the
    // runner is expected and must not fail the run.
    const results = await smokeTest(origin);
    const smoke = summarizeSmokeResults(results);
    const blocked = results.every((result) => result.skipped);
    summary.push(
      `- smoke routes: ${blocked ? "⏭️ skipped" : smoke.ok ? "✅" : "❌"} ${smoke.passed} passed, ${smoke.skipped} skipped, ${smoke.failed.length} failed`,
    );
    for (const result of results) {
      summary.push(`  - \`${result.route}\`: ${result.reason}`);
    }
    for (const failure of smoke.failed) {
      failures.push(`route ${failure.route}: ${failure.reason}`);
    }
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
