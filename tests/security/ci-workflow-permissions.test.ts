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

/**
 * The event names a workflow's `on:` trigger declares, across every YAML form
 * GitHub accepts:
 *
 *  - block form — `on:\n  pull_request:` (what this repo uses today);
 *  - sequence form — `on: [push, pull_request]`;
 *  - flow-map form — `on: { pull_request: {} }`;
 *  - a block whose children are sequences — `on:\n  - pull_request`.
 *
 * The earlier check was `/^\s{0,4}pull_request:\s*$/m`, which only matches the
 * block form. A `pull_request_target` declared as `on: [pull_request_target]` or
 * `on: { pull_request_target: {} }` — or a `pull_request` trigger written the
 * same way — was therefore **invisible**: the `pull_request_target` gate below
 * and the "every pull_request workflow declares permissions" gate both stayed
 * green while the trigger was present. A pull_request_target workflow runs with
 * the base repo's token *and* secrets while checking out the untrusted PR head,
 * so that is the exact privilege-escalation shape this suite exists to catch.
 *
 * No YAML parser is a dependency, so this is a small indentation scanner. It is
 * only as good as its self-test (below), which drives every form for both event
 * names.
 */
function triggerEvents(yaml: string): Set<string> {
  const events = new Set<string>();
  const lines = yaml.split("\n");

  const addName = (raw: string) => {
    const name = raw.trim().replace(/^["']|["']$/g, "");
    if (/^[A-Za-z_]+$/.test(name)) events.add(name);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const key = lines[index].match(/^["']?on["']?:[ \t]*(.*)$/);
    if (!key) continue;
    const inline = key[1].replace(/\s*#.*$/, "").trim();

    if (inline.startsWith("[")) {
      for (const part of inline.replace(/^\[|\]$/g, "").split(",")) addName(part);
      continue;
    }
    if (inline.startsWith("{")) {
      for (const part of inline.replace(/^\{|\}$/g, "").split(",")) addName(part.split(":")[0]);
      continue;
    }
    if (inline.length > 0) {
      addName(inline);
      continue;
    }

    // Block form: the child lines deeper than the `on:` key.
    let childIndent = -1;
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (line.trim() === "" || line.trim().startsWith("#")) continue;
      const indent = line.match(/^[ \t]*/)![0].length;
      if (indent === 0) break;
      if (childIndent === -1) childIndent = indent;
      if (indent < childIndent) break;
      if (indent > childIndent) continue;
      const sequence = line.match(/^[ \t]*-[ \t]*([A-Za-z_]+)[ \t]*$/);
      if (sequence) {
        addName(sequence[1]);
        continue;
      }
      const childKey = line.match(/^[ \t]*([A-Za-z_]+):/);
      if (childKey) addName(childKey[1]);
    }
  }
  return events;
}

function workflows(): Workflow[] {
  return readdirSync(workflowsDir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => {
      const yaml = readFileSync(new URL(name, workflowsDir), "utf8");
      // A `pull_request` trigger (not `pull_request_target`, which runs with the
      // base repo's token and is the dangerous variant).
      const onPullRequest = triggerEvents(yaml).has("pull_request");
      return { name, yaml, onPullRequest };
    });
}

const all = workflows();

/**
 * Every `permissions:` spec at any indent, in the three forms YAML allows:
 *
 *  - block form — `permissions:\n  contents: read` (what the repo uses today);
 *  - flow-map form — `permissions: { contents: write }`;
 *  - bare-scalar form — `permissions: write-all` / `read-all`.
 *
 * The earlier scanner only saw the block form: its regex required a newline
 * after `permissions:` and then indented continuation lines. A job-level
 * `permissions: { contents: write }` or `permissions: write-all` was therefore
 * **invisible** to the write check — a workflow could silently grant itself a
 * write token and this suite stayed green (proven: both forms yielded `[]`).
 * Each match records its own indent so the "top-level only" check still works.
 */
function permissionsSpecs(yaml: string): { text: string; topLevel: boolean }[] {
  const lines = yaml.split("\n");
  const specs: { text: string; topLevel: boolean }[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^([ \t]*)permissions:[ \t]*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const inline = match[2].trim();
    if (inline.length > 0) {
      specs.push({ text: inline, topLevel: indent === 0 });
      continue;
    }
    // Block form: the following lines indented deeper than the key itself.
    const block: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (line.trim() === "") {
        block.push("");
        continue;
      }
      if (line.match(/^[ \t]*/)![0].length <= indent) break;
      block.push(line);
    }
    specs.push({ text: block.join("\n"), topLevel: indent === 0 });
  }
  return specs;
}

/** The permission specs that can widen the token (`write`, incl. `write-all`). */
function writeSpecs(yaml: string): string[] {
  return permissionsSpecs(yaml)
    .map((spec) => spec.text)
    .filter((text) => /\bwrite\b/.test(text));
}

/** The top-level (`permissions:` at column 0) spec, for the "declares" check. */
function topLevelPermissions(yaml: string): string | null {
  const spec = permissionsSpecs(yaml).find((entry) => entry.topLevel);
  return spec ? spec.text : null;
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
    // Check *every* permissions spec, not just the top-level block: a
    // job-level `contents: write`, a flow-map `{ contents: write }`, or a bare
    // `write-all` overrides the top-level read and would otherwise be
    // invisible here.
    for (const spec of writeSpecs(workflow.yaml)) {
      offenders.push(`${workflow.name} [${spec.replace(/\s+/g, " ").trim()}]`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `pull_request workflows with an unexpected write permission: ${offenders.join(", ")}`,
  );
});

test("the permissions scanner sees every YAML form, at any indent (self-test)", () => {
  // Guards the guard: a form the scanner cannot read is a write grant it never
  // reports. Block, flow-map and bare-scalar, top-level and job-level.
  const jobBlock = [
    "permissions:",
    "  contents: read",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    "    permissions:",
    "      contents: write",
  ].join("\n");
  assert.ok(
    writeSpecs(jobBlock).some((text) => /contents:\s*write/.test(text)),
    "the job-level block write was not seen",
  );
  assert.equal(topLevelPermissions(jobBlock)!.includes("write"), false);

  // The two forms the earlier scanner missed entirely.
  const jobFlowMap = ["jobs:", "  build:", "    permissions: { contents: write }"].join("\n");
  assert.ok(
    writeSpecs(jobFlowMap).some((text) => /\bwrite\b/.test(text)),
    "a job-level flow-map write was not seen",
  );

  const jobWriteAll = ["jobs:", "  build:", "    permissions: write-all"].join("\n");
  assert.ok(
    writeSpecs(jobWriteAll).some((text) => /\bwrite\b/.test(text)),
    "a job-level `permissions: write-all` was not seen",
  );

  // The top-level flow-map must still satisfy the "declares permissions" check.
  assert.ok(
    topLevelPermissions("permissions: { contents: read }") !== null,
    "a top-level flow-map was not recognised as declaring permissions",
  );
  // And a top-level bare scalar is recognised too.
  assert.equal(topLevelPermissions("permissions: read-all"), "read-all");
});

test("no workflow uses the pull_request_target trigger", () => {
  // `pull_request_target` runs with the base repository's token *and* secrets,
  // while checking out (by default) the untrusted PR head — the classic
  // privilege-escalation shape. None of these workflows need it. The trigger is
  // read through `triggerEvents`, so the sequence and flow-map spellings are
  // seen too (the earlier block-only regex was blind to them).
  const offenders = all
    .filter((workflow) => triggerEvents(workflow.yaml).has("pull_request_target"))
    .map((workflow) => workflow.name);
  assert.deepEqual(
    offenders,
    [],
    `workflows using pull_request_target: ${offenders.join(", ")}`,
  );
});

test("the trigger scanner sees every YAML form of `on:` (self-test)", () => {
  // Guards the guard: a trigger form the scanner cannot read is a
  // pull_request_target (or a pull_request) that never reaches the gates above.
  const has = (yaml: string, event: string) => triggerEvents(yaml).has(event);

  assert.equal(has("on:\n  pull_request:\n  push:\n", "pull_request"), true);
  assert.equal(has("on: [push, pull_request]\n", "pull_request"), true);
  assert.equal(has("on: { pull_request: {} }\n", "pull_request"), true);
  assert.equal(has("on:\n  - push\n  - pull_request\n", "pull_request"), true);

  assert.equal(has("on:\n  pull_request_target:\n", "pull_request_target"), true);
  assert.equal(has("on: [push, pull_request_target]\n", "pull_request_target"), true);
  assert.equal(has("on: { pull_request_target: {} }\n", "pull_request_target"), true);
  assert.equal(has("on:\n  pull_request_target:\n    types: [opened]\n", "pull_request_target"), true);

  // A `#` comment or a string that merely mentions the name is not a trigger.
  assert.equal(has("on:\n  push:\n# pull_request_target is banned\n", "pull_request_target"), false);
  assert.equal(has("name: pull_request_target\non:\n  push:\n", "pull_request_target"), false);
  // `pull_request` must not be confused with `pull_request_target`.
  assert.equal(has("on:\n  pull_request_target:\n", "pull_request"), false);
  assert.equal(has("on:\n  pull_request:\n", "pull_request_target"), false);
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
