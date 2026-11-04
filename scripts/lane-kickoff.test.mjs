import assert from "node:assert/strict";
import test from "node:test";

import { kickoff } from "./lane-kickoff.mjs";

const lane = {
  brief: "00-orchestration",
  branch: "lane/infra",
  label: "agent:infra",
  skills: ["github-actions", "code-review"],
};

test("the kickoff names the lane, its brief, its branch and its issue label", () => {
  const prompt = kickoff("infra", lane);
  assert.match(prompt, /Lane: infra\./);
  assert.match(prompt, /docs\/lanes\/00-orchestration\.md/);
  assert.match(prompt, /lane\/infra/);
  assert.match(prompt, /gh issue list --state open --label agent:infra/);
});

// The bug this guards: spawn-lanes.mjs and lane-autopilot.mjs each built the
// prompt, and the autopilot's copy dropped the skills line — so a lane the
// schedule started was told to use fewer skills than one started by hand.
test("the kickoff includes the lane's skills so both callers send the same prompt", () => {
  const prompt = kickoff("infra", lane);
  assert.match(prompt, /Kullanacağın skill'ler/);
  assert.match(prompt, /github-actions, code-review/);
});

test("a lane with no skills omits the skills line rather than printing an empty one", () => {
  const prompt = kickoff("infra", { ...lane, skills: [] });
  assert.doesNotMatch(prompt, /Kullanacağın skill'ler/);
});

test("the retry hint quotes the budget and carries the previous error", () => {
  const prompt = kickoff("infra", lane, { maxAttempts: 5, previousError: "boom" });
  assert.match(prompt, /bütçe 5/);
  assert.match(prompt, /ÖNCEKİ DENEME BAŞARISIZ OLDU\. Hata: boom/);
});

test("a first attempt carries no retry hint", () => {
  const prompt = kickoff("infra", lane, { maxAttempts: 3 });
  assert.doesNotMatch(prompt, /ÖNCEKİ DENEME/);
});
