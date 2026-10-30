"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getCurrentUser } from "@/server/dal/user";
import { getOwnedCompany } from "@/server/dal/companies";
import { getLocalePrefix } from "@/i18n/routing";
import { companyDirectory } from "./directory-data";
import type { CompanyDirectoryEntry } from "./directory";
import { getManagedDirectoryEntries } from "@/server/dal/content";
import {
  companyProfileSchema,
  createCompanySchema,
  type CompanyProfileFormState,
  type CompanyProfileSubmissionReviewState,
  type CreateCompanyFormState,
} from "./schemas";

export async function createCompany(
  _previousState: CreateCompanyFormState,
  formData: FormData,
): Promise<CreateCompanyFormState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "unauthorized" };
  if (user.status !== "active") return { status: "error", message: "unauthorized" };

  const result = createCompanySchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "invalid",
    };
  }

  const supabase = await createSupabaseServerClient({ allowCookieWrites: true });
  const { data: companyId, error } = await supabase.rpc("create_company", {
    company_name: result.data.name,
    company_slug: result.data.slug,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        message: "duplicate",
      };
    }

    if (error.code === "42501") {
      return {
        status: "error",
        message: "unauthorized",
      };
    }

    console.error("Company creation failed.", { code: error.code });
    return {
      status: "error",
      message: "failed",
    };
  }

  if (!companyId) {
    console.error("Company creation returned no company identifier.");
    return { status: "error", message: "failed" };
  }

  redirect(
    `${getLocalePrefix(user.locale)}/company/dashboard?company=${encodeURIComponent(companyId)}`,
  );
}

/**
 * Directory entries for branch validation. The managed table is authoritative;
 * the bundled bundle is the offline fallback. Logos are irrelevant here, so the
 * rows are used as-is.
 */
async function getDirectoryEntries(): Promise<readonly CompanyDirectoryEntry[]> {
  return (await getManagedDirectoryEntries()) ?? companyDirectory;
}

function getDirectoryTarget(
  value: string,
  entries: readonly CompanyDirectoryEntry[],
) {
  if (!value) return null;
  const [entryId, rawLocationIndex, extra] = value.split(":");
  const locationIndex = Number(rawLocationIndex);
  if (
    !entryId ||
    extra !== undefined ||
    !Number.isSafeInteger(locationIndex) ||
    locationIndex < 0
  ) {
    return null;
  }

  const entry = entries.find(({ id }) => id === entryId);
  if (!entry || !entry.locations[locationIndex]) return null;
  return { directoryEntryId: entryId, directoryLocationIndex: locationIndex };
}

export async function submitCompanyProfile(
  _previousState: CompanyProfileFormState,
  formData: FormData,
): Promise<CompanyProfileFormState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "unauthorized" };
  if (user.status !== "active") return { status: "error", message: "inactive" };

  const result = companyProfileSchema.safeParse({
    companyId: formData.get("companyId"),
    companyName: formData.get("companyName"),
    profileDescription: formData.get("profileDescription"),
    categoriesText: formData.get("categoriesText"),
    website: formData.get("website"),
    phone: formData.get("phone"),
    publicEmail: formData.get("publicEmail"),
    address: formData.get("address"),
    municipality: formData.get("municipality"),
    directoryTarget: formData.get("directoryTarget"),
  });
  if (!result.success) return { status: "error", message: "invalid" };

  const company = await getOwnedCompany(user.id, result.data.companyId);
  if (!company) return { status: "error", message: "unauthorized" };

  const directoryTarget = getDirectoryTarget(
    result.data.directoryTarget,
    await getDirectoryEntries(),
  );
  if (result.data.directoryTarget && !directoryTarget) {
    return { status: "error", message: "invalid" };
  }

  const profile = {
    company_name: result.data.companyName,
    profile_description: result.data.profileDescription,
    categories: result.data.categoriesText,
    website: result.data.website,
    phone: result.data.phone,
    public_email: result.data.publicEmail,
    address: result.data.address,
    municipality: result.data.municipality,
    directory_entry_id: directoryTarget?.directoryEntryId ?? null,
    directory_location_index: directoryTarget?.directoryLocationIndex ?? null,
  };
  const supabase = await createSupabaseServerClient();
  const { data: pendingSubmission, error: lookupError } = await supabase
    .from("company_profile_submissions")
    .select("id")
    .eq("company_id", company.id)
    .eq("status", "pending")
    .maybeSingle();

  if (lookupError) {
    console.error("Company profile submission lookup failed.", {
      code: lookupError.code,
    });
    return { status: "error", message: "saveFailed" };
  }

  const { error } = pendingSubmission
    ? await supabase
        .from("company_profile_submissions")
        .update(profile)
        .eq("id", pendingSubmission.id)
    : await supabase.from("company_profile_submissions").insert({
        ...profile,
        company_id: company.id,
        submitted_by: user.id,
      });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "pending" };
    }
    if (error.code === "42501") {
      return { status: "error", message: "unauthorized" };
    }
    console.error("Company profile submission failed.", { code: error.code });
    return { status: "error", message: "saveFailed" };
  }

  revalidatePath(`${getLocalePrefix(user.locale)}/company/dashboard`);
  return { status: "success", message: "submitted" };
}

export async function reviewCompanyProfile(
  _previousState: CompanyProfileSubmissionReviewState,
  formData: FormData,
): Promise<CompanyProfileSubmissionReviewState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { status: "error", message: "unauthorized" };
  }

  const submissionId = formData.get("submissionId");
  const decision = formData.get("decision");
  const reviewNote = formData.get("reviewNote");
  if (
    typeof submissionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(submissionId) ||
    (decision !== "approved" && decision !== "rejected") ||
    typeof reviewNote !== "string" ||
    reviewNote.length > 1_000
  ) {
    return { status: "error", message: "failed" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: submission, error: loadError } = await supabase
    .from("company_profile_submissions")
    .select("directory_entry_id, directory_location_index")
    .eq("id", submissionId)
    .maybeSingle();

  if (loadError) {
    console.error("Company profile review lookup failed.", {
      code: loadError.code,
    });
    return { status: "error", message: "failed" };
  }
  if (!submission) return { status: "error", message: "failed" };

  if (submission.directory_entry_id !== null) {
    const entries = await getDirectoryEntries();
    const entry = entries.find(
      ({ id }) => id === submission.directory_entry_id,
    );
    if (
      !entry ||
      submission.directory_location_index === null ||
      !entry.locations[submission.directory_location_index]
    ) {
      return { status: "error", message: "branchUnavailable" };
    }
  }

  const { error } = await supabase.rpc("review_company_profile_submission", {
    _submission_id: submissionId,
    _decision: decision,
    _review_note: reviewNote || null,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "unauthorized" };
    }
    console.error("Company profile review failed.", { code: error.code });
    return { status: "error", message: "failed" };
  }

  revalidatePath(`${getLocalePrefix(user.locale)}/admin/company-profiles`);
  revalidatePath(`${getLocalePrefix(user.locale)}/companies`);
  return {
    status: "success",
    message: decision === "approved" ? "approved" : "rejected",
  };
}
