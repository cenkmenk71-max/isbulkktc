import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The Turnstile (Cloudflare captcha) wiring on the auth forms.
 *
 * Supabase verifies a captcha token only when the project enables captcha
 * protection, and the app is expected to run with it on. The token reaches
 * Supabase through `options: { captchaToken }` on the auth call; the widget
 * injects the token into the form under `cf-turnstile-response`. If a refactor
 * drops either half — the read or the forward — the captcha silently stops
 * protecting the flow and nothing else fails, because the token is optional by
 * design (Supabase accepts a missing token when protection is off).
 *
 * These tests pin the wiring on the source. The unit suite pins the
 * `captcha_failed` → message mapping; this pins that the token is actually
 * carried to Supabase on every flow that Supabase captcha-protects.
 */

const actionsFile = "src/features/identity/actions.ts";
const actions = readFileSync(new URL(`../../${actionsFile}`, import.meta.url), "utf8");

/** The flows whose Supabase call accepts a captcha token. */
const captchaProtectedCalls = ["signInWithPassword", "signUp", "resend", "resetPasswordForEmail"];

/** The argument block of `supabase.auth.<call>(...)`, balanced to its close. */
function authCallBlock(source: string, call: string): string | null {
  const start = source.indexOf(`supabase.auth.${call}(`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

test("every captcha-protected auth flow forwards the token to Supabase", () => {
  const offenders: string[] = [];
  for (const call of captchaProtectedCalls) {
    const block = authCallBlock(actions, call);
    if (block === null) {
      offenders.push(`${call} (call not found)`);
      continue;
    }
    if (!/captchaToken\s*:\s*result\.data\.captchaToken/.test(block)) {
      offenders.push(`${call} (does not pass captchaToken)`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `auth flows that no longer forward the captcha token: ${offenders.join(", ")}`,
  );
});

test("every captcha-protected flow reads the token from the Turnstile field", () => {
  // One read per protected flow. A flow that forwards a token must first read it
  // from the form field the widget populates.
  const reads = [...actions.matchAll(/captchaToken:\s*readCaptchaToken\(formData\)/g)].length;
  assert.equal(
    reads,
    captchaProtectedCalls.length,
    `expected ${captchaProtectedCalls.length} captcha reads (one per protected flow), found ${reads}`,
  );
});

test("readCaptchaToken reads the widget's field name", () => {
  // The field name is the contract with the widget. It is also exported as
  // `turnstileResponseField`; the reader must agree with it.
  const turnstile = readFileSync(
    new URL("../../src/features/identity/turnstile.ts", import.meta.url),
    "utf8",
  );
  const declared = /turnstileResponseField\s*=\s*"([^"]+)"/.exec(turnstile)?.[1];
  assert.ok(declared, "turnstileResponseField is no longer declared");

  const read = /formData\.get\(\s*"([^"]+)"\s*\)/.exec(
    actions.slice(actions.indexOf("function readCaptchaToken")),
  )?.[1];
  assert.equal(
    read,
    declared,
    `readCaptchaToken reads ${JSON.stringify(read)} but the widget field is ${JSON.stringify(declared)}`,
  );
});

test("the auth-call block extractor is balanced (self-test)", () => {
  // Guards the guard: a naive slice to the next `)` would miss a token that sits
  // after a nested `emailRedirectTo: new URL(...)` call.
  const source = 'const x = supabase.auth.signUp({ email, options: { redirect: new URL("/a"), captchaToken: result.data.captchaToken } });';
  const block = authCallBlock(source, "signUp");
  assert.ok(block, "the extractor found no block");
  assert.match(block!, /captchaToken\s*:\s*result\.data\.captchaToken/);
  assert.equal(authCallBlock(source, "doesNotExist"), null);
});
