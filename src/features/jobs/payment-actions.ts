"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getLocalePrefix } from "@/i18n/routing";
import { hasAssignedPlatformRole, getCurrentUser } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export type ReconcilePaymentState = {
  status: "idle" | "error" | "success";
  message:
    | "idle"
    | "unauthorized"
    | "mfaRequired"
    | "invalid"
    | "reconcileFailed"
    | "reconciled";
};

const initialReconcileState: ReconcilePaymentState = {
  status: "idle",
  message: "idle",
};

const reconcilePaymentSchema = z.object({
  idempotencyKey: z.string().trim().min(10).max(120),
  submissionId: z.string().uuid(),
  decision: z.enum(["accepted", "rejected", "needs_more_info"]),
  bankReferenceNormalized: z.string().trim().min(4).max(60).toUpperCase(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

async function isActiveBillingAdmin() {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return null;
  const hasBillingAdmin = await hasAssignedPlatformRole("billing_admin");
  const hasPlatformAdmin = await hasAssignedPlatformRole("platform_admin");
  return hasBillingAdmin || hasPlatformAdmin ? user : null;
}

export async function reconcilePayment(
  _previousState: ReconcilePaymentState,
  formData: FormData,
): Promise<ReconcilePaymentState> {
  const user = await isActiveBillingAdmin();
  if (!user) {
    return { ...initialReconcileState, status: "error", message: "unauthorized" };
  }

  const result = reconcilePaymentSchema.safeParse({
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
    submissionId: String(formData.get("submissionId") ?? ""),
    decision: String(formData.get("decision") ?? ""),
    bankReferenceNormalized: String(formData.get("bankReferenceNormalized") ?? ""),
    notes: formData.get("notes") ? String(formData.get("notes")) : null,
  });
  if (!result.success) {
    return { ...initialReconcileState, status: "error", message: "invalid" };
  }

  const supabase = await createSupabaseServerClient({ allowCookieWrites: true });
  const { error } = await supabase.rpc("reconcile_payment", {
    _reconciliation_idempotency_key: result.data.idempotencyKey,
    _submission_id: result.data.submissionId,
    _decision: result.data.decision,
    _bank_reference_normalized: result.data.bankReferenceNormalized,
    _notes: result.data.notes ?? null,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialReconcileState, status: "error", message: "mfaRequired" };
    }
    if (error.code === "P0001" || error.code === "22023") {
      return { ...initialReconcileState, status: "error", message: "reconcileFailed" };
    }
    console.error("Payment reconciliation failed.", { code: error.code });
    return { ...initialReconcileState, status: "error", message: "reconcileFailed" };
  }

  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/admin/payments`);
  return { status: "success", message: "reconciled" };
}

export type SavePaymentInstructionState = {
  status: "idle" | "error" | "success";
  message:
    | "idle"
    | "unauthorized"
    | "invalid"
    | "saveFailed"
    | "saved"
    | "deleteFailed"
    | "deleted";
};

const initialSaveInstructionState: SavePaymentInstructionState = {
  status: "idle",
  message: "idle",
};

const savePaymentInstructionSchema = z.object({
  instructionId: z.string().uuid().nullable(),
  beneficiaryName: z.string().trim().min(2).max(120),
  bankName: z.string().trim().min(2).max(80),
  ibanRestrictedValue: z.string().trim().min(15).max(34).toUpperCase(),
  currency: z.string().trim().length(3).toUpperCase(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  activeFrom: z.string().datetime(),
  activeTo: z.string().datetime().nullable(),
});

async function isActivePlatformAdmin() {
  const user = await getCurrentUser();
  return user?.status === "active" && (await hasAssignedPlatformRole("platform_admin"))
    ? user
    : null;
}

export async function savePaymentInstruction(
  _previousState: SavePaymentInstructionState,
  formData: FormData,
): Promise<SavePaymentInstructionState> {
  const user = await isActivePlatformAdmin();
  if (!user) {
    return { ...initialSaveInstructionState, status: "error", message: "unauthorized" };
  }

  const result = savePaymentInstructionSchema.safeParse({
    instructionId: formData.get("instructionId") ? String(formData.get("instructionId")) : null,
    beneficiaryName: String(formData.get("beneficiaryName") ?? ""),
    bankName: String(formData.get("bankName") ?? ""),
    ibanRestrictedValue: String(formData.get("ibanRestrictedValue") ?? ""),
    currency: String(formData.get("currency") ?? ""),
    instructions: formData.get("instructions") ? String(formData.get("instructions")) : null,
    activeFrom: String(formData.get("activeFrom") ?? ""),
    activeTo: formData.get("activeTo") ? String(formData.get("activeTo")) : null,
  });
  if (!result.success) {
    return { ...initialSaveInstructionState, status: "error", message: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_save_payment_instruction", {
    _instruction_id: result.data.instructionId,
    _beneficiary_name: result.data.beneficiaryName,
    _bank_name: result.data.bankName,
    _iban_restricted_value: result.data.ibanRestrictedValue,
    _currency: result.data.currency,
    _instructions: result.data.instructions ?? null,
    _active_from: result.data.activeFrom,
    _active_to: result.data.activeTo ?? null,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialSaveInstructionState, status: "error", message: "unauthorized" };
    }
    if (error.code === "22023" || error.code === "23505") {
      return { ...initialSaveInstructionState, status: "error", message: "invalid" };
    }
    console.error("Payment instruction save failed.", { code: error.code });
    return { ...initialSaveInstructionState, status: "error", message: "saveFailed" };
  }

  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/admin/payment-instructions`);
  return { status: "success", message: "saved" };
}

export async function deletePaymentInstruction(
  _previousState: SavePaymentInstructionState,
  formData: FormData,
): Promise<SavePaymentInstructionState> {
  const user = await isActivePlatformAdmin();
  if (!user) {
    return { ...initialSaveInstructionState, status: "error", message: "unauthorized" };
  }

  const instructionId = formData.get("instructionId");
  const result = z.string().uuid().safeParse(instructionId);
  if (!result.success) {
    return { ...initialSaveInstructionState, status: "error", message: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_delete_payment_instruction", {
    _instruction_id: result.data,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialSaveInstructionState, status: "error", message: "unauthorized" };
    }
    if (error.code === "P0001" || error.code === "22023") {
      return { ...initialSaveInstructionState, status: "error", message: "deleteFailed" };
    }
    console.error("Payment instruction delete failed.", { code: error.code });
    return { ...initialSaveInstructionState, status: "error", message: "deleteFailed" };
  }

  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/admin/payment-instructions`);
  return { status: "success", message: "deleted" };
}