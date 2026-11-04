#!/usr/bin/env node
/**
 * Lane collision detector.
 *
 * The lane programme (docs/lanes/) states two rules that nothing enforced:
 * a lane writes only the paths it owns, and no two lanes edit the same file.
 * This script turns both into a check. It reads the ownership table straight
 * out of docs/lanes/00-orchestration.md, so the doc stays the single source of
 * truth, then inspects the open pull requests:
 *
 *   1. a file in a PR that no lane owns        -> unowned
 *   2. one file changed by two different PRs   -> overlap
 *
 * Exit code is non-zero when either is found, so it can gate CI. It never
 * writes anything.
 *
 * Usage: node scripts/lane-collisions.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ORCHESTRATION = 'docs/lanes/00-orchestration.md';

function parseOwnership(markdown) {
  const lanes = [];
  const row = /^\|\s*(LANE-[A-Z]+)\s*\|(.+)\|\s*$/gm;
  for (const match of markdown.matchAll(row)) {
    const lane = match[1];
    const globs = [...match[2].matchAll(/`([^`]*\/[^`]*)`/g)].map((m) => m[1]);
    if (globs.length > 0) lanes.push({ lane, globs });
  }
  return lanes;
}

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function ownersOf(path, lanes) {
  return lanes
    .filter(({ globs }) => globs.some((g) => globToRegExp(g).test(path)))
    .map(({ lane }) => lane);
}

function openPullRequests() {
  const raw = execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'open',
      '--json',
      'number,headRefName,title,files',
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(raw);
}

function laneFromBranch(branch) {
  const match = branch.match(/^lane\/([a-z-]+)/);
  if (!match) return null;
  return `LANE-${match[1].toUpperCase()}`;
}

function main() {
  const lanes = parseOwnership(readFileSync(ORCHESTRATION, 'utf8'));
  if (lanes.length === 0) {
    console.error(`No ownership table found in ${ORCHESTRATION}`);
    process.exit(1);
  }

  const prs = openPullRequests();
  const byFile = new Map();
  const problems = [];

  for (const pr of prs) {
    const lane = laneFromBranch(pr.headRefName);
    for (const file of pr.files ?? []) {
      const path = file.path ?? file;
      const owners = ownersOf(path, lanes);
      if (owners.length === 0) {
        problems.push(`#${pr.number} ${path} — owned by no lane`);
      }
      if (lane && owners.length > 0 && !owners.includes(lane)) {
        problems.push(
          `#${pr.number} ${path} — ${lane} does not own it (${owners.join(', ')})`,
        );
      }
      if (!byFile.has(path)) byFile.set(path, []);
      byFile.get(path).push(pr.number);
    }
  }

  for (const [path, numbers] of byFile) {
    const unique = [...new Set(numbers)];
    if (unique.length > 1) {
      problems.push(
        `${path} — edited by ${unique.map((n) => `#${n}`).join(' and ')}`,
      );
    }
  }

  if (problems.length === 0) {
    console.log(`No collisions across ${prs.length} open PR(s).`);
    return;
  }

  console.log(`Found ${problems.length} collision problem(s):`);
  for (const problem of problems) console.log(`  ${problem}`);
  process.exit(1);
}

main();
