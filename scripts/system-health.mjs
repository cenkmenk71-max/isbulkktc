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

import { classifyRedRuns, redRunsOnMain, stuckPullRequests } from './system-health-core.mjs';

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
    'number,headRefName,mergeStateStatus,labels,createdAt',
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
if (prs.length === 0) note('ok', 'PRs', 'none open');
else if (stalled.length === 0 && stuck.length === 0) {
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
