import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ApplicationStatusForm } from "@/features/jobs/application-status-form";
import { getApplicationStatusMessageKey } from "@/features/jobs/presentation";
import {
  getCompanyApplicationDetail,
  getCompanyApplications,
} from "@/server/dal/jobs";
import { getApplicationResume } from "@/server/dal/resumes";
import { getEmployerWorkspace } from "@/server/dal/companies";
import { requireAuthenticatedUser } from "@/server/dal/user";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type CompanyApplicationPageProps = {
  params: Promise<{ locale: string; applicationId: string }>;
};

export default async function CompanyApplicationPage({
  params,
}: CompanyApplicationPageProps) {
  const { locale: requestedLocale, applicationId } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  await requireAuthenticatedUser({ audience: "employer" });
  if (!z.string().uuid().safeParse(applicationId).success) notFound();

  const { companies } = await getEmployerWorkspace();
  const companyApplications = await Promise.all(
    companies.map((company) => getCompanyApplications(company.id)),
  );
  if (
    !companyApplications.some((applications) =>
      applications.some(
        (application) => application.application_id === applicationId,
      ),
    )
  ) {
    notFound();
  }

  const [application, resume, copy] = await Promise.all([
    getCompanyApplicationDetail(applicationId),
    getApplicationResume(applicationId),
    getTranslations("CompanyManagement"),
  ]);
  if (!application) notFound();

  return (
    <main className="company-application-detail page-container">
      <Link className="job-detail-back" href="/company/dashboard">
        <ArrowLeft size={16} aria-hidden="true" />
        {copy("applicationsTitle")}
      </Link>
      <article>
        <header>
          <p className="eyebrow">{copy("applicationDetailTitle")}</p>
          <h1>{application.job_title}</h1>
          <p>
            {copy("candidateLabel")}: {application.candidate_name}
          </p>
        </header>
        <dl>
          <div>
            <dt>{copy("applicationStatusLabel")}</dt>
            <dd>
              {copy(
                getApplicationStatusMessageKey(application.application_status),
              )}
            </dd>
          </div>
          <div>
            <dt>{copy("applicationSubmittedAt")}</dt>
            <dd>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(application.submitted_at))}
            </dd>
          </div>
          <div>
            <dt>{copy("applicationViewedAt")}</dt>
            <dd>
              {application.first_viewed_at
                ? new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(application.first_viewed_at))
                : copy("applicationNotViewed")}
            </dd>
          </div>
        </dl>
        {application.cover_letter ? (
          <section>
            <h2>{copy("coverLetterLabel")}</h2>
            <p>{application.cover_letter}</p>
          </section>
        ) : null}
        {resume ? (
          <section>
            <h2>{copy("cvDownloadLabel")}</h2>
            <a
              href={`/api/resumes/${resume.id}/download`}
              download={resume.original_filename}
              className="button button-outline"
            >
              {copy("cvDownloadButton")}
            </a>
          </section>
        ) : null}
        <section>
          <h2>{copy("candidateContactEmail")}</h2>
          {application.contact_email ? (
            <>
              <p>{copy("candidateContactConsentNote")}</p>
              <a href={`mailto:${application.contact_email}`}>
                {application.contact_email}
              </a>
            </>
          ) : (
            <p>{copy("candidateContactNotShared")}</p>
          )}
        </section>
        <ApplicationStatusForm
          applicationId={application.application_id}
          currentStatus={application.application_status}
        />
      </article>
    </main>
  );
}
