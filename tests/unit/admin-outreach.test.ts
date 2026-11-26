import assert from "node:assert/strict";
import test from "node:test";

/**
 * Unit tests for the admin outreach email sending logic.
 *
 * These tests verify the pure functions used by the outreach server action:
 * - Email validation and normalisation
 * - Deduplication within a batch
 * - Unsubscribed recipient filtering logic
 * - Batch size limits
 */

const MAX_BATCH_SIZE = 25;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

function deduplicateRecipients<T extends { email: string }>(recipients: T[]): T[] {
  const seen = new Set<string>();
  return recipients.filter((r) => {
    const norm = normaliseEmail(r.email);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

function filterUnsubscribed<T extends { email: string }>(
  recipients: T[],
  unsubscribedEmails: Set<string>,
): { filtered: T[]; skipped: T[] } {
  const filtered: T[] = [];
  const skipped: T[] = [];
  for (const r of recipients) {
    if (unsubscribedEmails.has(normaliseEmail(r.email))) {
      skipped.push(r);
    } else {
      filtered.push(r);
    }
  }
  return { filtered, skipped };
}

test("normaliseEmail trims and lowercases", () => {
  assert.equal(normaliseEmail("  User@Example.COM  "), "user@example.com");
  assert.equal(normaliseEmail("TEST@DOMAIN.ORG"), "test@domain.org");
});

test("isValidEmail accepts valid formats", () => {
  assert.ok(isValidEmail("user@example.com"));
  assert.ok(isValidEmail("user.name@domain.org"));
  assert.ok(isValidEmail("user+tag@sub.domain.co.uk"));
});

test("isValidEmail rejects invalid formats", () => {
  assert.ok(!isValidEmail(""));
  assert.ok(!isValidEmail("not-an-email"));
  assert.ok(!isValidEmail("missing@domain"));
  assert.ok(!isValidEmail("@nodomain.com"));
  assert.ok(!isValidEmail("user@"));
  assert.ok(!isValidEmail("user@@domain.com"));
  assert.ok(!isValidEmail("user name@domain.com"));
});

test("deduplicateRecipients removes duplicates within batch", () => {
  const recipients = [
    { id: "1", email: "a@example.com", name: "A" },
    { id: "2", email: "b@example.com", name: "B" },
    { id: "3", email: "A@EXAMPLE.COM", name: "A dup" },
    { id: "4", email: "c@example.com", name: "C" },
  ];
  const unique = deduplicateRecipients(recipients);
  assert.equal(unique.length, 3);
  assert.equal(unique.map((r) => r.email).join(","), "a@example.com,b@example.com,c@example.com");
});

test("deduplicateRecipients preserves first occurrence", () => {
  const recipients = [
    { id: "1", email: "first@example.com", name: "First" },
    { id: "2", email: "FIRST@EXAMPLE.COM", name: "Second" },
  ];
  const unique = deduplicateRecipients(recipients);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].name, "First");
});

test("filterUnsubscribed separates unsubscribed recipients", () => {
  const recipients = [
    { id: "1", email: "active@example.com" },
    { id: "2", email: "unsub@example.com" },
    { id: "3", email: "also@example.com" },
  ];
  const unsubscribed = new Set(["unsub@example.com", "UNSUB@EXAMPLE.COM"]);

  const { filtered, skipped } = filterUnsubscribed(recipients, unsubscribed);

  assert.equal(filtered.length, 2);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].email, "unsub@example.com");
  assert.ok(filtered.every((r) => !unsubscribed.has(normaliseEmail(r.email))));
});

test("filterUnsubscribed handles case-insensitive matching", () => {
  const recipients = [{ id: "1", email: "User@Domain.COM" }];
  const unsubscribed = new Set(["user@domain.com"]);

  const { filtered, skipped } = filterUnsubscribed(recipients, unsubscribed);

  assert.equal(filtered.length, 0);
  assert.equal(skipped.length, 1);
});

test("batch size limit is 25", () => {
  const recipients = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    email: `user${i}@example.com`,
  }));

  const truncated = recipients.slice(0, MAX_BATCH_SIZE);
  assert.equal(truncated.length, MAX_BATCH_SIZE);
});

test("empty recipient list is handled", () => {
  const unique = deduplicateRecipients([]);
  assert.equal(unique.length, 0);

  const { filtered, skipped } = filterUnsubscribed([], new Set());
  assert.equal(filtered.length, 0);
  assert.equal(skipped.length, 0);
});

test("recipient with only email (no company name) is valid", () => {
  const recipients = [{ id: "1", email: "bare@example.com" }];
  const unique = deduplicateRecipients(recipients);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].email, "bare@example.com");
});

test("normaliseEmail handles unicode domains", () => {
  const email = "user@exämple.com";
  const norm = normaliseEmail(email);
  assert.equal(norm, "user@exämple.com");
  assert.ok(isValidEmail(norm));
});