import assert from "node:assert/strict";
import test from "node:test";

import {
  callbackIsAllowed,
  evaluateOAuthProviders,
  evaluateTurnstileSecret,
  looksLikeTurnstileSiteKey,
  parseAdvertisedProviders,
} from "../../scripts/verify-auth-config.mjs";

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

test("an unexpected Cloudflare reply is a failure, not a pass", () => {
  assert.equal(evaluateTurnstileSecret(null).ok, false);
  assert.equal(evaluateTurnstileSecret({ "error-codes": ["internal-error"] }).ok, false);
});

test("an advertised provider must be enabled with a client id", () => {
  const config = {
    external_google_enabled: true,
    external_google_client_id: "google-client",
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

test("a fully configured provider set passes", () => {
  const config = {
    external_google_enabled: true,
    external_google_client_id: "g",
    external_facebook_enabled: true,
    external_facebook_client_id: "f",
  };
  assert.deepEqual(evaluateOAuthProviders(["google", "facebook"], config), []);
});

test("the production callback is recognized in the allowlist", () => {
  const allowList =
    "https://isbulkktc.com/auth/callback,https://isbulkktc.com/**,http://localhost:3000/**";
  assert.equal(callbackIsAllowed("https://isbulkktc.com", allowList), true);
  assert.equal(callbackIsAllowed("https://www.isbulkktc.com", allowList), false);
  assert.equal(callbackIsAllowed("https://isbulkktc.com", "http://localhost:3000/**"), false);
  assert.equal(callbackIsAllowed("https://isbulkktc.com", undefined), false);
});
