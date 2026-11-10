import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ghEnv, ghErrorLine, parsePendingRuns } from "./approve-pending-runs.mjs";

test("a missing token leaves GH_TOKEN unset so gh keeps its stored auth", () => {
  // With neither variable set the old `GH_TOKEN: A ?? B` still produced an
  // `undefined` value. Node drops an `undefined` env entry, so this particular
  // case happened to work — but the key must never be present as `""` either,
  // which is what a blank CI secret interpolates to.
  const env = ghEnv({ PATH: "/usr/bin" });
  assert.equal("GH_TOKEN" in env, false);
  assert.equal(env.PATH, "/usr/bin");
});

test("a blank token is treated as absent, not as a token", () => {
  assert.equal("GH_TOKEN" in ghEnv({ GH_TOKEN: "" }), false);
  assert.equal("GH_TOKEN" in ghEnv({ GITHUB_PERSONAL_ACCESS_TOKEN: "" }), false);
  assert.equal("GH_TOKEN" in ghEnv({ GH_TOKEN: "   " }), false);
});

test("a blank personal token does not shadow a valid GH_TOKEN", () => {
  // The real regression: `GITHUB_PERSONAL_ACCESS_TOKEN ?? GH_TOKEN` only falls
  // through on null/undefined, so an empty personal token (an unset CI secret)
  // won over a valid GH_TOKEN and `gh` ran unauthenticated. `||` fixes it.
  assert.equal(
    ghEnv({ GITHUB_PERSONAL_ACCESS_TOKEN: "", GH_TOKEN: "ghs_real" }).GH_TOKEN,
    "ghs_real",
  );
  assert.equal(
    ghEnv({ GITHUB_PERSONAL_ACCESS_TOKEN: "  ", GH_TOKEN: "ghs_real" }).GH_TOKEN,
    "ghs_real",
  );
});

test("a real token is passed through, preferring the personal access token", () => {
  assert.equal(ghEnv({ GH_TOKEN: "ghs_abc" }).GH_TOKEN, "ghs_abc");
  assert.equal(
    ghEnv({ GH_TOKEN: "ghs_abc", GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_xyz" })
      .GH_TOKEN,
    "ghp_xyz",
  );
});

test("the direct-run guard fires even when the script path holds a space", () => {
  const source = fileURLToPath(
    new URL("./approve-pending-runs.mjs", import.meta.url),
  );
  // A directory name with a space and `#` is what broke a hand-built
  // `file://${argv[1]}` guard: it never matched `import.meta.url`, so the script
  // exited 0 having approved nothing. `pathToFileURL` percent-encodes both.
  const dir = mkdtempSync(join(tmpdir(), "approve#pending "));
  const bin = join(dir, "bin");
  try {
    mkdirSync(bin);
    // A fake `gh` that prints nothing, so main() reaches its "no runs" branch
    // without touching the network. If the guard fails to fire, there is no
    // output at all.
    const fakeGh = join(bin, "gh");
    writeFileSync(fakeGh, "#!/bin/sh\nexit 0\n");
    chmodSync(fakeGh, 0o755);

    const copy = join(dir, "approve-pending-runs.mjs");
    cpSync(source, copy);

    const output = execFileSync(process.execPath, [copy, "--dry-run"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GH_TOKEN: "ghs_fake",
        GITHUB_PERSONAL_ACCESS_TOKEN: "",
      },
    });

    assert.match(output, /no runs are waiting for approval/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a blank line never becomes a phantom row with an undefined id", () => {
  const rows = parsePendingRuns("1\tCI\tmain\n\n2\tE2E\tmain\n");
  assert.deepEqual(rows, [
    { id: "1", name: "CI", branch: "main" },
    { id: "2", name: "E2E", branch: "main" },
  ]);
});

test("the list call paginates, so a backlog over one page is not half-approved", () => {
  // The regression: `per_page=50` with no `--paginate` returns only the first
  // page. A backlog larger than a page would be approved partially while the
  // script reported success — exactly the stuck-queue case it exists to clear
  // (#178). Pin the flag so it cannot be dropped silently.
  const source = readFileSync(
    fileURLToPath(new URL("./approve-pending-runs.mjs", import.meta.url)),
    "utf8",
  );
  assert.match(source, /'--paginate'/);
});

test("the real reason from gh is surfaced, not just 'Command failed'", () => {
  // `execFileSync`'s message is only `Command failed: gh api …`; the actionable
  // text ("Resource not accessible by integration") is on stderr. Reporting the
  // message alone leaves an operator staring at a run that says nothing.
  const error = Object.assign(
    new Error("Command failed: gh api repos/x/actions/runs/1/approve"),
    { stderr: "gh: Resource not accessible by integration\n" },
  );
  assert.equal(ghErrorLine(error), "gh: Resource not accessible by integration");
  // No stderr (e.g. a spawn error) falls back to the message.
  assert.equal(ghErrorLine(new Error("spawn gh ENOENT")), "spawn gh ENOENT");
});

test("a failed approval does not exit 0", () => {
  // A run that could not be approved is still held. Reporting success would let
  // a scheduled caller read "cleared the queue" while a lane stays BLOCKED with
  // no CI — the #178 failure mode this script exists to prevent.
  const source = fileURLToPath(
    new URL("./approve-pending-runs.mjs", import.meta.url),
  );
  const dir = mkdtempSync(join(tmpdir(), "approve-fail "));
  const bin = join(dir, "bin");
  try {
    mkdirSync(bin);
    const fakeGh = join(bin, "gh");
    writeFileSync(
      fakeGh,
      [
        "#!/bin/sh",
        'case "$*" in',
        '  *"/actions/runs?status=action_required"*)',
        `    printf '%s\\n' "$(printf '11\\tCI\\tmain')" ;;`,
        '  *"/actions/runs/11/approve"*)',
        "    echo 'gh: Resource not accessible by integration' >&2",
        "    exit 1 ;;",
        "esac",
        "exit 0",
        "",
      ].join("\n"),
    );
    chmodSync(fakeGh, 0o755);

    let status = 0;
    let stderr = "";
    try {
      execFileSync(process.execPath, [source], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GH_TOKEN: "ghs_fake",
          GITHUB_PERSONAL_ACCESS_TOKEN: "",
        },
      });
    } catch (error) {
      status = error.status;
      stderr = error.stderr;
    }

    assert.equal(status, 1);
    assert.match(stderr, /still need approval/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every pending run on every page is approved, not just the first page", () => {
  const source = fileURLToPath(
    new URL("./approve-pending-runs.mjs", import.meta.url),
  );
  const dir = mkdtempSync(join(tmpdir(), "approve-paginate "));
  const bin = join(dir, "bin");
  try {
    mkdirSync(bin);
    // A fake `gh` that records its argv and answers the list call with two rows.
    // The `--paginate` flag's presence is what this pins: without it the real
    // `gh` would stop at page one, so the script could report success having
    // approved only part of the queue.
    const log = join(dir, "argv.log");
    const fakeGh = join(bin, "gh");
    writeFileSync(
      fakeGh,
      [
        "#!/bin/sh",
        `printf '%s\\n' "$@" >> ${JSON.stringify(log)}`,
        'case "$*" in',
        '  *"/actions/runs?status=action_required"*)',
        `    printf '%s\\n' "$(printf '11\\tCI\\tmain')" "$(printf '22\\tE2E\\tmain')" ;;`,
        "esac",
        "exit 0",
        "",
      ].join("\n"),
    );
    chmodSync(fakeGh, 0o755);

    const output = execFileSync(process.execPath, [source, "--dry-run"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GH_TOKEN: "ghs_fake",
        GITHUB_PERSONAL_ACCESS_TOKEN: "",
      },
    });

    assert.match(output, /2 run\(s\) waiting for approval/);
    assert.match(output, /would approve 11 CI \(main\)/);
    assert.match(output, /would approve 22 E2E \(main\)/);
    assert.match(readFileSync(log, "utf8"), /--paginate/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
