import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrderSchema,
  submitPaymentSchema,
  reconciliationSchema,
  creditAdjustmentSchema,
} from "../../src/features/billing/schemas";
import {
  sendMessageSchema,
  startConversationSchema,
} from "../../src/features/messaging/schemas";
import { createResumeSchema } from "../../src/features/candidates/resume-schemas";

const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

test("order input selects only a server-priced plan and an allowed duration", () => {
  assert.equal(
    createOrderSchema.safeParse({
      companyId: firstId,
      listingPlanCode: "starter-plan",
      durationDays: 30,
    }).success,
    true,
  );
  assert.equal(
    createOrderSchema.safeParse({
      companyId: firstId,
      listingPlanCode: "starter-plan",
      durationDays: 30,
      amountMinor: 1,
    }).success,
    false,
  );
  assert.equal(
    createOrderSchema.safeParse({
      companyId: firstId,
      listingPlanCode: "starter-plan",
      durationDays: 365,
    }).success,
    false,
  );
});

test("payment submissions require positive bounded amounts and normalized currency", () => {
  const payment = {
    orderId: firstId,
    senderName: "Synthetic Sender",
    transferReference: "transfer-reference-1",
    amountMinor: 100,
    currency: "TRY",
    transferredAt: "2026-11-25T10:00:00.000Z",
  };
  assert.equal(submitPaymentSchema.safeParse(payment).success, true);
  assert.equal(
    submitPaymentSchema.safeParse({ ...payment, amountMinor: 0 }).success,
    false,
  );
  assert.equal(
    submitPaymentSchema.safeParse({ ...payment, currency: "try" }).success,
    false,
  );
});

test("payment reconciliation decisions and credit adjustment types are bounded", () => {
  assert.equal(
    reconciliationSchema.safeParse({
      orderId: firstId,
      submissionId: secondId,
      decision: "accepted",
      bankReferenceNormalized: "BANK-001",
    }).success,
    true,
  );
  assert.equal(
    reconciliationSchema.safeParse({
      orderId: firstId,
      submissionId: secondId,
      decision: "pending",
      bankReferenceNormalized: "BANK-001",
    }).success,
    false,
  );
  assert.equal(
    creditAdjustmentSchema.safeParse({
      companyId: firstId,
      quantityDelta: 0,
      entryType: "manual_adjustment",
      idempotencyKey: "adjustment-1",
      reason: "Correction",
    }).success,
    false,
  );
});

test("a conversation must have two distinct participants and bounded text", () => {
  assert.equal(
    startConversationSchema.safeParse({
      participantIds: [firstId, secondId],
    }).success,
    true,
  );
  assert.equal(
    startConversationSchema.safeParse({
      participantIds: [firstId, firstId],
    }).success,
    false,
  );
  assert.equal(
    sendMessageSchema.safeParse({
      conversationId: firstId,
      body: "A short, synthetic message.",
    }).success,
    true,
  );
  assert.equal(
    sendMessageSchema.safeParse({ conversationId: firstId, body: " " }).success,
    false,
  );
});

test("resume metadata accepts only bounded PDF metadata", () => {
  const resume = {
    storagePath: `${firstId}/resume.pdf`,
    originalFilename: "resume.pdf",
    fileSizeBytes: 1024,
    mimeType: "application/pdf",
    pageCount: 2,
  };
  assert.equal(createResumeSchema.safeParse(resume).success, true);
  assert.equal(
    createResumeSchema.safeParse({ ...resume, mimeType: "text/plain" }).success,
    false,
  );
  assert.equal(
    createResumeSchema.safeParse({ ...resume, fileSizeBytes: 25_000_001 }).success,
    false,
  );
});
