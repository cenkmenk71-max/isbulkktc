import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The two mail-fan-out credential endpoints that `auth-throttle-surface.test.ts`
 * does not cover: `signUp` and `resendConfirmation`.
 *
 * `auth-throttle-surface.test.ts` pins a throttle on the two endpoints #418 §7
 * names by hand ("giriş denemesi, şifre sıfırlama talebi" = `signIn`,
 * `requestPasswordReset`). Two siblings send mail to an address the caller
 * chooses and carry **no** session gate and **no** throttle:
 *
 *   - `signUp` (`src/features/identity/actions.ts`) calls
 *     `supabase.auth.signUp`, which mails a confirmation link to the submitted
 *     address, and fans out `sendWelcomeEmail` once a session comes back.
 *   - `resendConfirmation` calls `supabase.auth.resend`, which mails the
 *     confirmation link again — by design to an arbitrary address.
 *
 * Neither calls `getUser()`: a caller needs only the publishable key, the same
 * posture that made #139 real for the anonymous write RPCs and #457 real for
 * `signIn`/`requestPasswordReset`. The hosted project does not enforce its
 * captcha (see `docs/threat-model.md`, "Açık bulgular"), so the Turnstile token
 * the forms carry is not a bound either. The result is an unbounded
 * confirmation-mail fan-out: one HTTP call per victim address, one inbox
 * flooded, and the Resend send quota spent.
 *
 * The gates below mirror `auth-throttle-surface.test.ts`: a matcher self-test so
 * a narrowed matcher cannot pass vacuously, a function-extractor self-test, and
 * one test per endpoint. The auth layer bound an address/e-mail throttle to both
 * endpoints (#505), so the two endpoint gates are promoted to real gates.
 */

const actionsPath = "src/features/identity/actions.ts";
const actions = readFileSync(
  new URL(`../../${actionsPath}`, import.meta.url),
  "utf8",
);

/**
 * The text of a top-level `export async function <name>(…) { … }`, from its
 * declaration to the next top-level export. The auth actions are plain
 * top-level functions, so the next `\nexport ` is a safe boundary.
 */
function exportedFunctionText(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `${actionsPath} no longer declares ${name}`);
  const next = source.indexOf("\nexport ", start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

/**
 * A control reference: a limiter, a throttle, or a DB-side quota call. Kept
 * intentionally wide so the gate accepts any reasonable mechanism while still
 * rejecting "no control at all".
 */
const throttleReference =
  /rateLimit|RateLimiter|createRateLimiter|throttle|consumeAnonWriteQuota/i;

test("the mail-endpoint throttle matcher recognises a control (self-test)", () => {
  // Guards the guard: if the matcher is narrowed so it never matches, the gates
  // below would pass vacuously. These are the shapes a fix could ship.
  assert.equal(throttleReference.test("signUpThrottle.email.check(email)"), true);
  assert.equal(throttleReference.test("await consumeAnonWriteQuota("), true);
  assert.equal(
    throttleReference.test("const { error } = await supabase.auth.resend({"),
    false,
  );
});

test("the function extractor returns the named body, not the whole file (self-test)", () => {
  const synthetic = [
    "export async function alpha() { return 1; }",
    "export async function beta() { return throttleCheck(); }",
  ].join("\n");
  const alpha = exportedFunctionText(synthetic, "alpha");
  assert.ok(alpha.includes("return 1"));
  assert.ok(!alpha.includes("throttleCheck"));
  assert.ok(exportedFunctionText(synthetic, "beta").includes("throttleCheck"));
});

/**
 * Drop `//` line comments and block comments before matching. Without this the
 * gates are satisfied by prose: the `// Throttle before the mail fan-out.`
 * comment sits above `supabase.auth.signUp`, so a body whose *control* had been
 * moved below the mail call still reported a control offset above it — the
 * ordering gate passed vacuously (caught by mutation, #514).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * The abuse control must run *before* the mail fan-out, not merely appear in the
 * body. A refactor that moved the limiter below `supabase.auth.signUp`/`resend`
 * would let every rejected call still spend one mail send — a presence-only gate
 * would stay green. Returns the byte offset of the first control reference in the
 * comment-stripped body, or -1 when there is none.
 */
function firstThrottleOffset(body: string): number {
  return stripComments(body).search(throttleReference);
}

test("the ordering helper reports the control position, not just presence (self-test)", () => {
  const guarded =
    "export async function alpha() {\n  if (!signUpThrottle.address.check(x).ok) return;\n  await supabase.auth.signUp({});\n}";
  const body = exportedFunctionText(guarded, "alpha");
  assert.ok(firstThrottleOffset(body) > -1);
  assert.ok(firstThrottleOffset(body) < body.indexOf("supabase.auth.signUp"));
  // A body with no control at all must report -1, not 0, so the ordering gate
  // below cannot pass vacuously on an empty match.
  assert.equal(firstThrottleOffset("export async function beta() {}"), -1);
});

test("a control word that appears only in a comment does not count (self-test)", () => {
  const commented =
    "export async function gamma() {\n  // Throttle before the mail fan-out.\n  await supabase.auth.signUp({});\n}";
  const body = exportedFunctionText(commented, "gamma");
  assert.equal(firstThrottleOffset(body), -1);
  assert.equal(throttleReference.test(stripComments(body)), false);
});

test(
  "sign-up carries an abuse control before it mails a confirmation link",
  () => {
    const body = exportedFunctionText(actions, "signUp");
    // Non-vacuity: the endpoint we are talking about must still be the one here.
    assert.ok(
      body.includes("supabase.auth.signUp"),
      `${actionsPath} signUp no longer calls supabase.auth.signUp`,
    );
    assert.ok(
      throttleReference.test(stripComments(body)),
      "signUp does not consult any rate limiter before Supabase mails the confirmation link",
    );
    // Both offsets must come from the same (comment-stripped) text: comparing a
    // stripped offset against the raw `indexOf` mixes coordinate systems and
    // passes vacuously once a comment precedes the call (caught by mutation).
    const stripped = stripComments(body);
    assert.ok(
      stripped.search(throttleReference) < stripped.indexOf("supabase.auth.signUp"),
      "signUp consults the rate limiter only after calling supabase.auth.signUp, so a throttled call still sends one confirmation mail",
    );
  },
);

test(
  "resending the confirmation mail carries an abuse control",
  () => {
    const body = exportedFunctionText(actions, "resendConfirmation");
    assert.ok(
      body.includes("supabase.auth.resend"),
      `${actionsPath} resendConfirmation no longer calls supabase.auth.resend`,
    );
    assert.ok(
      throttleReference.test(stripComments(body)),
      "resendConfirmation does not consult any rate limiter before Supabase mails the confirmation link",
    );
    const stripped = stripComments(body);
    assert.ok(
      stripped.search(throttleReference) < stripped.indexOf("supabase.auth.resend"),
      "resendConfirmation consults the rate limiter only after calling supabase.auth.resend, so a throttled call still sends one confirmation mail",
    );
  },
);
