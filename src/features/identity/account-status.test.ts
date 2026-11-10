import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isAccountBlocked } from "./account-status";

// `profiles.status` is the account kill switch. Sign-in must refuse a
// non-active account and let every other value through — an unrecognised or
// missing value is not a suspension, and inventing one would lock out
// legitimate visitors.
test("a suspended or closed profile is blocked", () => {
  assert.equal(isAccountBlocked("suspended"), true);
  assert.equal(isAccountBlocked("closed"), true);
});

test("an active profile may sign in", () => {
  assert.equal(isAccountBlocked("active"), false);
});

test("a missing or unrecognised status does not block the visitor", () => {
  for (const status of [null, undefined, "", "ACTIVE", "pending", "deleted"]) {
    assert.equal(
      isAccountBlocked(status),
      false,
      `status ${JSON.stringify(status)} must not block sign-in`,
    );
  }
});

// The status read and the kill-switch call must both sit inside `signIn`,
// after the credential check and before any redirect. A refactor that drops
// the read, or moves a redirect ahead of it, would mint a session for a
// suspended account again — the exact gap this closes.
test("signIn reads profiles.status and blocks before redirecting", () => {
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const signIn = source.match(/export async function signIn\b[\s\S]*?\n\}/);
  assert.ok(signIn, "signIn is not defined");

  const body = signIn[0];
  const readAt = body.indexOf('.from("profiles")');
  const checkAt = body.indexOf("isAccountBlocked(");
  const blockedPathAt = body.indexOf("resolveAccountBlockedPath(");
  const redirectAt = body.lastIndexOf("redirect(resolveAuthDestination(");

  assert.ok(readAt > -1, "signIn does not read profiles.status");
  assert.ok(checkAt > -1, "signIn does not apply the account kill switch");
  assert.ok(redirectAt > -1, "signIn no longer redirects on success");
  assert.ok(
    readAt < checkAt && checkAt < redirectAt,
    "the status read and check must run before the success redirect",
  );

  // The blocked branch must drop the freshly minted session and route the
  // visitor to the login page's inactive branch, or the cookie survives the
  // refusal and the visitor sees nothing.
  assert.ok(
    blockedPathAt > -1 && blockedPathAt < redirectAt,
    "a blocked sign-in must redirect to the inactive-account branch",
  );
  const signOutCalls = body.match(/await supabase\.auth\.signOut\(\)/g) ?? [];
  assert.ok(
    signOutCalls.length >= 2,
    "a refused sign-in must sign the session out (read failure and non-active)",
  );
});
