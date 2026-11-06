import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

/**
 * The auth actions directory, scanned rather than pinned to one file.
 *
 * The token-forwarding half of this suite originally read only
 * `src/features/identity/actions.ts`. A new action file (a passwordless
 * `signInWithOtp`, a second reset form) that called a captcha-protected
 * Supabase method without forwarding the token would have shipped green — the
 * exact silent regression this suite exists to catch. Discovery closes it.
 */
const identityDir = new URL("../../src/features/identity/", import.meta.url);

/** Every `.ts` file under `src/features/identity/`, with its source. */
function identitySources(): { file: string; source: string }[] {
  return (readdirSync(identityDir, { recursive: true }) as string[])
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
    .sort()
    .map((entry) => ({
      file: `src/features/identity/${entry}`,
      source: readFileSync(new URL(entry, identityDir), "utf8"),
    }));
}

/**
 * The flows whose Supabase call accepts a captcha token, i.e. the auth forms the
 * project enables Turnstile protection for. A property of this repository's
 * configuration, not of the SDK (which accepts the token on more methods).
 */
const captchaProtectedCalls = [
  "signInWithPassword",
  "signUp",
  "resend",
  "resetPasswordForEmail",
] as const;

/**
 * Every argument block of `supabase.auth.<call>(...)` in `source`, each balanced
 * to its own close. Returning all occurrences (not just the first) matters: a
 * file with two `signUp` calls — one forwarding the token, one not — would
 * otherwise pass on the strength of the first.
 */
function authCallBlocks(source: string, call: string): string[] {
  const needle = `supabase.auth.${call}(`;
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(needle, from);
    if (start === -1) break;
    let depth = 0;
    let end = -1;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    // An unbalanced call (a truncated file, or the needle inside a string) has no
    // close: take the rest and stop, so a malformed source fails the assertion
    // instead of spinning the suite forever.
    if (end === -1) {
      blocks.push(source.slice(start));
      break;
    }
    blocks.push(source.slice(start, end));
    from = end;
  }
  return blocks;
}

test("every captcha-protected auth flow forwards the token to Supabase", () => {
  const offenders: string[] = [];
  let found = 0;
  for (const { file, source } of identitySources()) {
    for (const call of captchaProtectedCalls) {
      for (const block of authCallBlocks(source, call)) {
        found += 1;
        if (!/captchaToken\s*:\s*result\.data\.captchaToken/.test(block)) {
          offenders.push(`${file}: ${call} (does not pass captchaToken)`);
        }
      }
    }
  }
  assert.ok(found > 0, "no captcha-protected auth call was found at all");
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
  const protectedCalls = captchaProtectedCalls.reduce(
    (sum, call) => sum + authCallBlocks(actions, call).length,
    0,
  );
  assert.equal(
    reads,
    protectedCalls,
    `expected ${protectedCalls} captcha reads (one per protected flow), found ${reads}`,
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

test("the auth-call block extractor is balanced and returns every occurrence (self-test)", () => {
  // Guards the guard: a naive slice to the next `)` would miss a token that sits
  // after a nested `emailRedirectTo: new URL(...)` call, and a first-only scan
  // would pass a file whose second call drops the token.
  const source = 'const x = supabase.auth.signUp({ email, options: { redirect: new URL("/a"), captchaToken: result.data.captchaToken } });';
  const blocks = authCallBlocks(source, "signUp");
  assert.equal(blocks.length, 1, "the extractor found the wrong number of blocks");
  assert.match(blocks[0]!, /captchaToken\s*:\s*result\.data\.captchaToken/);
  assert.equal(authCallBlocks(source, "doesNotExist").length, 0);

  // Two calls in one file: the second omits the token, so the scan must see both.
  const twoCalls =
    'supabase.auth.signUp({ options: { captchaToken: result.data.captchaToken } });' +
    'supabase.auth.signUp({ options: {} });';
  const both = authCallBlocks(twoCalls, "signUp");
  assert.equal(both.length, 2, "the second call was not discovered");
  assert.ok(!/captchaToken/.test(both[1]!), "the second block should be the unguarded one");

  // An unbalanced call must terminate, not loop forever: a truncated file would
  // otherwise hang CI instead of failing it.
  const unbalanced = authCallBlocks("supabase.auth.signUp({ email:", "signUp");
  assert.equal(unbalanced.length, 1);
  assert.match(unbalanced[0]!, /signUp\(\{ email:$/);
});
