import "server-only";

import { requirePlatformRole } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import type { Database } from "@/types/database";

export type AdminOrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  company_name: string;
  company_slug: string;
  package_name: string;
  package_code: string;
  submission_id: string | null;
  submission_status: string | null;
  submission_sender_name: string | null;
  submission_transfer_reference: string | null;
  submission_amount_minor: number | null;
  submission_currency: string | null;
  submission_receipt_path: string | null;
  submission_created_at: string | null;
  reconciliation_id: string | null;
  reconciliation_decision: string | null;
  reconciliation_notes: string | null;
  reconciliation_reviewed_at: string | null;
  reconciliation_bank_ref: string | null;
  reviewed_by_name: string | null;
};

export type AdminPaymentInstructionRow = Database["public"]["Tables"]["payment_instruction_versions"]["Row"];

export async function getAdminPaymentConsoleData(): Promise<{
  orders: AdminOrderRow[];
  instructions: AdminPaymentInstructionRow[];
}> {
  await requirePlatformRole("billing_admin");
  const supabase = await createSupabaseServerClient();

  const [{ data: orders, error: orderError }, { data: instructions, error: instructionError }] =
    await Promise.all([
      supabase.rpc("admin_list_payment_console_orders"),
      supabase.rpc("admin_list_payment_instructions"),
    ]);

  if (orderError) {
    throw new Error("Admin payment orders could not be loaded.", { cause: orderError });
  }
  if (instructionError) {
    throw new Error("Admin payment instructions could not be loaded.", { cause: instructionError });
  }

  return { orders: orders ?? [], instructions: instructions ?? [] };
}

export async function getAdminPaymentInstructionVersions(): Promise<AdminPaymentInstructionRow[]> {
  await requirePlatformRole("platform_admin");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("payment_instruction_versions")
    .select("*")
    .order("active_from", { ascending: false });

  if (error) {
    throw new Error("Payment instruction versions could not be loaded.", { cause: error });
  }

  return data ?? [];
}

export async function createSignedReceiptUrl(storagePath: string): Promise<string> {
  await requirePlatformRole("billing_admin");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.storage
    .from("private-payment-receipts")
    .createSignedUrl(storagePath, 60 * 15);

  if (error) {
    throw new Error("Receipt signed URL could not be created.", { cause: error });
  }

  return data.signedUrl;
}