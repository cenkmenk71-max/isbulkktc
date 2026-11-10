import assert from "node:assert/strict";
import test from "node:test";

import {
  authCalls,
  authMethods,
  installBoundaryMocks,
  recorded,
  resetBoundary,
} from "./support/harness";

installBoundaryMocks();

/**
 * The two email flows that send the recipient *somewhere* rather than write a
 * row: password reset and confirmation resend.
 *
 * `updatePassword` was pinned by `credential-boundary.test.ts`, but these two
 * were not, and their contract is the redirect target — the only part of the
 * flow a user feels. The resend path shipped a hardcoded `next=candidate` that
 * landed an employer who re-verified on the candidate dashboard; the existing
 * guard for that is a source-text match in the auth layer's own test, which a
 * refactor can satisfy without the value being right. Here the real action body
 * runs and the *actual* `emailRedirectTo` / `redirectTo` is asserted.
 *
 * `tests/unit/identity-company-schemas.test.ts` already proves the schemas, so
 * these tests deliberately use valid input and assert on behaviour the unit
 * layer cannot see.
 */

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/**
 * The emailed link, split into the parts the flow owns. Parsing with `new URL`
 * also proves the link is absolute: a relative one would be resolved against the
 * request origin at send time, the same class of bug as the canonical-URL trap.
 * The origin itself is environment-dependent, so it is deliberately not asserted.
 */
function emailedLink(target: unknown): { pathname: string; search: string } {
  const url = new URL(String(target));
  return { pathname: url.pathname, search: url.search };
}

const identityActions = () => import("@/features/identity/actions");

test("a password reset emails a link to the locale-prefixed reset callback", async () => {
  resetBoundary();
  const { requestPasswordReset } = await identityActions();

  const state = await requestPasswordReset(
    { status: "idle", message: "idle" },
    form({ email: "Aday@Example.com", locale: "en" }),
  );

  assert.equal(state.status, "success");
  assert.equal(state.message, "resetRequestSent");
  // The address is normalised before it reaches GoTrue, and the link is absolute
  // with the locale prefix the request asked for.
  assert.equal(authCalls.resetPasswordForEmail?.email, "aday@example.com");
  assert.deepEqual(
    emailedLink(authCalls.resetPasswordForEmail?.options.redirectTo),
    { pathname: "/en/auth/callback", search: "?flow=reset" },
  );
});

test("the default locale gets no prefix on the reset link", async () => {
  resetBoundary();
  const { requestPasswordReset } = await identityActions();

  await requestPasswordReset(
    { status: "idle", message: "idle" },
    form({ email: "aday@example.com", locale: "tr" }),
  );

  assert.deepEqual(
    emailedLink(authCalls.resetPasswordForEmail?.options.redirectTo),
    { pathname: "/auth/callback", search: "?flow=reset" },
  );
});

test("a malformed reset request is rejected before any auth call", async () => {
  resetBoundary();
  const { requestPasswordReset } = await identityActions();

  const state = await requestPasswordReset(
    { status: "idle", message: "idle" },
    form({ email: "not-an-email", locale: "en" }),
  );

  assert.deepEqual(state, { status: "error", message: "invalid" });
  assert.deepEqual(authMethods(), [], "schema rejection must precede the auth client call");
});

test("an employer resend lands on the company dashboard, not the candidate one", async () => {
  resetBoundary();
  const { resendConfirmation } = await identityActions();

  const state = await resendConfirmation(
    { status: "idle", message: "idle" },
    form({ email: "isveren@example.com", audience: "employer", locale: "en" }),
  );

  assert.equal(state.status, "success");
  assert.equal(state.message, "verificationResent");
  assert.equal(authCalls.resend?.email, "isveren@example.com");
  assert.deepEqual(
    emailedLink(authCalls.resend?.options.emailRedirectTo),
    { pathname: "/en/auth/callback", search: "?next=company" },
  );
});

test("a candidate resend carries the candidate destination", async () => {
  resetBoundary();
  const { resendConfirmation } = await identityActions();

  await resendConfirmation(
    { status: "idle", message: "idle" },
    form({ email: "aday@example.com", audience: "candidate", locale: "en" }),
  );

  assert.deepEqual(
    emailedLink(authCalls.resend?.options.emailRedirectTo),
    { pathname: "/en/auth/callback", search: "?next=candidate" },
  );
});

test("a resend without an audience is rejected before any auth call", async () => {
  resetBoundary();
  const { resendConfirmation } = await identityActions();

  const state = await resendConfirmation(
    { status: "idle", message: "idle" },
    form({ email: "aday@example.com", locale: "en" }),
  );

  assert.deepEqual(state, { status: "error", message: "invalid" });
  assert.deepEqual(authMethods(), [], "schema rejection must precede the auth client call");
});

test("a captcha failure on resend maps to its own message, not a generic one", async () => {
  resetBoundary({ authError: { code: "captcha_failed" } });
  const { resendConfirmation } = await identityActions();

  const state = await resendConfirmation(
    { status: "idle", message: "idle" },
    form({ email: "aday@example.com", audience: "candidate", locale: "en" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "captchaFailed");
});

test("a rate-limited resend does not claim the mail went out", async () => {
  resetBoundary({ authError: { code: "over_email_send_rate_limit" } });
  const { resendConfirmation } = await identityActions();

  const state = await resendConfirmation(
    { status: "idle", message: "idle" },
    form({ email: "aday@example.com", audience: "candidate", locale: "en" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "resendFailed");
});

test("a failed reset request surfaces resetRequestFailed and does not redirect", async () => {
  resetBoundary({ authError: { code: "over_email_send_rate_limit" } });
  const { requestPasswordReset } = await identityActions();

  const state = await requestPasswordReset(
    { status: "idle", message: "idle" },
    form({ email: "aday@example.com", locale: "en" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "resetRequestFailed");
  assert.deepEqual(recorded.redirects, []);
});
