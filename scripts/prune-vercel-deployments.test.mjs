import assert from "node:assert/strict";
import test from "node:test";

import {
  describeTeamLookupFailure,
  isProtectedHostname,
  isVercelHostname,
  readVercelToken,
  selectDeploymentsToDelete,
} from "./prune-vercel-deployments.mjs";

test("an invalid Vercel token is named as such, not as a bad team slug", () => {
  const rejected = describeTeamLookupFailure(403, {
    error: { code: "forbidden", message: "Not authorized", invalidToken: true },
  });
  assert.match(rejected, /rejected the token/);
  assert.match(rejected, /403/);
  assert.doesNotMatch(rejected, /slug/);
  assert.match(describeTeamLookupFailure(401, {}), /rejected the token/);
  // A transient server error must not be reported as a credential problem.
  const server = describeTeamLookupFailure(503, {});
  assert.match(server, /HTTP 503/);
  assert.doesNotMatch(server, /rejected the token/);
});

test("a whitespace-only VERCEL_TOKEN is treated as unset", () => {
  assert.equal(readVercelToken({ VERCEL_TOKEN: "   " }), "");
  assert.equal(readVercelToken({}), "");
  assert.equal(readVercelToken({ VERCEL_TOKEN: " tok " }), "tok");
});

// The retention decision is the part that can take production down: a wrong
// result deletes the deployment a real domain points at. These tests pin it.

const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;

/** A deployment created `hoursAgo` before NOW. */
function deployment(uid, hoursAgo, target = "preview") {
  return { uid, created: NOW - hoursAgo * HOUR, target, state: "READY" };
}

const uids = (list) => list.map((d) => d.uid).sort();

test("the live production deployment is never deleted, even when it is oldest", () => {
  const deployments = [
    deployment("live", 500, "production"),
    deployment("p1", 10, "production"),
    deployment("p2", 5, "production"),
    deployment("pre1", 3),
  ];
  const stale = selectDeploymentsToDelete(deployments, {
    keepUid: "live",
    keepProduction: 1,
    keepPreview: 0,
    now: NOW,
  });
  assert.equal(stale.some((d) => d.uid === "live"), false);
  assert.deepEqual(uids(stale), ["p1", "pre1"]);
});

test("keeps the newest N production and newest M preview, deletes the rest", () => {
  const deployments = [
    deployment("prod-new", 1, "production"),
    deployment("prod-mid", 2, "production"),
    deployment("prod-old", 3, "production"),
    deployment("prev-new", 4),
    deployment("prev-old", 5),
  ];
  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 2,
    keepPreview: 1,
    now: NOW,
  });
  assert.deepEqual(uids(stale), ["prev-old", "prod-old"]);
});

test("deletions come back oldest first", () => {
  const deployments = [
    deployment("c", 3),
    deployment("a", 30),
    deployment("b", 10),
  ];
  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 0,
    keepPreview: 0,
    now: NOW,
  });
  assert.deepEqual(
    stale.map((d) => d.uid),
    ["a", "b", "c"],
  );
});

test("anything younger than the safety window is kept", () => {
  const deployments = [
    deployment("fresh", 0.5),
    deployment("fresh-prod", 0.25, "production"),
    deployment("old", 5),
  ];
  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 0,
    keepPreview: 0,
    minAgeMs: 1 * HOUR,
    now: NOW,
  });
  assert.deepEqual(uids(stale), ["old"]);
});

test("a missing `created` is treated as oldest, not as fresh", () => {
  // Vercel always sends `created`, but a malformed entry must not be kept by a
  // NaN comparison: `now - NaN < minAgeMs` is false, so it is prunable.
  const deployments = [
    { uid: "no-date", target: "preview", state: "READY" },
    deployment("old", 5),
  ];
  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 0,
    keepPreview: 0,
    minAgeMs: 1 * HOUR,
    now: NOW,
  });
  assert.deepEqual(uids(stale), ["no-date", "old"]);
});

test("an empty list yields no deletions", () => {
  assert.deepEqual(selectDeploymentsToDelete([], { now: NOW }), []);
});

test("a negative keep count is clamped to zero, but the newest production deployment is still kept", () => {
  // `keepProduction` may legitimately be 0 (or negative). The newest production
  // deployment is the only rollback target and, when the live id is unknown, may
  // be the one serving traffic — so it is never pruned.
  const deployments = [
    deployment("prod-new", 5, "production"),
    deployment("prod-old", 9, "production"),
    deployment("prev", 1),
  ];
  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: -3,
    keepPreview: -1,
    now: NOW,
  });
  assert.deepEqual(uids(stale), ["prev", "prod-old"]);
});

test("never deletes every production deployment when the live id is unknown", () => {
  // Regression: `keepUid` absent (targets.production.id missing) plus
  // VERCEL_KEEP_PRODUCTION=0 previously selected *every* production deployment.
  const deployments = [
    deployment("prod-live", 500, "production"),
    deployment("prod-old", 800, "production"),
    deployment("pre1", 1),
  ];
  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 0,
    keepPreview: 0,
    now: NOW,
  });
  const remaining = deployments
    .map((d) => d.uid)
    .filter((uid) => !stale.some((d) => d.uid === uid));
  assert.ok(
    remaining.includes("prod-live"),
    "the newest production deployment must survive",
  );
  assert.deepEqual(uids(stale), ["pre1", "prod-old"]);
});

test("only auto-generated vercel.app hostnames are disposable", () => {
  assert.equal(isVercelHostname("isbulkktc-amber.vercel.app"), true);
  assert.equal(isVercelHostname("isbulkktc.com"), false);
  assert.equal(isVercelHostname(undefined), false);

  assert.equal(isProtectedHostname("isbulkktc.com"), true);
  assert.equal(isProtectedHostname("www.isbulkktc.com"), true);
  assert.equal(isProtectedHostname("isbulkktc-amber.vercel.app"), false);
});
