#!/usr/bin/env node
/**
 * Lane collision detector.
 *
 * The lane programme (docs/lanes/) states two rules that nothing enforced:
 * a lane writes only the paths it owns, and no two lanes edit the same file.
 * This script turns both into a check. It reads the ownership table straight
 * out of docs/lanes/00-orchestration.md, so the doc stays the single source of
 * truth, then inspects the open pull requests.
 *
 * It splits its findings into two scopes, because conflating them is what froze
 * the merge queue:
 *
 *   1. GLOBAL — true of the queue, whoever is asking:
 *        - a file in a PR that no lane owns      -> unowned
 *        - one file changed by two different PRs -> overlap
 *      These gate every PR's CI: no lane may merge on top of an unowned file or
 *      a file two lanes both edit.
 *
 *   2. PR-LOCAL — true only of the pull request that owns the branch:
 *        - `<lane> does not own <path>` — the PR's own lane edited a file it
 *          does not own.
 *      This is self-audit. It must NOT gate the other lanes, or a single lane's
 *      ownership slip turns *every* open PR red (#552, #557, #555): the branch
 *      that owns the offending lane is told to fix it, and no one else waits.
 *
 * Exit code is non-zero when either scope finds a problem, so it can gate CI.
 * It never writes anything.
 *
 * Usage:
 *   node scripts/lane-collisions.mjs            # both scopes, all open PRs
 *   node scripts/lane-collisions.mjs --pr 557   # global + PR 557's own scope
 *   node scripts/lane-collisions.mjs --pr=557
 */

import { pathToFileURL } from "node:url";
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ORCHESTRATION = 'docs/lanes/00-orchestration.md';
const REGISTRY = 'scripts/lanes.json';

/**
 * The lane list lives in lanes.json; the path ownership lives in the
 * orchestration doc, which is what humans read. Two sources drift, so check
 * they name the same lanes before trusting either.
 */
function checkRegistryMatchesDoc(lanes) {
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
  const fromDoc = new Set(lanes.map((l) => foldName(l.lane)));
  const fromRegistry = new Set(
    Object.keys(registry.lanes).map((name) => foldName(`LANE-${name}`)),
  );
  const missingInDoc = [...fromRegistry].filter((n) => !fromDoc.has(n));
  const missingInRegistry = [...fromDoc].filter((n) => !fromRegistry.has(n));
  const problems = [];
  for (const n of missingInDoc) {
    problems.push(`${n} is in lanes.json but has no ownership row in ${ORCHESTRATION}`);
  }
  for (const n of missingInRegistry) {
    problems.push(`${n} has an ownership row but is not in ${REGISTRY}`);
  }
  return problems;
}

export function parseOwnership(markdown) {
  const lanes = [];
  const row = /^\|\s*(LANE-[^\s|]+)\s*\|(.+)\|\s*$/gm;
  // A path token is either a glob (contains `/`) or a root-level filename
  // (`package.json`). Requiring a slash silently dropped root files: the table
  // listed `package.json` under LANE-INFRA but the detector never saw it, so an
  // edit to package.json reported as "owned by no lane". The filename branch is
  // deliberately narrow (a dot-extension) so a skill name in the same table
  // (`github-actions`) is not mistaken for a path.
  const isPathToken = (token) => token.includes("/") || /\.[a-z0-9]+$/i.test(token);
  for (const match of markdown.matchAll(row)) {
    const globs = [...match[2].matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter(isPathToken);
    if (globs.length > 0) lanes.push({ lane: match[1], globs });
  }
  return lanes;
}

/**
 * Fold a name to a comparable form. The lane table uses Turkish characters
 * (LANE-GÜVENLİK) while a branch name cannot (lane/guvenlik), so a raw
 * comparison would report every file in that lane as unowned. Folds to ASCII
 * and lowercases.
 */
export function foldName(name) {
  return name
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .toLowerCase();
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

/**
 * Whether a lane owns a path. A glob prefixed with `!` excludes: the lane owns
 * the path if some include matches and no exclusion does. Order in the doc is
 * include-first, then exclusions.
 */
function owns(path, globs) {
  const includes = globs.filter((g) => !g.startsWith('!'));
  const excludes = globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1));
  const included = includes.some((g) => globToRegExp(g).test(path));
  const excluded = excludes.some((g) => globToRegExp(g).test(path));
  return included && !excluded;
}

export function ownersOf(path, lanes) {
  return lanes.filter(({ globs }) => owns(path, globs)).map(({ lane }) => lane);
}

/**
 * Whether a changed-file entry describes a deletion.
 *
 * `gh pr list --json files` reports `changeType` (`ADDED`, `MODIFIED`,
 * `DELETED`); the REST files endpoint reports `status` (`added`, `modified`,
 * `removed`). Both are accepted, and a bare path string (the shape the unit
 * fixtures use) is never a deletion because it carries no metadata.
 *
 * @param {{changeType?:string,status?:string,path?:string}|string} file
 * @returns {boolean}
 */
export function isDeletion(file) {
  if (typeof file === 'string') return false;
  const kind = file.changeType ?? file.status ?? '';
  return kind === 'DELETED' || kind === 'removed';
}

function openPullRequests() {
  let raw;
  try {
    raw = execFileSync(
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
  } catch (error) {
    // A read failure must be loud, not silent: exiting 0 here would report "no
    // collisions" when the pull requests were never read, which is exactly the
    // silent-green the check exists to prevent. The message names the token
    // scope so a CI failure is actionable.
    throw new Error(
      `could not list open pull requests via \`gh\` (${error.message}). ` +
        'The collision check needs a token with pull-requests:read.',
    );
  }
  return JSON.parse(raw);
}

/**
 * The pull request whose CI run this is, from `--pr <n>` / `--pr=<n>`.
 *
 * The ownership slip (`<lane> does not own <path>`) is a property of one branch,
 * not of the queue, so CI scopes it to the current PR by passing this flag. A
 * bare run (no flag) keeps the local check on for every PR, which is what a
 * developer wants from their laptop.
 *
 * @returns {number|null} the PR number, or null when the flag is absent or malformed
 */
export function currentPullRequestNumber(argv = process.argv.slice(2)) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const inline = arg.match(/^--pr=(.+)$/);
    if (inline) return Number.parseInt(inline[1], 10) || null;
    if (arg === '--pr') return Number.parseInt(argv[i + 1], 10) || null;
  }
  return null;
}

/**
 * Classify a set of pull requests against the ownership table.
 *
 * Pure so the two scopes can be tested without `gh`: `global` problems are the
 * queue-wide invariants (unowned file, file edited by two PRs) and gate every
 * run; `local` problems are one PR's own lane editing outside its globs and gate
 * only that PR.
 *
 * @param {Array<{number:number,headRefName:string,files:Array}>} prs
 * @param {Array<{lane:string,globs:string[]}>} lanes the ownership table
 * @param {number|null} [currentPr] when set, `local` holds only this PR's slips;
 *   when null, `local` holds every PR's slips (a laptop run)
 * @returns {{global: string[], local: string[]}}
 */
export function evaluateCollisions(prs, lanes, currentPr = null) {
  const knownLanes = lanes.map((l) => l.lane);
  const byFile = new Map();
  const global = [];
  const local = [];

  for (const pr of prs) {
    const lane = laneFromBranch(pr.headRefName, knownLanes);
    for (const file of pr.files ?? []) {
      const path = file.path ?? file;
      const owners = ownersOf(path, lanes);
      // A deletion leaves no file behind, so "owned by no lane" does not apply:
      // ownership governs what a lane writes, and a removed path occupies no
      // lane's territory once merged. Without this, deleting a stray unowned
      // file (a leftover placeholder, say) reports a *queue-wide* problem and
      // re-freezes every open PR — the very #552 bug class this scope split
      // exists to remove.
      if (owners.length === 0 && !isDeletion(file)) {
        global.push(`#${pr.number} ${path} — owned by no lane`);
      }
      // The lane's own slip: reported for the current PR, or for all when the
      // check runs unscoped.
      if (
        lane &&
        owners.length > 0 &&
        !owners.map(foldName).includes(lane) &&
        (currentPr === null || pr.number === currentPr)
      ) {
        local.push(
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
      global.push(`${path} — edited by ${unique.map((n) => `#${n}`).join(' and ')}`);
    }
  }

  return { global, local };
}

/**
 * Map a branch name to the lane it belongs to.
 *
 * A lane branch is `lane/<name>`, but a lane may open more than one branch for
 * distinct work: `lane/qa-visual-baselines` still belongs to LANE-QA. Taking the
 * whole suffix as the lane name folded it to `LANE-QA-VISUAL-BASELINES`, which
 * matches no lane, so every file in that PR was reported as "does not own it".
 * Match the longest known lane name that the suffix starts with instead.
 *
 * @param {string} branch
 * @param {string[]} knownLanes lane names as they appear in the ownership table
 *   (e.g. `LANE-QA`), before folding
 * @returns {string|null} the folded lane name, or null for a non-lane branch
 */
export function laneFromBranch(branch, knownLanes = []) {
  const match = branch.match(/^lane\/(.+)$/);
  if (!match) return null;
  const suffix = foldName(match[1]).replace(/-/g, '');
  const candidates = knownLanes
    .map((name) => ({ name, key: foldName(name).replace(/^lane-/, '').replace(/-/g, '') }))
    .filter((candidate) => candidate.key.length > 0 && suffix.startsWith(candidate.key))
    .sort((a, b) => b.key.length - a.key.length);
  if (candidates.length > 0) return foldName(candidates[0].name);
  // Unknown lane: fall back to the raw suffix so the report still names it.
  return foldName(`LANE-${match[1]}`);
}

function main() {
  const lanes = parseOwnership(readFileSync(ORCHESTRATION, 'utf8'));
  if (lanes.length === 0) {
    console.error(`No ownership table found in ${ORCHESTRATION}`);
    process.exit(1);
  }

  const drift = checkRegistryMatchesDoc(lanes);
  if (drift.length > 0) {
    console.log(`Registry and ownership table disagree (${drift.length}):`);
    for (const problem of drift) console.log(`  ${problem}`);
    process.exit(1);
  }

  const currentPr = currentPullRequestNumber();
  const prs = openPullRequests();
  const { global, local } = evaluateCollisions(prs, lanes, currentPr);

  const scopeNote = currentPr === null ? '' : ` (ownership scoped to #${currentPr})`;
  if (global.length === 0 && local.length === 0) {
    console.log(`No collisions across ${prs.length} open PR(s)${scopeNote}.`);
    return;
  }

  if (global.length > 0) {
    console.log(`Found ${global.length} queue-wide collision problem(s):`);
    for (const problem of global) console.log(`  ${problem}`);
  }
  if (local.length > 0) {
    console.log(
      `Found ${local.length} ownership problem(s) in ${
        currentPr === null ? 'the open pull requests' : `#${currentPr}`
      }:`,
    );
    for (const problem of local) console.log(`  ${problem}`);
  }
  process.exit(1);
}

// Only run when invoked directly, so the helpers stay importable in tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`lane-collisions: ${error.message}`);
    process.exit(1);
  }
}
