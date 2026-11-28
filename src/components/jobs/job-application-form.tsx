"use client";

import { useActionState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { applyToJob } from "@/features/jobs/actions";
import { Link } from "@/i18n/navigation";
import { getLocalePrefix } from "@/i18n/routing";
import { useTrackConversionOnSuccess } from "@/lib/analytics/conversion-client";
import type { ResumeRow } from "@/features/candidates/resume-schemas";

const initialState = { status: "idle", message: "idle" } as const;

export function JobApplicationForm({
  jobId,
  slug,
  jobTitle,
  contact,
  resumes = [],
}: {
  jobId: string;
  slug: string;
  jobTitle?: string;
  contact: { email: string | null; emailConfirmed: boolean } | null;
  resumes?: ResumeRow[];
}) {
  const locale = useLocale();
  const t = useTranslations("JobApplication");
  const [state, action, pending] = useActionState(applyToJob, initialState);

  const contactBlocked = Boolean(contact?.email && !contact.emailConfirmed);
  const parsedResumes = (resumes ?? []).filter((resume) => resume.status === "parsed");

  useTrackConversionOnSuccess(state.status, "apply_to_job", { job_id: jobId });

  const prefix = getLocalePrefix(locale);
  const nextPath = `${prefix}/jobs/${slug}`;
  const signInHref = `${prefix}/login?next=${encodeURIComponent(nextPath)}`;
  const signUpHref = `${prefix}/register?next=${encodeURIComponent(nextPath)}`;

  if (!contact) {
    return (
      <section className="job-application-card job-application-card--cta" aria-labelledby="job-application-cta-title">
        <h2 id="job-application-cta-title">{t("ctaTitle")}</h2>
        <p>{t("ctaDescription")}</p>
        <div className="job-application-cta-actions">
          <Link className="button button-primary" href={signInHref}>
            {t("ctaSignIn")}
          </Link>
          <Link className="button button-outline" href={signUpHref}>
            {t("ctaSignUp")}
          </Link>
        </div>
        <p className="job-application-cta-note">{t("ctaNote")}</p>
      </section>
    );
  }

  return (
    <section className="job-application-card" aria-labelledby="job-application-title">
      {state.status === "success" ? (
        <article className="job-application-confirmation" aria-labelledby="job-application-confirmation-title">
          <h2 id="job-application-confirmation-title">{t("messages.confirmationTitle")}</h2>
          {jobTitle ? (
            <p>{t("messages.confirmationJob", { jobTitle, companyName: "" })}</p>
          ) : null}
          {state.applicationId ? (
            <p>{t("messages.confirmationId", { applicationId: state.applicationId })}</p>
          ) : null}
          <p>{t("messages.confirmationNext")}</p>
          <p>
            <Link className="button button-outline" href={`${prefix}/profile/dashboard#my-applications`}>
              {t("messages.dashboardLink")}
            </Link>
          </p>
        </article>
      ) : null}
      <form action={action} className="job-application-form" aria-labelledby="job-application-title">
        <h2 id="job-application-title">{t("title")}</h2>
        <p>{t("description")}</p>
        <input type="hidden" name="jobId" value={jobId} />
        <label htmlFor="job-cover-letter">{t("coverLetterLabel")}</label>
        <textarea
          id="job-cover-letter"
          name="coverLetter"
          rows={5}
          maxLength={5000}
          placeholder={t("coverLetterPlaceholder")}
        />
        <p className="job-application-hint">{t("coverLetterHint")}</p>
        {parsedResumes.length > 0 ? (
          <>
            <label htmlFor="job-resume">{t("resumeLabel")}</label>
            <select id="job-resume" name="resumeId">
              <option value="">{t("resumePlaceholder")}</option>
              {parsedResumes.map((resume) => (
                <option key={resume.id} value={resume.id}>
                  {resume.original_filename}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <p className="job-application-resume-hint">
          {t("resumeNoResumes")} <Link href={`${prefix}/profile/dashboard`}>{t("resumeRegisterLink")}</Link>
        </p>
        {contact?.email ? (
          <p className="job-application-contact-address">
            {t("contactEmailLabel")}: <strong>{contact.email}</strong>{" "}
            {contactBlocked ? (
              <span className="job-application-contact-warning">
                {t("contactEmailUnverifiedNote")}{" "}
                <Link href="/login">{t("verifyEmailAction")}</Link>
              </span>
            ) : null}
          </p>
        ) : null}
        <label className="job-application-contact-consent">
          <input
            disabled={contactBlocked}
            name="shareContactEmail"
            type="checkbox"
          />
          <span>{t("shareContactEmail")}</span>
        </label>
        <button
          className="button button-primary"
          type="submit"
          disabled={pending || state.status === "success"}
        >
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>
      {state.status === "error" ? (
        <p
          className="job-application-message job-application-message--error"
          role="alert"
          aria-live="polite"
        >
          {t(`messages.${state.message}`)}
          {state.message === "unauthorized" ? (
            <>
              {" "}
              <Link href={signInHref}>{t("loginAction")}</Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
