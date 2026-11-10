#!/usr/bin/env node
/**
 * System health check — the operator's own loop.
 *
 * The autopilot keeps the lanes working. This checks the autopilot itself, plus
 * everything around it: is the schedule firing, are PRs moving, is anything
 * stuck, is token use sane. It is the difference between "the system is running"
 * and "the system is making progress".
 *
 * Exit code is non-zero when something needs attention, so a scheduled run can
 * alert on it.
 *
 * Usage: node scripts/system-health.mjs [--json]
 */

import { execFileSync } from 'node:child_process';

import { classifyDeployFreshness, classifyProductionProbe, classifyRedRuns, deployFreshnessFinding, queueGlobalGates, redPullRequests, redRunsOnMain, stuckPullRequests } from './system-health-core.mjs';

const REPO = 'cenkmenk71-max/isbulkktc';
const asJson = process.argv.includes('--json');

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_TOKEN:
        process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GH_TOKEN,
    },
  }).trim();
}

/**
 * How many jobs a run actually started.
 *
 * A scheduled run GitHub reports as failed but never picked up has zero jobs.
 * Returns `null` when the lookup fails so the caller treats the run as real
 * rather than silently dropping a genuine red.
 */
function jobCountOf(runId) {
  try {
    return Number(
      gh(['api', `repos/${REPO}/actions/runs/${runId}/jobs`, '--jq', '.total_count']),
    );
  } catch {
    return null;
  }
}

/**
 * Probe the production origin and report its real status.
 *
 * None of the GitHub-derived checks above can tell that the site is *gone*: a
 * red workflow names a symptom, and the origin can answer 402 to every visitor
 * while the Actions tab only shows a scheduled job failing. On 2026-11-10 the
 * site returned `402 DEPLOYMENT_DISABLED` (Vercel account blocked/over quota)
 * and this check never said so. Read the origin directly.
 *
 * The probe is a HEAD with a bounded timeout; the verdict is decided by the pure
 * `classifyProductionProbe`, so the classification is unit-tested and this only
 * fetches. A network error is a warning, not a failure — the probe has no
 * evidence the site is down, only that it could not look.
 */
async function probeProduction() {
  const origin = process.env.HEALTH_ORIGIN || 'https://isbulkktc.com';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(origin, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
    return classifyProductionProbe({
      status: response.status,
      vercelError: response.headers.get('x-vercel-error'),
    });
  } catch (error) {
    return classifyProductionProbe({ networkError: String(error?.message ?? error) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The commit the live origin reports it was built from, or `null` if it cannot
 * be read. Used only to compare against the default branch head; a failure here
 * is "could not verify", never evidence of a stale deploy.
 */
async function fetchLiveCommit() {
  const origin = process.env.HEALTH_ORIGIN || 'https://isbulkktc.com';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${origin}/api/build-info`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body?.commit === 'string' ? body.commit : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The default branch head, or `null` when GitHub cannot be asked. */
function mainCommitSha() {
  try {
    return gh(['api', `repos/${REPO}/commits/main`, '--jq', '.sha']);
  } catch {
    return null;
  }
}

const findings = [];
function note(level, area, detail) {
  findings.push({ level, area, detail });
}

// 1. Is the autopilot actually firing? Compare the newest run to now.
const runs = JSON.parse(
  gh([
    'run',
    'list',
    '--workflow',
    'Lane autopilot',
    '--limit',
    '5',
    '--json',
    'createdAt,conclusion,status',
  ]),
);
if (runs.length === 0) {
  note('fail', 'cron', 'no autopilot run has ever completed');
} else {
  const newest = new Date(runs[0].createdAt);
  const minutes = (Date.now() - newest.getTime()) / 60000;
  if (minutes > 75) {
    note('fail', 'cron', `last autopilot run was ${minutes.toFixed(0)} min ago`);
  } else if (minutes > 45) {
    note('warn', 'cron', `last run ${minutes.toFixed(0)} min ago (expected ~20)`);
  } else {
    note('ok', 'cron', `last run ${minutes.toFixed(0)} min ago`);
  }
  const failed = runs.filter((r) => r.conclusion && r.conclusion !== 'success');
  if (failed.length > 0) {
    note('warn', 'cron', `${failed.length} of the last ${runs.length} runs did not succeed`);
  }
}

// 2. PRs that need a human. The system cannot fix these; they must be loud.
const prs = JSON.parse(
  gh([
    'pr',
    'list',
    '--state',
    'open',
    '--limit',
    '50',
    '--json',
    'number,headRefName,mergeStateStatus,labels,createdAt,statusCheckRollup',
  ]),
);
const stalled = prs.filter((p) => {
  const labels = (p.labels ?? []).map((l) => l.name ?? l);
  return labels.includes('agent:blocked') || labels.includes('agent:hold');
});
if (stalled.length > 0) {
  note(
    'warn',
    'stalled PRs',
    `${stalled.length}: ${stalled.map((p) => `#${p.number}`).join(', ')} need a human`,
  );
}
const stuck = stuckPullRequests(prs);
if (stuck.length > 0) {
  note(
    'warn',
    'old PRs',
    `${stuck.length} open >3h and not CLEAN: ${stuck.map((p) => `#${p.number}`).join(', ')}`,
  );
}
// A PR blocked by a red check is the "all moving" lie: it is old and not CLEAN
// but `stuckPullRequests` cannot say why. Name the gate that refuses it.
const redPRs = redPullRequests(prs);
if (redPRs.length > 0) {
  note(
    'warn',
    'blocked PRs',
    `${redPRs.length} open with a red check (cannot merge): ${redPRs
      .map((p) => `#${p.number} (${p.redChecks.join(', ')})`)
      .join('; ')}`,
  );
}
// A check red on more than one PR is not that PR's failure: it is a shared
// gate (e.g. `lane-collisions`, which reads the whole queue) freezing every
// PR behind one lane's mistake. Name it once, so the operator fixes the cause
// instead of chasing N unrelated reds.
for (const gate of queueGlobalGates(prs)) {
  note(
    'warn',
    'queue-global gate',
    `${gate.check} is red on ${gate.prs.length} PRs (${gate.prs
      .map((n) => `#${n}`)
      .join(', ')}): one lane's mistake freezes the whole queue — fix the cause, not each PR`,
  );
}
if (prs.length === 0) note('ok', 'PRs', 'none open');
else if (stalled.length === 0 && stuck.length === 0 && redPRs.length === 0) {
  note('ok', 'PRs', `${prs.length} open, all moving`);
}

// 3. Any red workflow on the default branch: the harness itself broken.
//
// This asks for the branch, not a workflow name. Naming `isbulkktc CI` went
// blind when #375 dropped that workflow's `push` trigger — the query kept
// returning its last run and answering "green" while the workflow that *does*
// run on push, `Verify production deployment`, was failing. Reading whatever
// runs on the branch cannot drift out of step with the gate.
//
// The check's own workflow is excluded: it runs on a schedule, not on push, so
// a single failing run stays the newest run of its own name on `main` forever
// and the check would read its own failure as "main CI red" every time — a
// gate that can never go green, hiding the real red behind it.
//
// A red run is split by whether it actually ran a job. GitHub's scheduler
// occasionally marks a run `failure` without ever starting one (zero jobs, no
// logs) — a transient hiccup that must warn, not fail. Reading a job count needs
// the run id, so the query keeps `databaseId`.
const branchRuns = JSON.parse(
  gh([
    'run',
    'list',
    '--branch',
    'main',
    '--limit',
    '100',
    '--json',
    'name,conclusion,status,createdAt,databaseId',
  ]),
);
const redRuns = redRunsOnMain(branchRuns).map((run) => ({
  ...run,
  // 0 jobs = the run never started (glitch). `null` = the lookup failed, which
  // `classifyRedRuns` treats as real so a red is never silently dropped.
  jobCount: jobCountOf(run.databaseId),
}));
const { real: red, glitches } = classifyRedRuns(redRuns);
if (branchRuns.length === 0) {
  note('warn', 'main CI', 'no runs found on main');
} else if (red.length > 0) {
  note('fail', 'main CI', `${red.length} workflow(s) red on main: ${red.join(', ')}`);
} else if (glitches.length > 0) {
  note(
    'warn',
    'main CI',
    `${glitches.length} transient 0-job run(s) on main (GitHub glitch, not a real failure): ${glitches.join(', ')}`,
  );
} else {
  note('ok', 'main CI', `every workflow on main is green`);
}

// 3b. The production origin itself. A red workflow is a symptom; "the site is
// down" is a finding, and only the origin can answer it. See probeProduction.
const production = await probeProduction();
note(production.level, 'production', production.detail);

// 3c. Is the live build the one we just merged? "Serving HTTP 200" hides a stale
// deploy: on 2026-11-10 the origin was four commits behind `main` (the new
// Vercel account has no Git auto-deploy, #547) while every GitHub-derived check
// read green. Compare the origin's build-info commit to the default branch head.
const freshness = classifyDeployFreshness({
  liveCommit: await fetchLiveCommit(),
  mainCommit: mainCommitSha(),
});
const deployFinding = deployFreshnessFinding(freshness);
if (deployFinding) note(deployFinding.level, deployFinding.area, deployFinding.detail);

// 4. Runs held for approval: invisible unless asked for.
const held = gh(['api', `repos/${REPO}/actions/runs?status=action_required&per_page=20`, '--jq', '.total_count']);
if (Number(held) > 0) {
  note('warn', 'held runs', `${held} run(s) waiting for approval`);
} else {
  note('ok', 'held runs', 'none waiting');
}

const ICON = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL' };
if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  for (const f of findings) {
    console.log(`  ${ICON[f.level]} ${f.area.padEnd(12)} ${f.detail}`);
  }
}

const bad = findings.filter((f) => f.level === 'fail').length;
const warn = findings.filter((f) => f.level === 'warn').length;
if (!asJson) console.log(`\n${bad} failure(s), ${warn} warning(s)`);
process.exit(bad > 0 ? 1 : 0);
