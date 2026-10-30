import assert from "node:assert/strict";
import test from "node:test";
import { salesLeadSchema } from "../../src/features/sales/schemas";

test("sales lead requires a valid email address", () => {
  const missing = salesLeadSchema.safeParse({
    email: "",
    locale: "tr",
  });
  assert.equal(missing.success, false);

  const malformed = salesLeadSchema.safeParse({
    email: "not-an-email",
    locale: "tr",
  });
  assert.equal(malformed.success, false);
});

test("sales lead lowercases the email and accepts an otherwise bare request", () => {
  const result = salesLeadSchema.safeParse({
    email: "Satis@Example.COM",
    locale: "en",
  });
  assert.ok(result.success);
  assert.equal(result.data.email, "satis@example.com");
  assert.equal(result.data.companyName, undefined);
});

test("sales lead accepts only the offered listing durations", () => {
  for (const durationDays of ["1", "7", "30"] as const) {
    assert.equal(
      salesLeadSchema.safeParse({
        email: "a@b.com",
        durationDays,
        locale: "de",
      }).success,
      true,
      `duration ${durationDays} should be accepted`,
    );
  }
  assert.equal(
    salesLeadSchema.safeParse({
      email: "a@b.com",
      durationDays: "14",
      locale: "de",
    }).success,
    false,
  );
});

test("sales lead bounds the note and rejects an unknown locale", () => {
  assert.equal(
    salesLeadSchema.safeParse({
      email: "a@b.com",
      note: "x".repeat(2001),
      locale: "tr",
    }).success,
    false,
  );
  assert.equal(
    salesLeadSchema.safeParse({
      email: "a@b.com",
      locale: "fr",
    }).success,
    false,
  );
});
