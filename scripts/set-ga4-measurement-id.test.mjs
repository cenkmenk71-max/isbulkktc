import assert from "node:assert/strict";
import test from "node:test";

import {
  decideEnvWrite,
  envPayload,
  isFailed,
  isReady,
  looksLikeMeasurementId,
  parseArgs,
  scriptSources,
} from "./set-ga4-measurement-id.mjs";

test("looksLikeMeasurementId accepts real ids and rejects everything else", () => {
  assert.equal(looksLikeMeasurementId("G-ABC123DEF4"), true);
  assert.equal(looksLikeMeasurementId("  G-ABC123DEF4  "), true);
  // Lowercase is not what GA issues; accepting it would pass an id the client
  // component (`/^G-[A-Z0-9]+$/`) then rejects, so both must agree.
  assert.equal(looksLikeMeasurementId("g-abc123"), false);
  assert.equal(looksLikeMeasurementId("G-"), false);
  assert.equal(looksLikeMeasurementId("UA-12345-1"), false);
  assert.equal(looksLikeMeasurementId("G-ABC 123"), false);
  assert.equal(looksLikeMeasurementId(""), false);
  assert.equal(looksLikeMeasurementId(undefined), false);
});

test("parseArgs reads the id from the flag, then the environment", () => {
  assert.equal(parseArgs(["--id", "G-ONE"]).id, "G-ONE");
  assert.equal(parseArgs([], { GA_MEASUREMENT_ID: "G-ENV" }).id, "G-ENV");
  // The flag wins over the environment.
  assert.equal(parseArgs(["--id", "G-FLAG"], { GA_MEASUREMENT_ID: "G-ENV" }).id, "G-FLAG");
  assert.equal(parseArgs([], {}).id, "");
});

test("parseArgs pins the defaults and the opt-out flags", () => {
  const base = parseArgs([], {});
  assert.equal(base.project, "isbulkktc");
  assert.deepEqual(base.targets, ["production", "preview"]);
  assert.equal(base.redeploy, true);
  assert.equal(base.wait, true);
  assert.equal(base.verify, true);
  assert.equal(base.dryRun, false);
  assert.equal(base.timeoutMs, 600_000);

  const optedOut = parseArgs(["--no-redeploy", "--no-wait", "--no-verify", "--dry-run"], {});
  assert.equal(optedOut.redeploy, false);
  assert.equal(optedOut.wait, false);
  assert.equal(optedOut.verify, false);
  assert.equal(optedOut.dryRun, true);

  assert.equal(parseArgs([], { DRY_RUN: "1" }).dryRun, true);
  assert.equal(parseArgs([], { VERCEL_DEPLOY_TIMEOUT_MS: "1000" }).timeoutMs, 1000);
  // A nonsense timeout falls back rather than producing an unbounded wait.
  assert.equal(parseArgs([], { VERCEL_DEPLOY_TIMEOUT_MS: "-5" }).timeoutMs, 600_000);
});

test("parseArgs honours project and team overrides", () => {
  const args = parseArgs(["--project", "other", "--team-id", "team_x", "--team-slug", "slug"], {});
  assert.equal(args.project, "other");
  assert.equal(args.teamId, "team_x");
  assert.equal(args.teamSlug, "slug");
});

test("envPayload trims the id and targets both environments", () => {
  assert.deepEqual(envPayload("  G-XYZ  "), {
    key: "NEXT_PUBLIC_GA_MEASUREMENT_ID",
    value: "G-XYZ",
    type: "plain",
    target: ["production", "preview"],
  });
});

test("decideEnvWrite creates, updates, or skips idempotently", () => {
  const targets = ["production", "preview"];
  assert.deepEqual(decideEnvWrite(undefined, "G-1", targets), { action: "create" });

  // Same value and same targets — a re-run must not churn a rebuild.
  assert.deepEqual(
    decideEnvWrite({ id: "env_1", value: "G-1", target: ["preview", "production"] }, "G-1", targets),
    { action: "skip" },
  );

  // A different id is an update, and the existing env id is carried through.
  assert.deepEqual(
    decideEnvWrite({ id: "env_1", value: "G-OLD", target: targets }, "G-1", targets),
    { action: "update", envId: "env_1" },
  );

  // Same value but a missing target is still an update (production only → both).
  assert.deepEqual(
    decideEnvWrite({ id: "env_1", value: "G-1", target: ["production"] }, "G-1", targets),
    { action: "update", envId: "env_1" },
  );
});

test("deployment state helpers recognise terminal states", () => {
  assert.equal(isReady("READY"), true);
  assert.equal(isReady("BUILDING"), false);
  assert.equal(isFailed("ERROR"), true);
  assert.equal(isFailed("CANCELED"), true);
  assert.equal(isFailed("QUEUED"), false);
});

test("scriptSources resolves relative and absolute src values", () => {
  const html =
    '<html><head>' +
    '<script src="/_next/static/chunks/main.js"></script>' +
    '<script src="https://cdn.example.com/x.js"></script>' +
    '<script>inline()</script>' +
    "</head></html>";
  assert.deepEqual(scriptSources(html, "https://isbulkktc.com"), [
    "https://isbulkktc.com/_next/static/chunks/main.js",
    "https://cdn.example.com/x.js",
  ]);
  assert.deepEqual(scriptSources("", "https://isbulkktc.com"), []);
});
