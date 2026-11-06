import assert from "node:assert/strict";
import test from "node:test";

import {
  DELIVERY_FAILURE_EVENT,
  EMAIL_HEALTH_EVENT,
  describeDeliveryFailure,
  reportDeliveryFailure,
} from "./delivery-health";

/**
 * A Resend rejection was logged as a plain sentence with only `{ code }`, so a
 * health rule keyed on `email_health` (added for the malformed-key case, #186)
 * missed every real delivery failure and the HTTP status was discarded. These
 * pin the signal the mailer now emits.
 */

test("a Resend rejection is reported as an email_health delivery failure", () => {
  const signal = describeDeliveryFailure({
    name: "rate_limit_exceeded",
    message: "Too many requests",
    statusCode: 429,
  });
  assert.deepEqual(signal, {
    event: "email_delivery_failed",
    code: "rate_limit_exceeded",
    statusCode: 429,
  });
  assert.equal(DELIVERY_FAILURE_EVENT, "email_delivery_failed");
  assert.equal(EMAIL_HEALTH_EVENT, "email_health");
});

test("the SDK's statusCode is preserved, including its null form", () => {
  // A network-level failure: the SDK sets statusCode to null.
  assert.equal(
    describeDeliveryFailure({ name: "application_error", statusCode: null }).statusCode,
    null,
  );
  // A 4xx the caller must be able to tell apart from a 5xx.
  assert.equal(
    describeDeliveryFailure({ name: "validation_error", statusCode: 422 }).statusCode,
    422,
  );
});

test("a missing or non-numeric code degrades to unknown_error", () => {
  for (const bad of [null, undefined, {}, { name: "" }, { name: "  " }, { name: 42 }]) {
    assert.equal(
      describeDeliveryFailure(bad).code,
      "unknown_error",
      `${JSON.stringify(bad)} should degrade`,
    );
  }
  assert.equal(describeDeliveryFailure(null).statusCode, null);
  assert.equal(describeDeliveryFailure({ name: "x", statusCode: "429" }).statusCode, null);
});

test("the recipient is never part of the signal", () => {
  const signal = describeDeliveryFailure({
    name: "validation_error",
    message: "Invalid `to` field: aday@example.test",
    statusCode: 422,
  });
  assert.deepEqual(Object.keys(signal).sort(), ["code", "event", "statusCode"]);
  assert.equal(JSON.stringify(signal).includes("aday@example.test"), false);
});

test("the failure is emitted under the email_health key the alert watches", () => {
  const calls: Array<[string, unknown]> = [];
  const signal = reportDeliveryFailure(
    { name: "validation_error", statusCode: 401 },
    (event, payload) => calls.push([event, payload]),
  );
  assert.deepEqual(calls, [
    [
      EMAIL_HEALTH_EVENT,
      { event: DELIVERY_FAILURE_EVENT, code: "validation_error", statusCode: 401 },
    ],
  ]);
  assert.equal(calls[0][0], "email_health");
  assert.equal(signal.code, "validation_error");
});

test("a throw with no usable shape still emits a signal, never crashes", () => {
  for (const thrown of [new Error("ECONNRESET"), "boom", undefined]) {
    const calls: string[] = [];
    assert.doesNotThrow(() =>
      reportDeliveryFailure(thrown, (event) => calls.push(event)),
    );
    assert.deepEqual(calls, ["email_health"]);
  }
});
