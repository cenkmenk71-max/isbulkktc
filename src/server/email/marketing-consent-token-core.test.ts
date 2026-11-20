import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createMarketingConsentToken,
  MARKETING_CONSENT_TOKEN_TTL_SECONDS,
  verifyMarketingConsentToken,
} from "./marketing-consent-token-core";

const KEY = "test-marketing-consent-signing-secret";
const LEAD_ID = "84000000-0000-4000-8000-000000000001";
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

test("marketing consent token is signed, scoped, and expires after the advertised period", () => {
  const token = createMarketingConsentToken(LEAD_ID, "tr", "person@example.test", KEY, NOW);
  const claims = verifyMarketingConsentToken(token, KEY, NOW);
  assert.deepEqual(claims, {
    version: 1,
    leadId: LEAD_ID,
    locale: "tr",
    emailHash: createHash("sha256").update("person@example.test").digest("hex"),
    expiresAt: Math.floor(NOW / 1000) + MARKETING_CONSENT_TOKEN_TTL_SECONDS,
  });
});

test("marketing consent token rejects tampering and a different signing key", () => {
  const token = createMarketingConsentToken(LEAD_ID, "en", "person@example.test", KEY, NOW);
  const [payload, signature] = token.split(".");
  assert.equal(verifyMarketingConsentToken(payload + "." + signature.slice(1), KEY, NOW), null);
  assert.equal(verifyMarketingConsentToken(token, KEY + "-wrong", NOW), null);
});

test("marketing consent token rejects expired and malformed claims", () => {
  const token = createMarketingConsentToken(LEAD_ID, "de", "person@example.test", KEY, NOW);
  assert.equal(
    verifyMarketingConsentToken(token, KEY, NOW + MARKETING_CONSENT_TOKEN_TTL_SECONDS * 1000 + 1000),
    null,
  );
  assert.throws(() => createMarketingConsentToken("not-a-uuid", "tr", "person@example.test", KEY, NOW), TypeError);
  assert.throws(() => createMarketingConsentToken(LEAD_ID, "fr", "person@example.test", KEY, NOW), TypeError);
  assert.throws(() => createMarketingConsentToken(LEAD_ID, "tr", "person@example.test", "short", NOW), TypeError);
});

test("all six supported locales are accepted in confirmation tokens", () => {
  for (const locale of ["tr", "en", "ru", "el", "fa", "de"]) {
    const token = createMarketingConsentToken(LEAD_ID, locale, "person@example.test", KEY, NOW);
    assert.equal(verifyMarketingConsentToken(token, KEY, NOW)?.locale, locale);
  }
});

test("marketing consent tokens bind to the normalized recipient without exposing it", () => {
  const token = createMarketingConsentToken(LEAD_ID, "tr", "Person@Example.Test", KEY, NOW);
  const claims = verifyMarketingConsentToken(token, KEY, NOW);
  assert.ok(claims);
  assert.equal(
    claims.emailHash,
    createHash("sha256").update("person@example.test").digest("hex"),
  );
  assert.equal(token.includes("Person@Example.Test"), false);
  assert.equal(token.includes("person@example.test"), false);
});
