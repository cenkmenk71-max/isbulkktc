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
 *   - it retries a lane at most `maxAttemptsPerLane` times, then opens an issue
 *     for a human and stops trying. Infinite retries are how an autonomous
 *     system burns budget without getting closer to done.
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
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = 'https://app.all-hands.dev/api/v1';
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const REGISTRY = JSON.parse(readFileSync(join(HERE, 'lanes.json'), 'utf8'));
const STATE_FILE = join(REPO_ROOT, '.lane-state.json');

const { repo: REPO, provider: PROVIDER, lanes: LANES } = REGISTRY;
const MAX_ATTEMPTS = REGISTRY.maxAttemptsPerLane ?? 3;
const SANDBOX_BUDGET = REGISTRY.sandboxBudget ?? 6;

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
  const response = await fetch(`${API}${path}`, {
    ...init,
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
}

/** Open PRs keyed by head branch. */
function openPullRequests() {
  const raw = gh([
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,headRefName,mergeStateStatus',
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

function kickoff(name, context) {
  const lane = LANES[name];
  const parts = [
    `isbulkktc reposunda paralel "lane" programında çalışacaksın. Lane: ${name}.`,
    'Önce şu dosyaları OKU: docs/lanes/00-orchestration.md ve docs/lanes/' +
      `${lane.brief}.md. Ayrıca AGENTS.md'yi oku. Sonra kendi lane'inin görevini uygula.`,
    'KURULUM: kalite kapılarından ÖNCE `bash scripts/bootstrap-bun.sh` ve ' +
      '`export PATH="$HOME/.local/bin:$PATH"`, sonra `bun install --frozen-lockfile`.',
    `SOMUT İŞ: \`gh issue list --state open --label ${lane.label}\` ile sana ` +
      'atanmış issue var mı bak; varsa al. Yoksa brief\'inden sınırlı bir iş seç.',
    'MICRO-DENETİM: docs/lanes/AUDIT.md\'yi uygula — sahip olduğun her dosyayı ' +
      '`git ls-files` ile listele, boyut boyut tara, bulguları kanıtla ve PR ' +
      'gövdesine tablo yaz. Atladığın dosyayı "bakılmadı" işaretle.',
    'KENDİNİ DOĞRULA: PR açmadan önce gate\'leri çalıştır; kırmızıysa düzelt. ' +
      `Aynı hata ${MAX_ATTEMPTS} denemede çözülmezse PR açma, \`agent:blocked\` ` +
      'issue aç ve hatayı yaz.',
    `Kurallar: main'e push YOK; kendi branch'in (${lane.branch}) + PR; canlı ` +
      "Supabase'e yazma (tek yazar LANE-SUPABASE'dir); sadece sahibi olduğun " +
      'dosyalara yaz; CI yeşil olsun.',
    'Güncel ve profesyonel kaynakları kullan (resmî dokümanlar, context7, ' +
      'deepwiki, W3C/schema.org).',
  ];
  if (context?.previousError) {
    parts.push(
      'ÖNCEKİ DENEME BAŞARISIZ OLDU. Hata: ' +
        `${context.previousError}. Bu hatayı tekrarlama; önce onu çöz.`,
    );
  }
  return parts.join('\n');
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
        content: [{ type: 'text', text: kickoff(name, context) }],
        run: true,
      },
    }),
  });
  if (!ok) throw new Error(`${name}: HTTP ${body?.detail ?? 'unknown'}`);
  return body.id;
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
  const { ok, body } = await api(
    `/app-conversations/${conversationId}/send-message`,
    {
      method: 'POST',
      body: JSON.stringify({
        role: 'user',
        content: [{ type: 'text', text: kickoff(name, context) }],
        run: true,
      }),
    },
  );
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
 * A quota rejection is not the lane's fault, so it must not spend an attempt.
 * Counting it would exhaust a lane that never ran once and hand a healthy task
 * to a human. Detected by the message the backend returns.
 */
function isCapacityError(detail) {
  const text = String(detail ?? '').toLowerCase();
  return (
    text.includes('sandbox limit') ||
    text.includes('quota') ||
    text.includes('capacity')
  );
}

function blockedForLane(name, issues) {
  // Use the lane-specific label. The coarse discipline label (agent:backend)
  // is shared by several lanes, so matching on it made every backend lane stop
  // on one lane's blocked issue.
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

  if (blocked) {
    return { action: 'blocked', reason: `issue #${blocked.number} needs a human` };
  }
  if (pr) {
    const state_ = pr.mergeStateStatus;
    if (state_ === 'CLEAN') return { action: 'wait', reason: `PR #${pr.number} ready to merge` };
    return { action: 'wait', reason: `PR #${pr.number} in flight (${state_})` };
  }
  if (branchExists) {
    return { action: 'wait', reason: `branch ${lane.branch} exists, no PR yet` };
  }
  if (state.attempts >= MAX_ATTEMPTS) {
    return {
      action: 'exhausted',
      reason: `${state.attempts} attempts used; needs a human`,
    };
  }
  return {
    action: 'spawn',
    reason: state.attempts === 0 ? 'no work yet' : `retry ${state.attempts + 1}/${MAX_ATTEMPTS}`,
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

  const [prs, blocked, tasks, sandboxes, idle] = await Promise.all([
    Promise.resolve(openPullRequests()),
    Promise.resolve(blockedIssues()),
    startTasks(),
    runningSandboxes(),
    idleConversations(),
  ]);

  const branches = execFileSync('git', ['branch', '-r'], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // A lane whose latest task is still WORKING counts as running.
  const working = new Set(
    tasks
      .filter((t) => !['READY', 'ERROR'].includes(t.status))
      .map((t) => String(t.request?.title ?? '').replace(/^LANE-/, '')),
  );

  const ctx = { prs, blocked, branches, state };
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
  const reusable = toSpawn.filter((d) => reusableFor(d));
  const fresh = toSpawn.filter((d) => !reusableFor(d));

  const capacity = Math.max(0, SANDBOX_BUDGET - running);
  const freshAllowed = fresh.slice(0, capacity);
  const allowed = [...reusable, ...freshAllowed];
  const deferred = fresh.slice(capacity);

  console.log(`sandboxes running: ${running} (budget ${SANDBOX_BUDGET})`);
  for (const d of decisions) {
    const isAllowed = allowed.includes(d);
    const marker = d.action === 'spawn' && !isAllowed ? 'deferred' : d.action;
    const note = reusableFor(d) ? ' (reuse)' : '';
    console.log(`  ${d.name.padEnd(11)} ${marker.padEnd(9)} ${d.reason}${note}`);
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing started');
    return;
  }

  for (const d of allowed) {
    try {
      // Prefer a sandbox this lane already owns and is not using. Creating one
      // may be refused by the daily quota; reusing one never is.
      const reusable = idle.find(
        (c) => String(c.title ?? '') === `LANE-${d.name}`,
      );
      let entry = state[d.name] ?? { attempts: 0 };

      if (reusable) {
        await sendToExisting(reusable.id, d.name, d.context);
        entry.attempts = (entry.attempts ?? 0) + 1;
        entry.lastConversationId = reusable.id;
        entry.lastStatus = 'REUSED';
        entry.lastError = null;
        entry.updatedAt = new Date().toISOString();
        state[d.name] = entry;
        console.log(
          `  ${d.name}: reused sandbox (attempt ${entry.attempts})`,
        );
        continue;
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

  for (const d of decisions) {
    if (d.action === 'exhausted') {
      console.log(`\n${d.name} is out of attempts — open an issue for a human.`);
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
