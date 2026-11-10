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
export function namesLane(lane, issue) {
  const laneLabel = lane?.laneLabel;
  const broadLabel = lane?.label;
  if (!laneLabel && !broadLabel) return false;
  const labels = (issue?.labels ?? []).map((label) => label?.name ?? label);
  if (laneLabel && labels.includes(laneLabel)) return true;
  if (!broadLabel || !labels.includes(broadLabel)) return false;
  // The broad label only applies when no lane has claimed the issue precisely.
  return !labels.some((name) => typeof name === 'string' && name.startsWith('lane:'));
}

/**
 * Whether any open issue names this lane.
 *
 * @param {{label?: string, laneLabel?: string}} lane
 * @param {Array<{labels?: Array<{name?: string}|string>}>} issues open issues
 * @returns {boolean}
 */
export function hasLabelledWork(lane, issues) {
  return (issues ?? []).some((issue) => namesLane(lane, issue));
}

/**
 * The oldest open issue that names this lane, or null.
 *
 * `gh issue list` returns newest-first, and the autopilot used to take the first
 * match — so a lane with a steady stream of fresh handoffs never reached an
 * older issue that named it only by label. #398 ("canlı destek yok") is exactly
 * that case: label-only, older than every current handoff, so no owning lane
 * ever picked it and the owner saw the gap days later. Choosing the *oldest*
 * named work (FIFO) means every issue is reached in turn instead of starving.
 * Issue numbers are monotonic with creation, so the lowest number is oldest.
 *
 * @param {{label?: string, laneLabel?: string}} lane
 * @param {Array<{number?: number, labels?: Array<{name?: string}|string>}>} issues open issues
 * @param {Set<number>} [claimed] issue numbers already taken by another lane this pass
 * @returns {object|null}
 */
export function pickLaneWork(lane, issues, claimed) {
  const skip = claimed ?? new Set();
  const candidates = (issues ?? []).filter(
    (issue) => namesLane(lane, issue) && !skip.has(Number(issue?.number)),
  );
  if (candidates.length === 0) return null;
  const num = (issue) => {
    const n = Number(issue?.number);
    return Number.isFinite(n) ? n : Infinity;
  };
  return candidates.reduce((oldest, issue) => (num(issue) < num(oldest) ? issue : oldest));
}

/**
 * Whether the registry's model is one the account can actually reach.
 *
 * The account may only call a fixed set of models. Naming one outside it makes
 * every spawn die on its first turn with 0 tokens and nothing to do with the
 * lane's code (issue #442 — `deepseek-v4-pro` was not in the list, so the whole
 * team failed instantly and the stall stayed silent). The registry names the
 * model once; this check turns a re-pin to an unreachable model into a loud,
 * testable failure instead of a team-wide stall.
 *
 * @param {string|undefined|null} model the registry's `model`
 * @param {string[]|undefined|null} allowed the team's `allowedModels`
 * @returns {boolean}
 */
export function modelIsAllowed(model, allowed) {
  if (typeof model !== 'string' || model.length === 0) return false;
  if (!Array.isArray(allowed) || allowed.length === 0) return false;
  return allowed.includes(model);
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
 * Whether a lane's last recorded status is a successful *delivery*.
 *
 * The autopilot records `lastStatus` on every start. `RUNNING`, `REUSED` and
 * `RESUMED` mean the platform accepted the task on the lane's existing
 * transcript — the lane got its work. `REFRESHED` does *not*: it means the
 * lane's poisoned transcript was abandoned and a fresh, empty conversation was
 * started on the same sandbox. That is a restart, not a delivery. Counting it as
 * one reset the retry budget to zero on every pass, so a lane that refreshed
 * without ever opening a PR never reached `MAX_ATTEMPTS`: the poisoned-recovery
 * path looped forever (a lane reached attempt 9 with `maxAttemptsPerLane: 3`),
 * burning tokens and never escalating. `ERROR` (a rejection) and `null` (never
 * started) are not deliveries either.
 *
 * @param {string|null|undefined} status
 * @returns {boolean}
 */
export function laneDelivered(status) {
  return ['RUNNING', 'REUSED', 'RESUMED'].includes(String(status ?? ''));
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
 * Lane conversations that have run past any reasonable task budget and opened
 * no PR — regardless of whether they are still `running`.
 *
 * A conversation that loops — reading the same brief, re-running `git status`,
 * never committing — is the token leak of issue #218: one lane ran 13.5 hours
 * and spent ~180M prompt tokens with no commit and no PR. The staleness guard
 * interrupts such a conversation, but interrupting only *pauses* it; the next
 * pass saw a non-`running` conversation with a live sandbox, treated it as
 * "idle/reusable", and fed it another task. The transcript (and its per-turn
 * cost) only grew, so one conversation accumulated 34.5M prompt tokens across
 * its whole life. Being old and PR-less is the poison, so this predicate is what
 * both the interrupt *and* the reuse/resume decisions consult.
 *
 * A conversation is poisoned when its title starts with `LANE-`, it has
 * produced no PR (neither the summary `pr_number` nor the `pull_requests`
 * list), and *any* signal fires:
 *
 *   - **no commit in the window** — the lane's branch has had no new commit
 *     since the conversation started, and `noCommitMs` has elapsed. This is the
 *     signal that matches the brief: the stall criterion is "no commit/push in
 *     the window", not age. `updated_at` alone cannot see it — a lane that greps
 *     and re-reads forever keeps `updated_at` moving while landing nothing — so
 *     the caller passes the lane branch's newest commit time (`commitsByLane`).
 *     A lane that just started (window not elapsed) is not judged. This signal
 *     is read **only for a stopped lane**: it reads the *remote* branch, which a
 *     still-working lane has not pushed to yet, so a running lane is left to the
 *     liveness and ceiling signals and is never judged commit-less mid-work.
 *   - **idle** — it is still `running` but has not been touched for `maxIdleMs`.
 *     `updated_at` moves on every turn (tool call, model reply), so a *running*
 *     conversation that stopped moving is a dead sandbox whose agent is gone;
 *     nothing will resume it, and it is holding a sandbox the team could use.
 *     Only `running` conversations are judged idle: a `paused`/`idle` one is
 *     legitimately waiting, so its age is the ceiling's business, not idleness.
 *   - **over the hard ceiling** — it started longer than `maxRuntimeMs` ago,
 *     *whatever* `updated_at` says. This is the backstop for a loop that keeps
 *     moving but the commit signal cannot see (e.g. a branch whose commit time
 *     the caller could not read).
 *
 * `waiting_for_confirmation` is excluded from all three: it is blocked on a
 * human, not looping, so it must be left alone (the reaper treats it as active
 * for the same reason).
 *
 * A lane whose branch has an **open PR** is never poisoned, whatever the three
 * signals say. The conversation's own `pr_number`/`pull_requests` fields are the
 * ones the platform fills in from the agent's summary, and they stay empty for a
 * lane that opened its PR through `gh`/the API (the norm here) — so an
 * established lane that is genuinely working its PR reads as "no PR" and the
 * 45-minute ceiling fired on it. The dry run reported `would interrupt stalled
 * LANE-infra` while LANE-infra held open PR #493, and interrupting it would have
 * killed the agent mid-fix on live work. A branch with an open PR is the ground
 * truth that work is in flight, so it overrides the guess; only a PR-less lane
 * can be looping. The caller passes `openPrBranches` (the open PRs'
 * `headRefName`), keyed against the lane's `lane/<name>` branch.
 *
 * Only conversations titled `LANE-*` are considered: the guard governs the lane
 * team, so the operator's own conversation (or any other human-run one) is never
 * touched by it.
 *
 * A non-positive `maxIdleMs`, `maxRuntimeMs` or `noCommitMs` disables *that*
 * signal (it never fires), so an unset/blank threshold cannot poison anything on
 * its own — the `""`-is-truthy trap that bit `approve-pending-runs`. With all
 * disabled the predicate returns nothing, as before.
 *
 * @param {Array<{execution_status?: string|null, created_at?: string, updated_at?: string, pr_number?: unknown, pull_requests?: unknown, title?: string|null}>} conversations
 * @param {{now?: number, maxIdleMs?: number, maxRuntimeMs?: number, noCommitMs?: number, commitsByLane?: Map<string, number>|Record<string, number>, openPrBranches?: Iterable<string>}} [options]
 * @returns {Array<object>} the poisoned conversations, in input order
 */
export function poisonedConversations(conversations, options = {}) {
  const {
    now = Date.now(),
    maxIdleMs = 0,
    maxRuntimeMs = 0,
    noCommitMs = 0,
    commitsByLane,
    openPrBranches,
  } = options;
  // Branches with an open PR, normalized once. A lane with one is working, so it
  // is exempt from every poison signal below.
  const openPrSet = new Set(openPrBranches ?? []);
  const idleLimit = Number.isFinite(maxIdleMs) && maxIdleMs > 0 ? maxIdleMs : 0;
  const runtimeLimit = Number.isFinite(maxRuntimeMs) && maxRuntimeMs > 0 ? maxRuntimeMs : 0;
  // The commit signal needs a commit map to read: without one (a caller that
  // passed no `commitsByLane`, or one whose query failed and passed `null`) the
  // signal is disabled, so missing data never poisons a lane.
  const commitLimit =
    Number.isFinite(noCommitMs) && noCommitMs > 0 && commitsByLane != null ? noCommitMs : 0;
  if (idleLimit === 0 && runtimeLimit === 0 && commitLimit === 0) return [];
  const commitAtFor = (laneName) => {
    if (commitsByLane instanceof Map) {
      return commitsByLane.has(laneName) ? commitsByLane.get(laneName) : undefined;
    }
    if (commitsByLane && typeof commitsByLane === 'object') {
      return Object.prototype.hasOwnProperty.call(commitsByLane, laneName)
        ? commitsByLane[laneName]
        : undefined;
    }
    return undefined;
  };
  const poisoned = [];
  for (const conversation of conversations ?? []) {
    const title = String(conversation?.title ?? '');
    if (!title.startsWith('LANE-')) continue;
    // A lane with an open PR is working, not looping: the conversation's own
    // PR fields stay empty when the PR was opened via `gh`/the API, so without
    // this the ceiling fires on a lane that is fixing its PR. Exempt it.
    if (openPrSet.size > 0 && openPrSet.has(`lane/${title.slice(5)}`)) continue;
    // `waiting_for_confirmation` is blocked on a human, not looping, and must be
    // left alone (the reaper treats it as active for the same reason).
    if (String(conversation?.execution_status ?? '') === 'waiting_for_confirmation') {
      continue;
    }
    // `pr_number` comes back as an array (`[]` when none) and `pull_requests` as
    // a count; a bare `[]` is truthy, so count both instead of testing them.
    const prs =
      (Array.isArray(conversation?.pr_number) ? conversation.pr_number.length : 0) ||
      (Array.isArray(conversation?.pull_requests)
        ? conversation.pull_requests.length
        : Number(conversation?.pull_requests ?? 0) || 0);
    if (prs > 0) continue;

    const startedAt = Date.parse(String(conversation?.created_at ?? ''));
    const touchedAt = Date.parse(
      String(conversation?.updated_at ?? conversation?.created_at ?? ''),
    );
    // A conversation with no parsable timestamp at all cannot be judged, so it
    // is skipped rather than interrupted on a guess.
    if (!Number.isFinite(startedAt) && !Number.isFinite(touchedAt)) continue;

    const running = String(conversation?.execution_status ?? '') === 'running';
    const idle =
      running && idleLimit > 0 && Number.isFinite(touchedAt) && now - touchedAt >= idleLimit;
    const overCeiling =
      runtimeLimit > 0 && Number.isFinite(startedAt) && now - startedAt >= runtimeLimit;
    // A lane the commit map does not know about (no branch recorded, or a lane
    // name that does not line up) is left unjudged on this signal rather than
    // assumed commit-less: a naming mismatch would otherwise poison the whole
    // team at once. The idleness and ceiling signals still decide for it.
    //
    // The commit signal is read only for a *stopped* lane, never a running one.
    // It reads the lane branch's newest commit from the remote, but a lane
    // commits locally and pushes only when it opens or updates its PR (the
    // kickoff asks it to; the operator lane pushes only at PR time). A lane that
    // is working right now therefore has a remote branch that lags its local one
    // by however long it has been working: LANE-supabase held local commits at
    // 23:05/23:08 while `refs/heads/lane/supabase` still read 17:49, and the
    // signal reported it stalled mid-work — interrupting it would have killed
    // live work, the exact "signal reads the wrong thing" family the brief warns
    // about. A running lane is judged by liveness (`idle`) and the hard ceiling
    // instead. For a stopped lane the signal is honest: "never pushed anything"
    // does mean "never landed anything", which is the state a leaked transcript
    // must not be resumed from.
    const commitAt = commitAtFor(title.replace(/^LANE-/, ''));
    const noCommit =
      !running &&
      commitAt !== undefined &&
      noCommitInWindow({ commitAt, since: startedAt, now, windowMs: commitLimit });
    if (idle || overCeiling || noCommit) poisoned.push(conversation);
  }
  return poisoned;
}

/**
 * Whether a lane has gone a whole window without landing a commit.
 *
 * The stall criterion the brief names: "no commit/push in the window", not age.
 * A lane is judged only once the window has elapsed since it started, so a lane
 * that is still inside its first minutes is never called stalled — the kickoff
 * asks for a commit in the first ~10 minutes, and the window gives it room. A
 * commit on the lane branch at or after the start is progress, so it clears the
 * signal; no parsable start time or a disabled window means "cannot judge".
 *
 * @param {{commitAt?: number, since?: number, now?: number, windowMs?: number}} params
 * @returns {boolean}
 */
export function noCommitInWindow({ commitAt, since, now = Date.now(), windowMs = 0 } = {}) {
  const limit = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 0;
  if (limit === 0) return false;
  if (!Number.isFinite(since)) return false;
  if (now - since < limit) return false;
  return !(Number.isFinite(commitAt) && commitAt >= since);
}

/**
 * The subset of `poisonedConversations` that is still `running`, so the caller
 * can interrupt the burn now. A conversation that has *already* been interrupted
 * (it reports `paused`/`error`/`finished`) is not returned here — interrupting it
 * again is a no-op — but it is still poisoned, so it must not be resumed and fed
 * another task either.
 *
 * @param {Array<object>} conversations
 * @param {{now?: number, maxIdleMs?: number, maxRuntimeMs?: number}} [options]
 * @returns {Array<object>}
 */
export function stalledConversations(conversations, options = {}) {
  return poisonedConversations(conversations, options).filter(
    (conversation) =>
      String(conversation?.execution_status ?? '') === 'running',
  );
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
 * Let a lane woken to repair its *own* PR past the open-PR cap.
 *
 * A lane carrying `context.redPr` does not open a new PR — it repairs the one it
 * already holds, so it adds nothing to the queue and must not spend a PR slot.
 * Deferring it is a deadlock: the cap is full of stuck PRs, the fixes that would
 * empty it are deferred behind that same cap, and the queue never drains
 * (PR #493). Fixes are promoted ahead of fresh work so a broken PR is repaired
 * first. Every other deferred decision keeps its place.
 *
 * @param {Array<object>} allowed decisions the cap admitted this pass
 * @param {Array<object>} deferred decisions the cap deferred this pass
 * @returns {{allowed: Array<object>, deferred: Array<object>}}
 */
export function exemptFixes(allowed, deferred) {
  const a = Array.isArray(allowed) ? allowed : [];
  const d = Array.isArray(deferred) ? deferred : [];
  const fixes = d.filter((x) => x?.context?.redPr != null);
  if (fixes.length === 0) return { allowed: a, deferred: d };
  return {
    allowed: [...fixes, ...a],
    deferred: d.filter((x) => x?.context?.redPr == null),
  };
}

/**
 * Split the pass's PR slots between the quota-free group and the fresh group so
 * neither starves the other.
 *
 * The quota-free group (reuse / resume / poisoned-sandbox recovery) costs no
 * sandbox quota, but every lane in it still spends a PR slot. Listing it first
 * and taking `slice(0, slots)` let it monopolize all four slots whenever it was
 * larger than the cap — which, with every lane holding a poisoned sandbox, was
 * always. The fresh group (new sandboxes, the lanes that can actually deliver
 * new work) then never ran, all day, with `open PRs: 0`. That is starvation,
 * not a full queue.
 *
 * Reserving at least one slot for fresh work fixes it: when both groups have
 * candidates and at least two slots exist, the fresh group is guaranteed one
 * slot. A single slot stays with the quota-free group (it is quota-free and must
 * not be blocked by a quota that may already be gone), and an empty fresh group
 * leaves every slot to the quota-free group. The quota-free group takes the
 * remainder. Both groups are expected pre-sorted longest-waiting-first, so the
 * rotation within each is preserved.
 *
 * @param {Array<{name: string}>} quotaFree quota-free candidates, ordered
 * @param {Array<{name: string}>} fresh fresh-sandbox candidates, ordered
 * @param {number} slots how many PR slots this pass may spend
 * @returns {{allowed: Array<{name: string}>, deferred: Array<{name: string}>}}
 */
export function selectSlots(quotaFree, fresh, slots) {
  const q = Array.isArray(quotaFree) ? quotaFree : [];
  const f = Array.isArray(fresh) ? fresh : [];
  const cap = Number.isFinite(slots) && slots > 0 ? Math.floor(slots) : 0;
  // Reserve at least one slot for fresh work whenever both groups are waiting.
  // A single slot stays with the quota-free group: it costs no quota and must
  // not be blocked by a quota that may already be gone.
  const freshReserved = f.length > 0 && cap >= 2 ? Math.max(1, Math.ceil(cap / 2)) : 0;
  const quotaFreeReserved = cap - freshReserved;
  const takeQ = Math.min(q.length, quotaFreeReserved);
  const takeF = Math.min(f.length, freshReserved);
  // Any slot a group could not fill goes to the other, so no slot is wasted when
  // one group is smaller than its quota.
  const spare = cap - takeQ - takeF;
  const extraQ = Math.min(q.length - takeQ, spare);
  const extraF = Math.min(f.length - takeF, spare - extraQ);
  return {
    allowed: [...q.slice(0, takeQ + extraQ), ...f.slice(0, takeF + extraF)],
    deferred: [...q.slice(takeQ + extraQ), ...f.slice(takeF + extraF)],
  };
}

/**
 * Order candidate lanes longest-waiting first, so a scarce slot is shared.
 *
 * When more lanes are ready to start than there are PR slots, only the first
 * `slots` of the candidate list run this pass; the rest are deferred. Taking
 * the first `slots` in `lanes.json` order starves the lanes listed after the
 * cap: they lose the same race every pass and never start, however long their
 * handoff has been waiting. That is exactly what happened — with a cap of 4 and
 * the resume-heavy head of the registry (supabase, cloudflare, seo, geo) always
 * winning, the tail (urun, guvenlik, icerik, teslimat, operator) was deferred
 * every pass all day with `open PRs: 0`.
 *
 * Sorting by the lane's last start (`updatedAt`, refreshed on every attempt)
 * lets a lane that just ran fall behind one that has waited, so the slots
 * rotate instead of freezing on the registry head. A lane never started sorts
 * first (no `updatedAt`), and ties keep the input order so the result is
 * deterministic. Ordering only decides who runs *first*; a deferred lane is
 * still deferred, never dropped (issue #430).
 *
 * @param {Array<{name: string}>} decisions candidate lanes
 * @param {Record<string, {updatedAt?: string}|undefined>} state lane state keyed by name
 * @returns {Array<{name: string}>} a new array, longest-waiting first
 */
export function fairOrder(decisions, state) {
  const age = (name) => {
    const at = Date.parse(String(state?.[name]?.updatedAt ?? ''));
    return Number.isFinite(at) ? at : -Infinity;
  };
  return [...(decisions ?? [])].sort((a, b) => age(a.name) - age(b.name));
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

/**
 * Whether an open PR's head conflicts with its base.
 *
 * A conflicting head is a silent dead end: GitHub fires **no check-run** for a
 * CONFLICTING head, so `failedRequiredChecks` is empty and the lane reads as "in
 * flight" and waits forever while the conflicted PR holds a slot in the open-PR
 * cap (PR #493). The autopilot must treat the conflict as the thing to fix.
 *
 * Only the explicit `'CONFLICTING'` counts: GitHub reports `mergeable` as
 * `null`/`'UNKNOWN'` until it has computed the merge for the head, and guessing
 * there would wake a lane for a PR that is actually fine. `mergeStateStatus` is
 * the fallback — `DIRTY` means the same thing — because the fields the autopilot
 * requests do not always carry `mergeable`.
 *
 * @param {object} pr a PR with `mergeable` and/or `mergeStateStatus`
 * @returns {boolean}
 */
export function pullRequestConflicts(pr) {
  if (!pr || typeof pr !== 'object') return false;
  return pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY';
}

/**
 * Whether an open PR carries a brake that leaves it for a human.
 *
 * `agent:hold` and `agent:blocked` both mean "do not touch this without a
 * person": the first parks it deliberately, the second records that an agent
 * tried and could not finish. Two parts of the pass already honour them —
 * `mergeReadyPullRequests` refuses to merge such a PR and reports it under
 * "STALLED PRs (need a human)". But the per-lane `decide()` step only reads the
 * *issue* labels, so a lane whose PR carries `agent:blocked` and whose merge
 * state is `CLEAN` was told "PR #N ready to merge" — the same pass that had just
 * refused to merge it. On 2026-11-10 the report said both at once:
 *
 *     infra   wait      PR #579 ready to merge (reuse)
 *     STALLED PRs (need a human): 1
 *       #579 — held for a human (agent:blocked)
 *
 * The lane can never act on "ready to merge": the merge step will not merge it
 * and nothing else clears the label, so "ready to merge" is false. Report the
 * real state — held for a human — so the two lines agree.
 *
 * @param {Array<{name?: string}|string>|null|undefined} labels
 * @returns {boolean}
 */
export function heldForHuman(labels) {
  return (labels ?? []).some((label) => {
    const name = label?.name ?? label;
    return name === 'agent:hold' || name === 'agent:blocked';
  });
}

/**
 * Whether a PR is a draft, which GitHub will never auto-merge.
 *
 * `mergeReadyPullRequests` used to `continue` on a draft in silence, so a draft
 * that turned green stayed out of the merge queue *and* out of the "STALLED
 * PRs" list. On 2026-11-10 PR #584 was exactly that: a draft, every required
 * check green, `autoMergeRequest: null`. Nothing in the system un-drafts a PR,
 * so it could never land — and it held one of the four open-PR slots, which
 * deferred every other lane (`PR limit: pass may open 0 (open 4, cap 4)`). The
 * draft was invisible because the only line that would have named it was the
 * one the `continue` skipped.
 *
 * @param {{isDraft?: boolean}|null|undefined} pr
 * @returns {boolean}
 */
export function isDraftPullRequest(pr) {
  return pr?.isDraft === true;
}

/**
 * Checks that only aggregate other jobs, so they carry no gate of their own.
 *
 * `Quality, database and E2E` in `.github/workflows/ci.yml` declares
 * `needs: [static, database, e2e]` and does nothing but fail when any of them
 * failed; branch protection still requires it so the required-check name never
 * moves. Because it mirrors its dependencies it is red on every PR exactly when
 * one dependency is red, which is why `lanes.json` lists it as the required
 * check — the *dependency* is the real gate. Kept here, and asserted against the
 * workflow file by a unit test, so renaming the aggregator job cannot silently
 * make a queue-global red look like a local failure again.
 */
export const CI_AGGREGATOR_CHECKS = new Set(['Quality, database and E2E']);

/**
 * Whether a PR is red *only* on a queue-global gate — a red every open PR shares,
 * so the cause lives outside this head.
 *
 * `lane-collisions.mjs` (a step inside `Static checks`) reads *every* open PR, so
 * one PR with an unowned file turns `Static checks` red on all of them and, through
 * the `needs:` chain, on the required aggregator too. `decide()` would then respawn
 * *every* lane to repair a red that is not on its own head: the owning lane cannot
 * land its fix while the other PR is open, and the innocent lanes burn a sandbox
 * and a retry budget per pass on a head that is already clean. Naming that case is
 * the same discipline as the operator's `queueGlobalGates`: a shared red is one
 * cause, not N, and the repair belongs to the PR that names it.
 *
 * A red check counts as queue-global only when **two or more** PRs carry it. One PR
 * alone proves nothing: a red unique to this head is this lane's to fix. The rule
 * is judged on the *dependency* jobs, not the aggregator — the aggregator is red on
 * every PR whose dependency failed, so judging it directly would excuse two PRs with
 * **unrelated** local failures at once. Judging the job behind it (`Static checks`,
 * `E2E (n/4)`, …) keeps those local: each fails a job the other does not, so neither
 * is shared, and both lanes are woken to fix their own head.
 *
 * @param {object} pr the PR whose head is being judged
 * @param {Array<object>} allPrs every open PR (including `pr`)
 * @param {string[]} requiredChecks the required check names (from lanes.json)
 * @returns {boolean} true when `pr`'s red is a shared, queue-global one
 */
export function redIsQueueGlobal(pr, allPrs, requiredChecks) {
  if (!pr || typeof pr !== 'object') return false;
  const required = Array.isArray(requiredChecks) ? requiredChecks : [];
  const reds = (pr.statusCheckRollup ?? [])
    .filter((c) => c && ['FAILURE', 'TIMED_OUT'].includes(c.conclusion))
    .map((c) => c.name ?? c.context)
    .filter(Boolean);
  // Only a merge-blocking red matters: a required check, or the aggregator that
  // mirrors one. A red on a check that does not gate the merge must not wake a lane.
  const blocking = reds.filter((n) => required.includes(n) || CI_AGGREGATOR_CHECKS.has(n));
  if (blocking.length === 0) return false;
  // The aggregator carries no gate of its own; its dependencies do. Judge those so
  // two PRs with unrelated local failures are not both excused. Fall back to the
  // blocking names when no dependency job is listed (defensive).
  const causes = reds.filter((n) => !CI_AGGREGATOR_CHECKS.has(n));
  const judged = causes.length > 0 ? causes : blocking;
  const others = (allPrs ?? []).filter((p) => p && p !== pr);
  const redOn = (p, name) =>
    (p.statusCheckRollup ?? []).some(
      (c) =>
        (c?.name ?? c?.context) === name && ['FAILURE', 'TIMED_OUT'].includes(c.conclusion),
    );
  return judged.every((name) => others.some((p) => redOn(p, name)));
}

/**
 * Normalise an `api()` result into a list, *and* whether the read failed.
 *
 * `api()` reports a failure (HTTP error or timeout) as `{ ok: false, body: null }`
 * rather than throwing. The readers in `lane-autopilot.mjs` collapsed that to an
 * empty list, so a failed fetch was indistinguishable from a genuinely empty
 * one: an expired key or an API timeout made the pass read "0 sandboxes" and
 * "no conversations", i.e. a full budget and every lane idle, and it would then
 * over-spawn into a quota it could not see. The `failed` flag is what lets the
 * caller abort the pass instead of acting on a number it did not measure — the
 * same "the indicator reads its own error" family as bottleneck #5 in the
 * operator brief.
 *
 * @param {{ok?: boolean, body?: any}} result the value returned by `api()`
 * @returns {{items: any[], failed: boolean}}
 */
export function readApiList(result) {
  if (!result || result.ok !== true || !result.body) {
    return { items: [], failed: true };
  }
  return { items: Array.isArray(result.body.items) ? result.body.items : [], failed: false };
}

/**
 * The labels of the API reads that failed in a pass.
 *
 * Each entry is `{ label, ok }`. A non-empty result means the pass must not act:
 * every decision it would make is derived from state it failed to read.
 *
 * @param {Array<{label: string, ok: boolean}>} fetches
 * @returns {string[]}
 */
export function failedApiFetches(fetches) {
  return (fetches ?? [])
    .filter((f) => !f || f.ok !== true)
    .map((f) => f?.label ?? 'unknown');
}

/**
 * Interpret `confirm()`'s read-back of a start task, keeping the failure flag.
 *
 * The read that confirms a spawn can itself fail: `startTasks()` reports a failed
 * fetch as `{ items: [], failed: true }`, and a caller that only looked at `items`
 * read that as "the task is not in the list" — the same answer as a genuinely
 * missing task. Recording `UNKNOWN` there persists a status the pass never
 * measured, and because `UNKNOWN` is not `ERROR` it also leaves the lane looking
 * started. The `failed` flag is carried through so the caller can stop instead of
 * acting on a number it did not read (bottleneck #5, "the indicator reads its own
 * error").
 *
 * A missing task on a *successful* read still reports `UNKNOWN` with no `failed`
 * flag: that is real evidence the task is gone, not a read that failed.
 *
 * @param {string} taskId
 * @param {{items?: any[], failed?: boolean}} read the `startTasks()` result
 * @returns {{status: string, detail?: any, failed?: boolean}}
 */
export function confirmOutcome(taskId, read) {
  if (read?.failed !== false) {
    return { status: 'UNKNOWN', failed: true };
  }
  const task = (read.items ?? []).find((t) => t?.id === taskId);
  if (!task) return { status: 'UNKNOWN' };
  return { status: task.status, detail: task.detail };
}
