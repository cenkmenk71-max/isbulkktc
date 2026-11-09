/**
 * Pure decision helpers for the lane autopilot.
 *
 * `lane-autopilot.mjs` runs `main()` at import time, so it cannot be imported by
 * a unit test. These helpers hold the decisions worth pinning without touching
 * the network: when to refresh a lane's conversation, and whether a lane has any
 * labelled work at all.
 */

/**
 * Decide how to give a lane its next task on a sandbox it already owns.
 *
 * A conversation re-sends its whole transcript every turn, so appending forever
 * is a context cost, not a saving — that is what pushed one lane past 100M
 * prompt tokens (issue #218). Past `maxReuses` the lane gets a *fresh
 * conversation on the same sandbox*: the sandbox is reused (the daily quota
 * counts sandbox creation, so this costs none), the history is not.
 *
 * @param {object} params
 * @param {number} params.reuses tasks already appended to this conversation
 * @param {number} params.maxReuses
 * @returns {"append"|"refresh"}
 */
export function nextConversationAction({ reuses, maxReuses }) {
  const limit =
    Number.isFinite(maxReuses) && maxReuses > 0 ? maxReuses : 1;
  const used = Number.isFinite(reuses) && reuses > 0 ? reuses : 0;
  return used >= limit ? 'refresh' : 'append';
}

/**
 * Whether a lane has any open issue that names it.
 *
 * A lane is only started when it has concrete, bounded work (docs/lanes/POLICY.md):
 * a labelled issue is that work. Without this guard the autopilot hands a
 * "no work yet" kickoff to every idle lane each pass, and a lane with nothing to
 * do burns a full conversation before stopping.
 *
 * Matching rules, most precise first:
 *   - the lane's own `lane:<name>` label always counts;
 *   - the broad label (`agent:infra`) is shared by several lanes, so it only
 *     counts for an issue that carries no `lane:*` label at all — otherwise an
 *     infra-labelled issue would also start `cloudflare`, which shares the
 *     `agent:infra` label.
 *
 * @param {{label?: string, laneLabel?: string}} lane
 * @param {Array<{labels?: Array<{name?: string}|string>}>} issues open issues
 * @returns {boolean}
 */
export function hasLabelledWork(lane, issues) {
  const laneLabel = lane?.laneLabel;
  const broadLabel = lane?.label;
  if (!laneLabel && !broadLabel) return false;
  return (issues ?? []).some((issue) => {
    const labels = (issue?.labels ?? []).map((label) => label?.name ?? label);
    if (laneLabel && labels.includes(laneLabel)) return true;
    if (!broadLabel || !labels.includes(broadLabel)) return false;
    // The broad label only applies when no lane has claimed the issue precisely.
    return !labels.some((name) => typeof name === 'string' && name.startsWith('lane:'));
  });
}

/** A quota rejection is the platform's limit, not the lane's failure. */
export function isCapacityError(detail) {
  const text = String(detail ?? '').toLowerCase();
  return (
    text.includes('sandbox limit') ||
    text.includes('quota') ||
    text.includes('capacity')
  );
}

/**
 * Whether a lane's last recorded status is a successful delivery.
 *
 * The autopilot records `lastStatus` on every start. `RUNNING` means the
 * platform accepted the task and the agent began working — the only status that
 * means the lane got its work. `REUSED`, `RESUMED` and `REFRESHED` also mean the
 * task was handed over. `ERROR` (a rejection) and `null` (never started) do not.
 *
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
export function laneDelivered(status) {
  return ['RUNNING', 'REUSED', 'RESUMED', 'REFRESHED'].includes(String(status ?? ''));
}

/**
 * A stable signature of the work a lane is about to be started for.
 *
 * Two starts with the same signature are the same work, so a failure count
 * carries over. A *new* signature means the lane's assignment changed — a fresh
 * handoff, or the previous one closed — and the retry budget must restart,
 * because "three attempts" is a budget *per piece of work*, not per lane
 * lifetime. Without this a lane that exhausted its budget on one issue stays
 * `exhausted` forever even after new work arrives (issue #471).
 *
 * @param {object} ctx
 * @param {{number?: number}|undefined} ctx.handoff the handoff issue naming this lane, if any
 * @param {boolean} ctx.branchExists a stale remote branch for this lane exists
 * @returns {string}
 */
export function workSignature({ handoff, branchExists, prNumber }) {
  if (prNumber) return `pr-fix:${prNumber}`;
  if (handoff) return `handoff:${handoff.number}`;
  if (branchExists) return 'stale-branch';
  return 'labelled-work';
}

/**
 * The attempt count to carry into a lane's next decision.
 *
 * Reset to zero when the previous attempt delivered (see `laneDelivered`) or
 * when the work itself changed (see `workSignature`); otherwise carry the count
 * forward so a repeatedly failing lane still stops at the budget.
 *
 * @param {{attempts?: number, lastStatus?: string|null, work?: string}|undefined} entry
 * @param {string} work the signature of the work about to be attempted
 * @returns {number}
 */
export function carriedAttempts(entry, work) {
  const attempts = Number.isFinite(entry?.attempts) && entry.attempts > 0 ? entry.attempts : 0;
  if (attempts === 0) return 0;
  if (laneDelivered(entry?.lastStatus)) return 0;
  if (entry?.work && entry.work !== work) return 0;
  return attempts;
}

/**
 * How many *new* PRs the autopilot may open this pass.
 *
 * Every open PR is one CI run in the runner queue: five PRs × six jobs is thirty
 * concurrent jobs, and one E2E shard took 17 minutes under that load (issue
 * #430). Bounding how many PRs are open at once shortens the queue for every
 * lane. This only counts lanes that would open a *new* PR — a lane that already
 * has one is `wait`, not deferred — and it never blocks a merge, so the cap
 * drains itself: a merge frees a slot for the next pass.
 *
 * A missing or non-positive cap means "no limit" (`Infinity`), so a repo that
 * does not configure `maxOpenPRs` behaves exactly as before.
 *
 * @param {number} openPrs PRs currently open (any author, lane or not)
 * @param {number} maxOpenPRs the configured cap
 * @returns {number} how many new PRs may be opened (0 when at or over the cap)
 */
export function prCapacity(openPrs, maxOpenPRs) {
  const limit = Number.isFinite(maxOpenPRs) && maxOpenPRs > 0 ? maxOpenPRs : Infinity;
  const open = Number.isFinite(openPrs) && openPrs > 0 ? openPrs : 0;
  return Math.max(0, limit - open);
}

/**
 * The required checks that have actually *failed* on a PR.
 *
 * Only a required check failing should break the "PR in flight" wait: a
 * non-required failure (Vercel's build-rate limit is an external quota, not the
 * lane's code) must not wake a lane, or every quota hiccup would spawn the whole
 * team. `mergeStateStatus` cannot tell the two apart — it reports `BLOCKED` for
 * both — so the check rollup is consulted directly. A check that is absent or
 * still running is not a failure: a lane is not woken for a pending run.
 *
 * @param {Array<{name?: string, context?: string, status?: string, conclusion?: string|null}>} checks statusCheckRollup entries
 * @param {string[]} requiredChecks the required check names (from lanes.json)
 * @returns {string[]} names of the required checks that failed
 */
export function failedRequiredChecks(checks, requiredChecks) {
  const required = Array.isArray(requiredChecks) ? requiredChecks : [];
  return required.filter((name) => {
    const match = (checks ?? []).find((c) => (c?.name ?? c?.context) === name);
    return match ? ['FAILURE', 'TIMED_OUT'].includes(match.conclusion) : false;
  });
}

/**
 * Whether any *required* check on a PR has failed.
 *
 * The autopilot treats an open PR as "in flight" and waits, so a lane whose
 * sandbox is gone but whose PR is red waits forever — its own red PR freezes it
 * (issue #453). This is the predicate that breaks that wait.
 *
 * @param {Array<object>} checks statusCheckRollup entries
 * @param {string[]} requiredChecks the required check names (from lanes.json)
 * @returns {boolean}
 */
export function requiredCheckFailed(checks, requiredChecks) {
  return failedRequiredChecks(checks, requiredChecks).length > 0;
}
