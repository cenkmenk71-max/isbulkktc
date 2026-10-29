import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedCronRequest } from "../../src/server/auth/cron-auth";

const SECRET = "s3cret-cron-value";

test("cron auth fails closed when no secret is configured", () => {
  // The regression: `if (cronSecret && ...)` let every request through when the
  // secret was unset, exposing a service-role endpoint to the public.
  assert.equal(isAuthorizedCronRequest(null, undefined), false);
  assert.equal(isAuthorizedCronRequest("Bearer anything", undefined), false);
  assert.equal(isAuthorizedCronRequest(null, ""), false);
  assert.equal(isAuthorizedCronRequest("Bearer anything", ""), false);
});

test("cron auth accepts only the exact bearer token", () => {
  assert.equal(isAuthorizedCronRequest(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(isAuthorizedCronRequest(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(isAuthorizedCronRequest("Bearer wrong", SECRET), false);
  assert.equal(isAuthorizedCronRequest(SECRET, SECRET), false);
  assert.equal(isAuthorizedCronRequest(null, SECRET), false);
  assert.equal(isAuthorizedCronRequest("", SECRET), false);
});

test("cron auth rejects a same-length but different token", () => {
  const sameLength = "x".repeat(SECRET.length);
  assert.equal(isAuthorizedCronRequest(`Bearer ${sameLength}`, SECRET), false);
});
