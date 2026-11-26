"use server";

import {
  revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import {
  getCurrentUser,
  hasAssignedPlatformRole,
} from "@/server/dal/user";
import { getOwnedCompany } from "@/server/dal/companies";
import { getLocalePrefix } from "@/i18n/routing";
import { companyDirectory } from "./directory-data";
import type { CompanyDirectoryEntry } from "./directory";
import { getManagedDirectoryEntries } from "@/server/dal/content";
// Namespace import, not a named one: the integration harness replaces this
// module with a recorder whose export list is written out by hand, and a named
// import of a function that list omits fails at ESM link time — killing every
// test that merely imports this action, not just the one that sends mail. The
// send is best-effort behind a try/catch anyway, so a double that lacks it
// degrades to a caught error exactly like a delivery failure.
import * as mailer from "@/server/email/mailer";
import {
  companyProfileSchema,
  companyProfileSubmissionReviewSchema,
  companyVerificationReviewSchema,
  createCompanySchema,
  type CompanyProfileFormState,
  type CompanyProfileSubmissionReviewState,
  type CompanyVerificationReviewState,
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
    `${getLocalePrefix(user.locale)}/company/dashboard?company=${encodeURIComponent(companyId)}&created=1`,
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

  const categoriesArray = result.data.categoriesText;

  const supabase = await createSupabaseServerClient();

  // Call SECURITY DEFINER RPC to finalize company profile with auto-verification
  // @ts-expect-error - RPC not yet in generated types
  const { error: rpcError } = await supabase.rpc("finalize_company_profile", {
    _company_id: company.id,
    _company_name: result.data.companyName,
    _profile_description: result.data.profileDescription,
    _categories: categoriesArray,
    _website: result.data.website,
    _phone: result.data.phone,
    _public_email: result.data.publicEmail,
    _address: result.data.address,
    _municipality: result.data.municipality,
    _directory_entry_id: directoryTarget?.directoryEntryId ?? null,
    _directory_location_index: directoryTarget?.directoryLocationIndex ?? null,
  });

  if (rpcError) {
    if (rpcError.code === "42501") {
      return { status: "error", message: "unauthorized" };
    }
    if (rpcError.code === "22023") {
      return { status: "error", message: "invalid" };
    }
    console.error("Company profile finalization failed.", { code: rpcError.code });
    return { status: "error", message: "saveFailed" };
  }

  // Send dual emails: employer welcome + admin notification
  try {
    await mailer.sendCompanyProfileVerifiedEmails({
      employerEmail: user.email,
      employerLocale: user.locale,
      adminEmail: "info@isbulkktc.com",
      companyName: result.data.companyName,
      categories: categoriesArray.join(", ") || null,
      website: result.data.website,
      phone: result.data.phone,
      publicEmail: result.data.publicEmail,
      address: result.data.address,
      submittedBy: user.email,
      submissionId: `profile-${company.id}-${Date.now()}`,
    });
  } catch (mailError) {
    console.error("Company profile verified emails could not be sent.", {
      error: mailError instanceof Error ? mailError.message : "unknown_error",
    });
  }

  revalidatePath(`${getLocalePrefix(user.locale)}/company/dashboard`);
  revalidatePath(`${getLocalePrefix(user.locale)}/companies`);

  // Redirect to packages page with success banner
  redirect(`${getLocalePrefix(user.locale)}/packages?companySetup=completed`);
}

export async function reviewCompanyProfile(
  _previousState: CompanyProfileSubmissionReviewState,
  formData: FormData,
): Promise<CompanyProfileSubmissionReviewState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { status: "error", message: "unauthorized" };
  }

  const result = companyProfileSubmissionReviewSchema.safeParse({
    submissionId: formData.get("submissionId"),
    decision: formData.get("decision"),
    reviewNote: formData.get("reviewNote"),
  });
  if (!result.success) {
    return { status: "error", message: "failed" };
  }
  const { submissionId, decision, reviewNote } = result.data;

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

export async function reviewCompanyVerification(
  _previousState: CompanyVerificationReviewState,
  formData: FormData,
): Promise<CompanyVerificationReviewState> {
  const user = await getCurrentUser();
  if (
    !user ||
    user.status !== "active" ||
    !(await hasAssignedPlatformRole("platform_admin"))
  ) {
    return { status: "error", message: "unauthorized" };
  }

  const result = companyVerificationReviewSchema.safeParse({
    companyId: formData.get("companyId"),
    decision: formData.get("decision"),
  });
  if (!result.success) return { status: "error", message: "failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_company_verification", {
    _company_id: result.data.companyId,
    _decision: result.data.decision,
  });

  if (error) {
    if (error.code === "42501") {
      return { status: "error", message: "unauthorized" };
    }

    console.error("Company verification review failed.", {
      code: error.code,
    });
    return { status: "error", message: "failed" };
  }

  revalidatePath(`${getLocalePrefix(user.locale)}/admin/company-profiles`);
  revalidatePath(`${getLocalePrefix(user.locale)}/companies`);
  return { status: "success", message: result.data.decision };
}
