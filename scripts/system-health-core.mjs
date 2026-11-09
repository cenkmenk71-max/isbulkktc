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
 * The newest failed run of each workflow on the branch, excluding the health
 * check's own workflow, as the run objects themselves (so the caller can read
 * fields `newestRunPerWorkflow` kept, such as `databaseId`).
 *
 * Without the exclusion the check is self-referential: this workflow runs on a
 * schedule, not on push, so a failing run stays the newest run of its own name
 * on `main` forever. The next run then reads its own last failure, reports
 * "1 workflow(s) red on main: System health", fails, and the cycle repeats —
 * the gate can never go green, and the real red (a stale `push`-triggered run
 * whose trigger no longer fires) hides behind the noise.
 *
 * @param {Array<{name?: string, conclusion?: string|null, status?: string, createdAt?: string}>} runs
 * @returns {Array<{name: string, conclusion: string|null, createdAt: string}>}
 */
export function redRunsOnMain(runs) {
  return [...newestRunPerWorkflow(runs).values()].filter(
    (run) => run.conclusion === 'failure' && run.name !== HEALTH_WORKFLOW,
  );
}

/**
 * Workflows whose newest completed run on the branch failed, excluding the
 * health check's own workflow.
 *
 * @param {Array<{name?: string, conclusion?: string|null, status?: string, createdAt?: string}>} runs
 * @returns {string[]}
 */
export function redWorkflowsOnMain(runs) {
  return redRunsOnMain(runs).map((run) => run.name);
}

/**
 * Split the red workflows on `main` into real failures and transient startup
 * glitches.
 *
 * GitHub's scheduler occasionally reports a run as `failure` without ever
 * starting a job — the runner never picked the run up, so it has zero jobs and
 * no logs. Counting that as "main CI red" makes the gate fail on a GitHub
 * hiccup, and worse, the false red buries a real one in the same report. A red
 * run that actually ran a job (job count > 0) is a real failure; a red run with
 * zero jobs is a glitch, worth a warning, not a failure.
 *
 * When the job count is unknown (`null` — the lookup failed) the run is treated
 * as real. A check must never turn a red into a green just because it could not
 * look; fail-safe here means the gate stays loud until it has proof of a glitch.
 *
 * @param {Array<{name: string, jobCount?: number|null}>} redRuns
 * @returns {{real: string[], glitches: string[]}}
 */
export function classifyRedRuns(redRuns) {
  const real = [];
  const glitches = [];
  for (const run of redRuns ?? []) {
    const jobs = run?.jobCount;
    if (Number.isFinite(jobs) && jobs === 0) glitches.push(run.name);
    else real.push(run.name);
  }
  return { real, glitches };
}
