import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, CalendarDays, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmployerLogo } from "@/components/jobs/employer-logo";
import { JobApplicationForm } from "@/components/jobs/job-application-form";
import { Link } from "@/i18n/navigation";
import {
  getDistrictMessageKey,
  getJobTypeMessageKey,
  getWorkplaceModeMessageKey,
} from "@/features/jobs/presentation";
import type { AppLocale } from "@/i18n/routing";
import type { PublicJobListing } from "@/server/dal/jobs";

export async function JobDetailExperience({
  locale,
  job,
}: {
  locale: AppLocale;
  job: PublicJobListing;
}) {
  const [t, searchCopy] = await Promise.all([
    getTranslations({ locale, namespace: "JobDetail" }),
    getTranslations({ locale, namespace: "HomeJobSearch" }),
  ]);

  return (
    <div className="job-detail-page">
      <div className="page-container job-detail-content">
        <Link className="job-detail-back" href="/jobs">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("backToListings")}
        </Link>
        <article className="job-detail-card">
          <header className="job-detail-header">
            <p className="jobs-section-kicker">{t("eyebrow")}</p>
            <h1>{job.title}</h1>
            <div className="job-detail-employer">
              <EmployerLogo
                companyName={job.company.name}
                logoUrl={job.company.logo_url}
                className="job-detail-employer-logo"
                sizes="76px"
              />
              <div>
                <Link className="job-detail-company" href="/companies">
                  {job.company.name}
                  <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
                {job.company.categories.length > 0 ? (
                  <p className="job-detail-employer-category">
                    {job.company.categories.join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="job-detail-facts">
              <span>
                <BriefcaseBusiness size={16} aria-hidden="true" />
                {searchCopy(getJobTypeMessageKey(job.job_type))}
              </span>
              <span>
                <MapPin size={16} aria-hidden="true" />
                {job.district
                  ? searchCopy(getDistrictMessageKey(job.district))
                  : t("locationNotSpecified")}
              </span>
              {job.workplace_mode ? (
                <span>
                  {searchCopy(getWorkplaceModeMessageKey(job.workplace_mode))}
                </span>
              ) : null}
              {job.published_at ? (
                <span>
                  <CalendarDays size={16} aria-hidden="true" />
                  {t("publishedOn", {
                    date: new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                    }).format(new Date(job.published_at)),
                  })}
                </span>
              ) : null}
            </div>
            {job.summary ? (
              <p className="job-detail-summary">{job.summary}</p>
            ) : null}
          </header>

          <div className="job-detail-columns">
            <div className="job-detail-main">
              {job.description ? (
                <section className="job-detail-section">
                  <h2>{t("descriptionTitle")}</h2>
                  <p className="job-detail-body">{job.description}</p>
                </section>
              ) : null}
              {job.responsibilities ? (
                <section className="job-detail-section">
                  <h2>{t("responsibilitiesTitle")}</h2>
                  <p className="job-detail-body">{job.responsibilities}</p>
                </section>
              ) : null}
              {job.requirements ? (
                <section className="job-detail-section">
                  <h2>{t("requirementsTitle")}</h2>
                  <p className="job-detail-body">{job.requirements}</p>
                </section>
              ) : null}
            </div>
            <aside className="job-detail-aside">
              {job.publication_source === "platform" ? (
                <JobApplicationForm jobId={job.id} />
              ) : null}
              <section className="job-detail-company-card">
                <span>{t("companyLabel")}</span>
                <strong>{job.company.name}</strong>
                {job.company.profile_description ? (
                  <p>{job.company.profile_description}</p>
                ) : null}
                {job.company.municipality ? (
                  <p>
                    {t("companyLocation")}: {job.company.municipality}
                  </p>
                ) : null}
                <Link href="/companies">
                  {t("companyDirectoryLink")}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </section>
            </aside>
          </div>
        </article>
      </div>
    </div>
  );
}
