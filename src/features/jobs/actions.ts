"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getCurrentUser, getPlatformAdminMfaStatus } from "@/server/dal/user";
import { redirectLocalized } from "@/i18n/redirect";
import { getLocalePrefix } from "@/i18n/routing";
import {
  getApplicationForActor,
  getJobCompanyId,
  getJobForAdmin,
  hasPlatformRole,
  isJobCompanyMember,
} from "@/server/dal/jobs";
import { sendJobPublishedEmail, sendJobPublishedAdminEmail } from "@/server/email/mailer";
import {
  applicationIdSchema,
  applicationTransitionSchema,
  applyToJobSchema,
  companyJobPackageAssignmentSchema,
  jobDraftSchema,
  jobIdSchema,
  jobPackageSchema,
  jobReviewSchema,
  updatePublishedJobSchema,
  type ApplicationFormState,
  type JobFormState,
  type JobPackageActionState,
  type JobReviewFormState,
  type UpdatePublishedJobFormState,
} from "./schemas";

const initialJobFormState: JobFormState = {
  status: "idle",
  message: "idle",
};

const initialApplicationFormState: ApplicationFormState = {
  status: "idle",
  message: "idle",
};

const initialReviewFormState: JobReviewFormState = {
  status: "idle",
  message: "idle",
};

const initialPackageActionState: JobPackageActionState = {
  status: "idle",
  message: "idle",
};

const initialUpdatePublishedJobState: UpdatePublishedJobFormState = {
  status: "idle",
  message: "idle",
};

function activeUserError(status: string) {
  return status === "active"
    ? null
    : { status: "error" as const, message: "unauthorized" as const };
}

export async function saveJobDraft(
  _previousState: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const user = await getCurrentUser();
  if (!user) return { ...initialJobFormState, status: "error", message: "unauthorized" };
  const accountError = activeUserError(user.status);
  if (accountError) return { ...initialJobFormState, ...accountError };

  const result = jobDraftSchema.safeParse({
    jobId: formData.get("jobId") || null,
    companyId: formData.get("companyId"),
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    description: formData.get("description"),
    requirements: formData.get("requirements") ?? "",
    responsibilities: formData.get("responsibilities") ?? "",
    jobType: formData.get("jobType"),
    workplaceMode: formData.get("workplaceMode"),
    district: formData.get("district") || null,
  });
  if (!result.success) {
    return { ...initialJobFormState, status: "error", message: "invalid" };
  }

  if (!(await isJobCompanyMember(result.data.companyId))) {
    return { ...initialJobFormState, status: "error", message: "unauthorized" };
  }
  if (result.data.jobId) {
    const jobCompanyId = await getJobCompanyId(result.data.jobId);
    if (jobCompanyId !== result.data.companyId) {
      return { ...initialJobFormState, status: "error", message: "unauthorized" };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { jobId, ...job } = result.data;
  const { data, error } = jobId
    ? await supabase
        .from("jobs")
        .update({
          title: job.title,
          slug: job.slug,
          summary: job.summary,
          description: job.description,
          requirements: job.requirements,
          responsibilities: job.responsibilities,
          job_type: job.jobType,
          workplace_mode: job.workplaceMode,
          district: job.district,
        })
        .eq("id", jobId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("jobs")
        .insert({
          company_id: job.companyId,
          title: job.title,
          slug: job.slug,
          summary: job.summary,
          description: job.description,
          requirements: job.requirements,
          responsibilities: job.responsibilities,
          job_type: job.jobType,
          workplace_mode: job.workplaceMode,
          district: job.district,
        })
        .select("id")
        .single();

  if (error || !data) {
    if (error?.code === "42501" || error?.code === "PGRST116") {
      return { ...initialJobFormState, status: "error", message: "unauthorized" };
    }
    console.error("Job draft save failed.", { code: error?.code ?? "NO_ROW" });
    return { ...initialJobFormState, status: "error", message: "saveFailed" };
  }

  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/company/jobs`);
  revalidatePath(`${prefix}/company/dashboard`);
  revalidatePath(`${prefix}/admin/jobs`);

  return {
    status: "success",
    message: "saved",
    jobId: data.id,
  };
}

export async function submitJobForReview(
  _previousState: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const user = await getCurrentUser();
  if (!user) return { ...initialJobFormState, status: "error", message: "unauthorized" };
  const accountError = activeUserError(user.status);
  if (accountError) return { ...initialJobFormState, ...accountError };

  // Submit the values currently visible in the form, not a previously saved
  // snapshot. Persist first; the database RPC then performs the pending-review
  // transition. If the transition fails, preserve the saved id so the employer
  // can correct/retry without creating a duplicate draft.
  const saved = await saveJobDraft(_previousState, formData);
  if (saved.status !== "success" || !saved.jobId) return saved;

  const companyId = await getJobCompanyId(saved.jobId);
  if (!companyId || !(await isJobCompanyMember(companyId))) {
    return {
      ...initialJobFormState,
      status: "error",
      message: "unauthorized",
      jobId: saved.jobId,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_job_for_review", {
    _job_id: saved.jobId,
  });
  if (error) {
    if (error.code === "42501") {
      return {
        ...initialJobFormState,
        status: "error",
        message: "unauthorized",
        jobId: saved.jobId,
      };
    }
    if (error.code === "22023") {
      return {
        ...initialJobFormState,
        status: "error",
        message: "submitFailed",
        jobId: saved.jobId,
      };
    }
    console.error("Job moderation submission failed.", { code: error.code });
    return {
      ...initialJobFormState,
      status: "error",
      message: "submitFailed",
      jobId: saved.jobId,
    };
  }

  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/company/jobs`);
  revalidatePath(`${prefix}/company/dashboard`);
  revalidatePath(`${prefix}/admin/jobs`);
  return {
    status: "success",
    message: "submitted",
    jobId: saved.jobId,
  };
}

export async function publishApprovedJob(
  _previousState: JobFormState,
  formData: FormData,
): Promise<JobFormState> {
  const user = await getCurrentUser();
  if (!user) return { ...initialJobFormState, status: "error", message: "unauthorized" };
  const accountError = activeUserError(user.status);
  if (accountError) return { ...initialJobFormState, ...accountError };

  const result = jobIdSchema.safeParse({ jobId: formData.get("jobId") });
  if (!result.success) {
    return { ...initialJobFormState, status: "error", message: "invalid" };
  }

  const companyId = await getJobCompanyId(result.data.jobId);
  if (!companyId || !(await isJobCompanyMember(companyId))) {
    return { ...initialJobFormState, status: "error", message: "unauthorized" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_approved_job", {
    _job_id: result.data.jobId,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialJobFormState, status: "error", message: "unauthorized" };
    }
    if (error.code === "P0001") {
      const message = error.message.includes("active package")
        ? "packageRequired"
        : "packageLimit";
      return { ...initialJobFormState, status: "error", message };
    }
    if (error.code === "22023") {
      return { ...initialJobFormState, status: "error", message: "publishFailed" };
    }
    console.error("Approved job publication failed.", { code: error.code });
    return { ...initialJobFormState, status: "error", message: "publishFailed" };
  }

  // Fetch updated job details (including expires_at) for emails
  const jobDetails = await getJobForAdmin(result.data.jobId);

  // Best-effort: the employer is told the listing is live, but a mail failure
  // must not turn a successful publication into an error state.
  if (user.email && jobDetails) {
    try {
      await sendJobPublishedEmail({
        to: user.email,
        locale: user.locale,
        jobTitle: jobDetails.title,
        jobSlug: jobDetails.slug,
        jobId: result.data.jobId,
        expiresAt: jobDetails.expiresAt,
      });
    } catch (mailError) {
      console.error("Job published email could not be sent.", {
        error: mailError instanceof Error ? mailError.message : "unknown_error",
      });
    }
  }

  // Best-effort: admin notification
  if (jobDetails) {
    try {
      await sendJobPublishedAdminEmail({
        companyName: jobDetails.companies?.name ?? "Bilinmeyen Şirket",
        jobTitle: jobDetails.title,
        district: jobDetails.district,
        durationDays: jobDetails.jobDurationDays,
        jobSlug: jobDetails.slug,
      });
    } catch (mailError) {
      console.error("Job published admin email could not be sent.", {
        error: mailError instanceof Error ? mailError.message : "unknown_error",
      });
    }
  }

  return { status: "success", message: "published", jobId: result.data.jobId };
}

export async function updatePublishedJob(
  _previousState: UpdatePublishedJobFormState,
  formData: FormData,
): Promise<UpdatePublishedJobFormState> {
  const user = await getCurrentUser();
  if (!user) return { ...initialUpdatePublishedJobState, status: "error", message: "unauthorized" };
  const accountError = activeUserError(user.status);
  if (accountError) return { ...initialUpdatePublishedJobState, ...accountError };

  const result = updatePublishedJobSchema.safeParse({
    jobId: formData.get("jobId"),
    companyId: formData.get("companyId"),
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    description: formData.get("description"),
    requirements: formData.get("requirements") ?? "",
    responsibilities: formData.get("responsibilities") ?? "",
    jobType: formData.get("jobType"),
    workplaceMode: formData.get("workplaceMode"),
    district: formData.get("district") || null,
  });
  if (!result.success) {
    return { ...initialUpdatePublishedJobState, status: "error", message: "invalid" };
  }

  const companyId = await getJobCompanyId(result.data.jobId);
  if (!companyId || !(await isJobCompanyMember(companyId))) {
    return { ...initialUpdatePublishedJobState, status: "error", message: "unauthorized" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(
    // @ts-expect-error - RPC not yet in generated types
    "update_published_job",
    {
      _job_id: result.data.jobId,
      _title: result.data.title,
      _slug: result.data.slug,
      _summary: result.data.summary,
      _description: result.data.description,
      _requirements: result.data.requirements,
      _responsibilities: result.data.responsibilities,
      _job_type: result.data.jobType,
      _workplace_mode: result.data.workplaceMode,
      _district: result.data.district,
    },
  );
  if (error) {
    if (error.code === "42501") {
      return { ...initialUpdatePublishedJobState, status: "error", message: "unauthorized" };
    }
    if (error.code === "22023") {
      return { ...initialUpdatePublishedJobState, status: "error", message: "invalid" };
    }
    if (error.code === "23505") {
      return { ...initialUpdatePublishedJobState, status: "error", message: "invalid" };
    }
    console.error("Published job update failed.", { code: error.code });
    return { ...initialUpdatePublishedJobState, status: "error", message: "updateFailed" };
  }

  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/company/jobs`);
  revalidatePath(`${prefix}/company/dashboard`);
  revalidatePath(`${prefix}/jobs/${result.data.slug}`);
  revalidatePath(`${prefix}/admin/jobs`);

  return { status: "success", message: "updated", jobId: result.data.jobId };
}

export async function saveJobPackage(
  _previousState: JobPackageActionState,
  formData: FormData,
): Promise<JobPackageActionState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { ...initialPackageActionState, status: "error", message: "unauthorized" };
  }

  const activeValue = formData.get("isActive");
  if (activeValue !== "true" && activeValue !== "false") {
    return { ...initialPackageActionState, status: "error", message: "invalid" };
  }
  const result = jobPackageSchema.safeParse({
    packageId: formData.get("packageId") || null,
    code: formData.get("code"),
    displayName: formData.get("displayName"),
    description: formData.get("description") ?? "",
    maxActiveJobs: formData.get("maxActiveJobs"),
    jobDurationDays: formData.get("jobDurationDays"),
    isActive: activeValue === "true",
  });
  if (!result.success) {
    return { ...initialPackageActionState, status: "error", message: "invalid" };
  }

  if (!(await hasPlatformRole("platform_admin"))) {
    return { ...initialPackageActionState, status: "error", message: "unauthorized" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_save_job_package", {
    _package_id: result.data.packageId,
    _code: result.data.code,
    _display_name: result.data.displayName,
    _description: result.data.description,
    _max_active_jobs: result.data.maxActiveJobs,
    _job_duration_days: result.data.jobDurationDays,
    _is_active: result.data.isActive,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialPackageActionState, status: "error", message: "unauthorized" };
    }
    if (error.code === "22023" || error.code === "23505") {
      return { ...initialPackageActionState, status: "error", message: "invalid" };
    }
    console.error("Job package save failed.", { code: error.code });
    return { ...initialPackageActionState, status: "error", message: "saveFailed" };
  }

  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/admin/packages`);
  revalidatePath(`${prefix}/packages`);
  return { status: "success", message: "saved" };
}

export async function assignCompanyJobPackage(
  _previousState: JobPackageActionState,
  formData: FormData,
): Promise<JobPackageActionState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { ...initialPackageActionState, status: "error", message: "unauthorized" };
  }

  const durationValue = formData.get("durationDays");
  const result = companyJobPackageAssignmentSchema.safeParse({
    companyId: formData.get("companyId"),
    packageId: formData.get("packageId"),
    durationDays: durationValue === "" || durationValue === null ? null : durationValue,
  });
  if (!result.success) {
    return { ...initialPackageActionState, status: "error", message: "invalid" };
  }

  if (!(await hasPlatformRole("platform_admin"))) {
    return { ...initialPackageActionState, status: "error", message: "unauthorized" };
  }

  const expiresAt =
    result.data.durationDays === null
      ? null
      : new Date(Date.now() + result.data.durationDays * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_assign_company_job_package", {
    _company_id: result.data.companyId,
    _package_id: result.data.packageId,
    _expires_at: expiresAt,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialPackageActionState, status: "error", message: "unauthorized" };
    }
    if (error.code === "22023") {
      return { ...initialPackageActionState, status: "error", message: "assignFailed" };
    }
    console.error("Company job package assignment failed.", { code: error.code });
    return { ...initialPackageActionState, status: "error", message: "assignFailed" };
  }

  revalidatePath(`${getLocalePrefix(user.locale)}/admin/packages`);
  return { status: "success", message: "assigned" };
}

export async function applyToJob(
  _previousState: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const user = await getCurrentUser();
  if (!user) return { ...initialApplicationFormState, status: "error", message: "unauthorized" };
  const accountError = activeUserError(user.status);
  if (accountError) return { ...initialApplicationFormState, ...accountError };

  const result = applyToJobSchema.safeParse({
    jobId: formData.get("jobId"),
    coverLetter: formData.get("coverLetter") ?? "",
    shareContactEmail: formData.get("shareContactEmail") === "on",
  });
  if (!result.success) {
    return { ...initialApplicationFormState, status: "error", message: "invalid" };
  }

  // The RPC raises `22023` both for an unverified contact address and for a
  // closed job, so the two are indistinguishable from the error code alone.
  // The viewer's own verification state is already in hand, so check it here
  // and answer with copy that names the actual problem.
  if (result.data.shareContactEmail && !user.emailConfirmed) {
    return {
      ...initialApplicationFormState,
      status: "error",
      message: "contactEmailUnverified",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: candidateProfile, error: profileError } = await supabase
    .from("candidate_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    throw new Error("Candidate application eligibility could not be checked.", {
      cause: profileError,
    });
  }
  if (!candidateProfile) {
    return { ...initialApplicationFormState, status: "error", message: "unauthorized" };
  }

  const { error } = await supabase.rpc("apply_to_job", {
    _job_id: result.data.jobId,
    _cover_letter: result.data.coverLetter,
    _share_contact_email: result.data.shareContactEmail,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialApplicationFormState, status: "error", message: "unauthorized" };
    }
    if (error.code === "23505") {
      return { ...initialApplicationFormState, status: "error", message: "duplicate" };
    }
    if (error.code === "22023") {
      return { ...initialApplicationFormState, status: "error", message: "applyFailed" };
    }
    console.error("Job application failed.", { code: error.code });
    return { ...initialApplicationFormState, status: "error", message: "applyFailed" };
  }

  revalidatePath(`${getLocalePrefix(user.locale)}/profile/dashboard`);
  revalidatePath(`${getLocalePrefix(user.locale)}/company/dashboard`);
  return { status: "success", message: "applied" };
}

export async function markApplicationViewed(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return redirectLocalized("/login");
  }

  const result = applicationIdSchema.safeParse({
    applicationId: formData.get("applicationId"),
  });
  if (!result.success) {
    throw new Error("The application identifier is invalid.");
  }

  const application = await getApplicationForActor(result.data.applicationId);
  if (!application) {
    throw new Error("The application is not available to this company member.");
  }

  const companyId = await getJobCompanyId(application.job_id);
  if (!companyId || !(await isJobCompanyMember(companyId))) {
    throw new Error("The current user is not authorized to view this application.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_application_viewed", {
    _application_id: result.data.applicationId,
  });
  if (error) {
    throw new Error("The application view could not be recorded.", {
      cause: error,
    });
  }

  revalidatePath(`${getLocalePrefix(user.locale)}/profile/dashboard`);
  redirect(
    `${getLocalePrefix(user.locale)}/company/dashboard/applications/${result.data.applicationId}`,
  );
}

export async function transitionApplication(
  _previousState: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const user = await getCurrentUser();
  if (!user) return { ...initialApplicationFormState, status: "error", message: "unauthorized" };
  const accountError = activeUserError(user.status);
  if (accountError) return { ...initialApplicationFormState, ...accountError };

  const result = applicationTransitionSchema.safeParse({
    applicationId: formData.get("applicationId"),
    nextStatus: formData.get("nextStatus"),
  });
  if (!result.success) {
    return { ...initialApplicationFormState, status: "error", message: "invalid" };
  }

  const application = await getApplicationForActor(result.data.applicationId);
  if (!application) {
    return { ...initialApplicationFormState, status: "error", message: "unauthorized" };
  }
  if (result.data.nextStatus === "withdrawn") {
    if (application.candidate_id !== user.id) {
      return { ...initialApplicationFormState, status: "error", message: "unauthorized" };
    }
  } else {
    if (application.candidate_id === user.id) {
      return { ...initialApplicationFormState, status: "error", message: "unauthorized" };
    }
    const companyId = await getJobCompanyId(application.job_id);
    if (!companyId || !(await isJobCompanyMember(companyId))) {
      return { ...initialApplicationFormState, status: "error", message: "unauthorized" };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("transition_application", {
    _application_id: result.data.applicationId,
    _next_status: result.data.nextStatus,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialApplicationFormState, status: "error", message: "unauthorized" };
    }
    if (error.code === "22023") {
      return { ...initialApplicationFormState, status: "error", message: "transitionFailed" };
    }
    console.error("Application status transition failed.", { code: error.code });
    return { ...initialApplicationFormState, status: "error", message: "transitionFailed" };
  }

  revalidatePath(`${getLocalePrefix(user.locale)}/profile/dashboard`);
  revalidatePath(`${getLocalePrefix(user.locale)}/company/dashboard`);
  return { status: "success", message: "updated" };
}

export async function reviewJob(
  _previousState: JobReviewFormState,
  formData: FormData,
): Promise<JobReviewFormState> {
  const user = await getCurrentUser();
  if (!user) return { ...initialReviewFormState, status: "error", message: "unauthorized" };
  const accountError = activeUserError(user.status);
  if (accountError) return { ...initialReviewFormState, ...accountError };

  const result = jobReviewSchema.safeParse({
    jobId: formData.get("jobId"),
    decision: formData.get("decision"),
    reviewNote: formData.get("reviewNote") ?? "",
  });
  if (!result.success) {
    return { ...initialReviewFormState, status: "error", message: "invalid" };
  }

  if (!(await hasPlatformRole("platform_admin"))) {
    return { ...initialReviewFormState, status: "error", message: "unauthorized" };
  }

  // The route's MFA gate is presentation, not an authorization boundary.
  // Re-check AAL2 inside the server action so a forged direct action POST
  // cannot moderate a listing from an AAL1 session.
  const mfa = await getPlatformAdminMfaStatus();
  if (!mfa.aal2) {
    return { ...initialReviewFormState, status: "error", message: "unauthorized" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_job", {
    _job_id: result.data.jobId,
    _decision: result.data.decision,
    _review_note: result.data.reviewNote || null,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialReviewFormState, status: "error", message: "unauthorized" };
    }
    if (error.code === "22023") {
      return { ...initialReviewFormState, status: "error", message: "reviewFailed" };
    }
    console.error("Job moderation decision failed.", { code: error.code });
    return { ...initialReviewFormState, status: "error", message: "reviewFailed" };
  }

  const prefix = getLocalePrefix(user.locale);
  revalidatePath(`${prefix}/admin/jobs`);
  revalidatePath(`${prefix}/company/jobs`);
  revalidatePath(`${prefix}/company/dashboard`);
  return { status: "success", message: "reviewed" };
}
