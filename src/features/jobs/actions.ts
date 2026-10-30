"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getCurrentUser } from "@/server/dal/user";
import { redirectLocalized } from "@/i18n/redirect";
import { getLocalePrefix } from "@/i18n/routing";
import {
  getApplicationForActor,
  getJobCompanyId,
  getJobPublishAnnouncement,
  hasPlatformRole,
  isJobCompanyMember,
} from "@/server/dal/jobs";
import { sendJobPublishedEmail } from "@/server/email/mailer";
import {
  applicationIdSchema,
  applicationTransitionSchema,
  applyToJobSchema,
  companyJobPackageAssignmentSchema,
  jobDraftSchema,
  jobIdSchema,
  jobPackageSchema,
  jobReviewSchema,
  type ApplicationFormState,
  type JobFormState,
  type JobPackageActionState,
  type JobReviewFormState,
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

  const result = jobIdSchema.safeParse({ jobId: formData.get("jobId") });
  if (!result.success) {
    return { ...initialJobFormState, status: "error", message: "invalid" };
  }

  const companyId = await getJobCompanyId(result.data.jobId);
  if (!companyId || !(await isJobCompanyMember(companyId))) {
    return { ...initialJobFormState, status: "error", message: "unauthorized" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_job_for_review", {
    _job_id: result.data.jobId,
  });
  if (error) {
    if (error.code === "42501") {
      return { ...initialJobFormState, status: "error", message: "unauthorized" };
    }
    if (error.code === "22023") {
      return { ...initialJobFormState, status: "error", message: "submitFailed" };
    }
    console.error("Job moderation submission failed.", { code: error.code });
    return { ...initialJobFormState, status: "error", message: "submitFailed" };
  }

  return { status: "success", message: "submitted", jobId: result.data.jobId };
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

  // Best-effort: the employer is told the listing is live, but a mail failure
  // must not turn a successful publication into an error state.
  if (user.email) {
    try {
      const announcement = await getJobPublishAnnouncement(result.data.jobId);
      if (announcement) {
        await sendJobPublishedEmail({
          to: user.email,
          locale: user.locale,
          jobTitle: announcement.title,
          jobSlug: announcement.slug,
          jobId: result.data.jobId,
        });
      }
    } catch (mailError) {
      console.error("Job published email could not be sent.", {
        error: mailError instanceof Error ? mailError.message : "unknown_error",
      });
    }
  }

  return { status: "success", message: "published", jobId: result.data.jobId };
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

  return { status: "success", message: "reviewed" };
}
