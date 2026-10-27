"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { applyToJob } from "@/features/jobs/actions";
import { Link } from "@/i18n/navigation";

const initialState = { status: "idle", message: "idle" } as const;

export function JobApplicationForm({ jobId }: { jobId: string }) {
  const t = useTranslations("JobApplication");
  const [state, action, pending] = useActionState(applyToJob, initialState);

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
        <label className="job-application-contact-consent">
          <input name="shareContactEmail" type="checkbox" />
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
              <Link href="/login">{t("loginAction")}</Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
