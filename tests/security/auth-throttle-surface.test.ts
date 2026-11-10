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
 * This suite pins a control *before* the Supabase credential call, the same
 * ordering contract `auth-mail-throttle-surface.test.ts` holds for the mail
 * fan-out endpoints. It does not pin the mechanism: any limiter reference
 * satisfies it. A presence-only gate is not enough — LANE-AUTH landed the control
 * in `src/features/identity/auth-rate-limits.ts`, but a refactor that moved the
 * limiter *below* `signInWithPassword`/`resetPasswordForEmail` would still satisfy
 * presence while letting every rejected attempt reach the credential check. The
 * ordering gate below closes that (the mail suite caught the identical vacuity by
 * mutation in #514); it strips comments first, so the prose "Throttle before …"
 * cannot supply the offset either.
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

/**
 * Drop `//` line comments and block comments before matching. Without this the
 * gates are satisfied by prose: `signIn`'s `// Throttle before the credential
 * check.` comment sits above `signInWithPassword`, so a body whose *control* had
 * been moved below the call still reported a control offset above it — the
 * ordering gate passed vacuously (the identical bug was caught by mutation in
 * the mail suite, #514).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * The byte offset of the first control reference in the comment-stripped body,
 * or -1 when there is none. Returning -1 (not 0) for "no control" is what keeps
 * the ordering gate below from passing vacuously on an empty match.
 */
function firstThrottleOffset(body: string): number {
  return stripComments(body).search(throttleReference);
}

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

test("the ordering helper reports the control position, not just presence (self-test)", () => {
  const guarded = [
    "export async function alpha() {",
    "  if (!signInThrottle.address.check(x).ok) return;",
    "  await supabase.auth.signInWithPassword({});",
    "}",
  ].join("\n");
  const body = exportedFunctionText(guarded, "alpha");
  assert.ok(firstThrottleOffset(body) > -1);
  assert.ok(firstThrottleOffset(body) < body.indexOf("supabase.auth.signInWithPassword"));
  // A body with no control at all must report -1, not 0, so the ordering gate
  // below cannot pass vacuously on an empty match.
  assert.equal(firstThrottleOffset("export async function beta() {}"), -1);
});

test("a control word that appears only in a comment does not count (self-test)", () => {
  const commented = [
    "export async function gamma() {",
    "  // Throttle before the credential check.",
    "  await supabase.auth.signInWithPassword({});",
    "}",
  ].join("\n");
  const body = exportedFunctionText(commented, "gamma");
  assert.equal(firstThrottleOffset(body), -1);
  assert.equal(throttleReference.test(stripComments(body)), false);
});

test("sign-in carries an abuse control, not only the captcha", () => {
  const body = exportedFunctionText(actions, "signIn");
  // Non-vacuity: the endpoint we are talking about must still be the one here.
  assert.ok(
    body.includes("signInWithPassword"),
    `${actionsPath} signIn no longer calls signInWithPassword`,
  );
  assert.ok(
    throttleReference.test(stripComments(body)),
    "signIn does not consult any rate limiter before calling Supabase",
  );
  // Ordering: the limiter must run before the credential check, not merely
  // appear in the body. Both offsets come from the same (comment-stripped) text
  // so the comparison cannot mix coordinate systems.
  const stripped = stripComments(body);
  assert.ok(
    stripped.search(throttleReference) < stripped.indexOf("signInWithPassword"),
    "signIn consults the rate limiter only after calling signInWithPassword, so a throttled attempt still reaches the credential check",
  );
});

test("password-reset requests carry an abuse control, not only the captcha", () => {
  const body = exportedFunctionText(actions, "requestPasswordReset");
  assert.ok(
    body.includes("resetPasswordForEmail"),
    `${actionsPath} requestPasswordReset no longer calls resetPasswordForEmail`,
  );
  assert.ok(
    throttleReference.test(stripComments(body)),
    "requestPasswordReset does not consult any rate limiter before mailing",
  );
  const stripped = stripComments(body);
  assert.ok(
    stripped.search(throttleReference) < stripped.indexOf("resetPasswordForEmail"),
    "requestPasswordReset consults the rate limiter only after calling resetPasswordForEmail, so a throttled request still sends one reset mail",
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
