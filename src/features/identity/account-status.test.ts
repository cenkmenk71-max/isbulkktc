import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { accountBlockedMessage } from "./account-status";

// `profiles.status` is the account kill switch. Sign-in must refuse a
// non-active account and let every other value through — an unrecognised or
// missing value is not a suspension, and inventing one would lock out
// legitimate visitors.
test("a suspended profile is refused with its own message", () => {
  assert.equal(accountBlockedMessage("suspended"), "accountInactive");
});

test("a closed profile is refused with its own message", () => {
  assert.equal(accountBlockedMessage("closed"), "accountClosed");
});

test("an active profile may sign in", () => {
  assert.equal(accountBlockedMessage("active"), null);
});

test("a missing or unrecognised status does not block the visitor", () => {
  for (const status of [null, undefined, "", "ACTIVE", "pending", "deleted"]) {
    assert.equal(
      accountBlockedMessage(status),
      null,
      `status ${JSON.stringify(status)} must not block sign-in`,
    );
  }
});

// The status read and the kill-switch call must both sit inside `signIn`,
// after the credential check and before the redirect. A refactor that drops
// the read, or moves the redirect ahead of it, would mint a session for a
// suspended account again — the exact gap this closes.
test("signIn reads profiles.status and blocks before redirecting", () => {
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const signIn = source.match(/export async function signIn\b[\s\S]*?\n\}/);
  assert.ok(signIn, "signIn is not defined");

  const body = signIn[0];
  const readAt = body.indexOf('.from("profiles")');
  const checkAt = body.indexOf("accountBlockedMessage(");
  const redirectAt = body.lastIndexOf("redirect(resolveAuthDestination(");

  assert.ok(readAt > -1, "signIn does not read profiles.status");
  assert.ok(checkAt > -1, "signIn does not apply the account kill switch");
  assert.ok(redirectAt > -1, "signIn no longer redirects on success");
  assert.ok(
    readAt < checkAt && checkAt < redirectAt,
    "the status read and check must run before the success redirect",
  );

  // Both the read-failure and the blocked branches must drop the freshly
  // minted session before answering, or the cookie survives the refusal.
  const signOutCalls = body.match(/await supabase\.auth\.signOut\(\)/g) ?? [];
  assert.ok(
    signOutCalls.length >= 2,
    "a refused sign-in must sign the session out (read failure and non-active)",
  );
});
