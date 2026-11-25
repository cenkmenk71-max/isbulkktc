import { z } from "zod";
import type { CreditEntryType, ReconciliationDecision } from "@/types/database";

const uuidSchema = z.string().uuid();
const currencySchema = z.string().regex(/^[A-Z]{3}$/);

export const createOrderSchema = z
  .object({
    companyId: uuidSchema,
    listingPlanCode: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    durationDays: z.union([z.literal(1), z.literal(7), z.literal(30)]),
  })
  .strict();

export const submitPaymentSchema = z
  .object({
    orderId: uuidSchema,
    senderName: z.string().trim().min(1).max(120),
    transferReference: z.string().trim().min(1).max(128),
    amountMinor: z.number().int().positive().max(100_000_000),
    currency: currencySchema,
    transferredAt: z.iso.datetime(),
  })
  .strict();

export const orderPaymentInstructionsSchema = z
  .object({
    beneficiary_name: z.string().min(1).max(120),
    bank_name: z.string().min(1).max(120),
    iban_restricted_value: z.string().min(15).max(34),
    currency: currencySchema,
    instructions: z.string().max(5000).nullable(),
    reference_code: z.string().min(8).max(64),
    total_minor: z.number().int().positive(),
    expires_at: z.iso.datetime(),
  })
  .strict();

export const reconciliationSchema = z
  .object({
    orderId: uuidSchema,
    submissionId: uuidSchema,
    decision: z.custom<ReconciliationDecision>(
      (value) => value === "accepted" || value === "rejected",
    ),
    bankReferenceNormalized: z.string().trim().min(1).max(128),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict();

export const paymentInstructionsUpdateSchema = z
  .object({
    beneficiaryName: z.string().trim().min(1).max(120),
    bankName: z.string().trim().min(1).max(120),
    ibanRestrictedValue: z.string().trim().min(15).max(34),
    currency: currencySchema.default("TRY"),
    instructions: z.string().trim().max(5000).nullable().default(null),
    activeFrom: z.iso.datetime().optional(),
    activeTo: z.iso.datetime().nullable().default(null),
  })
  .strict();

export const creditLedgerQuerySchema = z
  .object({
    companyId: uuidSchema,
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .strict();

export const creditLedgerEntrySchema = z
  .object({
    id: uuidSchema,
    company_id: uuidSchema,
    order_id: uuidSchema.nullable(),
    job_id: uuidSchema.nullable(),
    entry_type: z.custom<CreditEntryType>((value) =>
      [
        "purchase_grant",
        "job_consume",
        "job_refund",
        "manual_adjustment",
        "expiry",
        "reversal",
      ].includes(String(value)),
    ),
    quantity_delta: z.number().int().refine((value) => value !== 0),
    idempotency_key: z.string().min(1).max(128),
    actor_id: uuidSchema,
    reason: z.string().min(1).max(500),
    created_at: z.iso.datetime(),
  })
  .strict();

export const creditAdjustmentSchema = z
  .object({
    companyId: uuidSchema,
    quantityDelta: z.number().int().refine((value) => value !== 0),
    entryType: z.custom<CreditEntryType>((value) =>
      ["manual_adjustment", "reversal", "expiry"].includes(String(value)),
    ),
    idempotencyKey: z.string().trim().min(1).max(128),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;
export type OrderPaymentInstructions = z.infer<
  typeof orderPaymentInstructionsSchema
>;
export type ReconciliationInput = z.infer<typeof reconciliationSchema>;
export type PaymentInstructionsUpdate = z.infer<
  typeof paymentInstructionsUpdateSchema
>;
export type CreditLedgerQuery = z.infer<typeof creditLedgerQuerySchema>;
export type CreditLedgerEntry = z.infer<typeof creditLedgerEntrySchema>;
export type CreditAdjustment = z.infer<typeof creditAdjustmentSchema>;
