import assert from "node:assert/strict";
import test from "node:test";

import {
  BUDGET_API,
  CONDENSER_API,
  CONDENSER_MAX_SIZE,
  MAX_BUDGET_PER_TASK,
  budgetOf,
  budgetPayload,
  condenserDiff,
  condenserOf,
} from "./lane-budget.mjs";

// The budget script guards the two platform settings that bound a lane's token
// spend (#218). They live in *different* documents and the endpoints are not
// interchangeable (verified live, 2026-11-09):
//
//   - the condenser lives in the *user* settings document (`/api/v1/settings`),
//     read from `agent_settings.condenser`;
//   - `max_budget_per_task` lives in the *org app* document
//     (`/api/organizations/app`).
//
// Two live traps these tests pin so they cannot come back:
//   1. `GET /api/organizations/app` has no `agent_settings` field, so reading
//      the condenser there always returns null — the old "the platform drops the
//      condenser" conclusion was a read-path artifact, not a write failure.
//   2. `POST /api/v1/settings` silently ignores `max_budget_per_task`, so the
//      budget cap must be written to the org app endpoint.

test("the condenser endpoint is the user settings document", () => {
  assert.equal(CONDENSER_API, "https://app.all-hands.dev/api/v1/settings");
  assert.doesNotMatch(CONDENSER_API, /organizations/);
});

test("the budget endpoint is the org app document, not the user settings", () => {
  assert.equal(BUDGET_API, "https://app.all-hands.dev/api/organizations/app");
  assert.doesNotMatch(BUDGET_API, /\/v1\/settings/);
});

test("the condenser diff writes an enabled finite condenser with the right key", () => {
  const diff = condenserDiff();
  const condenser = diff.agent_settings_diff.condenser;
  // `condenser_kind` (not `kind`) is the condenser's discriminator in this
  // schema; a wrong key is silently ignored by the settings endpoint.
  assert.equal(condenser.condenser_kind, "llm_summarizing");
  assert.equal(condenser.enabled, true);
  assert.equal(condenser.max_size, CONDENSER_MAX_SIZE);
  assert.ok(Number.isFinite(condenser.max_size));
  assert.equal(condenser.keep_first, 2);
  // The budget must NOT ride along here: this endpoint drops it.
  assert.equal(diff.max_budget_per_task, undefined);
});

test("the budget payload targets only the org app document", () => {
  const budget = budgetPayload();
  assert.equal(budget.max_budget_per_task, MAX_BUDGET_PER_TASK);
  // No condenser here: the org app document has no `agent_settings` field.
  assert.equal(budget.agent_settings_diff, undefined);
});

test("the condenser is read from agent_settings, not agent_settings_diff", () => {
  const settings = {
    max_budget_per_task: 5,
    agent_settings: { condenser: { condenser_kind: "llm_summarizing", max_size: 240 } },
    // A stray org-shaped field must not be mistaken for the real condenser.
    agent_settings_diff: { condenser: null },
  };
  assert.equal(condenserOf(settings).max_size, 240);
});

test("the budget is read from the org app document top level", () => {
  assert.equal(budgetOf({ max_budget_per_task: 5 }), 5);
  assert.equal(budgetOf({ agent_settings: {} }), null);
  assert.equal(budgetOf(null), null);
  assert.equal(budgetOf(undefined), null);
});

test("a missing condenser reads as null, not a crash", () => {
  assert.equal(condenserOf({}), null);
  assert.equal(condenserOf({ agent_settings: {} }), null);
  assert.equal(condenserOf(null), null);
  assert.equal(condenserOf(undefined), null);
});

test("the read-back guard rejects settings the server did not persist", () => {
  const condenser = condenserDiff().agent_settings_diff.condenser;
  const budget = budgetPayload().max_budget_per_task;
  // Mirrors the checks in main(): the condenser must survive enabled with the
  // requested size, and the budget cap must read back from the org document.
  const okCondenser = (c) => c?.max_size === condenser.max_size && c?.enabled === true;
  assert.equal(okCondenser({ max_size: condenser.max_size, enabled: true }), true);
  assert.equal(okCondenser({ max_size: condenser.max_size, enabled: false }), false);
  assert.equal(okCondenser({ max_size: 1e18, enabled: true }), false);
  assert.equal(okCondenser(null), false);
  assert.equal(budgetOf({ max_budget_per_task: budget }), budget);
  // A dropped budget write (user-settings trap) reads back as the old value.
  assert.notEqual(budgetOf({ max_budget_per_task: 0 }), budget);
});
