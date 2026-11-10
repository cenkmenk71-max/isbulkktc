import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describeVerdict } from "./verify-production-deployment.mjs";

const execFileAsync = promisify(execFile);

/**
 * `describeVerdict` is the single place that decides the summary's verdict
 * headline, and it must agree with the exit code: the run exits non-zero when
 * the commit is unconfirmed *or* a smoke route is unhealthy, so the headline
 * cannot be derived from the commit check alone. These are the pure cases; the
 * end-to-end run below proves the wiring in `main()`.
 */
test("describeVerdict: an unconfirmed commit is unhealthy and names the reason", () => {
  const verdict = describeVerdict(
    { verified: false, reason: "serving 11111111, expected 22222222" },
    [],
  );
  assert.equal(verdict.healthy, false);
  assert.match(verdict.reason, /expected/);
});

test("describeVerdict: a confirmed commit with no route failures is healthy", () => {
  const verdict = describeVerdict(
    { verified: true, method: "http", reason: "build-info HTTP 200" },
    [],
  );
  assert.equal(verdict.healthy, true);
  assert.equal(verdict.reason, "build-info HTTP 200");
});

test("describeVerdict: a confirmed commit with a broken route is unhealthy", () => {
  // The defect: freshness and health are separate, so the commit can be
  // confirmed while a reachable route answers 500. The old headline looked only
  // at the commit check and printed `✅` next to a job that exits 1.
  const verdict = describeVerdict(
    { verified: true, method: "http", reason: "build-info HTTP 200" },
    ["route /jobs: HTTP 500"],
  );
  assert.equal(verdict.healthy, false, "a broken route must not headline a green verdict");
  assert.match(verdict.reason, /1 smoke route\(s\) unhealthy/);
});

test("describeVerdict: the route count matches the failure set", () => {
  const verdict = describeVerdict(
    { verified: true, method: "vercel-api", reason: "alias READY" },
    ["route /: HTTP 500", "route /jobs: body too small (0 bytes)"],
  );
  assert.equal(verdict.healthy, false);
  assert.match(verdict.reason, /2 smoke route\(s\) unhealthy/);
});

/**
 * Run the script against a local origin that answers `/api/build-info` with
 * `servedCommit` and every other path with a large 200 body — unless
 * `brokenRoute` names a path that should answer 500. Lets one harness drive both
 * the "commit confirmed" and "route broken" cases. Uses the async exec so the
 * local server's event loop keeps running (a sync spawn would deadlock it).
 */
async function runWithLocalOrigin({ expectedSha, servedCommit, brokenRoute = null }) {
  const source = fileURLToPath(
    new URL("./verify-production-deployment.mjs", import.meta.url),
  );
  const dir = mkdtempSync(join(tmpdir(), "verify-verdict-"));
  const server = createServer((req, res) => {
    if (req.url === "/api/build-info") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ commit: servedCommit, environment: "production" }));
      return;
    }
    if (brokenRoute && req.url === brokenRoute) {
      res.writeHead(500, { "content-type": "text/html" });
      res.end("error");
      return;
    }
    res.writeHead(200, { "content-type": "text/html" });
    // A body over 100 bytes so `evaluateRouteResponse` counts it as healthy.
    res.end(`<!doctype html><html><body>${"ok".repeat(200)}</body></html>`);
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const copy = join(dir, "verify-production-deployment.mjs");
    cpSync(source, copy);

    let code = 0;
    let output = "";
    try {
      const { stdout } = await execFileAsync(
        process.execPath,
        [copy, "--expect", expectedSha, "--url", origin],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            GITHUB_SHA: "",
            BRANCH_TIP_SHA: "",
            GITHUB_EVENT_NAME: "",
            VERCEL_TOKEN: "",
            DEPLOY_TIMEOUT_SEC: "2",
            DEPLOY_POLL_SEC: "1",
          },
        },
      );
      output = stdout;
    } catch (error) {
      code = error.code;
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    return { code, output };
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a confirmed commit with a broken route headlines ❌, matching the exit code", async () => {
  // End-to-end proof of the wiring: the origin confirms the expected commit, so
  // `decision.verified` is true — but one route answers 500, so the run exits 1.
  // The summary must not print `verdict: ✅` next to that failing job.
  const commit = "2222222222222222222222222222222222222222";
  const { code, output } = await runWithLocalOrigin({
    expectedSha: commit,
    servedCommit: commit,
    brokenRoute: "/jobs",
  });

  assert.equal(code, 1, output);
  assert.match(output, /verdict: ❌/, "a failing run must not headline a green verdict");
  assert.match(output, /smoke route\(s\) unhealthy/);
  assert.doesNotMatch(output, /verdict: ✅/);
  assert.match(output, /smoke routes: ❌ 4 passed, 0 skipped, 1 failed/);
  assert.match(output, /FAIL route \/jobs: HTTP 500/);
});

test("a confirmed commit with every route healthy headlines ✅ and exits 0", async () => {
  const commit = "3333333333333333333333333333333333333333";
  const { code, output } = await runWithLocalOrigin({
    expectedSha: commit,
    servedCommit: commit,
  });

  assert.equal(code, 0, output);
  assert.match(output, /verdict: ✅/);
  assert.match(output, /5 passed, 0 skipped, 0 failed/);
  assert.doesNotMatch(output, /verdict: ❌/);
});
