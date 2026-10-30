import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInfoMatches,
  evaluateRouteResponse,
  normalizeCommit,
  summarizeSmokeResults,
} from "../../scripts/verify-production-deployment.mjs";

const COMMIT = "9e007100aeff4f4d8fda1c9cdb4244b54d75c1a6";

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

test("a 2xx with a real body is a healthy route", () => {
  const result = evaluateRouteResponse("/tr/jobs", 200, 42_000);
  assert.equal(result.ok, true);
  assert.equal(result.reason, "HTTP 200");
});

test("a non-2xx route fails with the status in the reason", () => {
  const result = evaluateRouteResponse("/tr/jobs", 500, 42_000);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "HTTP 500");
});

test("a 200 with an empty body is treated as unhealthy", () => {
  // A misrouted request can return 200 with an empty document; that is not a
  // healthy page and must not pass the smoke test.
  const result = evaluateRouteResponse("/tr", 200, 12);
  assert.equal(result.ok, false);
  assert.match(result.reason, /body too small/);
});

test("summarizes a mixed smoke run and lists only the failures", () => {
  const results = [
    evaluateRouteResponse("/tr", 200, 50_000),
    evaluateRouteResponse("/tr/jobs", 503, 0),
    evaluateRouteResponse("/tr/contact", 200, 30_000),
  ];
  const summary = summarizeSmokeResults(results);
  assert.equal(summary.ok, false);
  assert.equal(summary.passed, 2);
  assert.deepEqual(
    summary.failed.map((failure: { route: string }) => failure.route),
    ["/tr/jobs"],
  );
});

test("a fully healthy smoke run passes", () => {
  const results = [
    evaluateRouteResponse("/tr", 200, 50_000),
    evaluateRouteResponse("/tr/companies", 200, 40_000),
  ];
  assert.equal(summarizeSmokeResults(results).ok, true);
});
