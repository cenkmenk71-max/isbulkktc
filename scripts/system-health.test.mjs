import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HEALTH_WORKFLOW,
  classifyProductionProbe,
  classifyRedRuns,
  failingWorkflows,
  isDeploymentDisabled,
  isRedCheck,
  isUnresolvedMergeState,
  newestRunPerWorkflow,
  redPullRequests,
  redRunsOnMain,
  redWorkflowsOnMain,
  stuckPullRequests,
} from "./system-health-core.mjs";

// The bug this guards: `system-health.mjs` asked GitHub for one named workflow
// (`isbulkktc CI`). #375 removed that workflow's `push` trigger, so the query
// returned the last run that ever happened and kept answering "green" while the
// workflow that *does* run on push (`Verify production deployment`) was red.
// The check must read the branch, not a workflow name it cannot keep in step.

test("the newest run per workflow wins, whatever order GitHub returns", () => {
  const newest = newestRunPerWorkflow([
    { name: "B", status: "completed", conclusion: "failure", createdAt: "2026-01-01T00:00:00Z" },
    { name: "A", status: "completed", conclusion: "success", createdAt: "2026-01-02T00:00:00Z" },
    { name: "B", status: "completed", conclusion: "success", createdAt: "2026-01-03T00:00:00Z" },
  ]);
  assert.equal(newest.get("A").conclusion, "success");
  assert.equal(newest.get("B").conclusion, "success");
});

test("a workflow still running is not judged", () => {
  const newest = newestRunPerWorkflow([
    { name: "Gate", status: "in_progress", conclusion: null, createdAt: "2026-01-02T00:00:00Z" },
    { name: "Gate", status: "completed", conclusion: "success", createdAt: "2026-01-01T00:00:00Z" },
  ]);
  assert.equal(newest.get("Gate").conclusion, "success");
});

test("a run with no name is ignored rather than crashing", () => {
  const newest = newestRunPerWorkflow([
    { status: "completed", conclusion: "failure", createdAt: "2026-01-02T00:00:00Z" },
    { name: "Gate", status: "completed", conclusion: "success", createdAt: "2026-01-01T00:00:00Z" },
  ]);
  assert.deepEqual([...newest.keys()], ["Gate"]);
});

test("only a failed newest run is reported", () => {
  const failing = failingWorkflows([
    { name: "Verify production deployment", status: "completed", conclusion: "failure", createdAt: "2026-01-02T00:00:00Z" },
    { name: "isbulkktc CI", status: "completed", conclusion: "success", createdAt: "2026-01-02T00:00:00Z" },
  ]);
  assert.deepEqual(failing, ["Verify production deployment"]);
});

test("a cancelled run is a superseded push, not a broken gate", () => {
  // Back-to-back merges cancel the older verify run on purpose; calling that a
  // failure would cry wolf on every merge.
  assert.deepEqual(
    failingWorkflows([
      { name: "Verify production deployment", status: "completed", conclusion: "cancelled", createdAt: "2026-01-02T00:00:00Z" },
    ]),
    [],
  );
});

test("an older failure is forgiven once a newer run on the same workflow is green", () => {
  assert.deepEqual(
    failingWorkflows([
      { name: "Gate", status: "completed", conclusion: "failure", createdAt: "2026-01-01T00:00:00Z" },
      { name: "Gate", status: "completed", conclusion: "success", createdAt: "2026-01-02T00:00:00Z" },
    ]),
    [],
  );
});

test("no runs is not a failure", () => {
  assert.deepEqual(failingWorkflows([]), []);
  assert.deepEqual(failingWorkflows(undefined), []);
});

// ---------------------------------------------------------------------------
// redWorkflowsOnMain — the check must not read its own failure as "main CI red"
// ---------------------------------------------------------------------------

// The bug this guards: the check runs on a schedule, so a failed run stays the
// newest run of its own name on `main` forever. Reading that back as "main CI
// red" made the gate fail because it had failed — permanently red, and hiding
// the real red (a stale `push`-triggered run) behind its own noise.

test("the health check's own red run is not counted as main CI red", () => {
  assert.deepEqual(
    redWorkflowsOnMain([
      {
        name: "System health",
        status: "completed",
        conclusion: "failure",
        createdAt: "2026-01-02T00:00:00Z",
      },
    ]),
    [],
  );
});

test("a real red workflow is still reported while the health check is red", () => {
  assert.deepEqual(
    redWorkflowsOnMain([
      {
        name: "System health",
        status: "completed",
        conclusion: "failure",
        createdAt: "2026-01-03T00:00:00Z",
      },
      {
        name: "Verify production deployment",
        status: "completed",
        conclusion: "failure",
        createdAt: "2026-01-02T00:00:00Z",
      },
    ]),
    ["Verify production deployment"],
  );
});

test("a green health check does not hide another workflow's red", () => {
  assert.deepEqual(
    redWorkflowsOnMain([
      {
        name: "System health",
        status: "completed",
        conclusion: "success",
        createdAt: "2026-01-03T00:00:00Z",
      },
      {
        name: "isbulkktc CI",
        status: "completed",
        conclusion: "failure",
        createdAt: "2026-01-02T00:00:00Z",
      },
    ]),
    ["isbulkktc CI"],
  );
});

test("the excluded name matches the workflow file, so a rename cannot slip past", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/system-health.yml", import.meta.url),
    "utf8",
  );
  const declared = workflow.match(/^name:\s*(.+?)\s*$/m)?.[1];
  assert.equal(declared, HEALTH_WORKFLOW);
});

// ---------------------------------------------------------------------------
// redRunsOnMain / classifyRedRuns — a 0-job GitHub glitch is not "main CI red"
// ---------------------------------------------------------------------------

// The bug this guards: GitHub's scheduler sometimes reports a scheduled run as
// `failure` without ever starting a job (zero jobs, no logs). Counting that as a
// red on `main` made the gate fail on a GitHub hiccup, and the false red buried a
// real one in the same report. Only a red run that actually ran a job is real.

test("redRunsOnMain keeps the run objects so a job count can be read", () => {
  const redRuns = redRunsOnMain([
    {
      name: "Dispatch web push",
      status: "completed",
      conclusion: "failure",
      createdAt: "2026-01-02T00:00:00Z",
      databaseId: 12345,
    },
  ]);
  assert.equal(redRuns.length, 1);
  assert.equal(redRuns[0].name, "Dispatch web push");
  assert.equal(redRuns[0].databaseId, 12345);
});

test("redRunsOnMain still excludes the health check's own workflow", () => {
  const redRuns = redRunsOnMain([
    {
      name: "System health",
      status: "completed",
      conclusion: "failure",
      createdAt: "2026-01-02T00:00:00Z",
      databaseId: 1,
    },
    {
      name: "Gate",
      status: "completed",
      conclusion: "failure",
      createdAt: "2026-01-01T00:00:00Z",
      databaseId: 2,
    },
  ]);
  assert.deepEqual(
    redRuns.map((run) => run.name),
    ["Gate"],
  );
});

test("a red run with zero jobs is a glitch, not a real failure", () => {
  assert.deepEqual(
    classifyRedRuns([{ name: "Dispatch web push", jobCount: 0 }]),
    { real: [], glitches: ["Dispatch web push"] },
  );
});

test("a red run that started a job is a real failure", () => {
  assert.deepEqual(classifyRedRuns([{ name: "Verify production deployment", jobCount: 1 }]), {
    real: ["Verify production deployment"],
    glitches: [],
  });
});

test("a red run whose job count is unknown stays real, so a red is never dropped", () => {
  // The lookup failed (`null`). Fail-safe: a check must never turn a red into a
  // green just because it could not look.
  assert.deepEqual(classifyRedRuns([{ name: "Gate", jobCount: null }]), {
    real: ["Gate"],
    glitches: [],
  });
  assert.deepEqual(classifyRedRuns([{ name: "Gate" }]), {
    real: ["Gate"],
    glitches: [],
  });
});

test("a real red and a glitch are separated, not merged", () => {
  // This is the point of the whole change: the glitch must not hide the real
  // red, and the real red must still be loud.
  assert.deepEqual(
    classifyRedRuns([
      { name: "Dispatch web push", jobCount: 0 },
      { name: "Verify production deployment", jobCount: 2 },
    ]),
    { real: ["Verify production deployment"], glitches: ["Dispatch web push"] },
  );
});

test("no red runs classifies to nothing on either side", () => {
  assert.deepEqual(classifyRedRuns([]), { real: [], glitches: [] });
  assert.deepEqual(classifyRedRuns(undefined), { real: [], glitches: [] });
});

// The bug this guards: `system-health.mjs` computed the "old PRs" warning with
// `p.mergeStateStatus !== 'CLEAN'`. GitHub computes `mergeStateStatus` lazily,
// so the first read after a push returns `UNKNOWN`; the very same PR reads
// `CLEAN` a moment later. Reading `UNKNOWN` as "not moving" flagged a mergeable
// PR (#493 sat `CLEAN` while the check called it stuck), and a false warning
// buries the real one behind it.

test("a PR whose merge state is UNKNOWN is not called stuck", () => {
  const now = Date.parse("2026-11-10T03:00:00Z");
  const old = new Date(now - 5 * 3600000).toISOString();
  assert.deepEqual(
    stuckPullRequests([{ number: 493, mergeStateStatus: "UNKNOWN", createdAt: old }], { now }),
    [],
  );
});

test("a PR with no merge state at all is not called stuck", () => {
  const now = Date.parse("2026-11-10T03:00:00Z");
  const old = new Date(now - 5 * 3600000).toISOString();
  assert.deepEqual(
    stuckPullRequests(
      [
        { number: 1, mergeStateStatus: null, createdAt: old },
        { number: 2, createdAt: old },
      ],
      { now },
    ),
    [],
  );
});

test("an old PR whose state is known and not CLEAN is stuck", () => {
  const now = Date.parse("2026-11-10T03:00:00Z");
  const old = new Date(now - 5 * 3600000).toISOString();
  const fresh = new Date(now - 1 * 3600000).toISOString();
  const stuck = stuckPullRequests(
    [
      { number: 521, mergeStateStatus: "BLOCKED", createdAt: old },
      { number: 522, mergeStateStatus: "DIRTY", createdAt: old },
      { number: 493, mergeStateStatus: "CLEAN", createdAt: old },
      { number: 999, mergeStateStatus: "BLOCKED", createdAt: fresh },
    ],
    { now },
  );
  assert.deepEqual(stuck.map((p) => p.number), [521, 522]);
});

test("an UNKNOWN PR next to a genuinely stuck one does not hide it", () => {
  const now = Date.parse("2026-11-10T03:00:00Z");
  const old = new Date(now - 5 * 3600000).toISOString();
  const stuck = stuckPullRequests(
    [
      { number: 493, mergeStateStatus: "UNKNOWN", createdAt: old },
      { number: 521, mergeStateStatus: "BLOCKED", createdAt: old },
    ],
    { now },
  );
  assert.deepEqual(stuck.map((p) => p.number), [521]);
});

test("stuckPullRequests tolerates missing input", () => {
  assert.deepEqual(stuckPullRequests(undefined), []);
  assert.deepEqual(stuckPullRequests([null]), []);
});

test("isUnresolvedMergeState is exactly UNKNOWN/null/undefined", () => {
  assert.equal(isUnresolvedMergeState("UNKNOWN"), true);
  assert.equal(isUnresolvedMergeState(null), true);
  assert.equal(isUnresolvedMergeState(undefined), true);
  assert.equal(isUnresolvedMergeState("CLEAN"), false);
  assert.equal(isUnresolvedMergeState("BLOCKED"), false);
  assert.equal(isUnresolvedMergeState("DIRTY"), false);
});

// ---------------------------------------------------------------------------
// redPullRequests — "all moving" was a lie while a queue-global gate was red.
// ---------------------------------------------------------------------------

// The bug this guards: on 2026-11-10 `lane-collisions` (which scans every open
// PR) went red on one lane's PR. Every other open PR then read `BLOCKED`, so
// nothing could merge — yet `system-health` reported "PRs: N open, all moving",
// because `stuckPullRequests` only ages a PR and never looks at *why* it is not
// CLEAN. A red check on a blocked PR is the actionable fact and must be named.

test("isRedCheck reads both check-run and status-context shapes", () => {
  assert.equal(isRedCheck({ conclusion: "FAILURE" }), true);
  assert.equal(isRedCheck({ conclusion: "failure" }), true);
  assert.equal(isRedCheck({ state: "FAILURE" }), true);
  assert.equal(isRedCheck({ state: "error" }), true);
  assert.equal(isRedCheck({ conclusion: "SUCCESS" }), false);
  assert.equal(isRedCheck({ state: "PENDING" }), false);
  assert.equal(isRedCheck({}), false);
  assert.equal(isRedCheck(null), false);
});

test("a cancelled check is a superseded push, not a red gate", () => {
  assert.equal(isRedCheck({ conclusion: "CANCELLED" }), false);
});

test("an old blocked PR with a red check is named, with the gate", () => {
  const red = redPullRequests([
    {
      number: 548,
      mergeStateStatus: "BLOCKED",
      statusCheckRollup: [
        { name: "Static checks", conclusion: "FAILURE" },
        { name: "automate", conclusion: "SUCCESS" },
      ],
    },
  ]);
  assert.deepEqual(red, [{ number: 548, redChecks: ["Static checks"] }]);
});

test("a blocked PR whose checks are all green or pending is not called red", () => {
  assert.deepEqual(
    redPullRequests([
      {
        number: 1,
        mergeStateStatus: "BLOCKED",
        statusCheckRollup: [
          { name: "E2E (1/4)", status: "IN_PROGRESS", conclusion: "" },
          { name: "automate", conclusion: "SUCCESS" },
        ],
      },
    ]),
    [],
  );
});

test("a CLEAN PR with a stale red check is not called blocked", () => {
  assert.deepEqual(
    redPullRequests([
      {
        number: 1,
        mergeStateStatus: "CLEAN",
        statusCheckRollup: [{ name: "Static checks", conclusion: "FAILURE" }],
      },
    ]),
    [],
  );
});

test("a fresh red check is named at once — no age window that hides a freeze", () => {
  assert.deepEqual(
    redPullRequests([
      {
        number: 999,
        mergeStateStatus: "BLOCKED",
        statusCheckRollup: [{ name: "Static checks", conclusion: "FAILURE" }],
      },
    ]),
    [{ number: 999, redChecks: ["Static checks"] }],
  );
});

test("an UNKNOWN merge state is left alone even if a check reads red", () => {
  assert.deepEqual(
    redPullRequests([
      {
        number: 493,
        mergeStateStatus: "UNKNOWN",
        statusCheckRollup: [{ name: "Static checks", conclusion: "FAILURE" }],
      },
    ]),
    [],
  );
});

test("redPullRequests tolerates missing input and unnamed checks", () => {
  assert.deepEqual(redPullRequests(undefined), []);
  assert.deepEqual(redPullRequests([null]), []);
  assert.deepEqual(
    redPullRequests([
      { number: 7, mergeStateStatus: "DIRTY", statusCheckRollup: [{ state: "FAILURE" }] },
    ]),
    [{ number: 7, redChecks: ["(unnamed check)"] }],
  );
});

// ---------------------------------------------------------------------------
// classifyProductionProbe — the site can be *gone* while every GitHub check
// reads green. A red workflow is a symptom; the origin is the evidence.
// ---------------------------------------------------------------------------

// The bug this guards: on 2026-11-10 `isbulkktc.com` answered `402
// DEPLOYMENT_DISABLED` (Vercel account blocked/over quota) to every visitor for
// hours. The health check only named the failing `Dispatch web push` workflow —
// a symptom — and never said the site was down, because none of its checks read
// the origin. The probe must classify the origin's real answer, and the pure
// classifier is what the probe's verdict rests on.

test("a 402 DEPLOYMENT_DISABLED is a hard failure — the site is down", () => {
  const verdict = classifyProductionProbe({
    status: 402,
    vercelError: "DEPLOYMENT_DISABLED",
  });
  assert.equal(verdict.level, "fail");
  assert.match(verdict.detail, /DOWN/);
  assert.match(verdict.detail, /402/);
});

test("a bare 402 fails even without the Vercel header", () => {
  assert.equal(classifyProductionProbe({ status: 402 }).level, "fail");
});

test("the Vercel header alone fails even if the status is 200", () => {
  // The header is Vercel's authoritative marker; trust it over the code.
  assert.equal(
    classifyProductionProbe({ status: 200, vercelError: "deployment_disabled" }).level,
    "fail",
  );
});

test("a 2xx/3xx origin is serving", () => {
  assert.deepEqual(classifyProductionProbe({ status: 200 }), {
    level: "ok",
    detail: "serving (HTTP 200)",
  });
  assert.equal(classifyProductionProbe({ status: 301 }).level, "ok");
  assert.equal(classifyProductionProbe({ status: 308 }).level, "ok");
});

test("a 403 or 429 is the edge blocking the probe — a warning, never a failure", () => {
  // Cloudflare answers datacenter IPs (including CI runners) with 403. Calling
  // that an outage would cry wolf on every probe from CI.
  assert.equal(classifyProductionProbe({ status: 403 }).level, "warn");
  assert.equal(classifyProductionProbe({ status: 429 }).level, "warn");
});

test("a network error is 'could not verify', not 'down'", () => {
  // No evidence either way: warn rather than invent an outage.
  const verdict = classifyProductionProbe({ networkError: "fetch failed" });
  assert.equal(verdict.level, "warn");
  assert.match(verdict.detail, /fetch failed/);
});

test("a probe with no status is a warning, not a failure", () => {
  assert.equal(classifyProductionProbe({}).level, "warn");
  assert.equal(classifyProductionProbe(undefined).level, "warn");
  assert.equal(classifyProductionProbe(null).level, "warn");
});

test("any other non-serving status is a failure", () => {
  assert.equal(classifyProductionProbe({ status: 500 }).level, "fail");
  assert.equal(classifyProductionProbe({ status: 404 }).level, "fail");
});

test("isDeploymentDisabled matches only the 402 or the Vercel marker", () => {
  assert.equal(isDeploymentDisabled(402, null), true);
  assert.equal(isDeploymentDisabled(200, "DEPLOYMENT_DISABLED"), true);
  assert.equal(isDeploymentDisabled(200, "  deployment_disabled  "), true);
  assert.equal(isDeploymentDisabled(200, null), false);
  assert.equal(isDeploymentDisabled(403, null), false);
  assert.equal(isDeploymentDisabled(null, null), false);
});

test("isDeploymentDisabled recognises DEPLOYMENT_NOT_FOUND (404) but not a bare 404", () => {
  // 2026-11-10: the live origin answered 404 + x-vercel-error on every route.
  assert.equal(isDeploymentDisabled(404, "DEPLOYMENT_NOT_FOUND"), true);
  assert.equal(isDeploymentDisabled(404, "  deployment_not_found  "), true);
  // A healthy origin returns 404 for any path it does not own — without the
  // header this must stay a plain failure, not an account-state verdict.
  assert.equal(isDeploymentDisabled(404, null), false);
  assert.equal(isDeploymentDisabled(404, "NOT_FOUND"), false);
});

test("classifyProductionProbe names the Vercel account state it saw", () => {
  assert.deepEqual(classifyProductionProbe({ status: 404, vercelError: "DEPLOYMENT_NOT_FOUND" }), {
    level: "fail",
    detail: "DOWN: HTTP 404 DEPLOYMENT_NOT_FOUND (Vercel account/deployment is not being served)",
  });
  assert.deepEqual(classifyProductionProbe({ status: 402, vercelError: "DEPLOYMENT_DISABLED" }), {
    level: "fail",
    detail: "DOWN: HTTP 402 DEPLOYMENT_DISABLED (Vercel account/deployment is not being served)",
  });
  // A bare 404 keeps the generic, non-actionable copy.
  assert.deepEqual(classifyProductionProbe({ status: 404 }), {
    level: "fail",
    detail: "origin answered HTTP 404",
  });
});
