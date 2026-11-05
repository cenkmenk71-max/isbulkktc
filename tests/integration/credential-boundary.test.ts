import assert from "node:assert/strict";
import test from "node:test";

import {
  authMethods,
  fakeAuthUser,
  installBoundaryMocks,
  isRedirect,
  recorded,
  resetBoundary,
} from "./support/harness";

installBoundaryMocks();

/**
 * Credential changes, exercised through the real identity actions.
 *
 * The rest of this layer covers the *data* boundary (which table a write reaches,
 * with whose id). A password change is a different kind of action: it touches no
 * business table at all, it calls `auth.updateUser`. So the assertion has to be on
 * the GoTrue call log, not on a row — "the action returned success" cannot tell
 * "the password was changed" from "the action returned success and changed
 * nothing". `authMethods()` records those calls (harness change, same PR).
 *
 * The invariant that matters: a credential change requires a live session, and a
 * rejected one must not reach `updateUser`.
 */

const ID = "00000000-0000-4000-8000-000000000001";

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function passwordForm(values: Record<string, string> = {}): FormData {
  return form({ password: "Str0ng-Passw0rd!", locale: "tr", ...values });
}

async function loadIdentityActions() {
  return import("../../src/features/identity/actions");
}

test("an anonymous password change is refused and never reaches updateUser", async () => {
  resetBoundary({ user: undefined });

  const { updatePassword } = await loadIdentityActions();
  const state = await updatePassword(
    { status: "idle", message: "idle" } as never,
    passwordForm(),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "sessionExpired");
  assert.equal(
    authMethods().includes("updateUser"),
    false,
    `a session-less caller must not reach updateUser: ${authMethods().join(", ")}`,
  );
  assert.deepEqual(recorded.redirects, [], "a refused change must not redirect as if it succeeded");
});

test("a signed-in caller reaches updateUser and is signed out, then redirected", async () => {
  resetBoundary({ user: fakeAuthUser({ id: ID }) });

  const { updatePassword } = await loadIdentityActions();
  await assert.rejects(
    () => updatePassword({ status: "idle", message: "idle" } as never, passwordForm()),
    (error: unknown) => isRedirect(error),
    "a completed change redirects to the sign-in page",
  );

  const methods = authMethods();
  assert.ok(methods.includes("updateUser"), `the password change must reach updateUser: ${methods.join(", ")}`);
  assert.ok(methods.includes("signOut"), `the session must be revoked after the change: ${methods.join(", ")}`);
  // Order matters: the password is changed before the session is dropped.
  assert.ok(
    methods.indexOf("updateUser") < methods.indexOf("signOut"),
    `updateUser must precede signOut: ${methods.join(", ")}`,
  );
  assert.deepEqual(recorded.redirects, ["/login?reset=1"]);
});

test("a malformed password is rejected before any auth call", async () => {
  resetBoundary({ user: fakeAuthUser({ id: ID }) });

  const { updatePassword } = await loadIdentityActions();
  const state = await updatePassword(
    { status: "idle", message: "idle" } as never,
    passwordForm({ password: "short" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "invalid");
  assert.deepEqual(authMethods(), [], "schema rejection must precede the auth client call");
});

test("a failed password change is reported, not swallowed", async () => {
  resetBoundary({
    user: fakeAuthUser({ id: ID }),
    authError: { code: "weak_password", message: "Password is too weak" },
  });

  const { updatePassword } = await loadIdentityActions();
  const state = await updatePassword(
    { status: "idle", message: "idle" } as never,
    passwordForm(),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "passwordUpdateFailed");
  // The session is only dropped when the change actually succeeded.
  assert.equal(
    authMethods().includes("signOut"),
    false,
    `a failed change must not sign the user out: ${authMethods().join(", ")}`,
  );
});
