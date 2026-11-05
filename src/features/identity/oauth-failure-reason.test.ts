import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  messageKeyForOAuthFailureReason,
  oauthFailureReason,
} from "./auth-errors";
import { resolveAuthErrorRedirect, resolveAuthFailurePath } from "./auth-routing";

// The callback used to send every OAuth failure to the same `?error=oauth` page,
// so a visitor whose LinkedIn account already existed was told "try again" and
// retried forever. The raw GoTrue code is now reduced to a closed reason
// vocabulary that drives a specific message. These tests pin the mapping and the
// "never echo an untrusted code" boundary.

const reasonCases: [string, string][] = [
  // Duplicate identity/address -> the account already exists.
  ["identity_already_exists", "accountExists"],
  ["email_conflict_identity_not_deletable", "accountExists"],
  ["email_exists", "accountExists"],
  ["user_already_exists", "accountExists"],
  // The PKCE code / one-time link is gone.
  ["flow_state_expired", "linkExpired"],
  ["flow_state_not_found", "linkExpired"],
  ["otp_expired", "linkExpired"],
  // Consent declined — not an error.
  ["access_denied", "cancelled"],
  // Provider not usable.
  ["provider_disabled", "providerUnavailable"],
  ["oauth_provider_not_supported", "providerUnavailable"],
  ["server_error", "providerUnavailable"],
];

test("every known GoTrue code maps to a specific reason", () => {
  for (const [code, reason] of reasonCases) {
    assert.equal(oauthFailureReason(code), reason, `${code} -> ${reason}`);
  }
});

test("an unknown or missing code degrades to the generic reason", () => {
  for (const code of ["", null, undefined, "something_new", "access_denied "]) {
    assert.equal(oauthFailureReason(code), "failed", `${String(code)}`);
  }
});

test("each reason maps to its own message key, and accountExists is distinct", () => {
  // accountExists must never reuse the generic "try again" copy.
  assert.equal(
    messageKeyForOAuthFailureReason(
      oauthFailureReason("identity_already_exists"),
    ),
    "oauthAccountExists",
  );
  assert.notEqual(
    messageKeyForOAuthFailureReason("accountExists"),
    messageKeyForOAuthFailureReason("failed"),
  );
  assert.equal(messageKeyForOAuthFailureReason("failed"), "oauthMessage");
  assert.equal(messageKeyForOAuthFailureReason(null), "oauthMessage");

  // Every known code resolves to a key, and only the generic code reuses the
  // generic copy.
  const distinct = new Set<string>();
  for (const [code, reason] of reasonCases) {
    const key = messageKeyForOAuthFailureReason(reason);
    assert.notEqual(key, "oauthMessage", `${code} fell back to the generic copy`);
    distinct.add(key);
  }
  assert.ok(distinct.size >= 4, `expected distinct keys, got ${[...distinct]}`);
});

test("the failure path carries a specific reason for a known code", () => {
  assert.equal(
    resolveAuthFailurePath("oauth", "en", "candidate", "identity_already_exists"),
    "/en/login?error=oauth&reason=accountExists&audience=candidate",
  );
  assert.equal(
    resolveAuthFailurePath("oauth", "tr", "employer", "access_denied"),
    "/login?error=oauth&reason=cancelled&audience=employer",
  );
  assert.equal(
    resolveAuthFailurePath("oauth", "de", "candidate", "flow_state_expired"),
    "/de/login?error=oauth&reason=linkExpired&audience=candidate",
  );
});

test("an unknown code keeps the legacy generic path (no regression)", () => {
  assert.equal(
    resolveAuthFailurePath("oauth", "en", "candidate"),
    "/en/login?error=oauth&audience=candidate",
  );
  assert.equal(
    resolveAuthFailurePath("oauth", "en", "candidate", "totally_unknown"),
    "/en/login?error=oauth&audience=candidate",
  );
});

test("a hostile code is never echoed into the path", () => {
  for (const code of [
    "https://evil.example",
    "//evil.example",
    "accountExists",
    "../../etc/passwd",
    "reason=x&next=https://evil.example",
    "javascript:alert(1)",
  ]) {
    const path = resolveAuthFailurePath("oauth", "en", "candidate", code);
    assert.doesNotMatch(path, /evil\.example/, `${code} leaked into ${path}`);
    assert.doesNotMatch(path, /javascript:/i, `${code} leaked into ${path}`);
    assert.doesNotMatch(path, /\.\./, `${code} leaked into ${path}`);
    // Only the closed vocabulary may appear after `reason=`.
    const reason = new URLSearchParams(path.split("?")[1]).get("reason");
    if (reason !== null) {
      assert.ok(
        ["accountExists", "cancelled", "linkExpired", "providerUnavailable", "failed"].includes(reason),
        `${code} produced an unknown reason ${reason}`,
      );
    }
  }
});

test("the email / reset flows are unchanged by the new parameter", () => {
  assert.equal(
    resolveAuthFailurePath("email", "ru", "employer", "identity_already_exists"),
    "/ru/login?error=verification&audience=employer",
  );
  assert.equal(
    resolveAuthFailurePath("reset", "tr", "candidate", "flow_state_expired"),
    "/forgot-password?error=expired",
  );
});

test("a reduced reason maps straight to its key (no double mapping)", () => {
  // The login page reads `?reason=`, which is already reduced. Feeding that
  // literal back through the code→reason map would collapse every specific
  // reason to the generic copy — the exact bug this pins.
  assert.equal(
    messageKeyForOAuthFailureReason("accountExists"),
    "oauthAccountExists",
  );
  assert.equal(messageKeyForOAuthFailureReason("cancelled"), "oauthCancelled");
  assert.equal(messageKeyForOAuthFailureReason("linkExpired"), "oauthLinkExpired");
  assert.equal(
    messageKeyForOAuthFailureReason("providerUnavailable"),
    "oauthProviderUnavailable",
  );
  assert.equal(messageKeyForOAuthFailureReason("failed"), "oauthMessage");

  // Unknown / hostile reasons fall back to the generic copy, never echoed.
  for (const bad of [null, undefined, "", "bogus", "https://evil.example", "accountExists "]) {
    assert.equal(
      messageKeyForOAuthFailureReason(bad),
      "oauthMessage",
      `${String(bad)} must fall back to the generic message`,
    );
  }

  // A reason literal is not a code: reducing it as a code would collapse to the
  // generic reason, which is why the page uses the reason mapper.
  assert.equal(oauthFailureReason("accountExists"), "failed");
});

test("the reason in the failure path round-trips to the right key", () => {
  // End to end: GoTrue code -> URL reason -> login message key.
  const pairs: [string, string][] = [
    ["identity_already_exists", "oauthAccountExists"],
    ["access_denied", "oauthCancelled"],
    ["flow_state_expired", "oauthLinkExpired"],
    ["provider_disabled", "oauthProviderUnavailable"],
  ];
  for (const [code, expectedKey] of pairs) {
    const path = resolveAuthFailurePath("oauth", "en", "candidate", code);
    const reason = new URLSearchParams(path.split("?")[1]).get("reason");
    assert.equal(
      messageKeyForOAuthFailureReason(reason),
      expectedKey,
      `${code} -> ${path} -> ${expectedKey}`,
    );
  }
});

test("the home-page error redirect also carries the reason", () => {
  // The other entry point: GoTrue can bounce a failed round-trip to the bare
  // origin, and the home page forwards it to the login page.
  assert.equal(
    resolveAuthErrorRedirect({ error_code: "access_denied" }, "en"),
    "/en/login?error=oauth&reason=cancelled",
  );
  assert.equal(
    resolveAuthErrorRedirect({ error_code: "identity_already_exists" }, "tr"),
    "/login?error=oauth&reason=accountExists",
  );
  // Unknown codes keep the legacy generic path.
  assert.equal(
    resolveAuthErrorRedirect({ error_code: "brand_new_code" }, "en"),
    "/en/login?error=oauth",
  );
  // A bare `?error=` is still ignored (no open redirect from an arbitrary link).
  assert.equal(resolveAuthErrorRedirect({ error: "access_denied" }, "tr"), null);
});

test("every new login message exists in all six locales", () => {
  const keys = [
    "oauthAccountExists",
    "oauthAccountExistsAction",
    "oauthCancelled",
    "oauthLinkExpired",
    "oauthProviderUnavailable",
  ];
  for (const language of ["tr", "en", "ru", "el", "fa", "de"]) {
    const catalog = JSON.parse(
      readFileSync(new URL(`../../messages/${language}.json`, import.meta.url), "utf8"),
    ) as { AccountPages: { login: Record<string, string> } };
    for (const key of keys) {
      const value = catalog.AccountPages.login[key];
      assert.equal(typeof value, "string", `${language}: AccountPages.login.${key} missing`);
      assert.ok(value.length > 5, `${language}: ${key} looks like a placeholder`);
    }
    // The "already registered" copy must differ from the generic failure copy.
    assert.notEqual(
      catalog.AccountPages.login.oauthAccountExists,
      catalog.AccountPages.login.oauthMessage,
      `${language}: accountExists must not reuse the generic copy`,
    );
  }
});
