import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * Supply-chain boundary: the workflows that run in CI.
 *
 * `ci.yml` declares a top-level `permissions: contents: read`, so every job
 * inherits least privilege — including the `pull_request` job that runs a
 * contributor's code with the repository token in scope. A workflow that forgets
 * that declaration gets the repository's *default* token permissions, which on a
 * non-fork PR include write access. The regression is invisible (the workflow
 * still runs) and only shows up as a token that can push.
 *
 * A *job-level* `permissions:` block overrides the top-level one, so checking
 * only the top-level block misses the same widening one level down: a job could
 * add `permissions: { contents: write }` and this suite would stay green. Every
 * `permissions:` block in a `pull_request` workflow is inspected, at any indent.
 *
 * These are grep-level checks over the workflow YAML. They cannot prove the token
 * is safe at runtime; they catch the one mistake that silently widens it: a
 * missing or widened `permissions:` block.
 */

const workflowsDir = new URL("../../.github/workflows/", import.meta.url);

type Workflow = { name: string; yaml: string; onPullRequest: boolean };

function workflows(): Workflow[] {
  return readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => {
      const yaml = readFileSync(new URL(name, workflowsDir), "utf8");
      // A `pull_request` trigger (not `pull_request_target`, which runs with the
      // base repo's token and is the dangerous variant).
      const onPullRequest = /^\s{0,4}pull_request:\s*$/m.test(yaml);
      return { name, yaml, onPullRequest };
    });
}

const all = workflows();

/**
 * The block under *every* `permissions:` key — top-level (column 0) and any
 * job-level (indented) one. A job-level block overrides the top-level one, so
 * both must be inspected.
 */
function permissionsBlocks(yaml: string): string[] {
  const blocks: string[] = [];
  for (const match of yaml.matchAll(/^([ \t]*)permissions:[ \t]*\n((?:\1[ \t]+.*\n?)*)/gm)) {
    blocks.push(match[2]);
  }
  return blocks;
}

/** The top-level (`^permissions:`) block only, for the "declares permissions" check. */
function topLevelPermissions(yaml: string): string | null {
  const match = yaml.match(/^permissions:[ \t]*\n((?:[ \t]+.*\n?)*)/m);
  return match ? match[1] : null;
}

test("every workflow that runs on a pull request declares top-level permissions", () => {
  const offenders = all
    .filter((workflow) => workflow.onPullRequest && topLevelPermissions(workflow.yaml) === null)
    .map((workflow) => workflow.name);
  assert.deepEqual(
    offenders,
    [],
    `pull_request workflows with no permissions block inherit the default (write) token: ${offenders.join(", ")}`,
  );
});

/**
 * The one reviewed workflow that legitimately needs write on a PR. It only
 * calls `gh pr merge` / `gh pr edit` on a fixed set of GitHub APIs; it never
 * checks out or executes the PR's code, so a write token here cannot run
 * attacker code. Its own gate guard (see below) blocks changes to CI.
 */
const writeAllowlist = new Set(["agent-pr-automation.yml"]);

test("only the reviewed auto-merge workflow grants write on pull_request", () => {
  const offenders: string[] = [];
  for (const workflow of all) {
    if (!workflow.onPullRequest) continue;
    if (writeAllowlist.has(workflow.name)) continue;
    // Check *every* permissions block, not just the top-level one: a job-level
    // `contents: write` overrides the top-level read and would otherwise be
    // invisible here.
    for (const block of permissionsBlocks(workflow.yaml)) {
      if (/:\s*write\b/.test(block)) {
        offenders.push(`${workflow.name} [${block.replace(/\s+/g, " ").trim()}]`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `pull_request workflows with an unexpected write permission: ${offenders.join(", ")}`,
  );
});

test("the permissions scanner sees a job-level block too (self-test)", () => {
  // Guards the guard: a job-level block overrides the top-level one, so a
  // scanner that only looked at column 0 would miss the widening.
  const yaml = [
    "permissions:",
    "  contents: read",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      contents: write",
  ].join("\n");
  const blocks = permissionsBlocks(yaml);
  assert.equal(blocks.length, 2, `expected two permissions blocks, got ${blocks.length}`);
  assert.ok(
    blocks.some((block) => /:\s*write\b/.test(block)),
    "the job-level write block was not seen",
  );
  assert.equal(topLevelPermissions(yaml)!.includes("write"), false);
});

test("no workflow uses the pull_request_target trigger", () => {
  // `pull_request_target` runs with the base repository's token *and* secrets,
  // while checking out (by default) the untrusted PR head — the classic
  // privilege-escalation shape. None of these workflows need it.
  const offenders = all
    .filter((workflow) => /^\s{0,4}pull_request_target:\s*$/m.test(workflow.yaml))
    .map((workflow) => workflow.name);
  assert.deepEqual(
    offenders,
    [],
    `workflows using pull_request_target: ${offenders.join(", ")}`,
  );
});

test("the lane auto-merge gate refuses to merge a change to the workflows themselves", () => {
  // `agent-pr-automation.yml` turns on auto-merge for lane PRs. A self-modifying
  // gate is the most dangerous thing in an autonomous loop, so the workflow must
  // still (a) detect a change under `.github/workflows/` and (b) skip auto-merge
  // for it. If the detector is removed the loop could merge a weakened gate.
  const workflow = all.find((entry) => entry.name === "agent-pr-automation.yml");
  assert.ok(workflow, "agent-pr-automation.yml is missing");

  assert.match(
    workflow.yaml,
    /grep\s+-q\s+'\^\\\.github\/workflows\/'/,
    "the gate detector for `.github/workflows/` changes was removed",
  );
  assert.match(
    workflow.yaml,
    /steps\.gate\.outputs\.touches_gate\s*==\s*'false'/,
    "auto-merge is no longer conditioned on the gate detector",
  );
});
