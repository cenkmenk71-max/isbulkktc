import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInfoMatches,
  classifyHttpStatus,
  decideVerification,
  evaluateRouteResponse,
  isSuperseded,
  normalizeCommit,
  summarizeSmokeResults,
} from "../../scripts/verify-production-deployment.mjs";

const COMMIT = "9e007100aeff4f4d8fda1c9cdb4244b54d75c1a6";
const NEWER = "b76d5fb4065a0c6a4e5555add6de7bcbe2ba3e2e";

test("a run is superseded only when a newer commit owns the tip", () => {
  // Back-to-back pushes: the older run can never see its commit on production,
  // so it must skip rather than fail.
  assert.equal(isSuperseded(COMMIT, NEWER), true);
  // The run's commit is still the tip — verify it.
  assert.equal(isSuperseded(COMMIT, COMMIT), false);
  assert.equal(isSuperseded("9e00710", COMMIT), false);
});

test("an unknown tip never skips verification", () => {
  // A missing/blank tip means we cannot tell; the safe default is to verify.
  assert.equal(isSuperseded(COMMIT, ""), false);
  assert.equal(isSuperseded(COMMIT, undefined), false);
  assert.equal(isSuperseded(COMMIT, "not-a-sha"), false);
  assert.equal(isSuperseded("", COMMIT), false);
});

test("normalizes a commit and rejects values that cannot be a SHA", () => {
  assert.equal(normalizeCommit("  9E00710  "), "9e00710");
  assert.equal(normalizeCommit(COMMIT), COMMIT);
  assert.equal(normalizeCommit("unknown"), "");
  assert.equal(normalizeCommit(""), "");
  assert.equal(normalizeCommit(undefined), "");
  assert.equal(normalizeCommit("z".repeat(40)), "");
});

test("matches only when the live build reports the expected commit", () => {
  assert.equal(buildInfoMatches(COMMIT, { commit: COMMIT }).ok, true);
  // A short expected SHA still matches the full SHA the deployment reports.
  assert.equal(buildInfoMatches("9e00710", { commit: COMMIT }).ok, true);
});

test("rejects a deployment still serving the previous commit", () => {
  const result = buildInfoMatches(COMMIT, { commit: "0000000aaaa" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /expected 9e00710/);
});

test("rejects a deployment that has not reported a commit yet", () => {
  assert.equal(buildInfoMatches(COMMIT, { commit: "unknown" }).ok, false);
  assert.equal(buildInfoMatches(COMMIT, {}).ok, false);
  assert.equal(buildInfoMatches(COMMIT, null).ok, false);
});

test("classifies edge-blocked statuses apart from real errors", () => {
  // Cloudflare answers datacenter IPs (GitHub runners) with 403; that is not an
  // outage and must never be read as "down".
  assert.equal(classifyHttpStatus(403), "blocked");
  assert.equal(classifyHttpStatus(429), "blocked");
  assert.equal(classifyHttpStatus(200), "ok");
  assert.equal(classifyHttpStatus(301), "error");
  assert.equal(classifyHttpStatus(500), "error");
});

test("a 2xx with a real body is a healthy route", () => {
  const result = evaluateRouteResponse("/jobs", 200, 42_000);
  assert.equal(result.ok, true);
  assert.equal(result.reason, "HTTP 200");
});

test("a non-2xx route fails with the status in the reason", () => {
  const result = evaluateRouteResponse("/jobs", 500, 42_000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "HTTP 500");
});

test("a 200 with an empty body is treated as unhealthy", () => {
  // A misrouted request can return 200 with an empty document; that is not a
  // healthy page and must not pass the smoke test.
  const result = evaluateRouteResponse("/", 200, 12);
  assert.equal(result.ok, false);
  assert.match(result.reason, /body too small/);
});

test("a 403 from the edge is skipped, not failed", () => {
  const result = evaluateRouteResponse("/", 403, 0);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.match(result.reason, /blocked the runner/);
});

test("summarizes a mixed smoke run and lists only the failures", () => {
  const results = [
    evaluateRouteResponse("/", 200, 50_000),
    evaluateRouteResponse("/jobs", 503, 0),
    evaluateRouteResponse("/contact", 200, 30_000),
  ];
  const summary = summarizeSmokeResults(results);
  assert.equal(summary.ok, false);
  assert.equal(summary.passed, 2);
  assert.equal(summary.skipped, 0);
  assert.deepEqual(
    summary.failed.map((failure: { route: string }) => failure.route),
    ["/jobs"],
  );
});

test("skipped routes are counted apart from passes and failures", () => {
  const results = [
    evaluateRouteResponse("/", 403, 0),
    evaluateRouteResponse("/jobs", 403, 0),
  ];
  const summary = summarizeSmokeResults(results);
  assert.equal(summary.ok, true);
  assert.equal(summary.passed, 0);
  assert.equal(summary.skipped, 2);
  assert.equal(summary.failed.length, 0);
});

test("a fully healthy smoke run passes", () => {
  const results = [
    evaluateRouteResponse("/", 200, 50_000),
    evaluateRouteResponse("/companies", 200, 40_000),
  ];
  assert.equal(summarizeSmokeResults(results).ok, true);
});

test("either channel can verify the deploy", () => {
  const ok = { configured: true, ok: true, reason: "fine" };
  const blocked = { ok: false, blocked: true, reason: "HTTP 403" };

  // Vercel API wins even when the HTTP probe is blocked by the edge.
  assert.equal(
    decideVerification({ vercel: ok, http: blocked }).method,
    "vercel-api",
  );
  // HTTP alone is enough when no token is configured.
  const httpOk = { ok: true, blocked: false, reason: "serving 9e00710" };
  assert.equal(
    decideVerification({
      vercel: { configured: false, ok: false },
      http: httpOk,
    }).method,
    "http",
  );
  // A blocked probe with no token cannot verify — and says so explicitly.
  const decision = decideVerification({
    vercel: { configured: false, ok: false, reason: "VERCEL_TOKEN not set" },
    http: blocked,
  });
  assert.equal(decision.verified, false);
  assert.match(decision.reason, /no Vercel token/);
});

test("reports both channels when neither confirms the commit", () => {
  const decision = decideVerification({
    vercel: { configured: true, ok: false, reason: "alias built from aaaa1111" },
    http: { ok: false, blocked: false, reason: "serving bbbb2222" },
  });
  assert.equal(decision.verified, false);
  assert.match(decision.reason, /vercel: .*alias built from/);
  assert.match(decision.reason, /http: serving/);
});
