import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { ghEnv } from "./approve-pending-runs.mjs";

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
