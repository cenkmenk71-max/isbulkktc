import assert from "node:assert/strict";
import test from "node:test";

import {
  installBoundaryMocks,
  recorded,
  resetBoundary,
  setRequestHeaders,
} from "./support/harness";

installBoundaryMocks();

/**
 * The abuse throttle, exercised through the real actions.
 *
 * `tests/unit/**` proves the limiter's arithmetic in isolation
 * (`src/features/abuse/rate-limit.test.ts`). It cannot prove that the actions
 * *call* it, in the right place, keyed the right way — and that is the part that
 * actually bounds the mail flood. A refactor that moves the throttle below the
 * RPC, or keys it only by address, would keep every unit test green while
 * reopening the anonymous-mail vector the limiter exists to close.
 *
 * The limiter is a module singleton with a ten-minute window, so each test clears
 * it first rather than relying on test order.
 */

const FEEDBACK_MESSAGE = "The listing filter drops the district I picked.";

function feedbackForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("message", FEEDBACK_MESSAGE);
  data.set("category", "bug");
  data.set("locale", "tr");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

function rpcCount(name: string): number {
  return recorded.supabase.filter((call) => call.kind === "rpc" && call.name === name).length;
}

async function submit(overrides: Record<string, string> = {}) {
  const { submitFeedback } = await import("../../src/features/feedback/actions");
  return submitFeedback({ status: "idle", message: "idle" } as never, feedbackForm(overrides));
}

async function clearFeedbackLimiter() {
  const { feedbackRateLimiter } = await import("../../src/features/abuse/limits");
  feedbackRateLimiter.clear();
}

test("the sixth feedback from one address is throttled before it reaches the RPC", async () => {
  await clearFeedbackLimiter();
  resetBoundary({
    user: undefined,
    rpcs: { submit_feedback: { data: "00000000-0000-4000-8000-0000000000f1", error: null } },
  });
  setRequestHeaders({ "cf-connecting-ip": "203.0.113.7" });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const state = await submit();
    assert.equal(state.status, "success", `attempt ${attempt} should be admitted`);
  }

  // Count only what the sixth attempt does.
  recorded.supabase.length = 0;
  const throttled = await submit();

  assert.equal(throttled.status, "error");
  assert.equal(throttled.message, "failed");
  assert.equal(rpcCount("submit_feedback"), 0, "a throttled attempt must not reach the RPC");
});

test("the throttle is per address, not global", async () => {
  await clearFeedbackLimiter();
  resetBoundary({
    user: undefined,
    rpcs: { submit_feedback: { data: "00000000-0000-4000-8000-0000000000f1", error: null } },
  });

  setRequestHeaders({ "cf-connecting-ip": "198.51.100.9" });
  for (let attempt = 0; attempt < 5; attempt += 1) await submit();

  // A different origin must still be admitted after the first is exhausted.
  setRequestHeaders({ "cf-connecting-ip": "198.51.100.10" });
  const state = await submit();
  assert.equal(state.status, "success");
});

test("a victim address is throttled independently of the origin", async () => {
  await clearFeedbackLimiter();
  resetBoundary({
    user: undefined,
    rpcs: { submit_feedback: { data: "00000000-0000-4000-8000-0000000000f1", error: null } },
  });

  // Five attempts at the same victim mailbox, each from a fresh origin.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    setRequestHeaders({ "cf-connecting-ip": `203.0.113.${attempt + 1}` });
    const state = await submit({ email: "victim@example.invalid" });
    assert.equal(state.status, "success", `attempt ${attempt + 1} should be admitted`);
  }

  recorded.supabase.length = 0;
  setRequestHeaders({ "cf-connecting-ip": "203.0.113.99" });
  const throttled = await submit({ email: "victim@example.invalid" });

  assert.equal(throttled.status, "error");
  assert.equal(throttled.message, "failed");
  assert.equal(rpcCount("submit_feedback"), 0, "the victim mailbox must not receive a sixth mail");
});

test("the sales limiter is independent of the feedback limiter", async () => {
  await clearFeedbackLimiter();
  const { salesLeadRateLimiter } = await import("../../src/features/abuse/limits");
  salesLeadRateLimiter.clear();

  resetBoundary({
    user: undefined,
    rpcs: {
      submit_feedback: { data: "00000000-0000-4000-8000-0000000000f1", error: null },
      submit_sales_lead: { data: "00000000-0000-4000-8000-0000000000f2", error: null },
    },
  });
  setRequestHeaders({ "cf-connecting-ip": "203.0.113.7" });

  for (let attempt = 0; attempt < 5; attempt += 1) await submit();
  assert.equal((await submit()).status, "error", "feedback should now be exhausted");

  // Exhausting feedback must not throttle sales from the same origin.
  const { submitSalesLead } = await import("../../src/features/sales/actions");
  const salesForm = new FormData();
  salesForm.set("companyName", "Acme");
  salesForm.set("email", "lead@example.invalid");
  salesForm.set("locale", "tr");
  const salesState = await submitSalesLead({ status: "idle", message: "idle" } as never, salesForm);

  assert.equal(salesState.status, "success");
});
