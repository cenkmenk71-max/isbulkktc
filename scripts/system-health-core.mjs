/**
 * Pure decision helpers for the system-health check.
 *
 * `system-health.mjs` talks to GitHub at import time, so it cannot be imported
 * by a unit test. The decision worth pinning — which workflow on the default
 * branch is red — lives here, testable without touching the network.
 */

/**
 * This check's own workflow name, as declared in `.github/workflows/system-health.yml`.
 *
 * Kept here, and asserted against the workflow file by a unit test, so the two
 * cannot drift: renaming the workflow without updating this would silently
 * un-exclude it and re-break the gate.
 */
export const HEALTH_WORKFLOW = 'System health';

/**
 * The newest completed run of each workflow that ran on the default branch.
 *
 * The gate on `main` is not one fixed workflow. `isbulkktc CI` ran on push until
 * #375 dropped that trigger, while `Verify production deployment` kept running
 * and went red; a health check that names a single workflow goes blind the
 * moment the gate moves. Grouping whatever GitHub returns cannot go stale that
 * way — a workflow added tomorrow is covered without a code change.
 *
 * @param {Array<{name?: string, conclusion?: string|null, status?: string, createdAt?: string}>} runs
 * @returns {Map<string, {name: string, conclusion: string|null, createdAt: string}>}
 */
export function newestRunPerWorkflow(runs) {
  const newest = new Map();
  for (const run of runs ?? []) {
    if (!run?.name || run.status !== 'completed') continue;
    const seen = newest.get(run.name);
    if (!seen || String(run.createdAt) > String(seen.createdAt)) {
      newest.set(run.name, run);
    }
  }
  return newest;
}

/**
 * Workflows whose newest completed run on the branch failed.
 *
 * Only `failure` counts: a cancelled run is a superseded push, not a broken
 * gate, and treating it as one would cry wolf on every back-to-back merge.
 *
 * @param {Array<{name?: string, conclusion?: string|null, status?: string, createdAt?: string}>} runs
 * @returns {string[]}
 */
export function failingWorkflows(runs) {
  return [...newestRunPerWorkflow(runs).entries()]
    .filter(([, run]) => run.conclusion === 'failure')
    .map(([name]) => name);
}

/**
 * Workflows whose newest completed run on the branch failed, excluding the
 * health check's own workflow.
 *
 * Without the exclusion the check is self-referential: this workflow runs on a
 * schedule, not on push, so a failing run stays the newest run of its own name
 * on `main` forever. The next run then reads its own last failure, reports
 * "1 workflow(s) red on main: System health", fails, and the cycle repeats —
 * the gate can never go green, and the real red (a stale `push`-triggered run
 * whose trigger no longer fires) hides behind the noise.
 *
 * @param {Array<{name?: string, conclusion?: string|null, status?: string, createdAt?: string}>} runs
 * @returns {string[]}
 */
export function redWorkflowsOnMain(runs) {
  return failingWorkflows(runs).filter((name) => name !== HEALTH_WORKFLOW);
}
