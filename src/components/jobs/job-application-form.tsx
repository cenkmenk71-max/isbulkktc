"use client";

import { useActionState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { applyToJob } from "@/features/jobs/actions";
import { Link } from "@/i18n/navigation";
import { getLocalePrefix } from "@/i18n/routing";
import { useTrackConversionOnSuccess } from "@/lib/analytics/conversion-client";

const initialState = { status: "idle", message: "idle" } as const;

export function JobApplicationForm({
  jobId,
  slug,
  contact,
}: {
  jobId: string;
  slug: string;
  contact: { email: string | null; emailConfirmed: boolean } | null;
}) {
  const locale = useLocale();
  const t = useTranslations("JobApplication");
  const [state, action, pending] = useActionState(applyToJob, initialState);

  // An application can only share a verified address, and the RPC refuses the
  // whole submission otherwise. Naming the address — and blocking the consent
  // box when it cannot be used — turns a generic failure into something the
  // candidate can act on. A signed-out visitor has no address to show, so the
  // box stays enabled and the submit explains the login requirement instead.
  const contactBlocked = Boolean(contact?.email && !contact.emailConfirmed);

  useTrackConversionOnSuccess(state.status, "apply_to_job", { job_id: jobId });

  const prefix = getLocalePrefix(locale);
  const nextPath = `${prefix}/jobs/${slug}`;
  const signInHref = `${prefix}/sign-in?next=${encodeURIComponent(nextPath)}`;
  const signUpHref = `${prefix}/sign-up?next=${encodeURIComponent(nextPath)}`;

  // Unauthenticated visitor: show high-conversion CTA card instead of form
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

  // Authenticated user: show the application form
  return (
    <section className="job-application-card" aria-labelledby="job-application-title">
      <h2 id="job-application-title">{t("title")}</h2>
      <p>{t("description")}</p>
      <form action={action} className="job-application-form">
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
      {state.status !== "idle" ? (
        <p
          className={`job-application-message job-application-message--${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
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