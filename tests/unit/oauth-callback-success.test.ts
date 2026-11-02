import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relative: string) =>
  readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

/**
 * The OAuth callback must never turn a *successful* sign-in into the failure
 * page. `exchangeCodeForSession` writes the auth cookies, so from that point on
 * the user is signed in; only the code/verifier exchange itself may fail.
 *
 * The bug this pins: after the exchange the handler still returned the failure
 * path when the profile-locale write or the user lookup did not go exactly to
 * plan. The session was already live, so the user was signed in *and* shown
 * "social sign-in could not be completed" and left on the login screen instead
 * of the dashboard.
 */
test("the OAuth callback only fails on the code exchange, never after it", () => {
  const source = readSource("src/app/[locale]/auth/callback/route.ts");

  const exchangeIndex = source.indexOf("exchangeCodeForSession(");
  assert.ok(exchangeIndex > -1, "the callback must exchange the auth code");

  // The exchange's own error branch is legitimate: it is the one failure that
  // happens *before* the session exists.
  const afterExchange = source.slice(exchangeIndex);
  const errorBranchEnd = afterExchange.indexOf("if (isResetFlow)");
  assert.ok(
    errorBranchEnd > -1,
    "the reset-flow branch must follow the exchange error check",
  );

  const postSession = afterExchange.slice(errorBranchEnd);
  assert.equal(
    postSession.includes("failurePath"),
    false,
    "no failure redirect may follow a successful code exchange",
  );

  // Every post-session exit is the success destination.
  assert.match(
    postSession,
    /resolveAuthDestination\(audience, locale\)/,
    "the callback must end on the audience destination",
  );
});

test("post-session side effects are logged, not surfaced as failures", () => {
  const source = readSource("src/app/[locale]/auth/callback/route.ts");

  // The locale metadata write and the profile-locale update stay best-effort.
  assert.match(source, /OAuth profile locale could not be stored in user metadata/);
  assert.match(source, /New OAuth profile locale could not be stored/);
  assert.match(source, /OAuth profile auto-fill could not be applied/);

  // The profile-locale update must not depend on a SELECT that RLS can hide.
  assert.doesNotMatch(
    source,
    /\.update\(\{ locale: intent\.locale \}\)\s*\n?\s*\.eq\("id", user\.id\)\s*\n?\s*\.select\(/,
    "the locale update must not require a follow-up SELECT",
  );
});
