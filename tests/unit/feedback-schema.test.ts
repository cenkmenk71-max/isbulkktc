import assert from "node:assert/strict";
import test from "node:test";
import {
  feedbackCategorySchema,
  feedbackSchema,
} from "../../src/features/feedback/schemas";

test("feedback categories match the database check constraint", () => {
  assert.deepEqual(feedbackCategorySchema.options, [
    "general",
    "bug",
    "feature",
    "employer",
    "candidate",
    "other",
  ]);
});

test("feedback accepts an anonymous message with only a category", () => {
  const result = feedbackSchema.safeParse({
    name: "",
    email: "",
    category: "general",
    message: "Harika bir platform.",
    locale: "tr",
  });
  assert.ok(result.success);
  assert.equal(result.data.category, "general");
  assert.equal(result.data.rating, undefined);
});

test("feedback coerces a numeric rating and lowercases the email", () => {
  const result = feedbackSchema.safeParse({
    name: "Ayşe",
    email: "Ayse@Example.COM",
    category: "bug",
    rating: "4",
    message: "Filtreler çalışmıyor.",
    locale: "de",
  });
  assert.ok(result.success);
  assert.equal(result.data.rating, 4);
  assert.equal(result.data.email, "ayse@example.com");
});

test("feedback rejects a too-short message and an unknown category", () => {
  assert.equal(
    feedbackSchema.safeParse({
      category: "general",
      message: "ab",
      locale: "tr",
    }).success,
    false,
  );
  assert.equal(
    feedbackSchema.safeParse({
      category: "billing",
      message: "Geçerli uzunlukta bir mesaj.",
      locale: "tr",
    }).success,
    false,
  );
});

test("feedback rejects an out-of-range rating and an unknown locale", () => {
  assert.equal(
    feedbackSchema.safeParse({
      category: "general",
      rating: "9",
      message: "Geçerli uzunlukta bir mesaj.",
      locale: "tr",
    }).success,
    false,
  );
  assert.equal(
    feedbackSchema.safeParse({
      category: "general",
      message: "Geçerli uzunlukta bir mesaj.",
      locale: "fr",
    }).success,
    false,
  );
});

test("feedback rejects an invalid email when one is provided", () => {
  assert.equal(
    feedbackSchema.safeParse({
      email: "not-an-email",
      category: "general",
      message: "Geçerli uzunlukta bir mesaj.",
      locale: "tr",
    }).success,
    false,
  );
});
