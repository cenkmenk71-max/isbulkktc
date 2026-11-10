import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  foldName,
  laneFromBranch,
  ownersOf,
  parseOwnership,
} from "./lane-collisions.mjs";

// The ownership table names lanes as `LANE-QA`, `LANE-INFRA`, …; pass the same
// strings the detector reads from the doc.
const lanes = [
  "LANE-SUPABASE",
  "LANE-CLOUDFLARE",
  "LANE-SEO",
  "LANE-GEO",
  "LANE-TASARIM",
  "LANE-AUTH",
  "LANE-URUN",
  "LANE-QA",
  "LANE-GÜVENLİK",
  "LANE-INFRA",
];

test("a plain lane branch maps to its lane", () => {
  assert.equal(laneFromBranch("lane/infra", lanes), "lane-infra");
  assert.equal(laneFromBranch("lane/seo", lanes), "lane-seo");
});

test("a branch with extra words still maps to its lane", () => {
  // The bug: `lane/qa-visual-baselines` folded to `LANE-QA-VISUAL-BASELINES`,
  // which matched no lane, so every file in PR #228 was reported unowned.
  assert.equal(
    laneFromBranch("lane/qa-visual-baselines", lanes),
    "lane-qa",
  );
  assert.equal(
    laneFromBranch("lane/seo-bing-verification", lanes),
    "lane-seo",
  );
});

test("the Turkish lane name folds to ASCII", () => {
  assert.equal(laneFromBranch("lane/guvenlik", lanes), "lane-guvenlik");
});

test("the longest matching lane wins when one name prefixes another", () => {
  const overlapping = ["LANE-A", "LANE-AUTH"];
  assert.equal(laneFromBranch("lane/auth-flows", overlapping), "lane-auth");
  assert.equal(laneFromBranch("lane/anything-else", overlapping), "lane-a");
});

test("a non-lane branch returns null", () => {
  assert.equal(laneFromBranch("feature/widget", lanes), null);
  assert.equal(laneFromBranch("main", lanes), null);
});

test("an unknown lane branch still names itself so the report is actionable", () => {
  assert.equal(laneFromBranch("lane/newlane", lanes), "lane-newlane");
});

// The detector reads the ownership table out of docs/lanes/00-orchestration.md.
// Asserting on the real file (not a fixture) is the point: the doc is the single
// source of truth, and a lane whose row loses a path silently stops being
// checked. These run without `gh`, so they are deterministic in CI.
const orchestration = readFileSync("docs/lanes/00-orchestration.md", "utf8");
const table = parseOwnership(orchestration);

test("every lane in the registry has an ownership row", () => {
  const registry = JSON.parse(readFileSync("scripts/lanes.json", "utf8"));
  const rows = new Set(table.map((l) => foldName(l.lane)));
  for (const name of Object.keys(registry.lanes)) {
    assert.ok(
      rows.has(foldName(`LANE-${name}`)),
      `lanes.json has "${name}" but the ownership table has no row for it`,
    );
  }
});

test("a path is owned by exactly the lane whose globs match it", () => {
  // Root-level file: the bug that dropped `package.json` from the table.
  assert.deepEqual(ownersOf("package.json", table), ["LANE-INFRA"]);
  // The lockfile Dependabot now watches (see .github/dependabot.yml), and the
  // ignore rule that retired the stale npm lockfile. Both were unowned, so the
  // infra PR that touched them reported itself as a collision in CI.
  assert.deepEqual(ownersOf("bun.lock", table), ["LANE-INFRA"]);
  assert.deepEqual(ownersOf("package-lock.json", table), ["LANE-INFRA"]);
  assert.deepEqual(ownersOf(".gitignore", table), ["LANE-INFRA"]);
  // A glob with a slash.
  assert.deepEqual(ownersOf("scripts/lane-collisions.mjs", table), ["LANE-INFRA"]);
  // Exclusion syntax: URUN owns src/features/** but not identity.
  assert.deepEqual(ownersOf("src/features/identity/x.ts", table), ["LANE-AUTH"]);
  // `src/server/email/**` was unowned for three turns (#386); pin it to URUN.
  assert.deepEqual(ownersOf("src/server/email/mailer.ts", table), ["LANE-URUN"]);
  // A path no lane claims.
  assert.deepEqual(ownersOf("src/unowned/thing.ts", table), []);
});

test("the operator harness family is owned by LANE-OPERATÖR", () => {
  // The operator lane split its harness into `-core`/test modules and added
  // `reap-stalled-sandboxes`, but the ownership row still listed only
  // `lane-autopilot.mjs` / `lane-kickoff.mjs` / `system-health.mjs`. Every new
  // file therefore fell through to LANE-INFRA's `scripts/**`, so PR #494
  // (lane/operator) editing `lane-autopilot-core.mjs` reported a collision.
  // Pin the whole family to the operator lane.
  for (const path of [
    "scripts/lane-autopilot.mjs",
    "scripts/lane-autopilot-core.mjs",
    "scripts/lane-autopilot-core.test.mjs",
    "scripts/lane-kickoff.mjs",
    "scripts/lane-kickoff.test.mjs",
    "scripts/system-health.mjs",
    "scripts/system-health-core.mjs",
    "scripts/system-health.test.mjs",
    "scripts/reap-stalled-sandboxes.mjs",
    "scripts/reap-stalled-sandboxes.test.mjs",
  ]) {
    assert.ok(
      ownersOf(path, table).includes("LANE-OPERATÖR"),
      `${path} must be owned by LANE-OPERATÖR`,
    );
  }
});

test("the Copilot-only workspace config is owned by LANE-INFRA", () => {
  // `.github/skills/` and `.mcp.json` look like project sources but OpenHands
  // reads neither: it loads project skills only from `.agents/skills/` and has
  // no per-project MCP file (#475). They are still VS Code Copilot's workspace
  // config, which is LANE-INFRA's `.github/**` territory. `.github/skills/**`
  // matched `.github/**` already; `.mcp.json` (root file) and the doc that
  // describes the tooling did not, so editing either reported "owned by no
  // lane". Pin them.
  assert.deepEqual(ownersOf(".mcp.json", table), ["LANE-INFRA"]);
  assert.deepEqual(ownersOf("docs/developer-tooling.md", table), ["LANE-INFRA"]);
  assert.ok(
    ownersOf(".github/skills/deep-audit/SKILL.md", table).includes("LANE-INFRA"),
  );
});

test("foldName folds the Turkish lane name to ASCII", () => {
  assert.equal(foldName("LANE-GÜVENLİK"), "lane-guvenlik");
  assert.equal(foldName("LANE-İÇERİK"), "lane-icerik");
});

test("the security-critical surfaces of #424/#435 have an owner", () => {
  // `src/proxy.ts` is the session/locale security boundary, `src/server/auth/**`
  // holds its auth guards, and `src/app/api/build-info/**` is the `force-static`
  // build-identity surface. None were in the ownership table, so a fix to any of
  // them would report "owned by no lane" and no lane was accountable (#435).
  // `src/proxy.ts` is a root-level *source* file, which the `isPathToken` rule
  // (slash or dot-extension) must still accept.
  assert.deepEqual(ownersOf("src/proxy.ts", table), ["LANE-AUTH"]);
  assert.deepEqual(ownersOf("src/server/auth/supabase-guards.ts", table), ["LANE-AUTH"]);
  assert.deepEqual(ownersOf("src/app/api/build-info/route.ts", table), ["LANE-INFRA"]);
});
