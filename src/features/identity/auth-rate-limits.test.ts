import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  passwordResetThrottle,
  resendConfirmationThrottle,
  signInThrottle,
  signUpThrottle,
} from "./auth-rate-limits";

const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

/** The text of a top-level `export async function <name>(…) { … }`. */
function exportedFunctionText(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `actions.ts no longer declares ${name}`);
  const next = source.indexOf("\nexport ", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

test("the sign-in address budget caps one origin but tolerates a shared egress", () => {
  signInThrottle.address.clear();
  const allowed = Array.from({ length: 30 }, () =>
    signInThrottle.address.check("ip:1.2.3.4"),
  );
  assert.ok(allowed.every((result) => result.ok), "30 attempts should fit");
  assert.equal(signInThrottle.address.check("ip:1.2.3.4").ok, false);
  // A different address has its own bucket and is not collateral damage.
  assert.equal(signInThrottle.address.check("ip:5.6.7.8").ok, true);
});

test("the sign-in email budget is the tight, per-account one", () => {
  signInThrottle.email.clear();
  const allowed = Array.from({ length: 10 }, () =>
    signInThrottle.email.check("email:a@example.com"),
  );
  assert.ok(allowed.every((result) => result.ok), "10 attempts should fit");
  assert.equal(signInThrottle.email.check("email:a@example.com").ok, false);
  // Another account is unaffected.
  assert.equal(signInThrottle.email.check("email:b@example.com").ok, true);
});

test("the password-reset budgets bound both the origin and the victim mailbox", () => {
  passwordResetThrottle.address.clear();
  passwordResetThrottle.email.clear();

  const perIp = Array.from({ length: 10 }, () =>
    passwordResetThrottle.address.check("ip:1.2.3.4"),
  );
  assert.ok(perIp.every((result) => result.ok), "10 resets from one IP should fit");
  assert.equal(passwordResetThrottle.address.check("ip:1.2.3.4").ok, false);

  const perEmail = Array.from({ length: 5 }, () =>
    passwordResetThrottle.email.check("email:a@example.com"),
  );
  assert.ok(perEmail.every((result) => result.ok), "5 resets to one inbox should fit");
  assert.equal(passwordResetThrottle.email.check("email:a@example.com").ok, false);
});

test("requestPasswordReset consults the reset limiter", () => {
  const body = exportedFunctionText(actions, "requestPasswordReset");
  assert.match(body, /passwordResetThrottle\.address\.check/);
  assert.match(body, /passwordResetThrottle\.email\.check/);
});

test("signIn throttles before it reaches Supabase", () => {
  const body = exportedFunctionText(actions, "signIn");
  const throttle = body.indexOf("signInThrottle");
  const call = body.indexOf("signInWithPassword");
  assert.ok(throttle > -1, "signIn no longer consults signInThrottle");
  assert.ok(call > -1, "signIn no longer calls signInWithPassword");
  assert.ok(
    throttle < call,
    "the throttle must run before the credential check, not after",
  );
});

test("requestPasswordReset throttles before it mails", () => {
  const body = exportedFunctionText(actions, "requestPasswordReset");
  const throttle = body.indexOf("passwordResetThrottle");
  const call = body.indexOf("resetPasswordForEmail");
  assert.ok(throttle > -1, "requestPasswordReset no longer consults the throttle");
  assert.ok(call > -1, "requestPasswordReset no longer calls resetPasswordForEmail");
  assert.ok(throttle < call, "the throttle must run before the mail is sent");
});

test("throttling reuses the generic failure copy, not a distinct signal", () => {
  // A dedicated "too many attempts" message would confirm to a scripted caller
  // that it tripped the limit; the feedback/sales actions avoid that, and so do
  // these. The throttled state must reuse an existing failure message.
  assert.match(
    actions,
    /const throttledSignIn[\s\S]*?message: "signInFailed"/,
    "throttledSignIn must reuse the generic signInFailed copy",
  );
  assert.match(
    actions,
    /const throttledReset[\s\S]*?message: "resetRequestFailed"/,
    "throttledReset must reuse the generic resetRequestFailed copy",
  );
  assert.match(
    actions,
    /const throttledSignUp[\s\S]*?message: "signUpFailed"/,
    "throttledSignUp must reuse the generic signUpFailed copy",
  );
  assert.match(
    actions,
    /const throttledResend[\s\S]*?message: "resendFailed"/,
    "throttledResend must reuse the generic resendFailed copy",
  );
});

// #505 — the two mail-fan-out siblings of the credential endpoints.

test("the sign-up budgets bound both the origin and the victim mailbox", () => {
  signUpThrottle.address.clear();
  signUpThrottle.email.clear();

  const perIp = Array.from({ length: 10 }, () =>
    signUpThrottle.address.check("ip:1.2.3.4"),
  );
  assert.ok(perIp.every((result) => result.ok), "10 sign-ups from one IP should fit");
  assert.equal(signUpThrottle.address.check("ip:1.2.3.4").ok, false);

  const perEmail = Array.from({ length: 5 }, () =>
    signUpThrottle.email.check("email:a@example.com"),
  );
  assert.ok(perEmail.every((result) => result.ok), "5 sign-ups to one inbox should fit");
  assert.equal(signUpThrottle.email.check("email:a@example.com").ok, false);
});

test("the resend budgets bound both the origin and the victim mailbox", () => {
  resendConfirmationThrottle.address.clear();
  resendConfirmationThrottle.email.clear();

  const perIp = Array.from({ length: 10 }, () =>
    resendConfirmationThrottle.address.check("ip:1.2.3.4"),
  );
  assert.ok(perIp.every((result) => result.ok), "10 resends from one IP should fit");
  assert.equal(resendConfirmationThrottle.address.check("ip:1.2.3.4").ok, false);

  const perEmail = Array.from({ length: 5 }, () =>
    resendConfirmationThrottle.email.check("email:a@example.com"),
  );
  assert.ok(perEmail.every((result) => result.ok), "5 resends to one inbox should fit");
  assert.equal(resendConfirmationThrottle.email.check("email:a@example.com").ok, false);
});

test("signUp throttles before it mails a confirmation link", () => {
  const body = exportedFunctionText(actions, "signUp");
  const throttle = body.indexOf("signUpThrottle");
  const call = body.indexOf("supabase.auth.signUp");
  assert.ok(throttle > -1, "signUp no longer consults signUpThrottle");
  assert.ok(call > -1, "signUp no longer calls supabase.auth.signUp");
  assert.ok(throttle < call, "the throttle must run before the confirmation mail");
});

test("resendConfirmation throttles before it re-mails", () => {
  const body = exportedFunctionText(actions, "resendConfirmation");
  const throttle = body.indexOf("resendConfirmationThrottle");
  const call = body.indexOf("supabase.auth.resend");
  assert.ok(throttle > -1, "resendConfirmation no longer consults the throttle");
  assert.ok(call > -1, "resendConfirmation no longer calls supabase.auth.resend");
  assert.ok(throttle < call, "the throttle must run before the confirmation mail");
});
