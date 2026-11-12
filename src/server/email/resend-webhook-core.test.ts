import assert from "node:assert/strict";
import test from "node:test";

import { Webhook } from "standardwebhooks";

import {
  classifyResendEvent,
  eventRecipients,
  verifyResendWebhook,
} from "./resend-webhook-core";

/**
 * The webhook receiver is the only thing standing between a hard bounce and
 * every later send, so these pin the two decisions that matter: only a genuine
 * Resend signature is accepted, and only a real suppression event (not a
 * transient delay) removes an address.
 */

// A well-formed Svix secret: `whsec_` + base64. Value is arbitrary — it never
// leaves the test.
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

function signedRequest(body: string, secret = SECRET, when = new Date()) {
  const webhook = new Webhook(secret);
  const id = "msg_test_1";
  const timestamp = when;
  return {
    headers: {
      id,
      timestamp: Math.floor(timestamp.getTime() / 1000).toString(),
      signature: webhook.sign(id, timestamp, body),
    },
    body,
  };
}

test("a correctly signed payload verifies and parses", () => {
  const body = JSON.stringify({
    type: "email.bounced",
    data: { to: ["dead@example.com"] },
  });
  const { headers } = signedRequest(body);
  const event = verifyResendWebhook(body, headers, SECRET);
  assert.equal(event.type, "email.bounced");
  assert.deepEqual(event.data?.to, ["dead@example.com"]);
});

test("a tampered body is rejected", () => {
  const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.co"] } });
  const { headers } = signedRequest(body);
  const tampered = JSON.stringify({ type: "email.bounced", data: { to: ["evil@b.co"] } });
  assert.throws(() => verifyResendWebhook(tampered, headers, SECRET));
});

test("a signature from another secret is rejected", () => {
  const body = JSON.stringify({ type: "email.complained", data: { to: ["a@b.co"] } });
  const { headers } = signedRequest(body, "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  assert.throws(() => verifyResendWebhook(body, headers, SECRET));
});

test("a missing signature header is rejected", () => {
  const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.co"] } });
  assert.throws(() => verifyResendWebhook(body, { id: "x", timestamp: "1", signature: "" }, SECRET));
});

test("a stale timestamp outside the replay window is rejected", () => {
  const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@b.co"] } });
  const old = new Date(Date.now() - 10 * 60 * 1000);
  const { headers } = signedRequest(body, SECRET, old);
  assert.throws(() => verifyResendWebhook(body, headers, SECRET));
});

test("hard bounces, complaints and provider suppressions all suppress", () => {
  assert.deepEqual(classifyResendEvent("email.bounced"), { suppress: true, reason: "bounce" });
  assert.deepEqual(classifyResendEvent("email.complained"), {
    suppress: true,
    reason: "complaint",
  });
  assert.deepEqual(classifyResendEvent("email.suppressed"), {
    suppress: true,
    reason: "provider_suppression",
  });
});

test("transient and informational events never suppress", () => {
  for (const type of [
    "email.delivered",
    "email.sent",
    "email.delivery_delayed",
    "email.opened",
    "email.clicked",
    undefined,
  ]) {
    assert.deepEqual(classifyResendEvent(type), { suppress: false }, `${type} must not suppress`);
  }
});

test("reasons fit the 40-character column", () => {
  for (const type of ["email.bounced", "email.complained", "email.suppressed"]) {
    const decision = classifyResendEvent(type);
    assert.ok(decision.suppress && decision.reason.length <= 40);
  }
});

test("recipients are lower-cased, de-duplicated and validated", () => {
  assert.deepEqual(
    eventRecipients({ type: "email.bounced", data: { to: ["A@B.CO", "a@b.co", "  c@d.co  "] } }),
    ["a@b.co", "c@d.co"],
  );
});

test("a single string recipient is tolerated", () => {
  assert.deepEqual(
    eventRecipients({ data: { to: "Solo@Example.COM" } }),
    ["solo@example.com"],
  );
});

test("non-address and malformed recipients are dropped, not passed to the RPC", () => {
  assert.deepEqual(
    eventRecipients({
      data: { to: ["not-an-email", "", "   ", 42, null, { email: "x@y.co" }, "a@b.co"] },
    }),
    ["a@b.co"],
  );
});

test("a missing or non-array to yields no recipients", () => {
  assert.deepEqual(eventRecipients({ data: {} }), []);
  assert.deepEqual(eventRecipients({}), []);
  assert.deepEqual(eventRecipients({ data: { to: null } }), []);
});
