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
test("the OAuth callback never fails a request that already has a session", () => {
  const source = readSource("src/app/[locale]/auth/callback/route.ts");

  const exchangeIndex = source.indexOf("exchangeCodeForSession(");
  assert.ok(exchangeIndex > -1, "the callback must exchange the auth code");

  const afterExchange = source.slice(exchangeIndex);

  // A PKCE code is single-use: when the same callback is delivered twice the
  // second exchange answers `flow_state_not_found` while the visitor is already
  // signed in. So the *only* failure redirect that may follow the exchange must
  // be gated on a session check — never returned unconditionally.
  const failureRedirects =
    afterExchange.split("new URL(failurePath, appBaseUrl)").length - 1;
  assert.equal(
    failureRedirects,
    1,
    "exactly one failure redirect may follow the exchange",
  );

  const sessionCheckIndex = afterExchange.indexOf(
    "await supabase.auth.getUser()",
  );
  const failureIndex = afterExchange.indexOf("new URL(failurePath, appBaseUrl)");
  assert.ok(
    sessionCheckIndex > -1 && sessionCheckIndex < failureIndex,
    "the failure redirect must follow a session check, so a live session never lands on the failure page",
  );

  // Both the error-recovery exit and the normal exit end on the audience
  // destination rather than the login screen.
  assert.match(
    afterExchange,
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
