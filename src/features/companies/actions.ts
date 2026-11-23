"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import {
  getCurrentUser,
  hasAssignedPlatformRole,
} from "@/server/dal/user";
import { getOwnedCompany } from "@/server/dal/companies";
import { getLocalePrefix } from "@/i18n/routing";
import { getManagedDirectoryEntries } from "@/server/dal/content";
import type { CompanyDirectoryEntry } from "./directory";
import { companyDirectory } from "./directory-data";
import * as mailer from "@/server/email/mailer";
import {
  companyProfileSchema,
  companyVerificationReviewSchema,
  createCompanySchema,
  companySubmissionSchema,
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
    tradeName: formData.get("tradeName"),
    slug: formData.get("slug"),
  });

  if (!result.success) {
    return { status: "error", message: "invalid" };
  }

  const supabase = await createSupabaseServerClient({ allowCookieWrites: true });
  const { data: companyId, error } = await supabase.rpc("create_company", {
    company_name: result.data.tradeName,
    company_slug: result.data.slug,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "duplicate" };
    }
    if (error.code === "42501") {
      return { status: "error", message: "unauthorized" };
    }
    console.error("Company creation failed.", { code: error.code });
    return { status: "error", message: "failed" };
  }

  if (!companyId) {
    console.error("Company creation returned no company identifier.");
    return { status: "error", message: "failed" };
  }

  redirect(
    `${getLocalePrefix(user.locale)}/company/dashboard?company=${encodeURIComponent(companyId)}&created=1`,
  );
}

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
    tradeName: formData.get("tradeName"),
    tradeTitle: formData.get("tradeTitle"),
    companyType: formData.get("companyType"),
    taxNumber: formData.get("taxNumber"),
    tradeRegistryNumber: formData.get("tradeRegistryNumber"),
    mersisNo: formData.get("mersisNo"),
    establishmentDate: formData.get("establishmentDate"),
    capital: formData.get("capital") ? Number(formData.get("capital")) : null,
    currency: formData.get("currency"),
    registeredAddress: formData.get("registeredAddress"),
    registeredDistrict: formData.get("registeredDistrict"),
    registeredMunicipality: formData.get("registeredMunicipality"),
    registeredPostalCode: formData.get("registeredPostalCode"),
    workplaceAddress: formData.get("workplaceAddress"),
    workplaceDistrict: formData.get("workplaceDistrict"),
    workplaceMunicipality: formData.get("workplaceMunicipality"),
    workplacePostalCode: formData.get("workplacePostalCode"),
    phone: formData.get("phone"),
    fax: formData.get("fax"),
    email: formData.get("email"),
    website: formData.get("website"),
    authorizedSignatories: formData.get("authorizedSignatories"),
    naceCode: formData.get("naceCode"),
    sector: formData.get("sector"),
    subSector: formData.get("subSector"),
    keywords: formData.get("keywords"),
    bankName: formData.get("bankName"),
    iban: formData.get("iban"),
    insuranceNumber: formData.get("insuranceNumber"),
    employeeCount: formData.get("employeeCount") ? Number(formData.get("employeeCount")) : null,
    annualTurnoverRange: formData.get("annualTurnoverRange"),
    linkedIn: formData.get("linkedIn"),
    instagram: formData.get("instagram"),
    facebook: formData.get("facebook"),
    twitter: formData.get("twitter"),
    youtube: formData.get("youtube"),
    profileDescription: formData.get("profileDescription"),
    categoriesText: formData.get("categoriesText"),
    directoryTarget: formData.get("directoryTarget"),
  });

  if (!result.success) {
    console.error("Company profile validation failed:", result.error.flatten());
    return { status: "error", message: "invalid" };
  }

  const company = await getOwnedCompany(user.id, result.data.companyId);
  if (!company) return { status: "error", message: "unauthorized" };

  const directoryTarget = getDirectoryTarget(
    result.data.directoryTarget ?? "",
    await getDirectoryEntries(),
  );
  if (result.data.directoryTarget && !directoryTarget) {
    return { status: "error", message: "invalid" };
  }

  const profile = {
    company_name: result.data.tradeName,
    trade_title: result.data.tradeTitle ?? undefined,
    company_type: result.data.companyType ?? undefined,
    tax_number: result.data.taxNumber ?? undefined,
    trade_registry_number: result.data.tradeRegistryNumber ?? undefined,
    mersis_no: result.data.mersisNo ?? undefined,
    establishment_date: result.data.establishmentDate ?? undefined,
    capital: result.data.capital ?? undefined,
    currency: result.data.currency ?? undefined,
    registered_address: result.data.registeredAddress ?? undefined,
    registered_district: result.data.registeredDistrict ?? undefined,
    registered_municipality: result.data.registeredMunicipality ?? undefined,
    registered_postal_code: result.data.registeredPostalCode ?? undefined,
    workplace_address: result.data.workplaceAddress ?? undefined,
    workplace_district: result.data.workplaceDistrict ?? undefined,
    workplace_municipality: result.data.workplaceMunicipality ?? undefined,
    workplace_postal_code: result.data.workplacePostalCode ?? undefined,
    phone: result.data.phone ?? undefined,
    fax: result.data.fax ?? undefined,
    public_email: result.data.email ?? undefined,
    website: result.data.website ?? undefined,
    authorized_signatories: result.data.authorizedSignatories ?? undefined,
    nace_code: result.data.naceCode ?? undefined,
    sub_sector: result.data.subSector ?? undefined,
    keywords: result.data.keywords ?? undefined,
    bank_name: result.data.bankName ?? undefined,
    iban: result.data.iban ?? undefined,
    insurance_number: result.data.insuranceNumber ?? undefined,
    employee_count: result.data.employeeCount ?? undefined,
    annual_turnover_range: result.data.annualTurnoverRange ?? undefined,
    linked_in: result.data.linkedIn ?? undefined,
    instagram: result.data.instagram ?? undefined,
    facebook: result.data.facebook ?? undefined,
    twitter: result.data.twitter ?? undefined,
    youtube: result.data.youtube ?? undefined,
    profile_description: result.data.profileDescription ?? undefined,
    categories: result.data.categoriesText ?? undefined,
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

  const { data: submissionId, error } = pendingSubmission
    ? await supabase
        .from("company_profile_submissions")
        .update(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          profile as any,
        )
        .eq("id", pendingSubmission.id)
        .select("id")
        .single()
    : await supabase
        .from("company_profile_submissions")
        .insert({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(profile as any),
          company_id: company.id,
          submitted_by: user.id,
        })
        .select("id")
        .single();

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

  try {
    await mailer.sendCompanyProfileEmails({
      to: user.email,
      locale: user.locale,
      submissionId: submissionId.id,
      companyName: result.data.tradeName,
      categories: result.data.categoriesText.join(", ") || null,
      website: result.data.website,
      phone: result.data.phone,
      publicEmail: result.data.email,
      address: result.data.registeredAddress,
      submittedBy: user.email,
    });
  } catch (mailError) {
    console.error("Company profile notification could not be sent.", {
      error: mailError instanceof Error ? mailError.message : "unknown_error",
    });
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