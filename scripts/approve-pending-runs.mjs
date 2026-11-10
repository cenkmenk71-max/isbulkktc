#!/usr/bin/env node
/**
 * Approve workflow runs that GitHub is holding.
 *
 * A pull request opened by a bot can leave its checks stuck at
 * `action_required`: GitHub waits for a human to approve the run before it
 * starts. Nothing tells you — the PR simply shows BLOCKED forever and the lane
 * that opened it looks idle. That is how #178 sat with no CI at all.
 *
 * This approves those runs. It only approves; it never re-runs a failure, so a
 * genuinely red check stays red and visible.
 *
 * Usage: node scripts/approve-pending-runs.mjs [--dry-run]
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPO = 'cenkmenk71-max/isbulkktc';

/**
 * The environment to hand `gh`. Only set `GH_TOKEN` when a token actually
 * exists, so a blank variable never shadows `gh`'s stored auth or a real token.
 * `source.GITHUB_PERSONAL_ACCESS_TOKEN ?? source.GH_TOKEN` is not enough:
 * `??` falls through on `null`/`undefined` only, so a *blank* personal token
 * (`""`, what an unset CI secret interpolates to) won over a valid `GH_TOKEN`
 * and `gh` ran with an empty token. Whitespace is trimmed for the same reason.
 */
export function ghEnv(source = process.env) {
  const env = { ...source };
  // Trim each candidate *before* choosing: a whitespace-only value is truthy,
  // so `a || b` would keep it and then trim it down to nothing.
  const token =
    [source.GITHUB_PERSONAL_ACCESS_TOKEN, source.GH_TOKEN]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .find(Boolean) ?? "";
  if (token) env.GH_TOKEN = token;
  else delete env.GH_TOKEN;
  return env;
}

function gh(args, env = ghEnv()) {
  return execFileSync('gh', args, { encoding: 'utf8', env }).trim();
}

/** Parse the `id\tname\tbranch` rows emitted by the list call. Exported so the
 * row shape is testable without touching `gh`. */
export function parsePendingRuns(raw) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name, branch] = line.split('\t');
      return { id, name, branch };
    });
}

export async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');

  // `--paginate` is required: the API caps `per_page` at 100 and this default
  // returns only the first page, so a backlog of more than one page would be
  // approved partially while the script reported success. The whole point is to
  // clear the queue that has no human watching it (#178).
  const raw = gh([
    'api',
    '--paginate',
    `repos/${REPO}/actions/runs?status=action_required&per_page=50`,
    '--jq',
    '.workflow_runs[] | "\\(.id)\\t\\(.name)\\t\\(.head_branch)"',
  ]);

  if (!raw) {
    console.log('no runs are waiting for approval');
    return;
  }

  const rows = parsePendingRuns(raw);

  console.log(`${rows.length} run(s) waiting for approval`);
  let approved = 0;
  let failed = 0;
  for (const run of rows) {
    if (dryRun) {
      console.log(`  would approve ${run.id} ${run.name} (${run.branch})`);
      continue;
    }
    try {
      gh(['api', '-X', 'POST', `repos/${REPO}/actions/runs/${run.id}/approve`]);
      approved += 1;
      console.log(`  approved ${run.id} ${run.name} (${run.branch})`);
    } catch (error) {
      failed += 1;
      console.error(
        `  could not approve ${run.id}: ${String(error.message).split('\n')[0]}`,
      );
    }
  }

  if (dryRun) return 0;

  console.log(`approved ${approved}/${rows.length}`);
  // A run that could not be approved is still held, so the queue this script
  // exists to clear is *not* clear. Exiting 0 would let a scheduled caller read
  // "success" while a lane sits BLOCKED with no CI — the #178 failure mode.
  if (failed > 0) {
    console.error(
      `${failed} run(s) still need approval; the queue is not clear`,
    );
    process.exitCode = 1;
  }
  return failed;
}

// Only run when invoked directly, so the helpers stay importable in tests.
// Compare via `pathToFileURL`, not a hand-built `file://` string: on a path with
// a space or `#` the naive form never equals `import.meta.url` and the guard
// would silently skip `main()`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(String(error.message).split('\n')[0]);
    process.exitCode = 1;
  });
}
