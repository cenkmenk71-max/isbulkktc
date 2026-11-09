import assert from "node:assert/strict";
import test from "node:test";

import {
  carriedAttempts,
  deadConversationLanes,
  diedWithoutWorking,
  exhaustedCooldownElapsed,
  failedRequiredChecks,
  fairOrder,
  hasLabelledWork,
  isCapacityError,
  isInfraRejection,
  laneDelivered,
  nextConversationAction,
  prCapacity,
  requiredCheckFailed,
  stalledConversations,
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
// isInfraRejection — the model closed to the account must not spend an attempt
// (issue #442)
// ---------------------------------------------------------------------------

test("a model-access rejection is an infrastructure failure", () => {
  assert.equal(isInfraRejection("team not allowed to access model openhands/x"), true);
  assert.equal(isInfraRejection("model_access_denied"), true);
  assert.equal(isInfraRejection("team_model_access_denied"), true);
  assert.equal(isInfraRejection("not allowed to access model"), true);
});

test("a capacity rejection is also an infrastructure failure", () => {
  // isInfraRejection subsumes isCapacityError: both are the platform's limit.
  assert.equal(isInfraRejection("Daily sandbox limit of 20 reached"), true);
  assert.equal(isInfraRejection("quota exceeded"), true);
});

test("a lane's own failure is not an infrastructure rejection", () => {
  assert.equal(isInfraRejection("tests failed"), false);
  assert.equal(isInfraRejection(undefined), false);
  assert.equal(isInfraRejection(null), false);
});

// ---------------------------------------------------------------------------
// diedWithoutWorking — the death signature a start task cannot show (issue #442)
// ---------------------------------------------------------------------------

test("an errored conversation that spent nothing died without working", () => {
  // Exactly what a disallowed model produces: execution_status=error, cost 0,
  // while the start task still reports READY — invisible to confirm().
  assert.equal(
    diedWithoutWorking({ execution_status: "error", metrics: { accumulated_cost: 0 } }),
    true,
  );
});

test("a null-status conversation that spent nothing died without working", () => {
  // The observed #442 signature: a sandbox that never produced a turn leaves the
  // status null and the cost zero. This is the case a status-only check misses.
  assert.equal(
    diedWithoutWorking({ execution_status: null, metrics: { accumulated_cost: 0 } }),
    true,
  );
  assert.equal(diedWithoutWorking({ metrics: { accumulated_cost: 0 } }), true);
  assert.equal(
    diedWithoutWorking({ execution_status: "stuck", metrics: { accumulated_cost: 0 } }),
    true,
  );
});

test("an errored conversation that did work is a real failure, not infra", () => {
  // The lane tried and failed: cost > 0 means the platform ran it, so the
  // attempt must count and the lane must stop at its budget.
  assert.equal(
    diedWithoutWorking({ execution_status: "error", metrics: { accumulated_cost: 0.02 } }),
    false,
  );
  assert.equal(
    diedWithoutWorking({ execution_status: null, metrics: { accumulated_cost: 0.05 } }),
    false,
  );
});

test("a conversation that is not in a failed state did not die", () => {
  // A live or between-tasks conversation must never be healed, or a lane mid-turn
  // would lose the attempt it just spent.
  for (const status of ["running", "idle", "paused", "waiting_for_confirmation", "finished"]) {
    assert.equal(
      diedWithoutWorking({ execution_status: status, metrics: { accumulated_cost: 0 } }),
      false,
      `${status} must not count as a death`,
    );
  }
  assert.equal(diedWithoutWorking(undefined), false);
});

test("a missing metrics field on an error reads as zero cost", () => {
  // A rejected spawn may omit metrics entirely; the death is still a death.
  assert.equal(diedWithoutWorking({ execution_status: "error" }), true);
});

// ---------------------------------------------------------------------------
// deadConversationLanes — heal the whole team's poisoned budget at once (#442)
// ---------------------------------------------------------------------------

const dead = { execution_status: "error", metrics: { accumulated_cost: 0 } };
const alive = { execution_status: "running", metrics: { accumulated_cost: 1 } };

test("only lanes whose last conversation died are healed", () => {
  const state = { qa: { attempts: 3 }, seo: { attempts: 3 } };
  const conversations = [
    { title: "LANE-seo", ...alive },
    { title: "LANE-qa", ...dead },
  ];
  assert.deepEqual(deadConversationLanes(state, conversations), ["qa"]);
});

test("the newest conversation wins, so an old death under live work is ignored", () => {
  // The list is newest-first: seo died, then was restarted and is now running.
  const state = { seo: { attempts: 2 } };
  const conversations = [
    { title: "LANE-seo", ...alive },
    { title: "LANE-seo", ...dead },
  ];
  assert.deepEqual(deadConversationLanes(state, conversations), []);
});

test("a lane that spent no attempts has nothing to heal", () => {
  const state = { qa: { attempts: 0 }, seo: {} };
  const conversations = [
    { title: "LANE-qa", ...dead },
    { title: "LANE-seo", ...dead },
  ];
  assert.deepEqual(deadConversationLanes(state, conversations), []);
});

test("a lane with no conversation at all is left alone", () => {
  const state = { qa: { attempts: 3 } };
  assert.deepEqual(deadConversationLanes(state, [{ title: "LANE-seo", ...dead }]), []);
});

test("an empty or missing state heals nothing", () => {
  assert.deepEqual(deadConversationLanes({}, [{ title: "LANE-qa", ...dead }]), []);
  assert.deepEqual(deadConversationLanes(undefined, []), []);
});

// ---------------------------------------------------------------------------
// exhaustedCooldownElapsed — exhaustion is a cooldown, not a dead end (#442)
// ---------------------------------------------------------------------------

test("a lane is retried once its cooldown has elapsed", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const hourAgo = new Date(now - 60 * 60_000).toISOString();
  assert.equal(
    exhaustedCooldownElapsed({ updatedAt: hourAgo }, { now, cooldownMs: 60 * 60_000 }),
    true,
  );
});

test("a lane still inside its cooldown waits", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const tenMinutesAgo = new Date(now - 10 * 60_000).toISOString();
  assert.equal(
    exhaustedCooldownElapsed({ updatedAt: tenMinutesAgo }, { now, cooldownMs: 60 * 60_000 }),
    false,
  );
});

test("a zero cooldown keeps the old dead-end behaviour", () => {
  // 0 (absent) must not start retrying exhausted lanes: the feature is opt-in.
  const ancient = new Date(0).toISOString();
  assert.equal(exhaustedCooldownElapsed({ updatedAt: ancient }, { cooldownMs: 0 }), false);
  assert.equal(exhaustedCooldownElapsed({ updatedAt: ancient }), false);
});

test("an unknown age counts as elapsed so recovery is never blocked", () => {
  // A lane healed by an outage may carry no updatedAt; that must not strand it.
  assert.equal(exhaustedCooldownElapsed({}, { cooldownMs: 60 * 60_000 }), true);
  assert.equal(exhaustedCooldownElapsed(undefined, { cooldownMs: 60 * 60_000 }), true);
  assert.equal(
    exhaustedCooldownElapsed({ updatedAt: "not a date" }, { cooldownMs: 60 * 60_000 }),
    true,
  );
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
// fairOrder — rotate scarce PR slots so the registry tail is not starved (#484)
// ---------------------------------------------------------------------------

test("a lane that has waited longer is ordered ahead of one that just ran", () => {
  const candidates = [{ name: "head" }, { name: "tail" }];
  const state = {
    head: { updatedAt: "2026-11-09T12:58:00Z" },
    tail: { updatedAt: "2026-11-09T06:00:00Z" },
  };
  assert.deepEqual(
    fairOrder(candidates, state).map((d) => d.name),
    ["tail", "head"],
  );
});

test("a lane never started sorts before every lane that has", () => {
  const candidates = [{ name: "started" }, { name: "fresh" }];
  const state = { started: { updatedAt: "2026-11-09T12:58:00Z" } };
  assert.deepEqual(
    fairOrder(candidates, state).map((d) => d.name),
    ["fresh", "started"],
  );
});

test("slots rotate across passes as updatedAt advances", () => {
  const candidates = [{ name: "a" }, { name: "b" }, { name: "c" }];
  // First pass: all fresh, registry order preserved (stable ties).
  const pass1 = fairOrder(candidates, {});
  assert.deepEqual(pass1.map((d) => d.name), ["a", "b", "c"]);
  // After a ran, it falls behind b and c, so the next pass starts elsewhere.
  const state = { a: { updatedAt: "2026-11-09T13:00:00Z" } };
  const pass2 = fairOrder(candidates, state);
  assert.deepEqual(pass2.map((d) => d.name), ["b", "c", "a"]);
  assert.deepEqual(
    pass2.slice(0, 2).map((d) => d.name),
    ["b", "c"],
    "the two slots should go to the lanes that waited, not a",
  );
});

test("equal or unparsable timestamps keep the input order (deterministic)", () => {
  const candidates = [{ name: "x" }, { name: "y" }, { name: "z" }];
  const state = {
    x: { updatedAt: "2026-11-09T13:00:00Z" },
    y: { updatedAt: "2026-11-09T13:00:00Z" },
    z: { updatedAt: "not a date" },
  };
  assert.deepEqual(
    fairOrder(candidates, state).map((d) => d.name),
    ["z", "x", "y"],
  );
});

test("fairOrder does not mutate the input array", () => {
  const candidates = [{ name: "head" }, { name: "tail" }];
  const state = {
    head: { updatedAt: "2026-11-09T12:58:00Z" },
    tail: { updatedAt: "2026-11-09T06:00:00Z" },
  };
  fairOrder(candidates, state);
  assert.deepEqual(candidates.map((d) => d.name), ["head", "tail"]);
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

// ---------------------------------------------------------------------------
// stalledConversations — break a lane loop the platform never stops
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-11-09T12:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString();
const runningLane = (over = {}) => ({
  title: "LANE-qa",
  execution_status: "running",
  created_at: hoursAgo(1),
  pr_number: [],
  pull_requests: [],
  ...over,
});

test("a running lane past the budget with no PR is stalled", () => {
  const stalled = stalledConversations([runningLane({ created_at: hoursAgo(5) })], {
    now: NOW,
    maxRuntimeMs: 2 * 3600_000,
  });
  assert.equal(stalled.length, 1);
  assert.equal(stalled[0].title, "LANE-qa");
});

test("a lane inside the budget is not stalled", () => {
  assert.deepEqual(
    stalledConversations([runningLane({ created_at: hoursAgo(1) })], {
      now: NOW,
      maxRuntimeMs: 2 * 3600_000,
    }),
    [],
  );
});

test("a lane that opened a PR is never interrupted, however old", () => {
  // pr_number is the array the API actually returns; a bare `[]` is truthy.
  assert.deepEqual(
    stalledConversations([runningLane({ created_at: hoursAgo(20), pr_number: [123] })], {
      now: NOW,
      maxRuntimeMs: 2 * 3600_000,
    }),
    [],
  );
  assert.deepEqual(
    stalledConversations([runningLane({ created_at: hoursAgo(20), pull_requests: [{ number: 7 }] })], {
      now: NOW,
      maxRuntimeMs: 2 * 3600_000,
    }),
    [],
  );
});

test("only running lanes are considered", () => {
  for (const status of ["idle", "error", "finished", "stuck", "paused", null, ""]) {
    assert.deepEqual(
      stalledConversations([runningLane({ execution_status: status, created_at: hoursAgo(20) })], {
        now: NOW,
        maxRuntimeMs: 2 * 3600_000,
      }),
      [],
    );
  }
});

test("the guard only governs lane conversations", () => {
  // The operator's own conversation (and any other human-run one) is left alone.
  assert.deepEqual(
    stalledConversations([runningLane({ title: "Merhaba uzman", created_at: hoursAgo(20) })], {
      now: NOW,
      maxRuntimeMs: 2 * 3600_000,
    }),
    [],
  );
});

test("a non-positive or missing budget disables the guard", () => {
  const old = runningLane({ created_at: hoursAgo(50) });
  assert.deepEqual(stalledConversations([old], { now: NOW, maxRuntimeMs: 0 }), []);
  assert.deepEqual(stalledConversations([old], { now: NOW }), []);
  assert.deepEqual(stalledConversations([old], { now: NOW, maxRuntimeMs: Number.NaN }), []);
});

test("an unparseable created_at is skipped, not interrupted", () => {
  assert.deepEqual(
    stalledConversations([runningLane({ created_at: "not-a-date" })], {
      now: NOW,
      maxRuntimeMs: 2 * 3600_000,
    }),
    [],
  );
});

test("missing or empty input yields nothing", () => {
  assert.deepEqual(stalledConversations(undefined, { now: NOW, maxRuntimeMs: 3600_000 }), []);
  assert.deepEqual(stalledConversations([], { now: NOW, maxRuntimeMs: 3600_000 }), []);
});

test("several stalled lanes are all returned in input order", () => {
  const stalled = stalledConversations(
    [
      runningLane({ title: "LANE-qa", created_at: hoursAgo(4) }),
      runningLane({ title: "LANE-seo", created_at: hoursAgo(1) }),
      runningLane({ title: "LANE-auth", created_at: hoursAgo(9) }),
    ],
    { now: NOW, maxRuntimeMs: 2 * 3600_000 },
  );
  assert.deepEqual(
    stalled.map((c) => c.title),
    ["LANE-qa", "LANE-auth"],
  );
});
