import { ArrowUpRight, BriefcaseBusiness, MapPin, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";
import type { PublicJobSearchFilters } from "@/features/jobs/schemas";
import { EmployerLogo } from "@/components/jobs/employer-logo";
import {
  getDistrictMessageKey,
  getJobTypeMessageKey,
  getWorkplaceModeMessageKey,
} from "@/features/jobs/presentation";
import type { AppLocale } from "@/i18n/routing";
import type { searchPublicJobs } from "@/server/dal/jobs";

type JobsResults = Awaited<ReturnType<typeof searchPublicJobs>>;
type JobType = NonNullable<PublicJobSearchFilters["jobType"]>;
type WorkplaceMode = NonNullable<PublicJobSearchFilters["workplaceMode"]>;

const jobTypes = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
  "freelance",
] as const satisfies readonly JobType[];

const workplaceModes = ["on_site", "hybrid", "remote"] as const satisfies
  readonly WorkplaceMode[];

export async function JobsExperience({
  locale,
  filters,
  results,
  invalidFilters,
  title,
  description,
  eyebrow,
}: {
  locale: AppLocale;
  filters: PublicJobSearchFilters;
  results: JobsResults | null;
  invalidFilters: boolean;
  title: string;
  description: string;
  eyebrow: string;
}) {
  const [t, searchCopy] = await Promise.all([
    getTranslations({ locale, namespace: "JobsPage" }),
    getTranslations({ locale, namespace: "HomeJobSearch" }),
  ]);
  const pages = results
    ? Math.max(1, Math.ceil(results.total / results.pageSize))
    : 1;

  return (
    <div className="jobs-page">
      <header className="jobs-hero">
        <div className="page-container jobs-hero-inner">
          <p className="jobs-eyebrow">
            <span aria-hidden="true" />
            {eyebrow}
          </p>
          <h1>{title}</h1>
          <p className="jobs-hero-description">{description}</p>
          {results ? (
            <p className="jobs-live-count" aria-live="polite">
              <BriefcaseBusiness size={17} aria-hidden="true" />
              {results.total === 1
                ? t("oneOpening")
                : t("openings", { count: results.total })}
            </p>
          ) : null}
        </div>
      </header>

      <div className="page-container jobs-content">
        <form className="jobs-filter-panel" method="get" aria-label={t("filterTitle")}>
          <div className="jobs-filter-heading">
            <div>
              <p className="jobs-section-kicker">{t("filterEyebrow")}</p>
              <h2>{t("filterTitle")}</h2>
            </div>
            <Link className="jobs-clear-link" href="/jobs">
              {searchCopy("clearFilters")}
            </Link>
          </div>

          <div className="jobs-filter-grid">
            <label className="jobs-filter-field jobs-filter-keyword">
              <span>{searchCopy("keywordLabel")}</span>
              <span className="jobs-search-input">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  name="query"
                  maxLength={160}
                  defaultValue={filters.query}
                  placeholder={searchCopy("keywordPlaceholder")}
                />
              </span>
            </label>
            <label className="jobs-filter-field">
              <span>{searchCopy("districtLabel")}</span>
              <select name="district" defaultValue={filters.district ?? ""}>
                <option value="">{searchCopy("allDistricts")}</option>
                {northernCyprusDistrictValues.map((district) => (
                  <option key={district} value={district}>
                    {searchCopy(getDistrictMessageKey(district))}
                  </option>
                ))}
              </select>
            </label>
            <label className="jobs-filter-field">
              <span>{searchCopy("jobTypeLabel")}</span>
              <select name="jobType" defaultValue={filters.jobType ?? ""}>
                <option value="">{searchCopy("allJobTypes")}</option>
                {jobTypes.map((jobType) => (
                  <option key={jobType} value={jobType}>
                    {searchCopy(`jobTypes.${jobType}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="jobs-filter-field">
              <span>{searchCopy("workplaceLabel")}</span>
              <select
                name="workplaceMode"
                defaultValue={filters.workplaceMode ?? ""}
              >
                <option value="">{searchCopy("allWorkplaces")}</option>
                {workplaceModes.map((workplaceMode) => (
                  <option key={workplaceMode} value={workplaceMode}>
                    {searchCopy(`workplaceModes.${workplaceMode}`)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-primary jobs-search-button"
              type="submit"
            >
              <Search size={17} aria-hidden="true" />
              {searchCopy("searchAction")}
            </button>
          </div>
        </form>

        {invalidFilters ? (
          <p className="jobs-filter-error" role="alert">
            {searchCopy("invalidFilters")}
          </p>
        ) : null}

        {results ? (
          <section className="jobs-results" aria-labelledby="jobs-results-title">
            <div className="jobs-results-heading">
              <div>
                <p className="jobs-section-kicker">{t("resultsEyebrow")}</p>
                <h2 id="jobs-results-title">{t("resultsTitle")}</h2>
              </div>
              <p>
                {results.total === 1
                  ? searchCopy("resultCountSingular")
                  : searchCopy("resultCountPlural", { count: results.total })}
              </p>
            </div>

            {results.jobs.length > 0 ? (
              <ul className="jobs-list">
                {results.jobs.map((job) => (
                  <li className="jobs-list-item" key={job.id}>
                    <article className="jobs-card">
                      <div className="jobs-card-topline">
                        <span className="jobs-card-type">
                          {searchCopy(getJobTypeMessageKey(job.job_type))}
                        </span>
                        {job.published_at ? (
                          <time dateTime={job.published_at}>
                            {t("postedOn", {
                              date: new Intl.DateTimeFormat(locale, {
                                dateStyle: "medium",
                              }).format(new Date(job.published_at)),
                            })}
                          </time>
                        ) : null}
                      </div>
                      <h3>
                        <Link href={`/jobs/${job.slug}`}>{job.title}</Link>
                      </h3>
                      <div className="jobs-card-company">
                        <EmployerLogo
                          companyName={job.company.name}
                          logoUrl={job.company.logo_url}
                          className="jobs-card-company-logo"
                          sizes="54px"
                        />
                        <div>
                          <Link className="jobs-company-link" href="/companies">
                            {job.company.name}
                            <ArrowUpRight size={14} aria-hidden="true" />
                          </Link>
                          {job.company.categories.length > 0 ? (
                            <p className="jobs-card-company-category">
                              {job.company.categories.join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      {job.summary ? (
                        <p className="jobs-card-summary">{job.summary}</p>
                      ) : null}
                      <div className="jobs-card-footer">
                        <div className="jobs-card-tags">
                          {job.district ? (
                            <span>
                              <MapPin size={14} aria-hidden="true" />
                              {searchCopy(getDistrictMessageKey(job.district))}
                            </span>
                          ) : null}
                          {job.workplace_mode ? (
                            <span>
                              {searchCopy(
                                getWorkplaceModeMessageKey(job.workplace_mode),
                              )}
                            </span>
                          ) : null}
                        </div>
                        <Link className="jobs-details-link" href={`/jobs/${job.slug}`}>
                          {t("viewDetails")}
                          <ArrowUpRight size={15} aria-hidden="true" />
                        </Link>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="jobs-empty-state">
                <span className="jobs-empty-icon" aria-hidden="true">
                  <BriefcaseBusiness size={24} />
                </span>
                <h3>{searchCopy("emptyTitle")}</h3>
                <p>{searchCopy("emptyDescription")}</p>
              </div>
            )}

            {results.total > results.pageSize ? (
              <nav
                className="jobs-pagination"
                aria-label={searchCopy("paginationLabel")}
              >
                {results.page > 1 ? (
                  <Link href={buildSearchHref(filters, results.page - 1)} rel="prev">
                    {searchCopy("previousPage")}
                  </Link>
                ) : (
                  <span />
                )}
                <span>{searchCopy("pageCount", { page: results.page, pages })}</span>
                {results.page < pages ? (
                  <Link href={buildSearchHref(filters, results.page + 1)} rel="next">
                    {searchCopy("nextPage")}
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </section>
        ) : null}

      </div>
    </div>
  );
}

function buildSearchHref(filters: PublicJobSearchFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.district) params.set("district", filters.district);
  if (filters.jobType) params.set("jobType", filters.jobType);
  if (filters.workplaceMode) params.set("workplaceMode", filters.workplaceMode);
  params.set("page", String(page));
  return `/jobs?${params.toString()}`;
}
