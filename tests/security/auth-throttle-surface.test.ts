import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * #418 §7 — the credential endpoints must carry their own abuse control.
 *
 * `signIn` and `requestPasswordReset` are the two endpoints #418 names under
 * "Rate limit: giriş denemesi, şifre sıfırlama talebi". Neither ran any
 * application-level throttle, and the platform captcha is not a substitute: the
 * hosted project does not enforce one (see `docs/threat-model.md`, "Açık
 * bulgular"). A publishable key was enough to POST
 * `/auth/v1/token?grant_type=password` and `/auth/v1/recover` directly, so an
 * unlimited password guess and an unlimited reset-mail fan-out both lived one
 * HTTP call away. The server action adds no bound on top of that, which is the
 * same shape `anonymous-rpc-throttle.test.ts` closed for the anonymous write RPCs.
 *
 * This suite pins the *presence* of a control in the action, the same contract the
 * feedback/sales actions already meet through `src/features/abuse/**`. It does not
 * pin the mechanism: any limiter reference satisfies it. Ordering (throttle before
 * the Supabase call) is not asserted here; LANE-AUTH landed the control in
 * `src/features/identity/auth-rate-limits.ts`, which both actions consult before
 * the Supabase call.
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

test("the credential-endpoint throttle matcher recognises a control (self-test)", () => {
  // Guards the guard: if the matcher is narrowed so it never matches, the gate
  // below would pass vacuously. These are the shapes a fix could ship.
  assert.equal(throttleReference.test("signInRateLimiter.check(email)"), true);
  assert.equal(throttleReference.test("await consumeAnonWriteQuota("), true);
  assert.equal(
    throttleReference.test("const { error } = await supabase.auth.signInWithPassword("),
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

test("sign-in carries an abuse control, not only the captcha", () => {
  const body = exportedFunctionText(actions, "signIn");
  // Non-vacuity: the endpoint we are talking about must still be the one here.
  assert.ok(
    body.includes("signInWithPassword"),
    `${actionsPath} signIn no longer calls signInWithPassword`,
  );
  assert.ok(
    throttleReference.test(body),
    "signIn does not consult any rate limiter before calling Supabase",
  );
});

test("password-reset requests carry an abuse control, not only the captcha", () => {
  const body = exportedFunctionText(actions, "requestPasswordReset");
  assert.ok(
    body.includes("resetPasswordForEmail"),
    `${actionsPath} requestPasswordReset no longer calls resetPasswordForEmail`,
  );
  assert.ok(
    throttleReference.test(body),
    "requestPasswordReset does not consult any rate limiter before mailing",
  );
});

/**
 * CSRF posture of Server Actions.
 *
 * Next.js rejects a Server Action whose `Origin` is not the request host, so the
 * framework is the CSRF control here. That holds only while the app does not add
 * a foreign entry to `experimental.serverActions.allowedOrigins`; a single entry
 * re-opens cross-site action invocation with the visitor's cookies. This pins the
 * absence rather than trusting a future edit to remember it.
 */
const nextConfig = readFileSync(
  new URL("../../next.config.ts", import.meta.url),
  "utf8",
);

test("the Server Action origin allowlist is not widened", () => {
  const match = nextConfig.match(
    /serverActions\s*:\s*\{[\s\S]*?allowedOrigins\s*:\s*\[([\s\S]*?)\]/,
  );
  if (match === null) return; // no allowlist configured: Next.js same-origin default stands
  const entries = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith("//"));
  assert.deepEqual(
    entries,
    [],
    "serverActions.allowedOrigins must stay empty; a foreign origin re-enables cross-site Server Actions",
  );
});
