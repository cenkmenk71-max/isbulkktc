import "./support/server-only-hook";
import assert from "node:assert/strict";
import test from "node:test";

/**
 * `src/server/email/unsubscribe-token-core.ts` carries `import "server-only"`
 * (the secret-reading boundary #102 asks for). Under `tsx --test` the marker
 * package has no `react-server` condition and throws on import, so the hook
 * above resolves it to an empty module; the production module body still runs.
 *
 * The import is dynamic because a static one is hoisted above the hook's side
 * effect, so the hook would not be installed in time.
 */
const tokenCore = () => import("../../src/server/email/unsubscribe-token-core");

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

test("signing is disabled without a sufficiently long secret", async () => {
  const { isUnsubscribeSigningConfigured, signUnsubscribeEmail } = await tokenCore();
  withSecret(undefined, () => {
    delete process.env.RESEND_API_KEY;
    assert.equal(isUnsubscribeSigningConfigured(), false);
    assert.equal(signUnsubscribeEmail("a@b.com"), null);
  });
  withSecret("short", () => {
    assert.equal(isUnsubscribeSigningConfigured(), false);
  });
});

test("a signature verifies for the exact address and fails otherwise", async () => {
  const { signUnsubscribeEmail, verifyUnsubscribeSignature } = await tokenCore();
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
