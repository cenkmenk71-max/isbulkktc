#!/usr/bin/env node
/**
 * Lane spawner — start the parallel lane team on demand.
 *
 * The lane programme (docs/lanes/) was designed for a human to open one chat
 * per lane and paste the kickoff prompt. This script does that part: it starts
 * every lane as its own conversation, each in its own sandbox with its own
 * clone, all at the same time. The lanes never share a working tree, so they
 * cannot overwrite each other; they meet only at `main`, through pull requests.
 *
 * Usage:
 *   node scripts/spawn-lanes.mjs --dry-run              # print, start nothing
 *   node scripts/spawn-lanes.mjs seo geo tasarim        # start three lanes
 *   node scripts/spawn-lanes.mjs --all                  # start every lane
 *
 * Needs OPENHANDS_API_KEY in the environment. Each started lane consumes
 * sandbox budget, so nothing starts without an explicit lane list or --all.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { kickoff } from './lane-kickoff.mjs';

const API = 'https://app.all-hands.dev/api/v1';

// The lane team lives in lanes.json so the spawner, the collision detector and
// the autopilot read the same source.
const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = JSON.parse(readFileSync(join(HERE, 'lanes.json'), 'utf8'));
const REPO = REGISTRY.repo;
const PROVIDER = REGISTRY.provider;
const LANES = REGISTRY.lanes;

async function startLane(name, key) {
  const lane = LANES[name];
  const response = await fetch(`${API}/app-conversations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      selected_repository: REPO,
      selected_branch: 'main',
      git_provider: PROVIDER,
      title: `LANE-${name}`,
      initial_message: {
        role: 'user',
        content: [{ type: 'text', text: kickoff(name, lane) }],
        run: true,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`${name}: HTTP ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  return { name, taskId: body.id, branch: lane.branch };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const names = args.filter((a) => !a.startsWith('--'));

  // A bare `--dry-run` previews the whole team; otherwise a lane list or --all
  // is required so nothing starts by accident.
  if (!all && names.length === 0 && !dryRun) {
    console.error('Give lane names or --all. Known lanes:');
    for (const [name, lane] of Object.entries(LANES)) {
      console.error(`  ${name.padEnd(12)} wave ${lane.wave}  ${lane.scope}`);
    }
    process.exit(1);
  }

  const targets = all || names.length === 0 ? Object.keys(LANES) : names;
  for (const name of targets) {
    if (!LANES[name]) {
      console.error(`Unknown lane "${name}". Known: ${Object.keys(LANES).join(', ')}`);
      process.exit(1);
    }
  }

  if (dryRun) {
    for (const name of targets) {
      console.log(`would start ${name} -> branch ${LANES[name].branch}`);
    }
    return;
  }

  const key = process.env.OPENHANDS_API_KEY;
  if (!key) {
    console.error('OPENHANDS_API_KEY is not set');
    process.exit(1);
  }

  const results = await Promise.allSettled(targets.map((n) => startLane(n, key)));
  let failed = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      console.log(`started ${result.value.name} -> ${result.value.branch} (task ${result.value.taskId})`);
    } else {
      failed += 1;
      console.error(`FAILED ${result.reason}`);
    }
  }
  process.exit(failed === 0 ? 0 : 1);
}

// Only run when invoked directly, so the module stays importable in tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
