import "server-only";

import { requirePlatformRole } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export async function getAdminPackageConsoleData() {
  await requirePlatformRole("platform_admin");
  const supabase = await createSupabaseServerClient();
  const [{ data: packages, error: packageError }, { data: companies, error: companyError }] =
    await Promise.all([
      supabase.rpc("admin_list_job_packages"),
      supabase.rpc("admin_list_verified_companies"),
    ]);

  if (packageError) {
    throw new Error("Admin job packages could not be loaded.", {
      cause: packageError,
    });
  }
  if (companyError) {
    throw new Error("Verified companies could not be loaded for package assignment.", {
      cause: companyError,
    });
  }

  return { packages, companies };
}
