#!/usr/bin/env node
/**
 * System health check — production and CI monitoring.
 *
 * It answers the question "is the system actually running and making progress":
 * is the scheduled check firing, are PRs moving, is anything stuck, is any
 * workflow red on `main`, is the origin serving, and is the live build current.
 * It is the difference between "the system is running" and "the system is making
 * progress".
 *
 * Exit code is non-zero when something needs attention, so a scheduled run can
 * alert on it.
 *
 * Usage: node scripts/system-health.mjs [--json]
 */

import { execFileSync } from 'node:child_process';

import { classifyCronFreshness, classifyProductionProbe, classifyRedRuns, classifyTokenProbe, deployEvidenceFinding, queueGlobalGates, redPullRequests, redRunsOnMain, stuckPullRequests, supabaseTokenProblem } from './system-health-core.mjs';

const REPO = 'cenkmenk71-max/isbulkktc';
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'uwmhquvzbilbfzdrlxmb';
const VERCEL_API = 'https://api.vercel.com';
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
 * Whether the Supabase Management API accepts the token for our project.
 *
 * `GET /v1/projects/{ref}` is the cheapest authenticated call — the exact API
 * #209 used to show the 401 — so a 200 proves the token is usable and a
 * 401/403 proves it is not. Returns the verdict from the pure
 * `classifyTokenProbe`; this only fetches, so a network failure is a warning
 * and never a false red.
 */
async function probeSupabaseToken(token, projectRef) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    return classifyTokenProbe({ status: response.status });
  } catch (error) {
    return classifyTokenProbe({ networkError: String(error?.message ?? error) });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The commit the live origin reports it was built from, or `null` if it cannot
 * be read. Used only to compare against the default branch head; a failure here
 * is "could not verify", never evidence of a stale deploy.
 *
 * Also reports whether the origin *blocked* the probe (Cloudflare answers
 * datacenter IPs, including GitHub runners, with 403). That flag separates "the
 * site is unreachable from here" from "the site answered but had nothing to
 * say", which decides whether an unmeasurable deploy is this environment's known
 * blind spot or an unexpected one.
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
    if (response.status === 403 || response.status === 429) {
      return { commit: null, blocked: true };
    }
    if (!response.ok) return { commit: null, blocked: false };
    const body = await response.json();
    return { commit: typeof body?.commit === 'string' ? body.commit : null, blocked: false };
  } catch {
    return { commit: null, blocked: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The commit behind the deployment the Vercel production alias points at, or
 * `null` when the token is absent or the API cannot answer.
 *
 * This is the second channel for the same question `fetchLiveCommit` asks. The
 * origin channel is blocked from CI by Cloudflare's 403, so without this the
 * hourly check can never measure deploy freshness where it runs (#590). Mirrors
 * `verify-production-deployment.mjs`'s `resolveVercelContext` + alias read, but
 * only reads — it needs no polling, just the current alias.
 *
 * `configured` distinguishes "no token" from "token set but the API gave no
 * commit", so the caller can tell a plain missing-secret situation (expected in
 * this environment) from a real API problem.
 */
async function fetchVercelCommit() {
  const token = (process.env.VERCEL_TOKEN || '').trim();
  if (!token) return { commit: null, configured: false };
  const teamSlug = process.env.VERCEL_TEAM_SLUG || 'orijin1';
  const projectName = process.env.VERCEL_PROJECT || 'isbulkktc';
  const get = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const teams = await get(`${VERCEL_API}/v2/teams?limit=100`);
    const team = (teams?.teams ?? []).find((entry) => entry.slug === teamSlug);
    if (!team) return { commit: null, configured: true };
    const project = await get(
      `${VERCEL_API}/v9/projects/${encodeURIComponent(projectName)}?teamId=${team.id}`,
    );
    const liveUid = project?.targets?.production?.id;
    if (!liveUid) return { commit: null, configured: true };
    const detail = await get(`${VERCEL_API}/v13/deployments/${liveUid}?teamId=${team.id}`);
    if (detail?.readyState !== 'READY') return { commit: null, configured: true };
    const commit = typeof detail?.meta?.githubCommitSha === 'string' ? detail.meta.githubCommitSha : null;
    return { commit, configured: true };
  } catch {
    return { commit: null, configured: true };
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

// 1. Is the scheduled health check actually firing? Compare the newest run to now.
const runs = JSON.parse(
  gh([
    'run',
    'list',
    '--workflow',
    'system-health.yml',
    '--limit',
    '5',
    '--json',
    'createdAt,conclusion,status',
  ]),
);
if (runs.length === 0) {
  note('fail', 'cron', 'no system-health run has ever completed');
} else {
  const newest = new Date(runs[0].createdAt);
  const minutes = (Date.now() - newest.getTime()) / 60000;
  const freshness = classifyCronFreshness(minutes);
  if (freshness) {
    note(freshness.level, 'cron', freshness.detail);
  } else {
    note('warn', 'cron', `unreadable last-run time (${runs[0].createdAt})`);
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
// gate (one that scans the whole queue) freezing every PR behind one mistake.
// Name it once, so the operator fixes the cause instead of chasing N
// unrelated reds.
for (const gate of queueGlobalGates(prs)) {
  note(
    'warn',
    'queue-global gate',
    `${gate.check} is red on ${gate.prs.length} PRs (${gate.prs
      .map((n) => `#${n}`)
      .join(', ')}): one mistake freezes the whole queue — fix the cause, not each PR`,
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
//
// The origin channel is blocked from GitHub runners (Cloudflare answers those
// IPs with 403), so a second channel carries the verdict from CI exactly as
// `verify-production-deployment.mjs` does: the Vercel API's production alias.
// Without it the hourly check was blind where it runs (#590) — `deployEvidenceFinding`
// decides from both, and an unmeasurable deploy with no token is an `info` line,
// not the permanent warning that buried the real signal.
const httpBuild = await fetchLiveCommit();
// Only ask the Vercel API when the origin channel could not answer — it is the
// fallback, not a second opinion, and the origin proves reachability when it can.
const vercelBuild = httpBuild.commit
  ? { commit: null, configured: Boolean((process.env.VERCEL_TOKEN || '').trim()) }
  : await fetchVercelCommit();
const deployFinding = deployEvidenceFinding({
  httpCommit: httpBuild.commit,
  httpBlocked: httpBuild.blocked,
  vercelCommit: vercelBuild.commit,
  vercelConfigured: vercelBuild.configured,
  mainCommit: mainCommitSha(),
});
if (deployFinding) note(deployFinding.level, deployFinding.area, deployFinding.detail);

// 4. Runs held for approval: invisible unless asked for.
const held = gh(['api', `repos/${REPO}/actions/runs?status=action_required&per_page=20`, '--jq', '.total_count']);
if (Number(held) > 0) {
  note('warn', 'held runs', `${held} run(s) waiting for approval`);
} else {
  note('ok', 'held runs', 'none waiting');
}

// 5. Secrets that must be usable here. The Management API token is the only
//    way to read production logs, so a wrong-shaped value makes every diagnosis
//    blind while looking like a service outage (#209: a bare UUID answered
//    `401 {"message":"JWT could not be decoded"}`, and the same value had been
//    copied into RESEND_API_KEY — #186). A missing value is not flagged: CI runs
//    this with only GH_TOKEN, and "not configured here" is not a misconfig.
const tokenProblem = supabaseTokenProblem({
  token: process.env.SUPABASE_ACCESS_TOKEN,
  resendKey: process.env.RESEND_API_KEY,
});
if (tokenProblem) {
  note(tokenProblem.status === 'present' ? 'ok' : 'fail', 'secrets', tokenProblem.reason);
  // A well-shaped token can still be revoked or expired (#209 one level down):
  // the shape check cannot see that, so only a correctly-shaped token is put to
  // the API and its answer is what decides. The ref is interpolated so the URL
  // documents which project the call is about.
  if (tokenProblem.status === 'present') {
    const verdict = await probeSupabaseToken(
      process.env.SUPABASE_ACCESS_TOKEN,
      SUPABASE_PROJECT_REF,
    );
    if (verdict) note(verdict.level, 'supabase', verdict.reason);
  }
}

// `info` is a level below `warn`: a row that prints for the operator's eyes but
// is not a problem with the system. The deploy line uses it for the known
// "unmeasurable from CI, no VERCEL_TOKEN" state so that state stays visible
// without a permanent warning (see `deployEvidenceFinding`).
const ICON = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL', info: 'INFO' };
if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  for (const f of findings) {
    console.log(`  ${ICON[f.level] ?? f.level.toUpperCase()} ${f.area.padEnd(12)} ${f.detail}`);
  }
}

const bad = findings.filter((f) => f.level === 'fail').length;
const warn = findings.filter((f) => f.level === 'warn').length;
if (!asJson) console.log(`\n${bad} failure(s), ${warn} warning(s)`);
process.exit(bad > 0 ? 1 : 0);
