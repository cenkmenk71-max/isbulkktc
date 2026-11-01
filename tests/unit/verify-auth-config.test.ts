import assert from "node:assert/strict";
import test from "node:test";

import {
  callbackIsAllowed,
  evaluateCaptchaProbe,
  evaluateOAuthAuthorize,
  evaluateOAuthProviders,
  evaluateRecentOAuthErrors,
  evaluateTurnstileSecret,
  looksLikeOAuthClientId,
  looksLikeTurnstileSiteKey,
  parseAdvertisedProviders,
} from "../../scripts/verify-auth-config.mjs";
import { looksLikeTurnstileSecret } from "../../scripts/set-turnstile-secret.mjs";

test("advertised providers are trimmed, de-duplicated and validated", () => {
  assert.deepEqual(parseAdvertisedProviders("google, linkedin_oidc ,google").providers, [
    "google",
    "linkedin_oidc",
  ]);
  assert.deepEqual(parseAdvertisedProviders("google,google").providers, ["google"]);
  assert.deepEqual(parseAdvertisedProviders("google,instagram").unknown, ["instagram"]);
  assert.deepEqual(parseAdvertisedProviders("google,facebook").unknown, ["facebook"]);
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
  // GoTrue sends LinkedIn to api.linkedin.com, not www. An exact host list read
  // that as "redirected somewhere unexpected" and failed a working provider.
  assert.equal(
    evaluateOAuthAuthorize("linkedin_oidc", 302, "https://api.linkedin.com/oauth/v2/authorization?client_id=x").ok,
    true,
  );
  // A lookalike domain must not pass the suffix check.
  assert.equal(
    evaluateOAuthAuthorize("linkedin_oidc", 302, "https://evil-linkedin.com/oauth").ok,
    false,
  );
  assert.equal(
    evaluateOAuthAuthorize("linkedin_oidc", 302, "https://linkedin.com.evil.example/oauth").ok,
    false,
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
    external_linkedin_oidc_enabled: true,
    external_linkedin_oidc_client_id: "",
  };

  const problems = evaluateOAuthProviders(
    ["google", "linkedin_oidc"],
    config,
  );
  assert.equal(problems.length, 1);
  assert.match(problems.join(" "), /linkedin_oidc is enabled but has no client id/);
});

test("a placeholder client id is reported instead of passing as configured", () => {
  // LinkedIn was stored as "ISBULKKTC" — enabled, non-empty, and therefore green
  // under the emptiness check, while the live authorize endpoint forwarded that
  // literal to the provider.
  const config = {
    external_linkedin_oidc_enabled: true,
    external_linkedin_oidc_client_id: "ISBULKKTC",
  };
  const problems = evaluateOAuthProviders(["linkedin_oidc"], config);
  assert.equal(problems.length, 1);
  assert.match(problems.join(" "), /linkedin_oidc is enabled but its client id "ISBULKKTC" looks like a placeholder/);

  assert.equal(looksLikeOAuthClientId("linkedin_oidc", "ISBULKKTC"), false);
  assert.equal(looksLikeOAuthClientId("linkedin_oidc", ""), false);
  assert.equal(looksLikeOAuthClientId("linkedin_oidc", "short"), false);
  assert.equal(looksLikeOAuthClientId("linkedin_oidc", "78a1b2c3d4e5"), true);
});

test("a fully configured provider set passes", () => {
  const config = {
    external_google_enabled: true,
    external_google_client_id: "1021802173200-3atqa9tdtsqjppm0j9uqjc9gnrrjls4i.apps.googleusercontent.com",
    external_linkedin_oidc_enabled: true,
    external_linkedin_oidc_client_id: "78a1b2c3d4e5",
  };
  assert.deepEqual(evaluateOAuthProviders(["google", "linkedin_oidc"], config), []);
});

test("recent auth logs expose a failed OAuth token exchange", () => {
  // The exact line production logged while the secret was a placeholder.
  const failing = [
    {
      timestamp: "2026-11-01T09:35:07Z",
      event_message:
        '{"component":"api","error":"oauth2: \\"invalid_client\\" \\"The provided client secret is invalid.\\"","level":"error","msg":"500: Unable to exchange external code: 4/0A","path":"/callback"}',
    },
  ];
  assert.equal(evaluateRecentOAuthErrors(failing).state, "failing");
  assert.equal(evaluateRecentOAuthErrors(failing).ok, false);

  // A healthy window: authorize redirects and successful callbacks only.
  const clean = [
    {
      timestamp: "2026-11-01T11:31:01Z",
      event_message:
        '{"component":"api","level":"info","msg":"Redirecting to external provider","path":"/authorize","provider":"google"}',
    },
    {
      timestamp: "2026-11-01T11:31:02Z",
      event_message:
        '{"component":"api","duration":123,"level":"info","msg":"request completed","path":"/callback","status":302}',
    },
  ];
  assert.equal(evaluateRecentOAuthErrors(clean).state, "clean");
  assert.equal(evaluateRecentOAuthErrors(clean).ok, true);

  // A malformed payload must not be mistaken for a healthy one.
  assert.equal(evaluateRecentOAuthErrors(null).state, "unknown");
  assert.equal(evaluateRecentOAuthErrors("nope").state, "unknown");
});

test("the production callback is recognized in the allowlist", () => {
  const allowList =
    "https://isbulkktc.com/auth/callback,https://isbulkktc.com/**,http://localhost:3000/**";
  assert.equal(callbackIsAllowed("https://isbulkktc.com", allowList), true);
  assert.equal(callbackIsAllowed("https://www.isbulkktc.com", allowList), false);
  assert.equal(callbackIsAllowed("https://isbulkktc.com", "http://localhost:3000/**"), false);
  assert.equal(callbackIsAllowed("https://isbulkktc.com", undefined), false);
});
