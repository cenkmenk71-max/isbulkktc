import assert from "node:assert/strict";
import test from "node:test";

import { createRateLimiter, MAX_TRACKED_KEYS } from "./rate-limit";

test("allows up to the limit and then reports a retry delay", () => {
  let now = 1_000;
  const limiter = createRateLimiter({ limit: 3, windowMs: 1_000, now: () => now });

  assert.deepEqual(limiter.check("a"), { ok: true });
  assert.deepEqual(limiter.check("a"), { ok: true });
  assert.deepEqual(limiter.check("a"), { ok: true });
  assert.deepEqual(limiter.check("a"), { ok: false, retryAfterMs: 1_000 });

  // Time passes without crossing the boundary: still blocked.
  now = 1_999;
  assert.equal(limiter.check("a").ok, false);
});

test("a window boundary resets the budget", () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 500, now: () => now });

  assert.equal(limiter.check("a").ok, true);
  assert.equal(limiter.check("a").ok, false);

  now = 500; // resetAt is exclusive: the bucket is expired at exactly its reset.
  assert.equal(limiter.check("a").ok, true);
});

test("keys are counted independently", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => 0 });

  assert.equal(limiter.check("ip:1.1.1.1").ok, true);
  assert.equal(limiter.check("ip:2.2.2.2").ok, true);
  assert.equal(limiter.check("ip:1.1.1.1").ok, false);
  assert.equal(limiter.check("email:victim@example.com").ok, true);
});

test("clear drops every bucket", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => 0 });

  assert.equal(limiter.check("a").ok, true);
  assert.equal(limiter.check("a").ok, false);
  limiter.clear();
  assert.equal(limiter.check("a").ok, true);
});

test("the tracked-key table stays bounded and keeps serving new callers", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 10_000, now: () => 0 });

  // "first" is the oldest live bucket.
  assert.equal(limiter.check("first").ok, true);
  assert.equal(limiter.check("first").ok, false);

  for (let index = 0; index < MAX_TRACKED_KEYS; index += 1) {
    assert.equal(limiter.check(`k${index}`).ok, true, `k${index} should be admitted`);
  }

  // The newest key is still tracked...
  assert.equal(limiter.check(`k${MAX_TRACKED_KEYS - 1}`).ok, false);
  // ...and the flood evicted the oldest rather than failing closed.
  assert.equal(limiter.check("first").ok, true);
});
