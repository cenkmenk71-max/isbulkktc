import assert from "node:assert/strict";
import test from "node:test";

import {
  isProtectedHostname,
  isVercelHostname,
  selectDeploymentsToDelete,
} from "../../scripts/prune-vercel-deployments.mjs";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-10-30T18:00:00Z");

interface Deployment {
  uid: string;
  created: number;
  target: string | null;
  state: string;
  alias: string[];
}

// Build a deployment relative to NOW; `hoursAgo` keeps the fixtures readable.
function deployment(
  uid: string,
  hoursAgo: number,
  extra: Partial<Deployment> = {},
): Deployment {
  return {
    uid,
    created: NOW - hoursAgo * HOUR,
    target: "preview",
    state: "READY",
    alias: [],
    ...extra,
  };
}

test("keeps the live production deployment even when it is the oldest", () => {
  const deployments = [
    deployment("live", 100, { target: "production" }),
    deployment("newer-preview", 1),
  ];

  const stale = selectDeploymentsToDelete(deployments, {
    keepUid: "live",
    keepProduction: 0,
    keepPreview: 0,
    now: NOW,
  });

  assert.deepEqual(
    stale.map((d) => d.uid),
    ["newer-preview"],
  );
});

test("keeps the newest N production deployments and prunes the rest", () => {
  const deployments = [
    deployment("prod-1", 10, { target: "production" }),
    deployment("prod-2", 20, { target: "production" }),
    deployment("prod-3", 30, { target: "production" }),
    deployment("prod-4", 40, { target: "production" }),
  ];

  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 2,
    keepPreview: 0,
    now: NOW,
  });

  // Newest two kept; oldest two deleted, oldest first.
  assert.deepEqual(
    stale.map((d) => d.uid),
    ["prod-4", "prod-3"],
  );
});

test("keeps the newest N preview deployments independently of production", () => {
  const deployments = [
    deployment("prod-1", 5, { target: "production" }),
    deployment("prev-1", 6),
    deployment("prev-2", 7),
    deployment("prev-3", 8),
    deployment("prev-4", 9),
  ];

  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 1,
    keepPreview: 2,
    now: NOW,
  });

  assert.deepEqual(
    stale.map((d) => d.uid),
    ["prev-4", "prev-3"],
  );
});

test("a domain-pinned deployment is excluded from deletion regardless of age", () => {
  // The caller resolves the domain-pinned set from the authoritative aliases
  // endpoint and filters it out; here we prove the retention logic alone would
  // otherwise have selected the pinned, very old deployment.
  const deployments = [
    deployment("pinned", 90),
    deployment("disposable", 91),
  ];

  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 0,
    keepPreview: 0,
    now: NOW,
  });
  assert.deepEqual(
    stale.map((d) => d.uid),
    ["disposable", "pinned"],
  );

  const domainPinned = new Set(["pinned"]);
  const filtered = stale.filter((d) => !domainPinned.has(d.uid));
  assert.deepEqual(
    filtered.map((d) => d.uid),
    ["disposable"],
  );
});

test("distinguishes a configured domain from an auto-generated Vercel host", () => {
  assert.equal(isVercelHostname("isbulkktc-abc.vercel.app"), true);
  assert.equal(isVercelHostname("isbulkktc.com"), false);
  assert.equal(isProtectedHostname("isbulkktc.com"), true);
  assert.equal(isProtectedHostname("www.isbulkktc.com"), true);
  assert.equal(isProtectedHostname("isbulkktc-abc.vercel.app"), false);
  assert.equal(isProtectedHostname(undefined), false);
});

test("respects the minimum-age safety window so fresh builds are never raced", () => {
  const deployments = [
    deployment("fresh", 0.25), // 15 minutes old
    deployment("stale", 10),
  ];

  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 0,
    keepPreview: 0,
    minAgeMs: 1 * HOUR,
    now: NOW,
  });

  assert.deepEqual(
    stale.map((d) => d.uid),
    ["stale"],
  );
});

test("returns deletions oldest first regardless of input order", () => {
  const deployments = [
    deployment("middle", 5),
    deployment("newest", 1),
    deployment("oldest", 50),
  ];

  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 0,
    keepPreview: 1,
    now: NOW,
  });

  assert.deepEqual(
    stale.map((d) => d.uid),
    ["oldest", "middle"],
  );
});

test("an empty project prunes nothing", () => {
  assert.deepEqual(selectDeploymentsToDelete([], { now: NOW }), []);
});

test("deployments with no target are treated as preview and prunable", () => {
  const deployments = [
    deployment("no-target", 20, { target: null }),
    deployment("prod", 21, { target: "production" }),
  ];

  const stale = selectDeploymentsToDelete(deployments, {
    keepProduction: 1,
    keepPreview: 0,
    now: NOW,
  });

  assert.deepEqual(
    stale.map((d) => d.uid),
    ["no-target"],
  );
});
