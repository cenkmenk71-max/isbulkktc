import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  decideVerification,
  evaluateRouteResponse,
  initialVercelState,
  isDeploymentDisabled,
  isSuperseded,
  parsePositiveInt,
} from "./verify-production-deployment.mjs";

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

/**
 * Run the script in a throwaway dir with a fake `git` on PATH whose
 * `ls-remote origin refs/heads/main` reports `tipSha`. `--expect`/`--tip` are
 * pinned to `expectedSha`, the poll is capped, and no Vercel token is set so the
 * HTTP channel (pointed at a closed port) is the only one — meaning the run can
 * only ever end by deadline or by the superseded skip.
 */
function runWithFakeGit({ expectedSha, tipSha, passTip = true, eventName = "" }) {
  const source = fileURLToPath(
    new URL("./verify-production-deployment.mjs", import.meta.url),
  );
  const dir = mkdtempSync(join(tmpdir(), "verify-tip-"));
  try {
    const copy = join(dir, "verify-production-deployment.mjs");
    cpSync(source, copy);

    const fakeGit = join(dir, "git");
    writeFileSync(
      fakeGit,
      [
        "#!/bin/sh",
        'if [ "$1" = "ls-remote" ]; then',
        `  echo "${tipSha}\trefs/heads/main"`,
        "  exit 0",
        "fi",
        "exit 1",
      ].join("\n"),
    );
    chmodSync(fakeGit, 0o755);

    const args = [
      copy,
      "--expect",
      expectedSha,
      // A closed port fails the HTTP channel immediately (connection
      // refused), so the poll does not wait on a request timeout.
      "--url",
      "http://127.0.0.1:1",
    ];
    if (passTip) args.push("--tip", expectedSha);

    let code = 0;
    let output = "";
    try {
      output = execFileSync(process.execPath, args, {
        encoding: "utf8",
        env: {
          ...process.env,
          // Put the fake `git` first so `readRemoteTip` finds it.
          PATH: `${dir}:${process.env.PATH}`,
          GITHUB_SHA: "",
          GITHUB_EVENT_NAME: eventName,
          BRANCH_TIP_SHA: "",
          VERCEL_TOKEN: "",
          DEPLOY_TIMEOUT_SEC: "6",
          DEPLOY_POLL_SEC: "1",
          DEPLOY_TIP_REFRESH_SEC: "1",
        },
      });
    } catch (error) {
      code = error.status;
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    return { code, output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a tip that advances mid-run makes the poll skip instead of failing", () => {
  // The bug from issue #427: `--tip` is read once up front, but the loop polls
  // for up to 15 minutes. When a merge lands on `main` mid-run, the production
  // alias moves to the newer commit; the stale tip means the run never sees
  // "superseded" and paints a healthy site red. Here the fake remote tip is a
  // different commit from `--expect`, which is exactly the mid-run state.
  const { code, output } = runWithFakeGit({
    expectedSha: "1111111111111111111111111111111111111111",
    tipSha: "2222222222222222222222222222222222222222",
  });

  assert.equal(code, 0, output);
  assert.match(output, /superseded by `22222222`/);
  // The skip must come from the in-loop refresh, not the up-front check: the
  // up-front `--tip` equals `--expect`, so only a live re-read can skip here.
  assert.doesNotMatch(output, /FAIL/);
});

test("a tip that never moves still fails loudly when the commit does not promote", () => {
  // Guards against over-correcting: if the remote tip stays put, the run must
  // still report the real failure rather than skip everything.
  const sha = "3333333333333333333333333333333333333333";
  const { code, output } = runWithFakeGit({ expectedSha: sha, tipSha: sha });

  assert.equal(code, 1, output);
  assert.match(output, /FAIL/);
  assert.doesNotMatch(output, /superseded/);
});

test("a push run recovers when the workflow's initial tip read came back empty", () => {
  // The workflow's own `git ls-remote` can fail (network blip), leaving `--tip`
  // empty. On a push run the script still tracks the tip, so a commit that was
  // superseded while this run polled is skipped instead of failing red.
  const { code, output } = runWithFakeGit({
    expectedSha: "1111111111111111111111111111111111111111",
    tipSha: "2222222222222222222222222222222222222222",
    passTip: false,
    eventName: "push",
  });

  assert.equal(code, 0, output);
  assert.match(output, /superseded by `22222222`/);
});

test("a manual run without a tip never re-reads the remote and still fails loudly", () => {
  // `workflow_dispatch` names the commit explicitly and means to verify it even
  // if it is no longer the tip, so a manual run must not skip on a live re-read.
  const { code, output } = runWithFakeGit({
    expectedSha: "1111111111111111111111111111111111111111",
    tipSha: "2222222222222222222222222222222222222222",
    passTip: false,
    eventName: "workflow_dispatch",
  });

  assert.equal(code, 1, output);
  assert.match(output, /FAIL/);
  assert.doesNotMatch(output, /superseded/);
});

test("isSuperseded treats a moved tip as superseded and an unmoved one as not", () => {
  const expected = "aaaa111111111111111111111111111111111111";
  assert.equal(isSuperseded(expected, expected), false);
  // Abbreviated tip that is a prefix of the expected commit is the same commit.
  assert.equal(isSuperseded(expected, "aaaa111"), false);
  // A genuinely newer tip on the branch.
  assert.equal(isSuperseded(expected, "bbbb222222222222222222222222222222222222"), true);
  // Unknown tip must not trigger a skip.
  assert.equal(isSuperseded(expected, ""), false);
});

test("a 402 (DEPLOYMENT_DISABLED) is recognised from the status or the header", () => {
  // Vercel's blocked-account state: 402 with `x-vercel-error: DEPLOYMENT_DISABLED`.
  assert.equal(isDeploymentDisabled(402, ""), true);
  assert.equal(isDeploymentDisabled(200, "DEPLOYMENT_DISABLED"), true);
  assert.equal(isDeploymentDisabled(200, " deployment_disabled "), true);
  // A plain 5xx is not this state, and a missing header must not throw.
  assert.equal(isDeploymentDisabled(500, ""), false);
  assert.equal(isDeploymentDisabled(200, "SOMETHING_ELSE"), false);
});

test("a 404 (DEPLOYMENT_NOT_FOUND) is recognised as a not-served state", () => {
  // 2026-11-10: the origin stopped answering 402 and began answering 404 with
  // `x-vercel-error: DEPLOYMENT_NOT_FOUND` on every route. The predicate only
  // knew the 402 state, so the run fell through to the generic "build-info HTTP
  // 404 (retrying...)" path and polled until the deadline instead of naming the
  // account state. Both states mean "down for every visitor".
  assert.equal(isDeploymentDisabled(404, "DEPLOYMENT_NOT_FOUND"), true);
  assert.equal(isDeploymentDisabled(200, "deployment_not_found"), true);
  assert.equal(isDeploymentDisabled(404, " deployment_not_found "), true);
});

test("a bare 404 without the header is NOT the not-served state", () => {
  // A healthy origin answers 404 for any path it does not have, so the status
  // alone must not be read as "the site is down for every visitor": a deployment
  // that predates `/api/build-info` would be misreported as an outage, and the
  // false red would mask the Vercel API channel that still proves the alias
  // serves the expected commit. The header is what disambiguates a real
  // Vercel not-served state from an ordinary missing path.
  assert.equal(isDeploymentDisabled(404, ""), false);
  assert.equal(isDeploymentDisabled(404, undefined), false);
  assert.equal(isDeploymentDisabled(404, "SOMETHING_ELSE"), false);
});

test("a disabled deployment is a failure even when the Vercel alias looks healthy", () => {
  // The masking bug this pins: the account is blocked, so every visitor gets
  // 402, but the Vercel API channel can still report the production alias
  // pointing at a READY deployment built from the expected commit. The old
  // `if (vercel.ok) verified` ordering would report a green deploy for a site
  // that is down for everyone. A disabled origin must outrank `vercel.ok`.
  const decision = decideVerification({
    vercel: { configured: true, ok: true, reason: "alias built from 8d3db245" },
    http: { ok: false, blocked: false, disabled: true, reason: "HTTP 402 (DEPLOYMENT_DISABLED)" },
  });
  assert.equal(decision.verified, false);
  assert.match(decision.reason, /disabled/);
  assert.match(decision.reason, /not a code problem/);
});

test("a disabled origin is not reported as healthy when the Vercel channel is absent", () => {
  const decision = decideVerification({
    vercel: { configured: false, ok: false, reason: "VERCEL_TOKEN not set" },
    http: { ok: false, blocked: false, disabled: true, reason: "HTTP 402 (DEPLOYMENT_DISABLED)" },
  });
  assert.equal(decision.verified, false);
  assert.match(decision.reason, /disabled/);
});

test("a disabled origin is a failure even when the runner is edge-blocked", () => {
  // The full false-green path: Cloudflare edge-blocks the runner (403), so every
  // smoke route is *skipped* and nothing downstream can catch it, while the
  // Vercel alias still looks healthy. The old `if (vercel.ok)`-first ordering
  // returned verified:true here, so the run exited 0 for a site serving 402 to
  // every real visitor.
  const decision = decideVerification({
    vercel: { configured: true, ok: true, reason: "alias built from 8d3db245" },
    http: { ok: false, blocked: true, disabled: true, reason: "HTTP 402 (DEPLOYMENT_DISABLED)" },
  });
  assert.equal(decision.verified, false);
  assert.match(decision.reason, /disabled/);
});

test("a disabled route response is a failure, not a skipped 4xx", () => {
  const disabled = evaluateRouteResponse("/", 402, 78);
  assert.equal(disabled.ok, false);
  assert.equal(disabled.disabled, true);
  assert.match(disabled.reason, /not being served/);
  // 403/429 stay "blocked" (skipped) — the edge/WAF case, not an outage.
  assert.equal(evaluateRouteResponse("/", 403, 0).skipped, true);
  assert.equal(evaluateRouteResponse("/", 429, 0).skipped, true);
});

test("a 404 route is named as not-served only when Vercel sent the header", () => {
  // With `x-vercel-error: DEPLOYMENT_NOT_FOUND` the route is the whole-site
  // outage and must be named like the 402 case, not fall through to
  // `{ ok: false, reason: "HTTP 404" }` — that reads as a missing page rather
  // than "the site is not being served".
  const notServed = evaluateRouteResponse("/", 404, 0, "DEPLOYMENT_NOT_FOUND");
  assert.equal(notServed.ok, false);
  assert.equal(notServed.disabled, true);
  assert.match(notServed.reason, /not being served/);

  // A bare 404 (no header) stays an ordinary route failure: the status alone
  // cannot tell a missing path from a missing deployment.
  const missing = evaluateRouteResponse("/nope", 404, 0, "");
  assert.equal(missing.ok, false);
  assert.notEqual(missing.disabled, true);
  assert.equal(missing.reason, "HTTP 404");
});

test("a not-served deployment outranks a healthy Vercel alias", () => {
  // Same masking shape as the 402 case, for the 404 state: the alias can still
  // point at a READY deployment while the domain answers 404 to every request.
  const decision = decideVerification({
    vercel: { configured: true, ok: true, reason: "alias built from 8d3db245" },
    http: {
      ok: false,
      blocked: false,
      disabled: true,
      reason: "HTTP 404 (DEPLOYMENT_NOT_FOUND) — the deployment is not being served",
    },
  });
  assert.equal(decision.verified, false);
  assert.match(decision.reason, /not a code problem/);
  assert.match(decision.reason, /not being served/);
});
