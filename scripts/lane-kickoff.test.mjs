import assert from "node:assert/strict";
import test from "node:test";

import { kickoff } from "./lane-kickoff.mjs";

const lane = {
  brief: "00-orchestration",
  branch: "lane/infra",
  label: "agent:infra",
  laneLabel: "lane:infra",
  skills: ["github-actions", "code-review"],
};

test("the kickoff names the lane, its brief, its branch and its issue label", () => {
  const prompt = kickoff("infra", lane);
  assert.match(prompt, /Lane: infra\./);
  assert.match(prompt, /docs\/lanes\/00-orchestration\.md/);
  assert.match(prompt, /lane\/infra/);
  assert.match(prompt, /gh issue list --state open --label lane:infra/);
});

// The bug this guards: the prompt asked for the broad label (`agent:test`),
// which `qa`, `guvenlik` and `verify` all share, so one query returned the same
// issue to several lanes and they duplicated the work. `hasLabelledWork` matches
// the precise `lane:<name>` label first; the prompt must agree with that gate.
test("the kickoff queries the precise lane label, not the shared broad one", () => {
  const prompt = kickoff("guvenlik", {
    ...lane,
    label: "agent:test",
    laneLabel: "lane:guvenlik",
  });
  assert.match(prompt, /--label lane:guvenlik/);
  assert.doesNotMatch(prompt, /--label agent:test/);
});

test("a lane with no precise label falls back to its broad label", () => {
  const prompt = kickoff("infra", { ...lane, laneLabel: undefined });
  assert.match(prompt, /--label agent:infra/);
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

// The bug this guards (#304): parallel lanes push while `main` moves, and a PR
// whose head conflicts with main gets no CI run at all — GitHub fires no
// check-run for a CONFLICTING head, so `gh pr checks` shows only an unrelated
// failing check and the PR looks unverified rather than "never triggered".
// Telling every lane to rebase before opening the PR is what keeps the gate on.
test("the kickoff tells the lane to rebase onto origin/main before opening the PR", () => {
  const prompt = kickoff("infra", lane);
  assert.match(prompt, /git fetch origin main && git rebase origin\/main/);
  assert.match(prompt, /CONFLICTING/);
});

// The bug this guards (#453): a lane whose sandbox is gone but whose PR is red
// used to wait forever — its own red PR froze it, because an open PR always read
// as "in flight". The autopilot now re-spawns it with `redPr`, and the prompt
// must tell it to fix that PR instead of starting new work.
test("a red-PR respawn tells the lane to fix that PR, not start new work", () => {
  const prompt = kickoff("infra", lane, {
    redPr: { number: 478, checks: ["Quality, database and E2E"] },
  });
  assert.match(prompt, /PR #478/);
  assert.match(prompt, /Quality, database and E2E/);
  assert.match(prompt, /Yeni iş başlatma/);
  assert.match(prompt, /gh pr checks 478/);
  assert.match(prompt, /yeni PR açma/i);
});

test("a plain kickoff carries no red-PR instruction", () => {
  assert.doesNotMatch(kickoff("infra", lane), /PR #\d+/);
});
