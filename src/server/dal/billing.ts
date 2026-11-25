import "server-only";

import {
  creditAdjustmentSchema,
  creditLedgerEntrySchema,
  creditLedgerQuerySchema,
  createOrderSchema,
  orderPaymentInstructionsSchema,
  paymentInstructionsUpdateSchema,
  reconciliationSchema,
  submitPaymentSchema,
  type CreateOrderInput,
  type CreditAdjustment,
  type CreditLedgerQuery,
  type OrderPaymentInstructions,
  type PaymentInstructionsUpdate,
  type ReconciliationInput,
  type SubmitPaymentInput,
} from "@/features/billing/schemas";
import { requirePlatformRole, requireAuthenticatedUser } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

function requireValid<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  return schema.parse(value);
}

export async function createCompanyOrder(input: CreateOrderInput): Promise<string> {
  const parsed = requireValid(createOrderSchema, input);
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to create an order.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_order", {
    _company_id: parsed.companyId,
    _listing_plan_code: parsed.listingPlanCode,
    _duration_days: parsed.durationDays,
  });
  if (error || !data) {
    throw new Error("The company order could not be created.", { cause: error });
  }
  return data;
}

export async function submitCompanyPayment(input: SubmitPaymentInput): Promise<string> {
  const parsed = requireValid(submitPaymentSchema, input);
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to submit payment.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_payment", {
    _order_id: parsed.orderId,
    _sender_name: parsed.senderName,
    _transfer_reference: parsed.transferReference,
    _amount_minor: parsed.amountMinor,
    _currency: parsed.currency,
    _transferred_at: parsed.transferredAt,
    _receipt_storage_path: null,
  });
  if (error || !data) {
    throw new Error("The payment submission could not be recorded.", {
      cause: error,
    });
  }
  return data;
}

export async function getOrderPaymentInstructions(
  orderId: string,
): Promise<OrderPaymentInstructions> {
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to view payment instructions.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_order_payment_instructions", {
    _order_id: orderId,
  });
  if (error) {
    throw new Error("Payment instructions could not be loaded.", { cause: error });
  }

  const rows = orderPaymentInstructionsSchema.array().parse(data);
  if (rows.length !== 1) {
    throw new Error("The order has no valid payment instruction snapshot.");
  }
  return rows[0];
}

export async function getCompanyCreditLedger(
  input: CreditLedgerQuery,
) {
  const parsed = requireValid(creditLedgerQuerySchema, input);
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to view company credits.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_credit_ledger", {
    _company_id: parsed.companyId,
    _limit: parsed.limit,
    _offset: parsed.offset,
  });
  if (error) {
    throw new Error("The company credit ledger could not be loaded.", {
      cause: error,
    });
  }
  return creditLedgerEntrySchema.array().parse(data);
}

export async function savePaymentInstructions(
  input: PaymentInstructionsUpdate,
): Promise<string> {
  const parsed = requireValid(paymentInstructionsUpdateSchema, input);
  await requirePlatformRole("platform_admin");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_save_payment_instructions", {
    _beneficiary_name: parsed.beneficiaryName,
    _bank_name: parsed.bankName,
    _iban_restricted_value: parsed.ibanRestrictedValue,
    _currency: parsed.currency,
    _instructions: parsed.instructions,
    _active_from: parsed.activeFrom,
    _active_to: parsed.activeTo,
  });
  if (error || !data) {
    throw new Error("Payment instructions could not be saved.", { cause: error });
  }
  return data;
}

export async function reviewPaymentSubmission(
  orderId: string,
  submissionId: string,
): Promise<void> {
  await requirePlatformRole("platform_admin");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_payment_submission", {
    _order_id: orderId,
    _submission_id: submissionId,
  });
  if (error) {
    throw new Error("The payment submission could not enter review.", {
      cause: error,
    });
  }
}

export async function reconcilePayment(input: ReconciliationInput): Promise<void> {
  const parsed = requireValid(reconciliationSchema, input);
  await requirePlatformRole("platform_admin");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_reconcile_payment", {
    _order_id: parsed.orderId,
    _submission_id: parsed.submissionId,
    _decision: parsed.decision,
    _bank_reference_normalized: parsed.bankReferenceNormalized,
    _notes: parsed.notes,
  });
  if (error) {
    throw new Error("The payment reconciliation could not be recorded.", {
      cause: error,
    });
  }
}

export async function adjustCompanyCredits(input: CreditAdjustment): Promise<void> {
  const parsed = requireValid(creditAdjustmentSchema, input);
  await requirePlatformRole("billing_admin");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("adjust_credit_balance", {
    _company_id: parsed.companyId,
    _quantity_delta: parsed.quantityDelta,
    _entry_type: parsed.entryType,
    _idempotency_key: parsed.idempotencyKey,
    _reason: parsed.reason,
  });
  if (error) {
    throw new Error("The company credit balance could not be adjusted.", {
      cause: error,
    });
  }
}
