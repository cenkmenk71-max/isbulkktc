import assert from "node:assert/strict";
import test from "node:test";

import {
  callbackIsAllowed,
  evaluateCaptchaProbe,
  evaluateGoogleTokenReply,
  evaluateOAuthAuthorize,
  evaluateOAuthProviders,
  evaluateTurnstileSecret,
  looksLikeOAuthClientId,
  looksLikeTurnstileSiteKey,
  parseAdvertisedProviders,
} from "../../scripts/verify-auth-config.mjs";
import { looksLikeTurnstileSecret } from "../../scripts/set-turnstile-secret.mjs";

test("advertised providers are trimmed, de-duplicated and validated", () => {
  assert.deepEqual(parseAdvertisedProviders("google, linkedin_oidc ,facebook").providers, [
    "google",
    "linkedin_oidc",
    "facebook",
  ]);
  assert.deepEqual(parseAdvertisedProviders("google,google").providers, ["google"]);
  assert.deepEqual(parseAdvertisedProviders("google,instagram").unknown, ["instagram"]);
  assert.deepEqual(parseAdvertisedProviders("").providers, []);
  assert.deepEqual(parseAdvertisedProviders(undefined).providers, []);
});

test("a Turnstile site key is distinguished from a placeholder", () => {
  assert.equal(looksLikeTurnstileSiteKey("0x4AAAAAAFL-yuC1YeNRT3FB"), true);
  assert.equal(looksLikeTurnstileSiteKey(""), false);
  assert.equal(looksLikeTurnstileSiteKey("0x123"), false);
  assert.equal(looksLikeTurnstileSiteKey("your-site-key"), false);
});

test("a Turnstile secret key is distinguished from junk before any network call", () => {
  assert.equal(looksLikeTurnstileSecret("1x0000000000000000000000000000000AA"), true);
  assert.equal(looksLikeTurnstileSecret("80e57f1b1d0180592587b0624948ca639b36efa8ca0906fe554bfa3b5b48d70f"), true);
  assert.equal(looksLikeTurnstileSecret("kisa"), false);
  assert.equal(looksLikeTurnstileSecret(""), false);
  assert.equal(looksLikeTurnstileSecret("has space in the middle of it here"), false);
});

test("a valid secret answers invalid-input-response, an unknown one invalid-input-secret", () => {
  assert.equal(
    evaluateTurnstileSecret({ success: false, "error-codes": ["invalid-input-response"] }).ok,
    true,
  );
  const rejected = evaluateTurnstileSecret({
    success: false,
    "error-codes": ["invalid-input-secret"],
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.reason, /invalid-input-secret/);
});

test("Cloudflare's always-pass testing keys are accepted, not read as unexpected", () => {
  const testing = evaluateTurnstileSecret({ success: true, "error-codes": [] });
  assert.equal(testing.ok, true);
  assert.match(testing.reason, /accepted/);
});

test("an unexpected Cloudflare reply is a failure, not a pass", () => {
  assert.equal(evaluateTurnstileSecret(null).ok, false);
  assert.equal(evaluateTurnstileSecret({ "error-codes": ["internal-error"] }).ok, false);
});

test("the live auth probe reads the secret GoTrue actually uses", () => {
  const broken = evaluateCaptchaProbe(400, {
    error_code: "captcha_failed",
    msg: "captcha protection: request disallowed (invalid-input-secret)",
  });
  assert.equal(broken.state, "invalid-secret");
  assert.equal(broken.ok, false);

  const healthy = evaluateCaptchaProbe(400, {
    error_code: "captcha_failed",
    msg: "captcha protection: request disallowed (invalid-input-response)",
  });
  assert.equal(healthy.state, "valid");
  assert.equal(healthy.ok, true);

  const disabled = evaluateCaptchaProbe(400, {
    error_code: "invalid_credentials",
    msg: "Invalid login credentials",
  });
  assert.equal(disabled.state, "disabled");
  assert.equal(disabled.ok, true);

  const odd = evaluateCaptchaProbe(400, {
    error_code: "captcha_failed",
    msg: "captcha protection: request disallowed (something-else)",
  });
  assert.equal(odd.ok, false);
});

test("the live OAuth probe reads the authorize redirect", () => {
  assert.equal(
    evaluateOAuthAuthorize("google", 302, "https://accounts.google.com/o/oauth2/v2/auth?x=1").ok,
    true,
  );
  assert.equal(
    evaluateOAuthAuthorize("linkedin_oidc", 302, "https://www.linkedin.com/oauth/v2/authorization").ok,
    true,
  );
  // A redirect to an unexpected host is not proof of a working provider.
  assert.equal(evaluateOAuthAuthorize("google", 302, "https://evil.example/auth").ok, false);
  // An unconfigured provider answers 400.
  assert.equal(evaluateOAuthAuthorize("google", 400, null).ok, false);
});

test("an advertised provider must be enabled with a client id", () => {
  const config = {
    external_google_enabled: true,
    external_google_client_id: "1021802173200-3atqa9tdtsqjppm0j9uqjc9gnrrjls4i.apps.googleusercontent.com",
    external_linkedin_oidc_enabled: false,
    external_linkedin_oidc_client_id: null,
    external_facebook_enabled: true,
    external_facebook_client_id: "",
  };

  const problems = evaluateOAuthProviders(
    ["google", "linkedin_oidc", "facebook"],
    config,
  );
  assert.equal(problems.length, 2);
  assert.match(problems.join(" "), /linkedin_oidc is advertised but disabled/);
  assert.match(problems.join(" "), /facebook is enabled but has no client id/);
});

test("a placeholder client id is reported instead of passing as configured", () => {
  // LinkedIn and Facebook were stored as "ISBULKKTC" — enabled, non-empty, and
  // therefore green under the emptiness check, while the live authorize endpoint
  // forwarded that literal to the provider.
  const config = {
    external_linkedin_oidc_enabled: true,
    external_linkedin_oidc_client_id: "ISBULKKTC",
    external_facebook_enabled: true,
    external_facebook_client_id: "ISBULKKTC",
  };
  const problems = evaluateOAuthProviders(["linkedin_oidc", "facebook"], config);
  assert.equal(problems.length, 2);
  assert.match(problems.join(" "), /linkedin_oidc is enabled but its client id "ISBULKKTC" looks like a placeholder/);
  assert.match(problems.join(" "), /facebook is enabled but its client id "ISBULKKTC" looks like a placeholder/);

  assert.equal(looksLikeOAuthClientId("linkedin_oidc", "ISBULKKTC"), false);
  assert.equal(looksLikeOAuthClientId("facebook", ""), false);
  assert.equal(looksLikeOAuthClientId("facebook", "short"), false);
  assert.equal(looksLikeOAuthClientId("linkedin_oidc", "78a1b2c3d4e5"), true);
  assert.equal(looksLikeOAuthClientId("facebook", "1234567890123456"), true);
});

test("a fully configured provider set passes", () => {
  const config = {
    external_google_enabled: true,
    external_google_client_id: "1021802173200-3atqa9tdtsqjppm0j9uqjc9gnrrjls4i.apps.googleusercontent.com",
    external_facebook_enabled: true,
    external_facebook_client_id: "1234567890123456",
  };
  assert.deepEqual(evaluateOAuthProviders(["google", "facebook"], config), []);
});

test("Google's token reply separates a wrong secret from a valid client", () => {
  // Live answers: the stored secret produced the first, a good pair the second.
  assert.equal(
    evaluateGoogleTokenReply(401, {
      error: "invalid_client",
      error_description: "The provided client secret is invalid.",
    }).verdict,
    "fail",
  );
  assert.equal(
    evaluateGoogleTokenReply(400, {
      error: "invalid_client",
      error_description: "The OAuth client was not found.",
    }).verdict,
    "fail",
  );
  assert.equal(
    evaluateGoogleTokenReply(400, {
      error: "invalid_grant",
      error_description: "Malformed auth code.",
    }).verdict,
    "pass",
  );
  // A rate limit must not read as a credential failure.
  assert.equal(
    evaluateGoogleTokenReply(429, { error: "rate_limit_exceeded" }).verdict,
    "unknown",
  );
  assert.equal(evaluateGoogleTokenReply(500, null).verdict, "unknown");
});

test("the production callback is recognized in the allowlist", () => {
  const allowList =
    "https://isbulkktc.com/auth/callback,https://isbulkktc.com/**,http://localhost:3000/**";
  assert.equal(callbackIsAllowed("https://isbulkktc.com", allowList), true);
  assert.equal(callbackIsAllowed("https://www.isbulkktc.com", allowList), false);
  assert.equal(callbackIsAllowed("https://isbulkktc.com", "http://localhost:3000/**"), false);
  assert.equal(callbackIsAllowed("https://isbulkktc.com", undefined), false);
});
