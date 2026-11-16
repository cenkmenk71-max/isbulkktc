import "server-only";

import { unstable_cache } from "next/cache";
import { createSupabasePublicClient, createSupabaseServerClient } from "@/server/db/supabase-server";
import type { Database } from "@/types/database";

export type PublicJobPackage = Database["public"]["Tables"]["job_packages"]["Row"];
export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type PaymentSubmissionRow = Database["public"]["Tables"]["payment_submissions"]["Row"];
export type CreditAccountRow = Database["public"]["Tables"]["credit_accounts"]["Row"];
export type PaymentInstructionRow = {
  id: string;
  beneficiary_name: string;
  bank_name: string;
  iban_display: string;
  currency: string;
  instructions: string;
};

const loadJobPackages = unstable_cache(
  async (): Promise<PublicJobPackage[]> => {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.rpc("get_public_job_packages");
    if (error) throw new Error("Public job packages could not be loaded.", { cause: error });
    return data ?? [];
  },
  ["public-job-packages"],
  { tags: ["public-job-packages"], revalidate: 3600 },
);

export async function getPublicJobPackages(): Promise<PublicJobPackage[]> {
  try {
    return await loadJobPackages();
  } catch (error) {
    console.warn("Public job packages could not be read; returning empty list.", {
      cause: error instanceof Error ? error.message : undefined,
    });
    return [];
  }
}

export async function getActivePaymentInstruction(forAdmin = false): Promise<PaymentInstructionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_active_payment_instruction", {
    _for_admin: forAdmin,
  });
  if (error) throw new Error("Active payment instruction could not be loaded.", { cause: error });
  return data?.[0] ?? null;
}

export async function getCompanyOrders(companyId: string): Promise<OrderRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_orders", { _company_id: companyId });
  if (error) throw new Error("Company orders could not be loaded.", { cause: error });
  return data ?? [];
}

export async function getCompanyCreditAccount(companyId: string): Promise<CreditAccountRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("credit_accounts")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error("Credit account could not be loaded.", { cause: error });
  return data;
}

export async function getCompanyJobEntitlements(companyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_job_entitlements", {
    _company_id: companyId,
  });
  if (error) throw new Error("Company job entitlements could not be loaded.", { cause: error });
  return data ?? [];
}