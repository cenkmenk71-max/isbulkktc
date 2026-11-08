import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HEALTH_WORKFLOW,
  failingWorkflows,
  newestRunPerWorkflow,
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
