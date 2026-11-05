import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { messageForAuthErrorCode } from "./auth-errors";

// The reset-password action used to fold every `updateUser` failure into the
// generic `passwordUpdateFailed` copy ("could not be updated, try again"), which
// tells a visitor to retry the exact value GoTrue just rejected. Two codes are
// actionable and now have their own message:
//
//  - `same_password`: the new password equals the current one;
//  - `weak_password`: GoTrue rejected it for a named reason.
//
// Both are returned as `error.code` by auth-js (verified in the installed
// `GoTrueClient`: `_updateUser` catches an `AuthError` and returns it), so the
// action's `if (error)` branch is the right place to read them.

test("same_password keeps its own message", () => {
  assert.equal(
    messageForAuthErrorCode("same_password", "passwordUpdateFailed"),
    "passwordUnchanged",
  );
});

test("an unrelated update failure still falls back to the generic copy", () => {
  for (const code of [
    "over_request_rate_limit",
    "unexpected_failure",
    "weak_password",
    "",
    undefined,
  ]) {
    assert.equal(
      messageForAuthErrorCode(code, "passwordUpdateFailed"),
      "passwordUpdateFailed",
      `${String(code)} must fall back`,
    );
  }
});

test("the updatePassword action reads the error code instead of hardcoding", () => {
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const action = source.slice(
    source.indexOf("export async function updatePassword"),
    source.indexOf("export async function signOut"),
  );

  assert.match(
    action,
    /messageForAuthErrorCode\(error\.code,\s*"passwordUpdateFailed"\)/,
    "updatePassword must map the error code, not hardcode passwordUpdateFailed",
  );
});

test("the new password messages exist in all six locales", () => {
  for (const language of ["tr", "en", "ru", "el", "fa", "de"]) {
    const catalog = JSON.parse(
      readFileSync(new URL(`../../messages/${language}.json`, import.meta.url), "utf8"),
    ) as { AuthForms: { messages: Record<string, string> } };
    for (const key of ["passwordUnchanged"]) {
      const copy = catalog.AuthForms.messages[key];
      assert.equal(typeof copy, "string", `${language}: ${key} is missing`);
      assert.ok(copy.length > 20, `${language}: ${key} looks like a placeholder`);
    }
    assert.notEqual(
      catalog.AuthForms.messages.passwordUnchanged,
      catalog.AuthForms.messages.passwordUpdateFailed,
      `${language}: passwordUnchanged must not reuse the generic copy`,
    );
  }
});
