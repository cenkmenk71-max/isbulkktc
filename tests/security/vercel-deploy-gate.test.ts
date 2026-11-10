import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Deploy-quota availability gate.
 *
 * The Vercel Hobby build-rate limit is a denial-of-availability control that
 * already fired once: when it trips, `main` keeps merging and the live site
 * stops updating for 24 hours (#319). Every feature branch push used to create
 * its own preview build, and with a dozen active branches that is what drained
 * the daily build budget.
 *
 * The one lever that does not spend the budget is to not create the deployment:
 * a build cancelled by Vercel's "Ignored Build Step" still counts as a
 * deployment. `vercel.json` `git.deploymentEnabled` decides *before* a build
 * exists, so this suite pins it to "only `main` deploys".
 */

const config = JSON.parse(
  readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
);

/** `*` matches inside one path segment; `**` crosses segments. Anchored. */
function globToRegExp(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${out}$`);
}

/**
 * Vercel's documented rule: a branch deploys when at least one
 * `deploymentEnabled` key matches it and is `true`; an unspecified branch
 * defaults to `true`.
 */
function deploymentEnabledFor(
  branch: string,
  rules: Record<string, boolean> | boolean | undefined,
): boolean {
  if (rules === undefined || rules === null) return true;
  if (typeof rules === "boolean") return rules;
  const matched = Object.entries(rules).filter(([pattern]) =>
    globToRegExp(pattern).test(branch),
  );
  if (matched.length === 0) return true;
  return matched.some(([, enabled]) => enabled === true);
}

test("main still deploys — production must keep shipping", () => {
  assert.equal(
    deploymentEnabledFor("main", config.git?.deploymentEnabled),
    true,
  );
});

test("no feature, fix or bot branch deploys — the build budget is spent on main only", () => {
  for (const branch of [
    "feature/guvenlik",
    "feature/urun",
    "feature/infra",
    "fix/model-access-revert",
    "dependabot/npm_and_yarn/next-16.0.1",
    "renovate/zod-4.x",
    "release/1.0",
    "experiment/anything",
  ]) {
    assert.equal(
      deploymentEnabledFor(branch, config.git?.deploymentEnabled),
      false,
      `${branch} must not create a Vercel build`,
    );
  }
});

test("an unmatched branch defaults to deploy, as Vercel documents", () => {
  // Guards against a config that disables everything by accident: if the `**`
  // rule were dropped, default-true is what keeps `main` shipping.
  assert.equal(deploymentEnabledFor("some/unlisted-branch", {}), true);
  assert.equal(deploymentEnabledFor("main", false), false);
});

test("glob semantics are segment-aware, matching Vercel's minimatch", () => {
  assert.equal(globToRegExp("**").test("feature/x"), true);
  assert.equal(globToRegExp("*").test("feature/x"), false);
  assert.equal(globToRegExp("*").test("main"), true);
  assert.equal(globToRegExp("feature/*").test("feature/x"), true);
  assert.equal(globToRegExp("feature/*").test("feature/a/b"), false);
  assert.equal(globToRegExp("feature/**").test("feature/a/b"), true);
});

test("the shipped gate is exactly two rules, nothing broader", () => {
  assert.deepEqual(config.git?.deploymentEnabled, { "**": false, main: true });
});
