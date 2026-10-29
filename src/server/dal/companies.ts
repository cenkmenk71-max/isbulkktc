import "server-only";

import { redirect } from "next/navigation";
import { redirectLocalized } from "@/i18n/redirect";
import { getLocalePrefix } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getCurrentUser, requirePlatformRole } from "./user";
import type { Database } from "@/types/database";

type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
type CompanyProfileSubmission =
  Database["public"]["Tables"]["company_profile_submissions"]["Row"];
type CompanyDirectoryOverride =
  Database["public"]["Tables"]["company_directory_overrides"]["Row"];

export async function getOwnedCompany(
  userId: string,
  companyId: string,
): Promise<CompanyRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("membership_role", "owner")
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    throw new Error("Company ownership could not be verified.", {
      cause: membershipError,
    });
  }
  if (!membership) return null;

  const { data: company, error } = await supabase
    .from("companies")
    .select(
      "id, name, slug, verification_status, profile_description, categories, website, phone, public_email, address, municipality, directory_entry_id, directory_location_index, source_profile_url, logo_url, created_at, updated_at",
    )
    .eq("id", companyId)
    .maybeSingle();

  if (error) {
    throw new Error("The owned company profile could not be loaded.", {
      cause: error,
    });
  }

  return company;
}

export async function getEmployerWorkspace(requestedCompanyId?: string): Promise<{
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  companies: CompanyRow[];
  company: CompanyRow;
  latestSubmission: CompanyProfileSubmission | null;
}> {
  const user = await getCurrentUser();
  if (!user) return redirectLocalized("/login?audience=employer");
  if (user.status !== "active") {
    redirect(`${getLocalePrefix(user.locale)}/login?audience=employer&error=account`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("membership_role", "owner")
    .eq("status", "active");

  if (membershipError) {
    throw new Error("The employer's company memberships could not be loaded.", {
      cause: membershipError,
    });
  }

  const companyIds = memberships.map(({ company_id }) => company_id);
  if (companyIds.length === 0) {
    redirect(`${getLocalePrefix(user.locale)}/company/new`);
  }

  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select(
      "id, name, slug, verification_status, profile_description, categories, website, phone, public_email, address, municipality, directory_entry_id, directory_location_index, source_profile_url, logo_url, created_at, updated_at",
    )
    .in("id", companyIds)
    .order("name");

  if (companyError) {
    throw new Error("The employer's company profiles could not be loaded.", {
      cause: companyError,
    });
  }

  const company =
    companies.find(({ id }) => id === requestedCompanyId) ?? companies[0];
  if (!company) {
    throw new Error("An active company membership is missing its company record.");
  }

  const { data: latestSubmission, error: submissionError } = await supabase
    .from("company_profile_submissions")
    .select(
      "id, company_id, submitted_by, company_name, profile_description, categories, website, phone, public_email, address, municipality, directory_entry_id, directory_location_index, status, review_note, reviewed_by, reviewed_at, created_at, updated_at",
    )
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (submissionError) {
    throw new Error("The latest company profile submission could not be loaded.", {
      cause: submissionError,
    });
  }

  return { user, companies, company, latestSubmission };
}

export async function getPendingCompanyProfileSubmissions(): Promise<
  CompanyProfileSubmission[]
> {
  await requirePlatformRole("platform_admin");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("company_profile_submissions")
    .select(
      "id, company_id, submitted_by, company_name, profile_description, categories, website, phone, public_email, address, municipality, directory_entry_id, directory_location_index, status, review_note, reviewed_by, reviewed_at, created_at, updated_at",
    )
    .eq("status", "pending")
    .order("created_at")
    .limit(50);

  if (error) {
    throw new Error("Pending company profile submissions could not be loaded.", {
      cause: error,
    });
  }

  return data;
}

export async function getPublicCompanyDirectoryOverrides(): Promise<
  CompanyDirectoryOverride[]
> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("company_directory_overrides")
      .select(
        "directory_entry_id, directory_location_index, company_name, profile_description, categories, website, phone, public_email, address, municipality, updated_at",
      );

    if (error) {
      throw new Error("Approved company directory updates could not be loaded.", {
        cause: error,
      });
    }

    return data;
  } catch (error) {
    // The published directory ships with the deployment, so approved
    // overrides are an enhancement: keep the page fully functional and fall
    // back to the bundled directory when the database is unreachable.
    console.warn(
      "Onaylanmış şirket rehberi güncellemeleri alınamadı; paketlenmiş rehber verisi kullanılıyor.",
      error,
    );
    return [];
  }
}
