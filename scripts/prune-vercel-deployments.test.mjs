import assert from "node:assert/strict";
import test from "node:test";

import {
  isProtectedHostname,
  isVercelHostname,
  selectDeploymentsToDelete,
} from "./prune-vercel-deployments.mjs";

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

test("a negative keep count is clamped to zero rather than deleting nothing", () => {
  const deployments = [deployment("p", 5, "production")];
  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: -3,
    keepPreview: -1,
    now: NOW,
  });
  assert.deepEqual(uids(stale), ["p"]);
});

test("only auto-generated vercel.app hostnames are disposable", () => {
  assert.equal(isVercelHostname("isbulkktc-amber.vercel.app"), true);
  assert.equal(isVercelHostname("isbulkktc.com"), false);
  assert.equal(isVercelHostname(undefined), false);

  assert.equal(isProtectedHostname("isbulkktc.com"), true);
  assert.equal(isProtectedHostname("www.isbulkktc.com"), true);
  assert.equal(isProtectedHostname("isbulkktc-amber.vercel.app"), false);
});
