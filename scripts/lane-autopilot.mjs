#!/usr/bin/env node
/**
 * Lane autopilot — the autonomous loop for the lane team.
 *
 * One pass does, for every lane: read its real state from GitHub and the
 * sandbox list, then decide one of spawn / respawn / wait / done / blocked.
 * Run it on a schedule (cron) and the team keeps working without a human in
 * the loop; run it by hand to see what it would do.
 *
 * It is deliberately conservative:
 *   - it never pushes to `main`; lanes land by pull request,
 *   - it never spawns a lane whose work is already in flight,
 *   - it retries a lane at most `maxAttemptsPerLane` times, then stops trying and
 *     flags the lane as out of attempts for a human. Infinite retries are how an
 *     autonomous system burns budget without getting closer to done. (It does not
 *     open the issue itself: `gh` is run read-only here, so an exhausted lane is
 *     reported in the pass output and on the workflow summary.)
 *
 * State lives in .lane-state.json (gitignored), keyed by lane. Each attempt
 * records why it started and, when known, why the previous one failed, so a
 * retry is informed rather than a repeat.
 *
 * Usage:
 *   node scripts/lane-autopilot.mjs --dry-run      # decide, start nothing
 *   node scripts/lane-autopilot.mjs                # one pass, act
 *   node scripts/lane-autopilot.mjs --reset <lane> # clear a lane's attempts
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { kickoff } from './lane-kickoff.mjs';
import { reapStalledSandboxes } from './reap-stalled-sandboxes.mjs';
import {
  carriedAttempts,
  deadConversationLanes,
  exhaustedCooldownElapsed,
  failedRequiredChecks,
  fairOrder,
  hasLabelledWork,
  isInfraRejection,
  nextConversationAction,
  poisonedConversations,
  prCapacity,
  selectSlots,
  stalledConversations,
  workSignature,
} from './lane-autopilot-core.mjs';

const API = 'https://app.all-hands.dev/api/v1';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const REGISTRY = JSON.parse(readFileSync(join(HERE, 'lanes.json'), 'utf8'));

// The model every lane runs on. Passed explicitly at spawn because the
// account-level default is the cheap tier (deepseek-v4.1-flash), and setting it
// through the settings API did not take effect: a write was acknowledged and
// read back, yet every conversation still started on flash. The org endpoint
// cannot be the one that stores this — it has no `agent_settings` field at all
// (that lives in the user settings document, `/api/v1/settings`), so any
// read-back from it is a wrong-endpoint artifact. Passing the model per spawn is
// the one path that is verified to work, and it makes the choice visible here
// instead of hidden in a setting.
// Fallback must stay reachable: `deepseek-v4-pro` was not, and silently
// stranded every lane (#442).
const LANE_MODEL = REGISTRY.model ?? 'openhands/deepseek-v4.1-flash';
// The state file is gitignored. The autopilot workflow caches this exact path
// between scheduled runs so the attempt counters survive on a fresh runner.
const STATE_FILE = join(REPO_ROOT, '.lane-state.json');

const { repo: REPO, provider: PROVIDER, lanes: LANES } = REGISTRY;
const MAX_ATTEMPTS = REGISTRY.maxAttemptsPerLane ?? 3;
const SANDBOX_BUDGET = REGISTRY.sandboxBudget ?? 6;
// How many tasks one conversation may take before a fresh one is started.
// A conversation re-sends its whole transcript every turn, so reuse is a
// context cost, not a saving — see issue #218.
const MAX_REUSES = REGISTRY.maxReusesPerConversation ?? 2;
// How many lane PRs may be open at once. POLICY.md fixes the concurrent band at
// 4–6 lanes and every open PR is one CI run in the runner queue (5 PRs × 6 jobs
// = 30 concurrent jobs; one E2E shard took 17 minutes — issue #430). The cap is
// the band's lower bound, so the queue never saturates. When it is reached the
// autopilot still merges and still lets a lane *with an open PR* finish, but
// starts no new lane: the next pass runs once a merge frees a slot. 0/absent
// means no limit, as before.
const MAX_OPEN_PRS = REGISTRY.maxOpenPRs ?? 0;
// How long an `exhausted` lane waits before it may be retried. 0 (absent) keeps
// the old behaviour — an exhausted lane waits for a human forever. A positive
// value makes exhaustion a cooldown instead of a dead end: after one outage
// poisoned every lane's attempts the team recovers on its own instead of
// staying frozen (issue #442). A lane that exhausts again simply re-parks.
const EXHAUSTED_COOLDOWN_MS = (REGISTRY.exhaustedCooldownMinutes ?? 0) * 60_000;
// How long a lane conversation may stay `running` before the pass treats it as
// a stalled loop and interrupts it. A looping conversation never leaves
// `running`, so it is skipped as "busy" every pass and spends tokens forever
// (one ran 13.5 h / ~180M prompt tokens with no commit and no PR). 0 (absent)
// disables the guard, so an unset threshold never interrupts anything.
//
// This is the hard ceiling: it fires whatever `updated_at` says, which is what
// stops a read-only exploration loop. Such a lane greps and re-reads forever, so
// `updated_at` never stops moving and an idleness test alone would keep it alive
// all day — the "canlıda değişiklik yok" treadmill (a lane busy every pass that
// lands nothing).
const MAX_CONVERSATION_RUNTIME_MS =
  (REGISTRY.maxConversationRuntimeMinutes ?? 0) * 60_000;
// How long a *running* conversation may go untouched before the pass treats it
// as a dead sandbox (its agent is gone, nothing will resume it) and reclaims it.
// `updated_at` moves on every turn, so a running conversation that stopped
// moving is not working — it is holding a sandbox the team could be using. This
// is the fast signal; the ceiling above is the backstop for a loop that keeps
// moving. 0 (absent) disables it, so an unset threshold reclaims nothing.
const MAX_CONVERSATION_IDLE_MS =
  (REGISTRY.maxConversationIdleMinutes ?? 0) * 60_000;
// The stall criterion the brief actually names: a lane that lands no commit in
// the window. The two signals above are both proxies — idleness reads
// `updated_at`, which a lane that greps and re-reads forever keeps moving; the
// ceiling is a fixed age that cannot tell "working" from "looping". This one
// reads the lane *branch*: no commit since the conversation started is the
// ground truth for a lane that is busy every pass and landing nothing. The
// kickoff asks for a commit in the first ~10 minutes, so the window gives a
// healthy lane room while catching a loop well before the 45-minute ceiling. 0
// (absent) disables it, so an unset threshold never poisons anything.
const LANE_COMMIT_WINDOW_MS = (REGISTRY.laneCommitWindowMinutes ?? 0) * 60_000;
// The status checks that branch protection actually requires. An open PR is
// normally "in flight" and its lane is left alone, but a PR whose *required*
// check has failed is a dead end — its sandbox is gone, so nothing else will
// ever fix it (issue #453). Only these names may wake a lane; a non-required
// failure (Vercel's build-rate limit is an external quota, not the lane's code)
// must not, or every quota hiccup would wake the whole team.
const REQUIRED_CHECKS = REGISTRY.requiredChecks ?? [];
// Whether a lane must have a labelled issue to be started. The kickoff prompt
// also lets a lane pick its own bounded task from its brief, so this is a
// deliberate policy switch: on, the autopilot only starts lanes with a labelled
// issue (a lane with nothing to do is not woken to discover that); off, it
// starts every idle lane as before. `docs/lanes/POLICY.md` argues for on.
const REQUIRE_LABELLED_WORK = REGISTRY.requireLabelledWork ?? false;

const key = process.env.OPENHANDS_API_KEY;
const ghToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GH_TOKEN;

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: ghToken },
  }).trim();
}

function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

async function api(path, init = {}) {
  // Always bound the request. send-message blocks while the target agent is
  // busy, so an unbounded fetch would hang the whole pass.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20000);
  try {
    const response = await fetch(`${API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    // A timeout is reported, not thrown, so callers can decide what it means.
    return { ok: false, status: 0, body: null, timedOut: true, error: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Open PRs keyed by head branch. */
function openPullRequests() {
  const raw = gh([
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    // `mergeable` must be requested explicitly: `gh pr list` omits it otherwise,
    // so the conflict guard below read `undefined === 'CONFLICTING'` and never
    // fired. `mergeStateStatus` alone is not a substitute — it reports BLOCKED
    // for a conflict and for a missing required check alike.
    'number,headRefName,mergeStateStatus,mergeable,labels,isDraft,autoMergeRequest,statusCheckRollup',
    '--limit',
    '50',
  ]);
  return JSON.parse(raw);
}

/** Issues labelled agent:blocked, with their lane label if any. */
function blockedIssues() {
  const raw = gh([
    'issue',
    'list',
    '--state',
    'open',
    '--label',
    'agent:blocked',
    '--json',
    'number,title,labels',
    '--limit',
    '50',
  ]);
  return JSON.parse(raw);
}

/** Issues handed from one lane to another to fix. */
function handoffIssues() {
  const raw = gh([
    'issue',
    'list',
    '--state',
    'open',
    '--label',
    'agent:handoff',
    '--json',
    'number,title,labels',
    '--limit',
    '50',
  ]);
  return JSON.parse(raw);
}

/**
 * Every open issue, so a lane is only started when one names it.
 *
 * Fetched once and reused for all lanes: the per-lane decision needs the whole
 * set (an issue labelled `lane:qa` must not also start `guvenlik`, which shares
 * the broad `agent:test` label). A single list keeps the pass to one `gh` call.
 */
function openIssues() {
  const raw = gh([
    'issue',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,labels',
    '--limit',
    '100',
  ]);
  return JSON.parse(raw);
}

/**
 * The newest commit time on each lane branch, keyed by lane name.
 *
 * This is the ground truth for the commit-window stall signal: a lane that is
 * `running` every pass but has landed no commit is looping, whatever
 * `updated_at` claims. It must come from the API, not `git branch -r`: the
 * autopilot's checkout uses `fetch-depth: 1`, so a fresh runner has only
 * `origin/main` and no lane refs at all — a local read would see every lane as
 * commit-less and poison the whole team.
 *
 * One GraphQL call returns every `refs/heads/lane/*` head with its commit date,
 * so the pass stays at a single request. A lane whose branch is absent is left
 * out of the map, which the commit signal reads as "cannot judge" (the idleness
 * and ceiling signals still decide) rather than "commit-less" — a title/branch
 * mismatch would otherwise poison the whole team at once. A failed query returns
 * `null` instead, so the caller disables the signal outright.
 *
 * @returns {Map<string, number>|null} lane name → newest commit epoch ms, or
 *   `null` when the query could not be read
 */
function laneCommitTimes() {
  const query = `query($owner:String!,$name:String!){
    repository(owner:$owner,name:$name){
      refs(refPrefix:"refs/heads/lane/",first:100){
        nodes{ name target{ ... on Commit { committedDate } } }
      }
    }
  }`;
  const [owner, name] = REPO.split('/');
  let raw;
  try {
    raw = gh([
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
    ]);
  } catch (error) {
    // A read failure must not poison every lane: return `null` so the caller
    // disables the commit signal and the other signals decide. Reported so the
    // degradation is visible.
    console.error(`  lane commit times unavailable: ${String(error.message).split('\n')[0]}`);
    return null;
  }
  const nodes = JSON.parse(raw)?.data?.repository?.refs?.nodes ?? [];
  const times = new Map();
  for (const node of nodes) {
    const committed = Date.parse(String(node?.target?.committedDate ?? ''));
    if (!Number.isFinite(committed)) continue;
    times.set(String(node.name), committed);
  }
  return times;
}

/**
 * Merge lane PRs that are ready.
 *
 * The event-driven workflow enables auto-merge when a PR is opened, but an
 * event can be missed: a PR opened before the workflow existed never fires one,
 * and a PR that turns green later fires nothing. Reconciling here closes that
 * gap, because the pass runs on a schedule regardless of events.
 *
 * The same two brakes apply: a PR touching the CI gate, or carrying
 * agent:hold / agent:blocked, is left alone.
 */
function mergeReadyPullRequests(prs, dryRun) {
  const gate = /^\.github\/workflows\//;
  const merged = [];
  const stalled = [];
  for (const pr of prs) {
    const labels = (pr.labels ?? []).map((l) => l.name ?? l);
    // A PR that carries a brake is deliberately left for a human. Say so, so a
    // stalled PR is visible instead of silent — #193 sat CLEAN with no
    // auto-merge and nothing reported it.
    if (labels.includes('agent:hold') || labels.includes('agent:blocked')) {
      stalled.push({
        number: pr.number,
        reason: `held for a human (${labels.filter((l) => l.startsWith('agent:')).join(', ')})`,
      });
      continue;
    }
    if (pr.isDraft) continue;
    const files = JSON.parse(
      gh(['pr', 'view', String(pr.number), '--json', 'files', '--jq', '.files']),
    );
    // A PR touching the CI gate is never auto-merged: a lane must not be able to
    // weaken the checks that gate it. Report it too.
    if (files.some((f) => gate.test(f.path))) {
      stalled.push({ number: pr.number, reason: 'touches the CI gate' });
      continue;
    }
    // Only a real conflict stops a merge here. Do NOT require mergeStateStatus
    // === 'CLEAN': that flag goes UNSTABLE when any *non-required* check fails,
    // and Vercel is not required — its build-rate limit (an external quota)
    // turned every PR UNSTABLE and left them all unmerged forever. GitHub's
    // auto-merge already waits for the required checks, so the required gate is
    // enforced without this filter second-guessing it.
    if (pr.mergeable === 'CONFLICTING') {
      stalled.push({ number: pr.number, reason: 'conflicts with main' });
      continue;
    }
    if (pr.autoMergeRequest) continue;
    if (dryRun) {
      merged.push({ number: pr.number, action: 'would enable auto-merge' });
      continue;
    }
    try {
      gh([
        'pr',
        'merge',
        String(pr.number),
        '--squash',
        '--auto',
        '--repo',
        REPO,
      ]);
      merged.push({ number: pr.number, action: 'auto-merge on' });
    } catch (error) {
      merged.push({ number: pr.number, action: `failed: ${error.message}` });
    }
  }
  return { merged, stalled };
}

/** Lane tasks this process has started, newest first, from the cloud API. */
async function startTasks() {
  const { ok, body } = await api('/app-conversations/start-tasks/search?limit=50');
  if (!ok || !body) return [];
  return body.items ?? [];
}

async function runningSandboxes() {
  const { ok, body } = await api('/sandboxes/search?limit=50');
  if (!ok || !body) return [];
  return (body.items ?? []).filter((s) => s.status === 'RUNNING');
}

/** Every conversation, newest first — one fetch the pass derives several views from. */
async function allConversations() {
  const { ok, body } = await api('/app-conversations/search?limit=50');
  if (!ok || !body) return [];
  return body.items ?? [];
}

/**
 * Conversations whose sandbox is running but whose agent is not busy — the
 * ones a new task can be sent to without creating a sandbox.
 */
function idleConversations(conversations) {
  return (conversations ?? []).filter(
    (c) =>
      c.sandbox_status === 'RUNNING' &&
      !['running'].includes(String(c.execution_status ?? '')),
  );
}

/**
 * A lane's own paused sandbox, if it has one. Resuming an existing sandbox does
 * not create one, so it costs no quota — the third way to keep working on a
 * quota-exhausted day, after reuse and before a fresh sandbox.
 */
function pausedConversations(conversations) {
  return (conversations ?? []).filter((c) => c.sandbox_status === 'PAUSED');
}

async function resumeSandbox(sandboxId) {
  const { ok } = await api(`/sandboxes/${sandboxId}/resume`, { method: 'POST' });
  return ok;
}

/**
 * Interrupt a running lane conversation, ending its task.
 *
 * The interrupt lives on the sandbox's own conversation API, not the control
 * plane, so it needs the conversation's `conversation_url` (which carries the
 * sandbox host) and its per-conversation `session_api_key`. Both come from the
 * search item; a conversation missing either cannot be interrupted and is
 * reported so the caller can see it was skipped rather than silently ignored.
 *
 * Returns true when the sandbox accepted the interrupt.
 */
async function interruptConversation(conversation) {
  const url = String(conversation?.conversation_url ?? '');
  const sessionKey = String(conversation?.session_api_key ?? '');
  if (!url || !sessionKey) return false;
  const base = url.split('/api/conversations')[0];
  try {
    const response = await fetch(
      `${base}/api/conversations/${conversation.id}/interrupt`,
      {
        method: 'POST',
        headers: { 'X-Session-API-Key': sessionKey, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(20000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Poll until a resumed sandbox reports RUNNING, or give up.
 *
 * `resume` returns immediately while the sandbox is still STARTING; a send in
 * that window is refused with "Sandbox is STARTING". Waiting here turns a race
 * into a delay, so the lane does not lose an attempt to it.
 */
async function waitForSandboxReady(sandboxId, { attempts = 12, delayMs = 5000 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const { ok, body } = await api('/sandboxes/search?limit=50');
    if (ok && body) {
      const found = (body.items ?? []).find((s) => s.id === sandboxId);
      if (found?.status === 'RUNNING') return true;
      if (!found) return false;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

/** The kickoff prompt for a lane, with the autopilot's retry budget and hint. */
function laneKickoff(name, context) {
  return kickoff(name, LANES[name], {
    maxAttempts: MAX_ATTEMPTS,
    previousError: context?.previousError,
    redPr: context?.redPr,
    recovery: context?.recovery,
  });
}

async function spawnLane(name, context) {
  const { ok, body } = await api('/app-conversations', {
    method: 'POST',
    body: JSON.stringify({
      selected_repository: REPO,
      selected_branch: 'main',
      git_provider: PROVIDER,
      title: `LANE-${name}`,
      // Explicit: the account default is the cheap tier, and a setting change
      // did not stick (see LANE_MODEL).
      llm_model: LANE_MODEL,
      initial_message: {
        role: 'user',
        content: [{ type: 'text', text: laneKickoff(name, context) }],
        run: true,
      },
    }),
  });
  if (!ok) throw new Error(`${name}: HTTP ${body?.detail ?? 'unknown'}`);
  return body.id;
}

/**
 * Start a fresh conversation on a sandbox that already exists.
 *
 * The daily quota counts sandbox *creation*, so a lane with a running sandbox
 * can keep working without spending quota. Reusing that sandbox with a *new*
 * conversation (rather than appending to the old transcript) keeps the context
 * bounded: every task appended to one conversation makes the next turn pay for
 * the whole history again, which is how a single lane reached 100M+ prompt
 * tokens. A fresh transcript costs no sandbox; the sandbox is shared, only the
 * history is new.
 *
 * Starting a conversation is asynchronous (the POST returns a start-task, not a
 * conversation), so the caller records the sandbox id and a task count, not the
 * returned id. Returns true when the API accepted the request, false when it
 * refused, so the caller can fall back to appending.
 */
async function startConversationOnSandbox(sandboxId, name, context) {
  const { ok } = await api('/app-conversations', {
    method: 'POST',
    body: JSON.stringify({
      sandbox_id: sandboxId,
      selected_repository: REPO,
      selected_branch: 'main',
      git_provider: PROVIDER,
      title: `LANE-${name}`,
      initial_message: {
        role: 'user',
        content: [{ type: 'text', text: laneKickoff(name, context) }],
        run: true,
      },
    }),
  });
  return ok;
}

/**
 * Send a new task to an existing conversation's sandbox.
 *
 * The daily quota counts sandbox *creation*, so once it is exhausted no new
 * lane can start — but a lane whose sandbox is already running can still be
 * given work. This reuses that sandbox: the next task in the queue goes to it
 * instead of a fresh one. Returns the conversation id it used.
 */
async function sendToExisting(conversationId, name, context) {
  const { ok, body, timedOut } = await api(
    `/app-conversations/${conversationId}/send-message`,
    {
      method: 'POST',
      timeoutMs: 20000,
      body: JSON.stringify({
        role: 'user',
        content: [{ type: 'text', text: laneKickoff(name, context) }],
        run: true,
      }),
    },
  );
  // The endpoint holds the response until the agent accepts the message, so a
  // timeout means the agent was busy — the message was delivered, it is just
  // not acknowledged. Treat it as sent rather than retrying into a duplicate.
  if (timedOut) return conversationId;
  if (!ok) throw new Error(`${name}: HTTP ${body?.detail ?? 'unknown'}`);
  return conversationId;
}

/** Read a start task back; the POST returns 200 even when the sandbox is refused. */
async function confirm(taskId) {
  const tasks = await startTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return { status: 'UNKNOWN' };
  return { status: task.status, detail: task.detail };
}

/**
 * Issues that genuinely need a human, for this lane.
 *
 * `agent:blocked` means "an agent tried and could not finish" — the lane must
 * stop and wait. It is NOT the same as a handoff: when one lane finds a defect
 * in another lane's files, that is `agent:handoff`, which the owning lane is
 * expected to pick up and fix. Conflating the two deadlocked the whole team:
 * every handoff looked like a human blocker, so the finder stopped and the
 * owner stopped too.
 */
function blockedForLane(name, issues) {
  const laneLabel = LANES[name].laneLabel ?? `lane:${name}`;
  return issues.find(
    (issue) =>
      (issue.labels ?? []).some((l) => (l.name ?? l) === laneLabel) &&
      (issue.labels ?? []).some((l) => (l.name ?? l) === 'agent:blocked'),
  );
}

/** Issues handed to this lane by another lane, to fix. */
function handoffForLane(name, issues) {
  const laneLabel = LANES[name].laneLabel ?? `lane:${name}`;
  return issues.find((issue) =>
    (issue.labels ?? []).some((l) => (l.name ?? l) === laneLabel),
  );
}

async function decide(name, ctx) {
  const lane = LANES[name];
  const stored = ctx.state[name] ?? { attempts: 0 };
  const pr = ctx.prs.find((p) => p.headRefName === lane.branch);
  const branchExists = ctx.branches.includes(`origin/${lane.branch}`);
  const blocked = blockedForLane(name, ctx.blocked);
  const handoff = handoffForLane(name, ctx.handoffs);

  // The retry budget is per *piece of work*, not per lane lifetime. A lane that
  // delivered, or whose assignment changed, starts its next attempt with a clean
  // count; only a lane that keeps failing the same work carries its attempts.
  // Without this a lane that exhausted three attempts once stayed `exhausted`
  // forever — even after a new handoff arrived (issue #471).
  const work = workSignature({ handoff, branchExists, prNumber: pr?.number });
  const state = { ...stored, attempts: carriedAttempts(stored, work), work };

  // A human blocker stops the lane. A handoff is work: it does not stop it.
  if (blocked) {
    return { action: 'blocked', reason: `issue #${blocked.number} needs a human` };
  }
  if (pr) {
    // A PR whose *required* check has failed is a dead end: the sandbox that
    // opened it is gone, so a lane left to "wait" here never moves again — its
    // own red PR freezes it (issue #453). Re-spawn to fix the failing check.
    // Only required checks qualify; a non-required failure (Vercel's build-rate
    // limit is an external quota) must not wake a lane.
    const failed = failedRequiredChecks(pr.statusCheckRollup, REQUIRED_CHECKS);
    if (failed.length > 0) {
      if (state.attempts >= MAX_ATTEMPTS) {
        // After the cooldown a red PR is worth one more respawn: its failing
        // check may have been transient (a quota hiccup), and the merge queue
        // cannot drain a PR nobody retries. Clear the count so the retry is a
        // fresh bounded window; otherwise the same gate returns `exhausted`
        // forever (issue #453).
        if (exhaustedCooldownElapsed(stored, { cooldownMs: EXHAUSTED_COOLDOWN_MS })) {
          return {
            action: 'spawn',
            reason: `PR #${pr.number} red (${failed.join(', ')}) — cooldown elapsed, respawn`,
            resetAttempts: true,
            context: {
              previousError: `PR #${pr.number} failed: ${failed.join(', ')}`,
              work,
              redPr: { number: pr.number, checks: failed },
              recovery: true,
            },
          };
        }
        return {
          action: 'exhausted',
          reason: `PR #${pr.number} red (${failed.join(', ')}); ${state.attempts} attempts used; needs a human`,
        };
      }
      return {
        action: 'spawn',
        reason: `PR #${pr.number} red (${failed.join(', ')}) — respawn to fix`,
        context: {
          previousError: `PR #${pr.number} failed: ${failed.join(', ')}`,
          work,
          redPr: { number: pr.number, checks: failed },
        },
      };
    }
    const state_ = pr.mergeStateStatus;
    if (state_ === 'CLEAN') return { action: 'wait', reason: `PR #${pr.number} ready to merge` };
    return { action: 'wait', reason: `PR #${pr.number} in flight (${state_})` };
  }
  // A branch alone does NOT mean work is in flight. Squash-merge rewrites the
  // SHA, so a merged branch still looks "ahead of main" forever, and treating
  // it as in-flight deadlocked the lane. The branch only counts when the lane
  // is actually working or a PR is open (handled above).
  if (branchExists && ctx.working.has(name)) {
    return { action: 'wait', reason: `branch ${lane.branch} in use, task running` };
  }
  if (state.attempts >= MAX_ATTEMPTS) {
    // A lane that exhausted its budget is retried once the cooldown elapses, so
    // one outage that burned every lane's attempts does not freeze the team
    // forever (issue #442). The reset makes the retry a fresh bounded window;
    // a lane that exhausts again with no new work simply re-parks.
    if (exhaustedCooldownElapsed(stored, { cooldownMs: EXHAUSTED_COOLDOWN_MS })) {
      return {
        action: 'spawn',
        reason: `cooldown elapsed after ${state.attempts} attempts — retrying`,
        resetAttempts: true,
        context: { previousError: stored.lastError, work, recovery: true },
      };
    }
    return {
      action: 'exhausted',
      reason: `${state.attempts} attempts used; needs a human`,
    };
  }
  // A handoff names the work. Without one, only start the lane if some open
  // issue names it — a lane with nothing to do would otherwise burn a full
  // conversation before discovering that (docs/lanes/POLICY.md: "a lane is only
  // started when it has concrete, bounded work").
  if (REQUIRE_LABELLED_WORK && !handoff && !hasLabelledWork(lane, ctx.laneIssues)) {
    return { action: 'idle', reason: 'no labelled issue to work' };
  }
  return {
    action: 'spawn',
    reason: handoff
      ? `handoff #${handoff.number} to fix`
      : branchExists
        ? 'stale branch, restarting'
        : state.attempts === 0
          ? 'labelled work'
          : `retry ${state.attempts + 1}/${MAX_ATTEMPTS}`,
    context: { previousError: state.lastError, work },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const resetIdx = args.indexOf('--reset');
  const state = loadState();

  if (resetIdx !== -1) {
    const target = args[resetIdx + 1];
    if (!target || !LANES[target]) {
      console.error(`--reset needs a lane name. Known: ${Object.keys(LANES).join(', ')}`);
      process.exit(1);
    }
    delete state[target];
    saveState(state);
    console.log(`reset ${target}`);
    return;
  }

  if (!dryRun && !key) {
    console.error('OPENHANDS_API_KEY is not set');
    process.exit(1);
  }

  // Free the slots stranded by lanes that ended in `error` (or were abandoned in
  // `finished`/`stuck`): those leave their sandbox RUNNING forever, and once the
  // budget fills, the lanes with real work are deferred every pass. Reap before
  // the fetch below so the count it reads reflects the freed slots, and this
  // pass can spend them. Pausing keeps the worktree, so a lane can still be
  // resumed later without quota. Never runs in a dry-run: it is not a decision.
  if (!dryRun) {
    try {
      const reaped = await reapStalledSandboxes({ key });
      if (reaped.paused.length > 0 || reaped.failures.length > 0) {
        console.log(
          `reaped stalled sandboxes: paused=${reaped.paused.length} failed=${reaped.failures.length}`,
        );
        for (const entry of reaped.paused) {
          console.log(`  paused ${entry.lane} (${entry.sandboxId})`);
        }
        for (const failure of reaped.failures) {
          console.error(`  reap FAIL ${failure}`);
        }
      }
    } catch (error) {
      // Reaping is opportunistic housekeeping: a failure must not stop the pass.
      console.error(`  reap skipped: ${String(error.message).split('\n')[0]}`);
    }
  }

  const [prs, blocked, handoffs, issues, tasks, sandboxes, conversations] =
    await Promise.all([
      Promise.resolve(openPullRequests()),
      Promise.resolve(blockedIssues()),
      Promise.resolve(handoffIssues()),
      Promise.resolve(openIssues()),
      startTasks(),
      runningSandboxes(),
      allConversations(),
    ]);
  // The lane branches' newest commit times, for the commit-window stall signal.
  // Fetched once here so the signal has real data on a `fetch-depth: 1` runner
  // (where no lane ref exists locally). Skipped when the window is disabled, so
  // an unconfigured repo pays no extra API call.
  const commitsByLane =
    LANE_COMMIT_WINDOW_MS > 0 ? laneCommitTimes() : new Map();
  // A conversation that is old and has produced no PR is poisoned: its
  // transcript only grows, so every extra task re-sends all of it and the leak
  // compounds (issue #218). Compute it once here, before anything is
  // interrupted, and exclude these conversations from *both* the reuse target
  // (`idle`) and the resume target (`paused`). Without this the staleness guard
  // only paused the loop — the next pass saw a non-`running` conversation with a
  // live sandbox and fed it another task, so one conversation reached 34.5M
  // prompt tokens. The lane instead gets a fresh conversation (or sandbox), and
  // the interrupt below stops the burn now.
  const poisoned = new Set(
    poisonedConversations(conversations, {
      maxIdleMs: MAX_CONVERSATION_IDLE_MS,
      maxRuntimeMs: MAX_CONVERSATION_RUNTIME_MS,
      noCommitMs: LANE_COMMIT_WINDOW_MS,
      commitsByLane,
    }).map((c) => c.id),
  );
  const idle = idleConversations(conversations).filter(
    (c) => !poisoned.has(c.id),
  );
  const paused = pausedConversations(conversations).filter(
    (c) => !poisoned.has(c.id),
  );

  // Break stalled loops before deciding: a `running` conversation older than the
  // runtime budget that has opened no PR is a lane stuck in a loop, and it is
  // counted as "working" every pass, so nothing ever re-evaluates it. Interrupt
  // it here to stop the burn now; the sandbox it was holding is released and the
  // reaper reclaims it on the next pass, when the lane restarts from a clean
  // state. Excluded from `busyConversations` below so the lane is not skipped as
  // still-busy on the stale status. A dry-run only previews it.
  const stalledLanes = stalledConversations(conversations, {
    maxIdleMs: MAX_CONVERSATION_IDLE_MS,
    maxRuntimeMs: MAX_CONVERSATION_RUNTIME_MS,
    noCommitMs: LANE_COMMIT_WINDOW_MS,
    commitsByLane,
  });
  const interrupted = new Set();
  if (dryRun && stalledLanes.length > 0) {
    for (const conversation of stalledLanes) {
      console.log(`  would interrupt stalled ${conversation.title} (${conversation.id})`);
    }
  } else if (stalledLanes.length > 0) {
    for (const conversation of stalledLanes) {
      const stopped = await interruptConversation(conversation);
      if (stopped) interrupted.add(conversation.id);
      console.log(
        `  ${stopped ? 'interrupted' : 'could not interrupt'} stalled ${conversation.title} (${conversation.id})`,
      );
    }
  }

  // Self-heal a budget poisoned by an outage before deciding anything: a lane
  // whose last conversation died without working never actually spent its
  // attempts (issue #442). Deleting the entry (not just zeroing the count) also
  // drops the stale lastError/work, so the lane restarts clean. This must run
  // before the decisions so every healed lane — including ones this pass defers —
  // starts from a clean count. A dry run still heals in memory (so its preview is
  // truthful) but does not write, keeping it side-effect-free.
  const healed = deadConversationLanes(state, conversations);
  if (healed.length > 0) {
    for (const name of healed) delete state[name];
    console.log(`healed poisoned budgets (conversation died, 0 tokens): ${healed.join(', ')}`);
    if (!dryRun) saveState(state);
  }

  const branches = execFileSync('git', ['branch', '-r'], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // A lane whose latest task is still WORKING counts as running.
  // A lane is busy when a task it owns is still starting, OR when its
  // conversation reports execution_status=running. The second half matters for
  // lanes given work through send-message: their start task stays READY, so
  // counting only start tasks made a busy lane look idle and the pass asked for
  // a fresh sandbox it did not need.
  const busyConversations = new Set(
    (conversations ?? [])
      .filter((c) => String(c.execution_status ?? '') === 'running')
      .filter((c) => !interrupted.has(c.id))
      .map((c) => String(c.title ?? '').replace(/^LANE-/, '')),
  );
  const working = new Set([
    ...tasks
      .filter((t) => !['READY', 'ERROR'].includes(t.status))
      .map((t) => String(t.request?.title ?? '').replace(/^LANE-/, '')),
    ...busyConversations,
  ]);

  const ctx = { prs, blocked, handoffs, laneIssues: issues, branches, state, working };
  const decisions = [];
  let running = sandboxes.length;

  for (const name of Object.keys(LANES)) {
    if (working.has(name)) {
      decisions.push({ name, action: 'running', reason: 'task in progress' });
      continue;
    }
    decisions.push({ name, ...(await decide(name, ctx)) });
  }

  const toSpawn = decisions.filter((d) => d.action === 'spawn');

  // A lane that can reuse a running sandbox costs no quota, so it never waits
  // for budget — and it goes first, because a lane that needs a fresh sandbox
  // may be refused once the daily quota is gone. Processing the reusable ones
  // first is what keeps the team moving on a quota-exhausted day.
  const reusableFor = (d) =>
    idle.find((c) => String(c.title ?? '') === `LANE-${d.name}`);
  const resumableFor = (d) =>
    paused.find(
      (c) =>
        String(c.title ?? '') === `LANE-${d.name}` && c.sandbox_id,
    );
  // A lane whose only sandbox holds a poisoned conversation: it has a sandbox
  // already, so recovering it (fresh transcript on that sandbox) spends no
  // quota — it must not be budget-gated like a lane that needs a *new* sandbox.
  const poisonedSandboxFor = (d) =>
    conversations.find(
      (c) =>
        poisoned.has(c.id) &&
        String(c.title ?? '') === `LANE-${d.name}` &&
        c.sandbox_id,
    );
  const reusable = toSpawn.filter((d) => reusableFor(d));
  const resumable = toSpawn.filter(
    (d) => !reusableFor(d) && resumableFor(d),
  );
  const fresh = toSpawn.filter(
    (d) =>
      !reusableFor(d) && !resumableFor(d) && !poisonedSandboxFor(d),
  );

  const capacity = Math.max(0, SANDBOX_BUDGET - running);
  // Rotate, don't freeze on the registry order. Both the sandbox budget and the
  // PR cap are scarce, and the candidate lists were sliced in `lanes.json`
  // order, so with a cap of 4 and 9 resumable lanes the registry head (supabase,
  // cloudflare, seo, geo) won every pass and the tail (urun, guvenlik, icerik,
  // teslimat, operator) was deferred all day with `open PRs: 0` — starvation,
  // not a full queue. Ordering longest-waiting first (`updatedAt`, refreshed on
  // every attempt) lets the tail take its turn; a lane that just ran falls
  // behind one that has waited.
  const freshOrdered = fairOrder(fresh, state);
  const freshAllowed = freshOrdered.slice(0, capacity);
  // Two independent brakes. The sandbox budget bounds fresh sandboxes; the PR cap
  // bounds how many lanes may open a PR this pass. Reusable/resumable lanes cost
  // no quota so they are considered first — but they still spend a PR slot,
  // because a PR is what queues CI. Beyond the cap a spawn is *deferred*, not
  // dropped: it starts on a later pass once a merge frees a slot (issue #430).
  // Merges below are deliberately not subject to the cap, so the queue drains.
  const prSlots = prCapacity(prs.length, MAX_OPEN_PRS);
  // A poisoned-sandbox recovery is quota-free too: it starts a fresh transcript
  // on a sandbox the lane already owns, so it joins the quota-free group and is
  // never deferred for "no sandbox budget".
  const poisonedSandboxed = toSpawn.filter((d) => poisonedSandboxFor(d));
  const quotaFree = fairOrder(
    [...reusable, ...resumable, ...poisonedSandboxed],
    state,
  );
  // Reserve a share of the PR slots for the fresh group; otherwise the
  // quota-free group (larger than the cap whenever every lane holds a poisoned
  // sandbox) takes all of them and fresh work never runs. See `selectSlots`.
  const { allowed, deferred: overPrCap } = selectSlots(quotaFree, freshAllowed, prSlots);
  const overBudget = freshOrdered.slice(capacity);
  const deferred = [...overBudget, ...overPrCap];
  const deferredReason = new Map();
  for (const d of overBudget) deferredReason.set(d, 'no sandbox budget');
  for (const d of overPrCap) {
    deferredReason.set(
      d,
      `PR limit: pass may open ${prSlots} (open ${prs.length}, cap ${MAX_OPEN_PRS})`,
    );
  }

  console.log(`sandboxes running: ${running} (budget ${SANDBOX_BUDGET})`);
  if (MAX_OPEN_PRS > 0) console.log(`open PRs: ${prs.length} (limit ${MAX_OPEN_PRS})`);
  for (const d of decisions) {
    const isDeferred = deferredReason.has(d);
    const marker = isDeferred ? 'deferred' : d.action;
    const note = isDeferred
      ? ` (${deferredReason.get(d)})`
      : reusableFor(d)
        ? ' (reuse)'
        : resumableFor(d)
          ? ' (resume)'
          : '';
    console.log(`  ${d.name.padEnd(11)} ${marker.padEnd(9)} ${d.reason}${note}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing started');
  }

  // Reconcile PRs before starting anything: a ready PR should land even if its
  // opening event was missed.
  const { merged: mergeResults, stalled } = mergeReadyPullRequests(prs, dryRun);
  if (mergeResults.length > 0) {
    console.log('\nready PRs:');
    for (const m of mergeResults) console.log(`  #${m.number} ${m.action}`);
  }
  // Never leave a stalled PR silent. A PR that waits for a human is the one
  // failure the system cannot fix itself, so it must be the loudest line.
  if (stalled.length > 0) {
    console.log(`\nSTALLED PRs (need a human): ${stalled.length}`);
    for (const s of stalled) console.log(`  #${s.number} — ${s.reason}`);
  }

  // A bot-opened PR has its checks held at action_required until a human
  // approves the run. Without this the PR shows BLOCKED forever and the lane
  // that opened it looks idle — #178 had no CI at all. Approving is safe: it
  // starts the run, it does not make a failure pass.
  if (!dryRun) {
    try {
      const approved = execFileSync('node', ['scripts/approve-pending-runs.mjs'], {
        encoding: 'utf8',
        env: process.env,
      }).trim();
      if (!approved.includes('no runs are waiting')) {
        console.log(`\nheld runs:\n${approved.split('\n').map((l) => `  ${l}`).join('\n')}`);
      }
    } catch (error) {
      console.error(`  could not approve held runs: ${String(error.message).split('\n')[0]}`);
    }
  }

  if (dryRun) return;

  for (const d of allowed) {
    try {
      // Prefer a sandbox this lane already owns. Creating one may be refused
      // by the daily quota; reusing or resuming one never is.
      const reusable = idle.find(
        (c) => String(c.title ?? '') === `LANE-${d.name}`,
      );
      const resumable = paused.find(
        (c) => String(c.title ?? '') === `LANE-${d.name}` && c.sandbox_id,
      );
      let entry = state[d.name] ?? { attempts: 0 };

      // The decision gates on `carriedAttempts`, but the stored count was never
      // synced to it: a reset (delivered / new work / infra rejection) zeroed
      // only the decision's view, so the raw counter kept climbing — a lane
      // reached attempt 9 with a cap of 3. Persist the carried count so the
      // stored value and the gate always agree; the increment below then starts
      // from the same number the decision saw.
      entry = { ...entry, attempts: carriedAttempts(entry, d.context?.work) };

      // A cooldown retry starts a fresh bounded window: clear the count so the
      // lane gets its full budget again instead of re-parking on the first
      // failure. `updatedAt` is refreshed below, so the next cooldown is timed
      // from this retry.
      if (d.resetAttempts) entry = { ...entry, attempts: 0 };

      // Reuse is bounded. A conversation keeps every task's transcript, and each
      // new turn re-sends all of it; past MAX_REUSES the lane gets a fresh
      // conversation so the context stays small. Unbounded reuse is what pushed
      // one lane past 100M prompt tokens (issue #218).
      const reuses = entry.reuses ?? 0;
      const reuseAllowed =
        nextConversationAction({ reuses, maxReuses: MAX_REUSES }) === 'append';

      if (reusable && reuseAllowed) {
        await sendToExisting(reusable.id, d.name, d.context);
        entry.attempts = (entry.attempts ?? 0) + 1;
        entry.reuses = reuses + 1;
        entry.lastConversationId = reusable.id;
        entry.lastStatus = 'REUSED';
        entry.lastError = null;
        entry.work = d.context?.work;
        entry.updatedAt = new Date().toISOString();
        state[d.name] = entry;
        console.log(
          `  ${d.name}: reused sandbox (attempt ${entry.attempts}, reuse ${entry.reuses}/${MAX_REUSES})`,
        );
        continue;
      }
      if (reusable && !reuseAllowed) {
        // Start a fresh conversation on the *same* sandbox instead of falling
        // through to a new one: the daily quota counts sandbox creation, so a
        // new sandbox here would spend quota the reuse was meant to save. The
        // counter resets, otherwise every later pass would take the "budget
        // spent" path and leak a sandbox each time.
        const started = await startConversationOnSandbox(
          reusable.sandbox_id,
          d.name,
          d.context,
        );
        if (started) {
          entry.attempts = (entry.attempts ?? 0) + 1;
          entry.reuses = 1;
          entry.lastConversationId = reusable.id;
          entry.lastStatus = 'REFRESHED';
          entry.lastError = null;
          entry.work = d.context?.work;
          entry.updatedAt = new Date().toISOString();
          state[d.name] = entry;
          console.log(
            `  ${d.name}: context budget spent (${reuses} reuses), fresh conversation on the reused sandbox (attempt ${entry.attempts})`,
          );
          continue;
        }
        console.error(
          `  ${d.name}: could not start a fresh conversation on the sandbox, falling back to a new one`,
        );
      }

      if (resumable) {
        const resumed = await resumeSandbox(resumable.sandbox_id);
        if (resumed) {
          // resume returns before the sandbox accepts work: it reports
          // "Sandbox is STARTING" for a few seconds. Wait for it, otherwise the
          // send fails and the lane spends an attempt on a race.
          const ready = await waitForSandboxReady(resumable.sandbox_id);
          if (ready) {
            // The resume path must honour the same transcript budget as reuse:
            // appending forever is what leaks tokens (#218). Past MAX_REUSES the
            // lane gets a fresh transcript on the same (quota-free) sandbox.
            if (reuseAllowed) {
              await sendToExisting(resumable.id, d.name, d.context);
              entry.attempts = (entry.attempts ?? 0) + 1;
              entry.reuses = reuses + 1;
              entry.lastConversationId = resumable.id;
              entry.lastStatus = 'RESUMED';
              entry.lastError = null;
              entry.work = d.context?.work;
              entry.updatedAt = new Date().toISOString();
              state[d.name] = entry;
              console.log(
                `  ${d.name}: resumed sandbox (attempt ${entry.attempts}, reuse ${entry.reuses}/${MAX_REUSES})`,
              );
              continue;
            }
            const started = await startConversationOnSandbox(
              resumable.sandbox_id,
              d.name,
              d.context,
            );
            if (started) {
              entry.attempts = (entry.attempts ?? 0) + 1;
              entry.reuses = 1;
              entry.lastConversationId = null;
              entry.lastStatus = 'REFRESHED';
              entry.lastError = null;
              entry.work = d.context?.work;
              entry.updatedAt = new Date().toISOString();
              state[d.name] = entry;
              console.log(
                `  ${d.name}: context budget spent (${reuses} reuses), fresh conversation on the resumed sandbox (attempt ${entry.attempts})`,
              );
              continue;
            }
          }
          console.error(
            `  ${d.name}: sandbox did not become ready after resume, using a new one`,
          );
        } else {
          console.error(`  ${d.name}: resume failed, falling through to a new sandbox`);
        }
      }

      // The lane's only sandbox may hold just a poisoned conversation — the leak
      // case itself. Reusing the sandbox costs no quota, so resume it if needed
      // and start a *fresh transcript* on it instead of creating a sandbox or,
      // worse, appending to the leaked conversation. The old transcript is
      // abandoned; its history is never re-sent.
      const poisonedConv = conversations.find(
        (c) =>
          poisoned.has(c.id) &&
          String(c.title ?? '') === `LANE-${d.name}` &&
          c.sandbox_id,
      );
      if (poisonedConv) {
        const resumed = await resumeSandbox(poisonedConv.sandbox_id);
        const ready =
          resumed && (await waitForSandboxReady(poisonedConv.sandbox_id));
        if (ready) {
          const started = await startConversationOnSandbox(
            poisonedConv.sandbox_id,
            d.name,
            d.context,
          );
          if (started) {
            entry.attempts = (entry.attempts ?? 0) + 1;
            entry.reuses = 1;
            entry.lastConversationId = null;
            entry.lastStatus = 'REFRESHED';
            entry.lastError = null;
            entry.work = d.context?.work;
            entry.updatedAt = new Date().toISOString();
            state[d.name] = entry;
            console.log(
              `  ${d.name}: poisoned conversation dropped, fresh transcript on its sandbox (attempt ${entry.attempts})`,
            );
            continue;
          }
        }
        console.error(
          `  ${d.name}: could not start a fresh transcript on the poisoned sandbox, using a new one`,
        );
      }

      const taskId = await spawnLane(d.name, d.context);
      await new Promise((r) => setTimeout(r, 4000));
      const result = await confirm(taskId);

      // An infrastructure rejection (quota, or the model closed to the account)
      // is the platform's limit, not the lane's failure. Do not spend an attempt
      // on it, and stop the pass: a model-access or quota refusal will refuse the
      // remaining lanes too.
      if (result.status === 'ERROR' && isInfraRejection(result.detail)) {
        console.error(`  ${d.name}: infra rejection — ${result.detail}`);
        entry.lastError = result.detail;
        entry.work = d.context?.work;
        entry.updatedAt = new Date().toISOString();
        state[d.name] = entry;
        console.error('  stopping this pass: infrastructure rejection');
        break;
      }

      entry.attempts = (entry.attempts ?? 0) + 1;
      entry.lastTaskId = taskId;
      entry.lastStatus = result.status;
      entry.work = d.context?.work;
      entry.lastError =
        result.status === 'ERROR' ? (result.detail ?? 'unknown error') : null;
      entry.updatedAt = new Date().toISOString();
      state[d.name] = entry;
      if (result.status === 'ERROR') {
        console.error(`  ${d.name}: REJECTED ${result.detail ?? ''}`);
      } else {
        console.log(`  ${d.name}: started (attempt ${entry.attempts}, ${result.status})`);
      }
    } catch (error) {
      console.error(`  ${d.name}: FAILED ${error.message}`);
    }
  }

  // An exhausted lane is the one thing here a human must see: it will not be
  // retried again. Surface it as a workflow warning and on the run summary, not
  // only in the log, so it cannot scroll past unnoticed.
  const exhausted = decisions.filter((d) => d.action === 'exhausted');
  if (exhausted.length > 0) {
    const lines = exhausted.map((d) => `- \`${d.name}\`: ${d.reason}`);
    for (const d of exhausted) {
      console.log(`\n${d.name} is out of attempts — needs a human (${d.reason}).`);
    }
    console.log(
      `::warning title=Lane(s) out of attempts::${exhausted
        .map((d) => d.name)
        .join(', ')} — open an issue for a human.`,
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## Lane(s) out of attempts\n\n${lines.join('\n')}\n`,
      );
    }
  }
  if (deferred.length > 0) {
    const byReason = {};
    for (const d of deferred) {
      const reason = deferredReason.get(d) ?? 'deferred';
      (byReason[reason] ??= []).push(d.name);
    }
    console.log('\ndeferred:');
    for (const [reason, names] of Object.entries(byReason)) {
      console.log(`  ${names.join(', ')} — ${reason}`);
    }
  }

  saveState(state);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
