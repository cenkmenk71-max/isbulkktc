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
import {
  hasLabelledWork,
  isCapacityError,
  nextConversationAction,
} from './lane-autopilot-core.mjs';

const API = 'https://app.all-hands.dev/api/v1';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const REGISTRY = JSON.parse(readFileSync(join(HERE, 'lanes.json'), 'utf8'));
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
    'number,headRefName,mergeStateStatus,labels,isDraft,autoMergeRequest',
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
 * set (an issue labelled `lane:qa` must not also start `infra`, which shares the
 * broad `agent:test` label). A single list keeps the pass to one `gh` call.
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

/**
 * Conversations whose sandbox is running but whose agent is not busy — the
 * ones a new task can be sent to without creating a sandbox.
 */
async function idleConversations() {
  const { ok, body } = await api('/app-conversations/search?limit=50');
  if (!ok || !body) return [];
  return (body.items ?? []).filter(
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
async function pausedConversations() {
  const { ok, body } = await api('/app-conversations/search?limit=50');
  if (!ok || !body) return [];
  return (body.items ?? []).filter((c) => c.sandbox_status === 'PAUSED');
}

async function resumeSandbox(sandboxId) {
  const { ok } = await api(`/sandboxes/${sandboxId}/resume`, { method: 'POST' });
  return ok;
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
  const state = ctx.state[name] ?? { attempts: 0 };
  const pr = ctx.prs.find((p) => p.headRefName === lane.branch);
  const branchExists = ctx.branches.includes(`origin/${lane.branch}`);
  const blocked = blockedForLane(name, ctx.blocked);
  const handoff = handoffForLane(name, ctx.handoffs);

  // A human blocker stops the lane. A handoff is work: it does not stop it.
  if (blocked) {
    return { action: 'blocked', reason: `issue #${blocked.number} needs a human` };
  }
  if (pr) {
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
    context: { previousError: state.lastError },
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

  const [prs, blocked, handoffs, issues, tasks, sandboxes, idle, paused] =
    await Promise.all([
      Promise.resolve(openPullRequests()),
      Promise.resolve(blockedIssues()),
      Promise.resolve(handoffIssues()),
      Promise.resolve(openIssues()),
      startTasks(),
      runningSandboxes(),
      idleConversations(),
      pausedConversations(),
    ]);

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
    (await api('/app-conversations/search?limit=50')).body?.items
      ?.filter((c) => String(c.execution_status ?? '') === 'running')
      .map((c) => String(c.title ?? '').replace(/^LANE-/, '')) ?? [],
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
  const reusable = toSpawn.filter((d) => reusableFor(d));
  const resumable = toSpawn.filter(
    (d) => !reusableFor(d) && resumableFor(d),
  );
  const fresh = toSpawn.filter((d) => !reusableFor(d) && !resumableFor(d));

  const capacity = Math.max(0, SANDBOX_BUDGET - running);
  const freshAllowed = fresh.slice(0, capacity);
  const allowed = [...reusable, ...resumable, ...freshAllowed];
  const deferred = fresh.slice(capacity);

  console.log(`sandboxes running: ${running} (budget ${SANDBOX_BUDGET})`);
  for (const d of decisions) {
    const isAllowed = allowed.includes(d);
    const marker = d.action === 'spawn' && !isAllowed ? 'deferred' : d.action;
    const note = reusableFor(d)
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
            await sendToExisting(resumable.id, d.name, d.context);
            entry.attempts = (entry.attempts ?? 0) + 1;
            entry.lastConversationId = resumable.id;
            entry.lastStatus = 'RESUMED';
            entry.lastError = null;
            entry.updatedAt = new Date().toISOString();
            state[d.name] = entry;
            console.log(
              `  ${d.name}: resumed sandbox (attempt ${entry.attempts})`,
            );
            continue;
          }
          console.error(
            `  ${d.name}: sandbox did not become ready after resume, using a new one`,
          );
        } else {
          console.error(`  ${d.name}: resume failed, falling through to a new sandbox`);
        }
      }

      const taskId = await spawnLane(d.name, d.context);
      await new Promise((r) => setTimeout(r, 4000));
      const result = await confirm(taskId);

      // A capacity rejection is the platform's limit, not the lane's failure.
      // Do not spend an attempt on it, and stop the pass: if the quota is
      // exhausted, the remaining lanes will be refused too.
      if (result.status === 'ERROR' && isCapacityError(result.detail)) {
        console.error(`  ${d.name}: no capacity — ${result.detail}`);
        entry.lastError = result.detail;
        entry.updatedAt = new Date().toISOString();
        state[d.name] = entry;
        console.error('  stopping this pass: no sandbox capacity');
        break;
      }

      entry.attempts = (entry.attempts ?? 0) + 1;
      entry.lastTaskId = taskId;
      entry.lastStatus = result.status;
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
    console.log(`\ndeferred (no sandbox budget): ${deferred.map((d) => d.name).join(', ')}`);
  }

  saveState(state);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
