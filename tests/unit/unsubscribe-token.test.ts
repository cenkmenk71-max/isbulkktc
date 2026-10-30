import assert from "node:assert/strict";
import test from "node:test";
import {
  isUnsubscribeSigningConfigured,
  signUnsubscribeEmail,
  verifyUnsubscribeSignature,
} from "../../src/server/email/unsubscribe-token-core";

const SECRET = "test-secret-value-with-enough-entropy";

function withSecret<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.ENGAGEMENT_UNSUBSCRIBE_SECRET;
  if (value === undefined) {
    delete process.env.ENGAGEMENT_UNSUBSCRIBE_SECRET;
  } else {
    process.env.ENGAGEMENT_UNSUBSCRIBE_SECRET = value;
  }
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.ENGAGEMENT_UNSUBSCRIBE_SECRET;
    } else {
      process.env.ENGAGEMENT_UNSUBSCRIBE_SECRET = previous;
    }
  }
}

test("signing is disabled without a sufficiently long secret", () => {
  withSecret(undefined, () => {
    delete process.env.RESEND_API_KEY;
    assert.equal(isUnsubscribeSigningConfigured(), false);
    assert.equal(signUnsubscribeEmail("a@b.com"), null);
  });
  withSecret("short", () => {
    assert.equal(isUnsubscribeSigningConfigured(), false);
  });
});

test("a signature verifies for the exact address and fails otherwise", () => {
  withSecret(SECRET, () => {
    const signature = signUnsubscribeEmail("Ayse@Example.COM");
    assert.ok(signature);
    // Case and surrounding whitespace are normalised before signing.
    assert.ok(verifyUnsubscribeSignature("ayse@example.com", signature));
    assert.ok(verifyUnsubscribeSignature("  AYSE@example.com  ", signature));
    assert.equal(verifyUnsubscribeSignature("other@example.com", signature), false);
    assert.equal(verifyUnsubscribeSignature("ayse@example.com", "tampered"), false);
    assert.equal(verifyUnsubscribeSignature("ayse@example.com", ""), false);
  });
});
