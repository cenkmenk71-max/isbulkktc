import assert from "node:assert/strict";
import test from "node:test";

import { callbackIsAllowed, detectDeployedCaptcha, evaluateCaptchaProbe, isDirectRun, turnstileSiteKeyInBundle } from "./verify-auth-config.mjs";

const ORIGIN = "https://isbulkktc.com";

test("a bare-origin allowlist entry does not cover the callback path", () => {
  // GoTrue compiles each entry with glob.MustCompile(uri, '.', '/'), so the
  // separator characters are `.` and `/`: a bare origin matches only itself and
  // `/auth/callback` spans separators. Accepting it reported a missing callback
  // entry as healthy.
  assert.equal(callbackIsAllowed(ORIGIN, ORIGIN), false);
  assert.equal(callbackIsAllowed(ORIGIN, `${ORIGIN}/`), false);
});

test("the exact callback path or the globstar covers the callback", () => {
  assert.equal(callbackIsAllowed(ORIGIN, `${ORIGIN}/auth/callback`), true);
  assert.equal(callbackIsAllowed(ORIGIN, `${ORIGIN}/**`), true);
  assert.equal(
    callbackIsAllowed(ORIGIN, `http://localhost:3000/**,${ORIGIN}/auth/callback`),
    true,
  );
});

test("an unrelated or missing allowlist does not cover the callback", () => {
  assert.equal(callbackIsAllowed(ORIGIN, "http://localhost:3000/**"), false);
  assert.equal(callbackIsAllowed(ORIGIN, "https://www.isbulkktc.com/auth/callback"), false);
  assert.equal(callbackIsAllowed(ORIGIN, undefined), false);
});

test("the captcha probe reads GoTrue's answer, not just the status", () => {
  // A wrong secret makes every auth request fail: GoTrue answers
  // `captcha_failed` with `invalid-input-secret`.
  assert.equal(
    evaluateCaptchaProbe(400, { error_code: "captcha_failed", msg: "invalid-input-secret" }).state,
    "invalid-secret",
  );
  // A valid secret rejects only our fake token — the healthy answer.
  assert.equal(
    evaluateCaptchaProbe(400, { error_code: "captcha_failed", msg: "invalid-input-response" }).state,
    "valid",
  );
  // No `captcha_failed` on a 4xx means captcha is not enforced.
  assert.equal(evaluateCaptchaProbe(200, {}).state, "disabled");
});

test("a rate-limited captcha probe is unreachable, not a false pass", () => {
  // Regression: the `200 <= status < 500` branch read a 429 as `disabled`, so a
  // throttled run reported "captcha is not enforced" without testing anything.
  // Supabase Auth answers 429 when a rate limit is exceeded.
  const throttled = evaluateCaptchaProbe(429, { msg: "Too many requests" });
  assert.equal(throttled.state, "unreachable");
  assert.equal(throttled.ok, false);
  // A 5xx is likewise inconclusive.
  assert.equal(evaluateCaptchaProbe(503, {}).state, "unreachable");
});

test("the direct-run guard fires even when the script path holds a space or #", () => {
  // The naive `file://${argv[1]}` guard never equals `import.meta.url` when the
  // path holds a space or `#`, so `node`-invoked runs exited 0 having verified
  // nothing. `pathToFileURL` percent-encodes both, so the guard matches.
  const url = "file:///tmp/verify%23guard%20x/verify-auth-config.mjs";
  assert.equal(isDirectRun(url, "/tmp/verify#guard x/verify-auth-config.mjs"), true);
  assert.equal(isDirectRun("file:///repo/scripts/verify-auth-config.mjs", "/repo/scripts/verify-auth-config.mjs"), true);
  assert.equal(isDirectRun(url, undefined), false);
  assert.equal(isDirectRun(url, ""), false);
  assert.equal(isDirectRun("file:///repo/scripts/other.mjs", "/repo/scripts/verify-auth-config.mjs"), false);
});

test("the deployed captcha state is read from the bundle, not the local env var", () => {
  // Regression: the guard reported "captcha is disabled" whenever the *local*
  // `NEXT_PUBLIC_TURNSTILE_SITE_KEY` was empty, but production is built by
  // Vercel with its own environment. A live widget was therefore reported as
  // off. The deployed bundle is the only evidence of what actually shipped.
  const key = "0x4AAAAAAFL-yuC1YeNRT3FB";
  const loader = 'loadTurnstileScript(){s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"}';
  assert.equal(turnstileSiteKeyInBundle(`${loader}key="${key}"`), key);
  // The SDK URL without a key still proves a key is configured (minified form).
  assert.equal(turnstileSiteKeyInBundle(loader), "(present)");
  // A bundle that never mentions Turnstile is a genuine "no captcha".
  assert.equal(turnstileSiteKeyInBundle("const x=1;"), null);
  assert.equal(turnstileSiteKeyInBundle(null), null);
});

test("detectDeployedCaptcha follows the login page into its chunks", async () => {
  const key = "0x4AAAAAAFL-yuC1YeNRT3FB";
  const html = '<script src="/_next/static/chunks/app.js"></script>';
  const fetchImpl = async (url) => ({
    status: 200,
    text: async () =>
      url.endsWith("/login")
        ? html
        : `s.src="https://challenges.cloudflare.com/turnstile/v0/api.js";k="${key}"`,
  });
  const found = await detectDeployedCaptcha("https://isbulkktc.com", fetchImpl);
  assert.equal(found.checked, true);
  assert.equal(found.siteKey, key);

  // A login page that will not load is "could not tell", never "captcha is off".
  const unreachable = await detectDeployedCaptcha("https://isbulkktc.com", async () => ({
    status: 503,
    text: async () => "",
  }));
  assert.equal(unreachable.checked, false);
});
