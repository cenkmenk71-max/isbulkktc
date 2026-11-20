import assert from "node:assert/strict";
import test from "node:test";

import { salesLeadSchema } from "./schemas";

/**
 * The phone field is optional, but a value that is present must satisfy the
 * column's floor: `sales_leads.phone` requires 4–32 characters, and the RPC
 * drops anything shorter. Before this guard the schema accepted a bare "12",
 * the RPC stored `null`, and the visitor was never told their number was
 * discarded. The bound below mirrors the column check, so the two cannot drift.
 */
test("a phone below the column floor is rejected, not silently dropped", () => {
  for (const phone of ["1", "12", "123"]) {
    const result = salesLeadSchema.safeParse({ email: "a@b.com", phone, locale: "tr" });
    assert.equal(result.success, false, `"${phone}" should be rejected`);
  }
});

test("an absent or empty phone stays valid because the field is optional", () => {
  for (const phone of ["", undefined]) {
    const result = salesLeadSchema.safeParse({ email: "a@b.com", phone, locale: "tr" });
    assert.equal(result.success, true, `phone ${JSON.stringify(phone)} should be accepted`);
  }
});

test("a phone at or above the floor is accepted and trimmed", () => {
  const cases: Array<[string, string]> = [
    ["1234", "1234"],
    ["  +90 533 000 0000  ", "+90 533 000 0000"],
    ["0539 131 64 21", "0539 131 64 21"],
  ];
  for (const [input, expected] of cases) {
    const result = salesLeadSchema.safeParse({ email: "a@b.com", phone: input, locale: "tr" });
    assert.ok(result.success, `"${input}" should be accepted`);
    assert.equal(result.data.phone, expected);
  }
});

test("the upper bound still rejects an over-long phone", () => {
  const result = salesLeadSchema.safeParse({
    email: "a@b.com",
    phone: "x".repeat(33),
    locale: "tr",
  });
  assert.equal(result.success, false);
});


test("marketing consent is explicit and defaults to off", () => {
  const omitted = salesLeadSchema.safeParse({ email: "a@example.com", locale: "tr" });
  assert.ok(omitted.success);
  assert.equal(omitted.data.marketingConsent, false);

  const optedIn = salesLeadSchema.safeParse({
    email: "a@example.com",
    locale: "tr",
    marketingConsent: true,
  });
  assert.ok(optedIn.success);
  assert.equal(optedIn.data.marketingConsent, true);
});
