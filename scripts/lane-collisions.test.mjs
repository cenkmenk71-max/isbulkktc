import assert from "node:assert/strict";
import test from "node:test";

import { laneFromBranch } from "./lane-collisions.mjs";

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
