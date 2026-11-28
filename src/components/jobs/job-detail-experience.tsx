import { ArrowLeft, ArrowUpRight, BriefcaseBusiness, CalendarDays, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmployerLogo } from "@/components/jobs/employer-logo";
import { JobApplicationForm, type DirectContact } from "@/components/jobs/job-application-form";
import { Link } from "@/i18n/navigation";
import {
  getDistrictMessageKey,
  getJobTypeMessageKey,
  getWorkplaceModeMessageKey,
  isRedundantJobSummary,
} from "@/features/jobs/presentation";
import type { AppLocale } from "@/i18n/routing";
import type { PublicJobListing } from "@/server/dal/jobs";
import { listMyResumes } from "@/server/dal/resumes";

function bulletLines(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function phoneToWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

function extractDirectContact(job: PublicJobListing): DirectContact | null {
  const haystack = [
    job.description,
    job.responsibilities,
    job.requirements,
    job.company.profile_description,
  ]
    .filter(Boolean)
    .join(" ");
  const email = haystack.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0] ?? null;
  const phone = haystack.match(/(?:\+?90\s*)?\(?\d{3,4}\)?[\s.\-]?\d{3}[\s.\-]?\d{2}[\s.\-]?\d{2}/)?.[0] ?? null;
  const website = job.company.website ?? null;
  if (!email && !phone && !website) return null;
  return { email, phone, whatsapp: phoneToWhatsApp(phone), website };
}

export async function JobDetailExperience({
  locale,
  job,
  viewerContact,
}: {
  locale: AppLocale;
  job: PublicJobListing;
  viewerContact: { email: string | null; emailConfirmed: boolean } | null;
}) {
  const [t, searchCopy] = await Promise.all([
    getTranslations({ locale, namespace: "JobDetail" }),
    getTranslations({ locale, namespace: "HomeJobSearch" }),
  ]);

  const summaryIsRedundant = isRedundantJobSummary(job.summary, job.description);
  const sourceListingHost =
    job.publication_source === "source_site" && job.source_listing_url
      ? new URL(job.source_listing_url).hostname
      : null;

  // Only an authenticated candidate can attach a resume, so only fetch the
  // candidate's registered resumes when the viewer is signed in. Parsed
  // resumes are offered for attachment; everything else stays hidden here.
  let resumes: Awaited<ReturnType<typeof listMyResumes>> = [];
  if (viewerContact) {
    try {
      resumes = (await listMyResumes()) ?? [];
    } catch {
      resumes = [];
    }
  }

  const directContact = extractDirectContact(job);

  const responsibilities = bulletLines(job.responsibilities);
  const requirements = bulletLines(job.requirements);

  return (
    <div className="job-detail-page">
      <div className="page-container job-detail-content">
        <Link className="job-detail-back" href="/jobs">
          <ArrowLeft size={16} aria-hidden="true" />
          {t("backToListings")}
        </Link>
        <article className="job-detail-card">
          <header className="job-detail-header" data-reveal>
            <p className="jobs-section-kicker">{t("eyebrow")}</p>
            <h1>{job.title}</h1>
            <div className="job-detail-identity">
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
              <span className="job-detail-badge">
                {job.publication_source === "platform" ? t("platformBadge") : t("sourceBadge")}
              </span>
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
            {job.summary && !summaryIsRedundant ? (
              <p className="job-detail-summary">{job.summary}</p>
            ) : null}
          </header>

          <div className="job-detail-columns">
            <div className="job-detail-main">
              {job.description ? (
                <section className="job-detail-section" data-reveal>
                  <h2>{t("descriptionTitle")}</h2>
                  <p className="job-detail-body">{job.description}</p>
                </section>
              ) : null}
              {responsibilities.length > 0 ? (
                <section className="job-detail-section job-detail-section--bullets" data-reveal>
                  <h2>{t("responsibilitiesTitle")}</h2>
                  <ul className="job-detail-list">
                    {responsibilities.map((line, index) => (
                      <li key={index} className="job-detail-list-item">
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {requirements.length > 0 ? (
                <section className="job-detail-section job-detail-section--bullets" data-reveal>
                  <h2>{t("requirementsTitle")}</h2>
                  <ul className="job-detail-list">
                    {requirements.map((line, index) => (
                      <li key={index} className="job-detail-list-item">
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
            <aside className="job-detail-aside">
              {job.publication_source === "platform" ? (
                <JobApplicationForm
                  contact={viewerContact}
                  jobId={job.id}
                  slug={job.slug}
                  jobTitle={job.title}
                  resumes={resumes}
                  directContact={directContact}
                />
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
                <div className="job-detail-company-links">
                  <Link className="job-detail-company-link" href="/companies">
                    {t("companyDirectoryLink")}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                  {job.publication_source === "source_site" && job.source_listing_url ? (
                    <a
                      aria-label={`${sourceListingHost} — ${t("sourceAttributionLink")}`}
                      className="job-detail-source-link"
                      href={job.source_listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {sourceListingHost}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </article>
      </div>
    </div>
  );
}
