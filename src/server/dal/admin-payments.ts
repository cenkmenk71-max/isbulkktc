import "server-only";

import { requirePlatformRole } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export async function getPendingPayments() {
  await requirePlatformRole("platform_admin");
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("payment_confirmations")
    .select(
      `
        id,
        company_id,
        package_id,
        amount,
        currency,
        requested_at,
        companies!inner (name, slug, public_email),
        job_packages!inner (code, display_name, max_active_jobs)
      `,
    )
    .order("requested_at", { ascending: false });

  if (error) {
    throw new Error("Pending payments could not be loaded.", { cause: error });
  }

  return (data ?? []).map((row: {
    id: string;
    company_id: string;
    package_id: string;
    amount: number;
    currency: string;
    requested_at: string;
    companies: { name: string; slug: string; public_email: string | null };
    job_packages: { code: string; display_name: string; max_active_jobs: number };
  }) => ({
    id: row.id,
    company_id: row.company_id,
    company_name: row.companies.name,
    company_slug: row.companies.slug,
    package_id: row.package_id,
    package_code: row.job_packages.code,
    package_name: row.job_packages.display_name,
    amount: row.amount,
    currency: row.currency,
    amount_display: new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: row.currency,
    }).format(row.amount),
    requested_at: row.requested_at,
  }));
}