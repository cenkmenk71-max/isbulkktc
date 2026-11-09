#!/usr/bin/env node
/**
 * Read or set the OpenHands settings that bound a lane's token spend
 * (issue #218).
 *
 * Two of the four root causes of the 520M-token leak are *platform* settings,
 * not repository code:
 *
 *   1. the conversation condenser never summarizes early enough, so every turn
 *      re-sends the whole history, and
 *   2. `max_budget_per_task` is unset, so a runaway loop has no ceiling.
 *
 * These two settings live in **different** documents, and the endpoints are not
 * interchangeable (verified live, 2026-11-09):
 *
 *   | setting              | read + write endpoint                | field                        |
 *   |----------------------|--------------------------------------|------------------------------|
 *   | condenser            | `/api/v1/settings` (user settings)   | `agent_settings.condenser`   |
 *   | `max_budget_per_task`| `/api/organizations/app` (org app)   | `max_budget_per_task`        |
 *
 * Two traps this script exists to avoid:
 *
 *   - `GET /api/organizations/app` does **not** expose `agent_settings` at all
 *     (its response model is only `{enable_proactive_conversation_starters,
 *     max_budget_per_task, registered_marketplaces, updated_at}`). Reading the
 *     condenser from there always echoes `null` — the earlier "the platform
 *     silently drops the condenser" conclusion was a **read-path** artifact, not
 *     a write failure. The condenser was set correctly all along.
 *   - `POST /api/v1/settings` **silently ignores** `max_budget_per_task`: it
 *     answers `{"message":"Settings stored"}` but the value does not change. The
 *     budget cap is only writable through the org app endpoint.
 *
 * The condenser's discriminator is `condenser_kind` (not `kind`); a wrong key is
 * silently ignored. The user-settings condenser is what the harness loads for a
 * conversation, and it overrides the org defaults, so it is the one this script
 * writes.
 *
 * Usage:
 *   node scripts/lane-budget.mjs            # print the current settings
 *   node scripts/lane-budget.mjs --apply    # set the condenser + budget cap
 *   DRY_RUN=1 node scripts/lane-budget.mjs --apply   # print the POST bodies only
 *
 * Needs OPENHANDS_API_KEY (the same secret the autopilot workflow uses). Both
 * documents are account-wide, so applying is an operator action: it affects
 * every conversation, not only the lanes.
 */

import { pathToFileURL } from "node:url";

/** User settings document: reads and writes the condenser. */
export const CONDENSER_API = 'https://app.all-hands.dev/api/v1/settings';
/** Org app settings document: the only place `max_budget_per_task` persists. */
export const BUDGET_API = 'https://app.all-hands.dev/api/organizations/app';

/** The history size, in events, at which the condenser starts summarizing. */
export const CONDENSER_MAX_SIZE = 240;
/** Hard ceiling, in dollars, for a single conversation's accumulated cost. */
export const MAX_BUDGET_PER_TASK = 5;

const key = process.env.OPENHANDS_API_KEY;

function headers() {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function get(url) {
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    throw new Error(`GET ${url} -> HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${url} -> HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

/**
 * The user-settings diff that turns the condenser on with a real size bound.
 *
 * `agent_settings_diff` is a partial override of `agent_settings`; the SDK
 * accepts a nested `condenser` there. The discriminator is `condenser_kind`.
 */
export function condenserDiff() {
  return {
    agent_settings_diff: {
      condenser: {
        condenser_kind: 'llm_summarizing',
        enabled: true,
        max_size: CONDENSER_MAX_SIZE,
        keep_first: 2,
        minimum_progress: 0.1,
      },
    },
  };
}

/**
 * The org app settings payload that sets the per-task budget ceiling. It must go
 * to {@link BUDGET_API}: `/api/v1/settings` accepts the field but drops it.
 */
export function budgetPayload() {
  return { max_budget_per_task: MAX_BUDGET_PER_TASK };
}

/** The condenser object inside a user settings document, or null when absent. */
export function condenserOf(settings) {
  return settings?.agent_settings?.condenser ?? null;
}

/** The per-task budget ceiling in an org app settings document, or null. */
export function budgetOf(settings) {
  return settings?.max_budget_per_task ?? null;
}

async function main() {
  if (!key) {
    console.error('OPENHANDS_API_KEY is not set');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const [userSettings, orgApp] = await Promise.all([get(CONDENSER_API), get(BUDGET_API)]);
  console.log('current settings:');
  console.log(`  max_budget_per_task: ${JSON.stringify(budgetOf(orgApp))}`);
  console.log(`  condenser: ${JSON.stringify(condenserOf(userSettings))}`);

  const diff = condenserDiff();
  const budget = budgetPayload();
  if (!apply) {
    console.log('\nwould set (pass --apply to write):');
    console.log(`  max_budget_per_task: ${budget.max_budget_per_task}`);
    console.log(
      `  condenser: kind=${diff.agent_settings_diff.condenser.condenser_kind} max_size=${diff.agent_settings_diff.condenser.max_size}`,
    );
    return;
  }

  if (process.env.DRY_RUN === '1') {
    console.log('\nDRY_RUN=1 — POST bodies:');
    console.log(`POST ${CONDENSER_API}`);
    console.log(JSON.stringify(diff, null, 2));
    console.log(`POST ${BUDGET_API}`);
    console.log(JSON.stringify(budget, null, 2));
    return;
  }

  await post(CONDENSER_API, diff);
  await post(BUDGET_API, budget);

  // The POSTs only acknowledge the write; read both documents back to prove it.
  const [updatedUser, updatedOrg] = await Promise.all([get(CONDENSER_API), get(BUDGET_API)]);
  const condenser = condenserOf(updatedUser);
  const budgetCap = budgetOf(updatedOrg);
  console.log('\napplied:');
  console.log(`  max_budget_per_task: ${JSON.stringify(budgetCap)}`);
  console.log(`  condenser: ${JSON.stringify(condenser)}`);
  if (
    budgetCap !== budget.max_budget_per_task ||
    condenser?.max_size !== diff.agent_settings_diff.condenser.max_size ||
    condenser?.enabled !== true
  ) {
    console.error(
      '\nthe server did not echo the requested settings — verify with a fresh read before relying on them',
    );
    process.exitCode = 1;
  }
}

// Only run when executed directly; a test may import the pure helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
