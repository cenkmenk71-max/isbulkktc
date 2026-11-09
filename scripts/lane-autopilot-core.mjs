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
 * A rejection caused by the platform or account config, not by the lane's work.
 *
 * A capacity/quota rejection already exists (`isCapacityError`). This adds the
 * second infrastructure class the team hit: the model named in `lanes.json` being
 * closed to the account, so every spawn dies on the first turn with 0 tokens and
 * nothing to do with the lane's code (issue #442 — `deepseek-v4-pro` was not in
 * the team's allowed list, so the whole team failed instantly).
 *
 * A rejection in either class must not spend a retry attempt: retrying the same
 * work cannot fix it, and counting it walks every lane to `maxAttemptsPerLane`
 * and freezes the whole team — the exact stall this guards against.
 *
 * @param {string|null|undefined} detail the platform's rejection message
 * @returns {boolean}
 */
export function isInfraRejection(detail) {
  if (isCapacityError(detail)) return true;
  const text = String(detail ?? '').toLowerCase();
  return (
    text.includes('not allowed to access model') ||
    text.includes('model_access_denied') ||
    text.includes('team_model_access_denied') ||
    text.includes('team not allowed to access model')
  );
}

/**
 * Whether an exhausted lane's cooldown has elapsed, so it may be retried.
 *
 * Parking a lane at `exhausted` forever means one outage that burns every lane's
 * attempts freezes the whole team with no path back — the sandbox-quota outage
 * that killed nine lanes left them permanently "needs a human" (issue #442). The
 * cooldown opens a fresh, bounded window after a wait: the lane retries, and if
 * it exhausts again with no new work it re-parks for another cooldown. Recovery
 * is automatic but a genuinely stuck lane still escalates instead of looping
 * every pass. Measured from the lane's last start (`updatedAt`); an unknown age
 * counts as elapsed, so a missing timestamp never blocks recovery.
 *
 * @param {{updatedAt?: string}|undefined} entry lane state
 * @param {{now?: number, cooldownMs?: number}} [options]
 * @returns {boolean}
 */
export function exhaustedCooldownElapsed(entry, { now = Date.now(), cooldownMs = 0 } = {}) {
  if (!(Number(cooldownMs) > 0)) return false;
  const at = Date.parse(String(entry?.updatedAt ?? ''));
  if (!Number.isFinite(at)) return true;
  return now - at >= cooldownMs;
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
 * Whether a lane's conversation died without doing any work.
 *
 * This is the signature of an *infrastructure* failure, not a lane failure. When
 * the model named in `lanes.json` is closed to the account (issue #442) — or any
 * other config/platform problem hits before the first turn — the conversation
 * ends having spent nothing: `accumulated_cost` is zero. The platform may mark
 * such a conversation `error` (a refused spawn), `stuck`, or leave the status
 * null; all spend zero. The platform still accepts the *start task* (it reports
 * `READY`), so the autopilot cannot tell from the start task that the lane is
 * dead — only the conversation shows it.
 *
 * The predicate is deliberately narrow, to avoid healing a lane that is merely
 * between tasks. Only a conversation in a *failed* state counts (`error`,
 * `stuck`, or an empty/null status); `running`/`idle`/`paused`/
 * `waiting_for_confirmation`/`finished` do not. And it must have spent nothing:
 * a conversation that spent anything (cost > 0) ran real work, so its failure is
 * the lane's own and must still count. Together these separate "the platform
 * refused to run this" from "the lane tried and failed" and from "not started
 * yet".
 *
 * @param {{execution_status?: string|null, metrics?: {accumulated_cost?: number}}} conversation
 * @returns {boolean}
 */
export function diedWithoutWorking(conversation) {
  if (!conversation || typeof conversation !== 'object') return false;
  const status = String(conversation.execution_status ?? '');
  if (!['error', 'stuck', ''].includes(status)) return false;
  const cost = Number(conversation.metrics?.accumulated_cost ?? 0);
  return !(cost > 0);
}

/**
 * Lane conversations that are still `running` long past any reasonable task
 * budget and have opened no PR.
 *
 * The autopilot's `working` set treats every `running` conversation as busy and
 * skips it for the rest of the pass, and `decide()` returns `wait` for a lane
 * whose branch exists while it is `working`. A conversation that loops — reading
 * the same brief, re-running `git status`, never committing — therefore never
 * leaves `running`, is never re-evaluated, and burns tokens indefinitely. One
 * such lane ran 13.5 hours and spent ~180M prompt tokens with no commit and no
 * PR; the platform does not stop it, and the reaper only reclaims sandboxes
 * whose conversations are already terminal, so nothing did.
 *
 * This is the missing staleness guard. A conversation is stalled when it is
 * `running`, started longer than `maxRuntimeMs` ago, and has produced no PR
 * (neither the summary `pr_number` nor the `pull_requests` list). The caller
 * interrupts those conversations, which releases the sandbox and lets the next
 * pass re-decide the lane from a clean state.
 *
 * Only conversations titled `LANE-*` are considered: the guard governs the lane
 * team, so the operator's own conversation (or any other human-run one) is never
 * interrupted by it.
 *
 * `maxRuntimeMs <= 0` disables the guard, so an unset/blank threshold never
 * interrupts anything (the `""`-is-truthy trap that bit `approve-pending-runs`).
 *
 * @param {Array<{execution_status?: string|null, created_at?: string, pr_number?: unknown, pull_requests?: unknown, title?: string|null}>} conversations
 * @param {{now?: number, maxRuntimeMs?: number}} [options]
 * @returns {Array<object>} the stalled conversations, in input order
 */
export function stalledConversations(conversations, options = {}) {
  const { now = Date.now(), maxRuntimeMs = 0 } = options;
  if (!(Number.isFinite(maxRuntimeMs) && maxRuntimeMs > 0)) return [];
  const stalled = [];
  for (const conversation of conversations ?? []) {
    if (!String(conversation?.title ?? '').startsWith('LANE-')) continue;
    if (String(conversation?.execution_status ?? '') !== 'running') continue;
    const startedAt = Date.parse(String(conversation?.created_at ?? ''));
    if (!Number.isFinite(startedAt)) continue;
    if (now - startedAt < maxRuntimeMs) continue;
    // `pr_number` comes back as an array (`[]` when none) and `pull_requests` as
    // a count; a bare `[]` is truthy, so count both instead of testing them.
    const prs =
      (Array.isArray(conversation?.pr_number) ? conversation.pr_number.length : 0) ||
      (Array.isArray(conversation?.pull_requests)
        ? conversation.pull_requests.length
        : Number(conversation?.pull_requests ?? 0) || 0);
    if (prs > 0) continue;
    stalled.push(conversation);
  }
  return stalled;
}

/**
 * The lanes whose attempt counter must be cleared because their last
 * conversation died without working.
 *
 * The counterpart to `diedWithoutWorking` for the whole team: the autopilot
 * applies this before deciding, so every poisoned lane — including ones the pass
 * later defers — restarts from a clean count. The newest conversation titled
 * `LANE-<name>` is the lane's last attempt (the search list is newest-first), so
 * only that one is consulted; an older death under newer live work is ignored.
 *
 * Only a lane that has actually spent attempts is considered: a lane at zero has
 * nothing to heal, and reporting it would be noise.
 *
 * @param {Record<string, {attempts?: number}>} state lane state, keyed by lane name
 * @param {Array<{title?: string, execution_status?: string, metrics?: {accumulated_cost?: number}}>} conversations newest-first
 * @returns {string[]} names of the lanes to heal
 */
export function deadConversationLanes(state, conversations) {
  const healed = [];
  for (const [name, entry] of Object.entries(state ?? {})) {
    if (!(Number.isFinite(entry?.attempts) && entry.attempts > 0)) continue;
    const last = (conversations ?? []).find(
      (c) => String(c?.title ?? '') === `LANE-${name}`,
    );
    if (diedWithoutWorking(last)) healed.push(name);
  }
  return healed;
}

/**
 * The attempt count to carry into a lane's next decision.
 *
 * Reset to zero when the previous attempt delivered (see `laneDelivered`), when
 * the work itself changed (see `workSignature`), or when the previous attempt was
 * an infrastructure rejection (see `isInfraRejection`); otherwise carry the count
 * forward so a repeatedly failing lane still stops at the budget.
 *
 * The infrastructure reset is the self-heal for a poisoned budget: a model-access
 * or quota outage fails every spawn with nothing the lane can fix, so counting
 * those rejections walked the whole team to `exhausted` and froze it long after
 * the outage ended (issue #442). A failure the lane cannot cause must never count
 * against it, so the next pass retries instead of waiting for a human.
 *
 * This covers a rejection the autopilot *recorded* (`lastError`). A spawn that
 * dies after the start task is accepted leaves no `lastError` — the start task
 * still reports `READY` — so that case is healed from the conversation itself
 * (`diedWithoutWorking`), which the caller applies before deciding.
 *
 * @param {{attempts?: number, lastStatus?: string|null, lastError?: string|null, work?: string}|undefined} entry
 * @param {string} work the signature of the work about to be attempted
 * @returns {number}
 */
export function carriedAttempts(entry, work) {
  const attempts = Number.isFinite(entry?.attempts) && entry.attempts > 0 ? entry.attempts : 0;
  if (attempts === 0) return 0;
  if (laneDelivered(entry?.lastStatus)) return 0;
  if (entry?.work && entry.work !== work) return 0;
  if (isInfraRejection(entry?.lastError)) return 0;
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
