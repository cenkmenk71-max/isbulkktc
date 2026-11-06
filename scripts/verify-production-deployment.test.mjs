import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { initialVercelState, parsePositiveInt } from "./verify-production-deployment.mjs";

test("a token that fails to resolve is not reported as 'not set'", () => {
  // Set but unreachable (bad token, unknown team slug, API blip): the old code
  // collapsed this to "VERCEL_TOKEN not set", so the operator was told to set a
  // secret they had already set and `decideVerification` blamed the missing
  // token instead of the real cause.
  const absent = initialVercelState(undefined, null, null);
  assert.equal(absent.configured, false);
  assert.match(absent.reason, /not set/);

  const unreachable = initialVercelState("tok", null, 'no team with slug "orijin1"');
  assert.equal(unreachable.configured, true);
  assert.equal(unreachable.ok, false);
  assert.doesNotMatch(unreachable.reason, /not set/);
  assert.match(unreachable.reason, /unreachable/);
  assert.match(unreachable.reason, /orijin1/);

  const ready = initialVercelState("tok", { teamId: "t", projectId: "p" }, null);
  assert.equal(ready.configured, true);
  assert.equal(ready.reason, "not checked yet");
});

test("a blank timeout falls back to the default instead of becoming NaN", () => {
  // The regression: `Number.parseInt("")` is NaN, a NaN deadline is never
  // reached, and the poll loop spins forever. An unset repository variable
  // reaches the workflow as "" (see verify-production-deployment.yml).
  assert.equal(parsePositiveInt("", 900), 900);
  assert.equal(parsePositiveInt(undefined, 900), 900);
  assert.equal(parsePositiveInt("abc", 900), 900);
  assert.equal(parsePositiveInt("0", 900), 900);
  assert.equal(parsePositiveInt("-5", 900), 900);
});

test("a real positive value is used as given", () => {
  assert.equal(parsePositiveInt("120", 900), 120);
  assert.equal(parsePositiveInt("30", 20), 30);
});

test("the direct-run guard fires even when the script path holds a space", () => {
  const source = fileURLToPath(
    new URL("./verify-production-deployment.mjs", import.meta.url),
  );
  // A directory name with a space and `#` is what broke the old
  // `file://${argv[1]}` guard: it never matched `import.meta.url`, so the script
  // exited 0 having verified nothing. `pathToFileURL` percent-encodes both.
  const dir = mkdtempSync(join(tmpdir(), "verify#prod "));
  try {
    const copy = join(dir, "verify-production-deployment.mjs");
    cpSync(source, copy);

    let code = 0;
    let output = "";
    try {
      output = execFileSync(process.execPath, [copy, "--expect", "not-a-sha"], {
        encoding: "utf8",
        // Clear the CI-provided SHA and cap the poll so an accidental network
        // path cannot hang the suite for the default 15 minutes.
        env: {
          ...process.env,
          GITHUB_SHA: "",
          BRANCH_TIP_SHA: "",
          DEPLOY_TIMEOUT_SEC: "1",
          DEPLOY_POLL_SEC: "1",
        },
      });
    } catch (error) {
      code = error.status;
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }

    // `--expect not-a-sha` normalises to nothing, so main() runs and fails
    // loudly. A silent no-op would be exit 0 with empty output.
    assert.equal(code, 1);
    assert.match(output, /No commit to verify/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
