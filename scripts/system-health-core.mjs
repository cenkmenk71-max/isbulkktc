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
 * CI job names that only aggregate other jobs, so they carry no gate of their own.
 *
 * `Quality, database and E2E` in `.github/workflows/ci.yml` declares
 * `needs: [static, database, e2e]` and does nothing but fail when any of them
 * failed; branch protection still requires it so the required-check name never
 * moves. Because it mirrors its dependencies, it is red on every PR exactly when
 * `static` is red, which makes `queueGlobalGates` read one shared cause as two
 * independent gates ("Static checks" *and* "Quality, database and E2E"). Naming
 * the aggregator as a second cause inflates one freeze into two and hides that
 * the aggregator has no failure to fix — the cause is always its dependency.
 *
 * Kept here, and asserted against the workflow file by a unit test, so renaming
 * the aggregator job cannot silently re-introduce the double count.
 */
export const CI_AGGREGATOR_CHECKS = new Set(['Quality, database and E2E']);

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
 * A check conclusion that means "this gate is red".
 *
 * `CANCELLED` is deliberately absent: a back-to-back push cancels the older run
 * on purpose, so a cancelled check is a superseded push, not a broken gate —
 * the same distinction `failingWorkflows` draws for workflow runs.
 */
const RED_CONCLUSIONS = new Set(['FAILURE', 'ERROR', 'TIMED_OUT']);
const RED_STATES = new Set(['FAILURE', 'ERROR']);

/**
 * Whether a single check in a PR's rollup is red.
 *
 * The rollup mixes two shapes: Actions check runs carry `conclusion`/`status`,
 * commit status contexts carry `state`. Read whichever is present.
 *
 * @param {{conclusion?: string|null, state?: string|null}} check
 * @returns {boolean}
 */
export function isRedCheck(check) {
  if (!check) return false;
  const conclusion = (check.conclusion ?? '').toUpperCase();
  if (RED_CONCLUSIONS.has(conclusion)) return true;
  return RED_STATES.has((check.state ?? '').toUpperCase());
}

/**
 * Open pull requests that are blocked by a *red* check.
 *
 * `stuckPullRequests` only sees the merge state: a PR is "not moving" when its
 * state is known and not `CLEAN`. That is blind to *why*. On 2026-11-10 the
 * queue-global `lane-collisions` gate went red on one lane's PR and every other
 * open PR read `BLOCKED` too; the health check reported "PRs: N open, all
 * moving" while nothing could merge — the watchdog read "not aged out" as
 * "advancing". A merge state of `BLOCKED` with a red check is the specific,
 * actionable state the operator must name: nobody advances it because a gate
 * refuses it, and it stays red until the owning lane fixes the cause.
 *
 * Unlike `stuckPullRequests` this is *not* age-gated. The `UNKNOWN` merge state
 * already covers the window right after a push (GitHub computes the merge state
 * lazily), and a `FAILURE` in the rollup is for the current head SHA — a durable
 * verdict on this commit, not the merge-state churn the age gate exists to
 * smooth over. Age-gating here would leave a multi-hour blind window in which
 * the watchdog keeps claiming the queue is moving while it is frozen.
 *
 * @param {Array<{number: number, mergeStateStatus?: string|null, statusCheckRollup?: Array<object>|null}>} prs
 * @returns {Array<{number: number, redChecks: string[]}>}
 */
export function redPullRequests(prs) {
  const red = [];
  for (const pr of prs ?? []) {
    if (!pr || isUnresolvedMergeState(pr.mergeStateStatus)) continue;
    if (pr.mergeStateStatus === 'CLEAN') continue;
    const redChecks = (pr.statusCheckRollup ?? [])
      .filter(isRedCheck)
      .map((check) => check.name ?? check.context ?? '(unnamed check)');
    if (redChecks.length > 0) red.push({ number: pr.number, redChecks });
  }
  return red;
}

/**
 * Red checks that refuse more than one open pull request at once.
 *
 * Some gates read *every* open PR instead of just the one they run on:
 * `lane-collisions.mjs` fails when any lane edits a file it does not own, so a
 * single lane's mistake marks that check red on *every* PR in the queue. That is
 * a self-inflicted freeze — the queue cannot drain no matter how healthy each
 * individual PR is — and it is a different diagnosis from a PR failing its own
 * tests. `redPullRequests` names the gate per PR but cannot say it is shared, so
 * the operator sees two unrelated reds instead of one systemic cause.
 *
 * A check is queue-global when the same check name is red on two or more open
 * PRs. One PR alone cannot distinguish "my gate is broken" from "a shared gate
 * is broken", so a single red is deliberately not reported here.
 *
 * Aggregator checks (`CI_AGGREGATOR_CHECKS`) are excluded: they only mirror their
 * dependencies, so counting them would report one shared cause as two gates and
 * point the operator at a job that has nothing of its own to fix.
 *
 * @param {Array<object>} prs same shape as {@link redPullRequests}
 * @returns {Array<{check: string, prs: number[]}>}
 */
export function queueGlobalGates(prs) {
  const byCheck = new Map();
  for (const pr of redPullRequests(prs)) {
    for (const check of pr.redChecks) {
      if (CI_AGGREGATOR_CHECKS.has(check)) continue;
      if (!byCheck.has(check)) byCheck.set(check, []);
      byCheck.get(check).push(pr.number);
    }
  }
  const gates = [];
  for (const [check, numbers] of byCheck) {
    if (numbers.length > 1) gates.push({ check, prs: numbers });
  }
  return gates;
}

/**
 * Vercel's marker for a deployment the account is no longer allowed to serve.
 *
 * `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` means the
 * account is blocked, suspended or over quota. It is an account state, not an
 * application bug: the origin is down for every visitor and redeploying does not
 * fix it. On 2026-11-10 the live origin switched to **404** with
 * `x-vercel-error: DEPLOYMENT_NOT_FOUND` — same account-level state, different
 * marker. A bare 404 must NOT match: a healthy origin answers 404 for every path
 * it does not own, so only the `x-vercel-error` header disambiguates it (the 402
 * is unambiguous on its own). Kept as a pure predicate (mirroring
 * `verify-production-deployment.mjs`) so the probe's verdict is testable without
 * the network.
 *
 * @param {number|null|undefined} status
 * @param {string|null|undefined} vercelError
 * @returns {boolean}
 */
export function isDeploymentDisabled(status, vercelError) {
  if (status === 402) return true;
  return vercelAccountState(vercelError) !== '';
}

/** The account-state marker Vercel sent, normalised, or "" when there is none. */
function vercelAccountState(vercelError) {
  if (typeof vercelError !== 'string') return '';
  const marker = vercelError.trim().toUpperCase();
  return marker === 'DEPLOYMENT_DISABLED' || marker === 'DEPLOYMENT_NOT_FOUND' ? marker : '';
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
 * A 402 / `DEPLOYMENT_DISABLED` / `DEPLOYMENT_NOT_FOUND` is a hard failure: the
 * site is down for real visitors, which outranks a workflow that merely reports
 * it. A 403/429 is the edge blocking the probe (Cloudflare answers datacenter IPs
 * that way) — that is "could not verify", a warning, never a failure. A network
 * error is likewise "could not verify" rather than "down": the probe has no
 * evidence either way, so it warns instead of inventing an outage.
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
    const state = vercelAccountState(vercelError);
    return {
      level: 'fail',
      detail: state
        ? `DOWN: HTTP ${status} ${state} (Vercel account/deployment is not being served)`
        : `DOWN: HTTP ${status} (Vercel account blocked or over quota)`,
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

/**
 * Compare the commit the live origin serves to the default branch head.
 *
 * "Serving HTTP 200" is not "serving the current build". On 2026-11-10 the
 * origin answered 200 while it was four commits behind `main` (the new Vercel
 * account has no Git auto-deploy, #547): every check that reads GitHub's view
 * said green while the work the team just merged was not live. The origin's
 * `/api/build-info` reports the commit it was built from; compare it here.
 *
 * A short SHA on either side counts as current when it prefixes the other, so a
 * trimmed `build-info` still matches. Missing or non-string input is `unknown`,
 * never a failure — the probe has no evidence of a stale deploy, only that it
 * could not compare, and inventing a failure from no data is the very bug this
 * family is about.
 *
 * `build-info` reports the literal `"unknown"` (and `"development"`) when
 * `VERCEL_GIT_COMMIT_SHA` is unset, which is a non-Git deploy, not a stale one.
 * A value that is not a commit at all is "could not compare", so it must return
 * `unknown` too — otherwise the check prints "live build unknown is behind main
 * <sha> — merged work is not deployed", a fabricated warning naming a commit
 * that does not exist. Requiring a hex SHA is the same guard
 * `verify-production-deployment.mjs`'s `normalizeCommit` uses.
 *
 * @param {{liveCommit?: string|null, mainCommit?: string|null}} [input]
 * @returns {{level: 'ok'|'warn'|'unknown', detail: string}}
 */
const COMMIT_SHA = /^[0-9a-f]{7,40}$/;

export function classifyDeployFreshness({ liveCommit, mainCommit } = {}) {
  const live = typeof liveCommit === 'string' ? liveCommit.trim().toLowerCase() : '';
  const main = typeof mainCommit === 'string' ? mainCommit.trim().toLowerCase() : '';
  if (!live || !main) {
    return { level: 'unknown', detail: 'no build-info to compare against main' };
  }
  if (!COMMIT_SHA.test(live) || !COMMIT_SHA.test(main)) {
    const reported = COMMIT_SHA.test(live) ? main : live;
    return {
      level: 'unknown',
      detail: `build-info reported "${reported.slice(0, 16)}" instead of a commit — cannot compare`,
    };
  }
  if (live === main || live.startsWith(main) || main.startsWith(live)) {
    return { level: 'ok', detail: `live build matches main (${live.slice(0, 7)})` };
  }
  return {
    level: 'warn',
    detail: `live build ${live.slice(0, 7)} is behind main ${main.slice(0, 7)} — merged work is not deployed`,
  };
}
