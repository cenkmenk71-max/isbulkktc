import assert from "node:assert/strict";
import test from "node:test";

import { laneName, reapStalledSandboxes, selectStalledSandboxes } from "./reap-stalled-sandboxes.mjs";

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

test("an interrupted (paused) conversation's sandbox is reclaimed", () => {
  // An interrupt — the operator stopping a zombie, or a lane paused mid-run —
  // leaves the conversation `paused` but its sandbox RUNNING. Counting `paused`
  // as active stranded those sandboxes and kept the capacity deadlock (#218)
  // alive; it is now a reclaimable state.
  const stalled = selectStalledSandboxes(
    [conversation("sbx-1", "paused", 30, "LANE-auth")],
    { minIdleMs: 15 * MINUTE, now: NOW },
  );
  assert.deepEqual(sandboxIds(stalled), ["sbx-1"]);
  assert.equal(stalled[0].status, "paused");
});

test("a sandbox with a live conversation is spared despite a paused one", () => {
  // Same shared-sandbox guard as the idle case, now for `paused`: a paused old
  // conversation must not drag a sandbox that a live conversation still owns.
  const stalled = selectStalledSandboxes(
    [
      conversation("sbx-1", "paused", 40),
      conversation("sbx-1", "running", 2),
    ],
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

// --- reapStalledSandboxes orchestration -------------------------------------
// The orchestration is what talks to the API: the max-pauses cap, the
// already-gone handling and failure collection. A fake `request` exercises it
// without a network, so the wiring is tested, not just the pure decision.

/** A fake request that answers the conversation list and each pause by path. */
function fakeRequest({ items, pauseStatus = 200 }) {
  const pausedPaths = [];
  const request = async (_key, path, method = "GET") => {
    if (path.startsWith("/app-conversations/search")) {
      return { status: 200, body: { items } };
    }
    const match = /^\/sandboxes\/([^/]+)\/pause$/.exec(path);
    if (match && method === "POST") {
      pausedPaths.push(match[1]);
      return { status: pauseStatus, body: {} };
    }
    throw new Error(`unexpected request: ${method} ${path}`);
  };
  return { request, pausedPaths };
}

test("reap pauses each stalled sandbox and reports it", async () => {
  const { request, pausedPaths } = fakeRequest({
    items: [
      conversation("sbx-1", "error", 30),
      conversation("sbx-2", "finished", 40),
    ],
  });
  const result = await reapStalledSandboxes({
    key: "k",
    request,
    minIdleMinutes: 15,
    now: NOW,
  });
  assert.deepEqual(pausedPaths.sort(), ["sbx-1", "sbx-2"]);
  assert.equal(result.paused.length, 2);
  assert.equal(result.failures.length, 0);
});

test("reap in dry-run mode finds candidates but pauses nothing", async () => {
  const { request, pausedPaths } = fakeRequest({
    items: [conversation("sbx-1", "error", 30)],
  });
  const result = await reapStalledSandboxes({
    key: "k",
    request,
    apply: false,
    minIdleMinutes: 15,
    now: NOW,
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.toPause.length, 1);
  assert.equal(result.paused.length, 0);
  assert.deepEqual(pausedPaths, []);
});

test("reap honours the max-pauses cap so one run cannot free the whole budget", async () => {
  const { request, pausedPaths } = fakeRequest({
    items: [
      conversation("sbx-1", "error", 30),
      conversation("sbx-2", "error", 40),
      conversation("sbx-3", "error", 50),
    ],
  });
  const result = await reapStalledSandboxes({
    key: "k",
    request,
    maxPauses: 2,
    minIdleMinutes: 15,
    now: NOW,
  });
  assert.equal(result.toPause.length, 2);
  assert.equal(pausedPaths.length, 2);
});

test("a 404 means the platform already reclaimed it, not a failure", async () => {
  const { request } = fakeRequest({
    items: [conversation("sbx-1", "error", 30)],
    pauseStatus: 404,
  });
  const result = await reapStalledSandboxes({
    key: "k",
    request,
    minIdleMinutes: 15,
    now: NOW,
  });
  assert.equal(result.gone.length, 1);
  assert.equal(result.paused.length, 0);
  assert.equal(result.failures.length, 0);
});

test("a pause error is collected, not thrown", async () => {
  const { request } = fakeRequest({
    items: [conversation("sbx-1", "error", 30)],
    pauseStatus: 500,
  });
  const result = await reapStalledSandboxes({
    key: "k",
    request,
    minIdleMinutes: 15,
    now: NOW,
  });
  assert.equal(result.paused.length, 0);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /HTTP 500/);
});

test("reap refuses to run without an API key", async () => {
  await assert.rejects(
    () => reapStalledSandboxes({ key: "", minIdleMinutes: 15, now: NOW }),
    /OPENHANDS_API_KEY/,
  );
});
