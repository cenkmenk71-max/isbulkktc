#!/usr/bin/env node
/**
 * Read or set the OpenHands organization settings that bound a lane's token
 * spend (issue #218).
 *
 * Two of the four root causes of the 520M-token leak are *platform* settings,
 * not repository code:
 *
 *   1. the conversation condenser is effectively off (`max_size` of 1e18 never
 *      triggers a summary, so every turn re-sends the whole history), and
 *   2. `max_budget_per_task` is unset, so a runaway loop has no ceiling.
 *
 * The conversation-start API does not accept either field, so the only lever is
 * the organization app settings endpoint. This script reads them, and — only
 * with `--apply` — writes the two values that cap spend.
 *
 * Usage:
 *   node scripts/lane-budget.mjs            # print the current settings
 *   node scripts/lane-budget.mjs --apply    # set the condenser + budget cap
 *   DRY_RUN=1 node scripts/lane-budget.mjs --apply   # print the PATCH only
 *
 * Needs OPENHANDS_API_KEY (the same secret the autopilot workflow uses). The
 * endpoint is org-wide, so applying is an operator action: it affects every
 * conversation, not only the lanes.
 */

const API = 'https://app.all-hands.dev/api/organizations/app';

/** The history size, in events, at which the condenser starts summarizing. */
const CONDENSER_MAX_SIZE = 240;
/** Hard ceiling, in dollars, for a single conversation's accumulated cost. */
const MAX_BUDGET_PER_TASK = 5;

const key = process.env.OPENHANDS_API_KEY;

function headers() {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function readSettings() {
  const response = await fetch(API, { headers: headers() });
  if (!response.ok) {
    throw new Error(`GET ${API} -> HTTP ${response.status} ${await response.text()}`);
  }
  return response.json();
}

/**
 * The org settings diff that turns the condenser on with a real size bound and
 * sets a per-task budget ceiling.
 *
 * `agent_settings_diff` is a partial override of the agent settings; the SDK
 * accepts a nested `condenser` there. `max_size` is the event count that
 * triggers summarization — a finite value is what the 1e18 default defeated.
 */
function desiredSettings() {
  return {
    max_budget_per_task: MAX_BUDGET_PER_TASK,
    agent_settings_diff: {
      condenser: {
        kind: 'LLMSummarizingCondenser',
        max_size: CONDENSER_MAX_SIZE,
        keep_first: 2,
        minimum_progress: 0.1,
      },
    },
  };
}

async function main() {
  if (!key) {
    console.error('OPENHANDS_API_KEY is not set');
    process.exit(1);
  }

  const apply = process.argv.includes('--apply');
  const current = await readSettings();
  console.log('current organization settings:');
  console.log(`  max_budget_per_task: ${JSON.stringify(current.max_budget_per_task)}`);
  console.log(
    `  condenser: ${JSON.stringify(current.agent_settings_diff?.condenser ?? null)}`,
  );

  const desired = desiredSettings();
  if (!apply) {
    console.log('\nwould set (pass --apply to write):');
    console.log(`  max_budget_per_task: ${desired.max_budget_per_task}`);
    console.log(
      `  condenser: kind=${desired.agent_settings_diff.condenser.kind} max_size=${desired.agent_settings_diff.condenser.max_size}`,
    );
    return;
  }

  if (process.env.DRY_RUN === '1') {
    console.log('\nDRY_RUN=1 — PATCH body:');
    console.log(JSON.stringify(desired, null, 2));
    return;
  }

  const response = await fetch(API, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(desired),
  });
  if (!response.ok) {
    throw new Error(`POST ${API} -> HTTP ${response.status} ${await response.text()}`);
  }

  const updated = await response.json();
  console.log('\napplied:');
  console.log(`  max_budget_per_task: ${JSON.stringify(updated.max_budget_per_task)}`);
  console.log(
    `  condenser: ${JSON.stringify(updated.agent_settings_diff?.condenser ?? null)}`,
  );
  if (
    updated.max_budget_per_task !== desired.max_budget_per_task ||
    !updated.agent_settings_diff?.condenser
  ) {
    console.error(
      '\nthe server did not echo the requested settings — verify with a fresh read before relying on them',
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
