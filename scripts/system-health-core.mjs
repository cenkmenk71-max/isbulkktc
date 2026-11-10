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

/**
 * Whether GitHub has left a pull request's merge state uncomputed.
 *
 * `mergeStateStatus` is computed lazily: the first read after a push returns
 * `UNKNOWN` ("the merge state could not be computed"), and the very same PR
 * reads `CLEAN` a moment later. `UNKNOWN` (or a missing value) is therefore
 * "cannot judge", not "not moving".
 *
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
export function isUnresolvedMergeState(status) {
  return status == null || status === 'UNKNOWN';
}

/**
 * Open pull requests that are old and genuinely not moving.
 *
 * The point of this warning is to surface a PR nobody is advancing. A PR whose
 * merge state GitHub has not computed yet is not evidence of that: treating
 * `UNKNOWN` as "not CLEAN" made the check cry wolf about a mergeable PR (#493
 * sat `CLEAN` while the check called it stuck), and a false warning buries the
 * real one behind it — the same "the indicator reads its own error" family as
 * the zero-job run glitch. A PR is stuck only when its state is *known* and
 * not `CLEAN`; `UNKNOWN`/missing is skipped so the next pass (by which time
 * GitHub has resolved it) decides.
 *
 * @param {Array<{number: number, mergeStateStatus?: string|null, createdAt?: string}>} prs
 * @param {{now?: number, maxAgeHours?: number}} [options]
 * @returns {Array<object>}
 */
export function stuckPullRequests(prs, { now = Date.now(), maxAgeHours = 3 } = {}) {
  return (prs ?? []).filter((pr) => {
    if (!pr || isUnresolvedMergeState(pr.mergeStateStatus)) return false;
    const ageHours = (now - new Date(pr.createdAt).getTime()) / 3600000;
    return pr.mergeStateStatus !== 'CLEAN' && ageHours > maxAgeHours;
  });
}

/**
 * Vercel's marker for a deployment the account is no longer allowed to serve.
 *
 * `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` means the
 * account is blocked, suspended or over quota. It is an account state, not an
 * application bug: the origin is down for every visitor and redeploying does not
 * fix it. Kept as a pure predicate (mirroring `verify-production-deployment.mjs`)
 * so the probe's verdict is testable without the network.
 *
 * @param {number|null|undefined} status
 * @param {string|null|undefined} vercelError
 * @returns {boolean}
 */
export function isDeploymentDisabled(status, vercelError) {
  if (status === 402) return true;
  return (
    typeof vercelError === 'string' &&
    vercelError.trim().toUpperCase() === 'DEPLOYMENT_DISABLED'
  );
}

/**
 * Classify a reachability probe of the production origin.
 *
 * The operator's other checks read GitHub's view of the world: a red workflow, a
 * stalled PR. None of them can see that the site itself is gone. On 2026-11-10
 * `push-dispatch` had been failing every ten minutes for two hours while the
 * health check only named the symptom workflow — and the origin answered
 * `402 DEPLOYMENT_DISABLED` to everyone. A red workflow is a symptom; "the site
 * is down" is the finding, and it must be read directly from the origin.
 *
 * A 402 / `DEPLOYMENT_DISABLED` is a hard failure: the site is down for real
 * visitors, which outranks a workflow that merely reports it. A 403/429 is the
 * edge blocking the probe (Cloudflare answers datacenter IPs that way) — that is
 * "could not verify", a warning, never a failure. A network error is likewise
 * "could not verify" rather than "down": the probe has no evidence either way,
 * so it warns instead of inventing an outage.
 *
 * @param {{status?: number|null, vercelError?: string|null, networkError?: string|null}} probe
 * @returns {{level: 'ok'|'warn'|'fail', detail: string}}
 */
export function classifyProductionProbe(probe) {
  const { status, vercelError, networkError } = probe ?? {};
  if (networkError) {
    return { level: 'warn', detail: `could not reach the origin (${networkError})` };
  }
  if (typeof status !== 'number') {
    return { level: 'warn', detail: 'probe returned no status' };
  }
  if (isDeploymentDisabled(status, vercelError)) {
    return {
      level: 'fail',
      detail: `DOWN: HTTP ${status} DEPLOYMENT_DISABLED (Vercel account blocked or over quota)`,
    };
  }
  if (status >= 200 && status < 400) {
    return { level: 'ok', detail: `serving (HTTP ${status})` };
  }
  if (status === 403 || status === 429) {
    return { level: 'warn', detail: `HTTP ${status} (edge blocked the probe — could not verify)` };
  }
  return { level: 'fail', detail: `origin answered HTTP ${status}` };
}
