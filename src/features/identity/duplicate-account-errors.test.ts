import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { messageForAuthErrorCode } from "./auth-errors";

// GoTrue reports a duplicate registration under more than one code. The empty
// `identities` obfuscation covers a second password sign-up while confirmations
// are on, but the dedicated codes still surface: `email_exists` /
// `user_already_exists` when the duplicate is detected outright, and
// `email_conflict_identity_not_deletable` / `identity_already_exists` when an
// OAuth identity lands on an address that already has an account. Falling
// through to `signUpFailed` reads as "your details were wrong" and invites a
// retry that cannot succeed, which is the duplicate-account confusion the owner
// reported.

test("every GoTrue duplicate-account code maps to the already-registered message", () => {
  for (const code of [
    "email_exists",
    "user_already_exists",
    "identity_already_exists",
    "email_conflict_identity_not_deletable",
  ]) {
    assert.equal(
      messageForAuthErrorCode(code, "signUpFailed"),
      "emailAlreadyRegistered",
      `${code} must map to emailAlreadyRegistered, not the generic failure`,
    );
  }
});

test("unrelated codes still fall through to the caller's fallback", () => {
  // `weak_password` now has its own copy (a too-weak password is actionable), so
  // it is no longer an example of a pass-through code.
  assert.equal(
    messageForAuthErrorCode("over_email_send_rate_limit", "signUpFailed"),
    "signUpFailed",
  );
  assert.equal(
    messageForAuthErrorCode("unexpected_failure", "signUpFailed"),
    "signUpFailed",
  );
  assert.equal(messageForAuthErrorCode(undefined, "signUpFailed"), "signUpFailed");
});

test("the already-registered message exists in all six locales", () => {
  for (const language of ["tr", "en", "ru", "el", "fa", "de"]) {
    const catalog = JSON.parse(
      readFileSync(
        new URL(`../../messages/${language}.json`, import.meta.url),
        "utf8",
      ),
    ) as { AuthForms: { messages: Record<string, string> } };
    const copy = catalog.AuthForms.messages.emailAlreadyRegistered;
    assert.equal(typeof copy, "string", `${language}: emailAlreadyRegistered missing`);
    assert.ok(copy.length > 20, `${language}: emailAlreadyRegistered looks like a placeholder`);
  }
});
