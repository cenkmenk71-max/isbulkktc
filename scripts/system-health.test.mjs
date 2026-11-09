import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HEALTH_WORKFLOW,
  classifyRedRuns,
  failingWorkflows,
  newestRunPerWorkflow,
  redRunsOnMain,
  redWorkflowsOnMain,
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
