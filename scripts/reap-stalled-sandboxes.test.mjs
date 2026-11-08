import assert from "node:assert/strict";
import test from "node:test";

import { laneName, selectStalledSandboxes } from "./reap-stalled-sandboxes.mjs";

// The selection decides which sandbox is paused. Pausing the wrong one stops a
// working agent; failing to pause a stranded one keeps the capacity deadlock in
// issue #218 alive. These tests pin the safety boundaries.

const MINUTE = 60_000;
const NOW = 1_700_000_000_000;

/** A conversation on `sandboxId` in `status`, last touched `minutesAgo`. */
function conversation(sandboxId, status, minutesAgo, title = "LANE-geo") {
  return {
    sandbox_id: sandboxId,
    sandbox_status: "RUNNING",
    execution_status: status,
    title,
    updated_at: new Date(NOW - minutesAgo * MINUTE).toISOString(),
  };
}

const sandboxIds = (list) => list.map((s) => s.sandboxId).sort();

test("a sandbox whose only conversation errored long ago is reaped", () => {
  const stalled = selectStalledSandboxes(
    [conversation("sbx-1", "error", 30)],
    { minIdleMs: 15 * MINUTE, now: NOW },
  );
  assert.deepEqual(sandboxIds(stalled), ["sbx-1"]);
  assert.equal(stalled[0].lane, "geo");
  assert.equal(stalled[0].status, "error");
});

test("a running conversation is never paused", () => {
  const stalled = selectStalledSandboxes(
    [conversation("sbx-1", "running", 30)],
    { minIdleMs: 15 * MINUTE, now: NOW },
  );
  assert.deepEqual(stalled, []);
});

test("an idle conversation is left alone: it is the autopilot reuse target", () => {
  const stalled = selectStalledSandboxes(
    [conversation("sbx-1", "idle", 30)],
    { minIdleMs: 15 * MINUTE, now: NOW },
  );
  assert.deepEqual(stalled, []);
});

test("waiting_for_confirmation is a human block, not a terminal state", () => {
  const stalled = selectStalledSandboxes(
    [conversation("sbx-1", "waiting_for_confirmation", 30)],
    { minIdleMs: 15 * MINUTE, now: NOW },
  );
  assert.deepEqual(stalled, []);
});

test("a shared sandbox with a live conversation is spared despite an old terminal one", () => {
  // The lane refreshes its conversation on the same sandbox: an old errored
  // conversation and a live idle one coexist. The live one wins.
  const stalled = selectStalledSandboxes(
    [
      conversation("sbx-1", "error", 40),
      conversation("sbx-1", "idle", 2),
    ],
    { minIdleMs: 15 * MINUTE, now: NOW },
  );
  assert.deepEqual(stalled, []);
});

test("a sandbox that only just went terminal is left for the next pass", () => {
  const stalled = selectStalledSandboxes(
    [conversation("sbx-1", "error", 5)],
    { minIdleMs: 15 * MINUTE, now: NOW },
  );
  assert.deepEqual(stalled, []);
});

test("a sandbox the platform already reclaimed is skipped", () => {
  const gone = { ...conversation("sbx-1", "error", 30), sandbox_status: "MISSING" };
  const stalled = selectStalledSandboxes([gone], {
    minIdleMs: 15 * MINUTE,
    now: NOW,
  });
  assert.deepEqual(stalled, []);
});

test("the newest updated_at among a sandbox's conversations sets idle time", () => {
  const stalled = selectStalledSandboxes(
    [
      conversation("sbx-1", "error", 90),
      conversation("sbx-1", "finished", 20),
    ],
    { minIdleMs: 15 * MINUTE, now: NOW },
  );
  assert.equal(stalled.length, 1);
  assert.equal(stalled[0].conversations, 2);
  assert.ok(Math.abs(stalled[0].idleMs - 20 * MINUTE) < 1000);
});

test("candidates come back oldest first so the worst leak is fixed first", () => {
  const stalled = selectStalledSandboxes(
    [
      conversation("sbx-young", "error", 20, "LANE-tasarim"),
      conversation("sbx-old", "error", 120, "LANE-qa"),
    ],
    { minIdleMs: 15 * MINUTE, now: NOW },
  );
  assert.deepEqual(sandboxIds(stalled), ["sbx-old", "sbx-young"]);
});

test("conversations without a sandbox_id are ignored", () => {
  const stalled = selectStalledSandboxes(
    [{ execution_status: "error", updated_at: new Date(NOW).toISOString() }],
    { minIdleMs: 0, now: NOW },
  );
  assert.deepEqual(stalled, []);
});

test("laneName reads the lane out of a title and rejects non-lanes", () => {
  assert.equal(laneName("LANE-operator"), "operator");
  assert.equal(laneName("LANE-geo"), "geo");
  assert.equal(laneName("Some other conversation"), null);
  assert.equal(laneName(undefined), null);
});
