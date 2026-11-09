import assert from "node:assert/strict";
import test from "node:test";

import {
  carriedAttempts,
  failedRequiredChecks,
  hasLabelledWork,
  isCapacityError,
  laneDelivered,
  nextConversationAction,
  prCapacity,
  requiredCheckFailed,
  workSignature,
} from "./lane-autopilot-core.mjs";

// ---------------------------------------------------------------------------
// nextConversationAction — bound the transcript, keep the sandbox (issue #218)
// ---------------------------------------------------------------------------

test("within the reuse budget the lane appends to its conversation", () => {
  assert.equal(nextConversationAction({ reuses: 0, maxReuses: 2 }), "append");
  assert.equal(nextConversationAction({ reuses: 1, maxReuses: 2 }), "append");
});

test("once the reuse budget is spent the lane refreshes its conversation", () => {
  assert.equal(nextConversationAction({ reuses: 2, maxReuses: 2 }), "refresh");
  assert.equal(nextConversationAction({ reuses: 9, maxReuses: 2 }), "refresh");
});

test("a missing or invalid budget falls back to one task per conversation", () => {
  for (const bad of [undefined, 0, -1, Number.NaN]) {
    assert.equal(
      nextConversationAction({ reuses: 1, maxReuses: bad }),
      "refresh",
      `budget ${String(bad)} should behave like 1`,
    );
  }
});

test("a missing reuse count is treated as zero, so the conversation is kept", () => {
  assert.equal(nextConversationAction({ reuses: undefined, maxReuses: 2 }), "append");
});

// ---------------------------------------------------------------------------
// hasLabelledWork — a lane with no work is not started (docs/lanes/POLICY.md)
// ---------------------------------------------------------------------------

const infraLane = { label: "agent:infra", laneLabel: "lane:infra" };

test("a lane is started when an issue carries its precise lane label", () => {
  const issues = [{ labels: [{ name: "lane:infra" }, { name: "agent" }] }];
  assert.equal(hasLabelledWork(infraLane, issues), true);
});

test("a lane with no matching issue has no work", () => {
  const issues = [{ labels: [{ name: "lane:seo" }] }, { labels: ["bug"] }];
  assert.equal(hasLabelledWork(infraLane, issues), false);
});

test("the broad label alone counts, but not when another lane claimed the issue", () => {
  // `agent:infra` is shared by cloudflare and infra; without a lane:* label the
  // issue is unclaimed, so either may act on it.
  assert.equal(
    hasLabelledWork(infraLane, [{ labels: [{ name: "agent:infra" }] }]),
    true,
  );
  // Once `lane:cloudflare` claims it, infra must not also start for it.
  assert.equal(
    hasLabelledWork(infraLane, [
      { labels: [{ name: "agent:infra" }, { name: "lane:cloudflare" }] },
    ]),
    false,
  );
});

test("string labels are accepted as well as label objects", () => {
  assert.equal(hasLabelledWork(infraLane, [{ labels: ["lane:infra"] }]), true);
  assert.equal(hasLabelledWork(infraLane, [{ labels: ["agent:infra"] }]), true);
});

test("a lane with no labels configured never reports work", () => {
  assert.equal(hasLabelledWork({}, [{ labels: ["agent:infra"] }]), false);
});

// ---------------------------------------------------------------------------
// isCapacityError — a quota rejection must not spend an attempt
// ---------------------------------------------------------------------------

test("a quota/capacity rejection is recognised", () => {
  assert.equal(isCapacityError("Daily sandbox limit of 20 reached"), true);
  assert.equal(isCapacityError("quota exceeded"), true);
  assert.equal(isCapacityError("no capacity available"), true);
});

test("an ordinary failure is not treated as a capacity error", () => {
  assert.equal(isCapacityError("repository not found"), false);
  assert.equal(isCapacityError(undefined), false);
});

// ---------------------------------------------------------------------------
// carriedAttempts — the retry budget is per work item, not per lane lifetime
// (issue #471)
// ---------------------------------------------------------------------------

test("a delivered attempt resets the count, so the lane is never stuck exhausted", () => {
  for (const status of ["RUNNING", "REUSED", "RESUMED", "REFRESHED"]) {
    assert.equal(
      carriedAttempts({ attempts: 3, lastStatus: status, work: "handoff:7" }, "handoff:7"),
      0,
      `${status} should clear the count`,
    );
  }
});

test("a rejection keeps the count so a failing lane still stops at the budget", () => {
  assert.equal(
    carriedAttempts({ attempts: 3, lastStatus: "ERROR", work: "handoff:7" }, "handoff:7"),
    3,
  );
});

test("a never-started lane carries nothing", () => {
  assert.equal(carriedAttempts(undefined, "labelled-work"), 0);
  assert.equal(carriedAttempts({ attempts: 0 }, "labelled-work"), 0);
});

test("new work restarts the budget, even after exhaustion", () => {
  // The lane exhausted its three attempts on handoff #7 and never delivered.
  const exhausted = { attempts: 3, lastStatus: "ERROR", work: "handoff:7" };
  // The same work carries the count — it must still stop.
  assert.equal(carriedAttempts(exhausted, "handoff:7"), 3);
  // A new handoff is new work: the lane gets its three attempts back.
  assert.equal(carriedAttempts(exhausted, "handoff:9"), 0);
});

test("a failed attempt on new work carries its count", () => {
  // A lane that failed once on handoff #9 keeps that one failure on the same work.
  assert.equal(
    carriedAttempts({ attempts: 1, lastStatus: "ERROR", work: "handoff:9" }, "handoff:9"),
    1,
  );
});

test("an entry written before the work field existed keeps its count", () => {
  // Legacy state: no `work` recorded, so the signature cannot prove the work
  // changed. Treating it as unchanged is the safe reading — it preserves the
  // budget rather than silently handing an exhausted lane more attempts.
  assert.equal(carriedAttempts({ attempts: 2, lastStatus: "ERROR" }, "handoff:7"), 2);
});

test("workSignature is stable for the same work and distinct for new work", () => {
  assert.equal(workSignature({ handoff: { number: 7 }, branchExists: false }), "handoff:7");
  assert.equal(workSignature({ handoff: { number: 9 }, branchExists: false }), "handoff:9");
  assert.equal(workSignature({ handoff: undefined, branchExists: true }), "stale-branch");
  assert.equal(workSignature({ handoff: undefined, branchExists: false }), "labelled-work");
});

test("fixing an open PR is its own piece of work, keyed by the PR number", () => {
  // A red-PR fix round must not inherit the attempts of the work that opened the
  // PR (or a later handoff): it is a distinct task with its own budget (#453).
  assert.equal(workSignature({ prNumber: 478, handoff: { number: 7 }, branchExists: true }), "pr-fix:478");
  assert.equal(workSignature({ prNumber: 479, handoff: { number: 7 }, branchExists: true }), "pr-fix:479");
});

test("laneDelivered recognises only the statuses that mean work was handed over", () => {
  for (const status of ["RUNNING", "REUSED", "RESUMED", "REFRESHED"]) {
    assert.equal(laneDelivered(status), true);
  }
  for (const status of ["ERROR", null, undefined, "PENDING", ""]) {
    assert.equal(laneDelivered(status), false);
  }
});

// ---------------------------------------------------------------------------
// prCapacity — bound concurrent PRs to shorten the CI runner queue (issue #430)
// ---------------------------------------------------------------------------

test("below the cap every lane may open a PR", () => {
  assert.equal(prCapacity(0, 3), 3);
  assert.equal(prCapacity(1, 3), 2);
  assert.equal(prCapacity(2, 3), 1);
});

test("at or above the cap no new PR is opened", () => {
  assert.equal(prCapacity(3, 3), 0);
  assert.equal(prCapacity(5, 3), 0);
});

test("a missing or non-positive cap means no limit", () => {
  for (const unlimited of [0, -1, undefined, Number.NaN]) {
    assert.equal(prCapacity(50, unlimited), Infinity, `cap ${String(unlimited)} should be unlimited`);
  }
});

test("a missing or negative open count is treated as zero", () => {
  assert.equal(prCapacity(undefined, 3), 3);
  assert.equal(prCapacity(-1, 3), 3);
});

// ---------------------------------------------------------------------------
// failedRequiredChecks — a red required check must respawn the lane (issue #453)
// ---------------------------------------------------------------------------

const REQUIRED = ["Quality, database and E2E"];

test("a failed required check is reported by name", () => {
  const checks = [
    { name: "Quality, database and E2E", conclusion: "FAILURE" },
    { name: "automate", conclusion: "CANCELLED" },
  ];
  assert.deepEqual(failedRequiredChecks(checks, REQUIRED), ["Quality, database and E2E"]);
  assert.equal(requiredCheckFailed(checks, REQUIRED), true);
});

test("a timed-out required check counts as a failure", () => {
  const checks = [{ name: "Quality, database and E2E", conclusion: "TIMED_OUT" }];
  assert.deepEqual(failedRequiredChecks(checks, REQUIRED), REQUIRED);
});

// The bug this guards: PR #478 showed Vercel's `automate` check CANCELLED. That
// is a non-required, external-quota failure; treating it as red would spawn the
// whole team on every build-rate hiccup.
test("a non-required failure never wakes a lane", () => {
  const checks = [
    { name: "Quality, database and E2E", conclusion: "SUCCESS" },
    { name: "automate", conclusion: "CANCELLED" },
    { name: "Vercel", conclusion: "FAILURE" },
  ];
  assert.deepEqual(failedRequiredChecks(checks, REQUIRED), []);
  assert.equal(requiredCheckFailed(checks, REQUIRED), false);
});

test("a pending or absent required check is not a failure", () => {
  assert.equal(
    requiredCheckFailed([{ name: "Quality, database and E2E", status: "IN_PROGRESS", conclusion: null }], REQUIRED),
    false,
  );
  assert.equal(requiredCheckFailed([], REQUIRED), false);
  assert.equal(requiredCheckFailed(undefined, REQUIRED), false);
});

test("the legacy `context` field is matched too", () => {
  // Older rollup entries use `context` where newer ones use `name`.
  assert.deepEqual(
    failedRequiredChecks([{ context: "Quality, database and E2E", conclusion: "FAILURE" }], REQUIRED),
    REQUIRED,
  );
});

test("no configured required checks means nothing can fail", () => {
  const checks = [{ name: "Quality, database and E2E", conclusion: "FAILURE" }];
  assert.equal(requiredCheckFailed(checks, []), false);
  assert.equal(requiredCheckFailed(checks, undefined), false);
});
