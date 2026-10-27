import { BriefcaseBusiness, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";
import type { PublicJobSearchFilters } from "@/features/jobs/schemas";
import type { AppLocale } from "@/i18n/routing";

type JobPreview = {
  title: string;
  companyName: string;
};

type SearchResults = {
  previews: JobPreview[];
  total: number;
  page: number;
  pageSize: number;
};

export type HomeJobSearchData = {
  filters: PublicJobSearchFilters;
  results: SearchResults | null;
  invalidFilters: boolean;
};

type HomeJobSearchProps = HomeJobSearchData & {
  locale: AppLocale;
};

const districtKeys = {
  Lefkoşa: "lefkosia",
  Mağusa: "magusa",
  Girne: "girne",
  Güzelyurt: "guzelyurt",
  İskele: "iskele",
  Lefke: "lefke",
} as const;

const jobTypes = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
  "freelance",
] as const;

const workplaceModes = ["on_site", "hybrid", "remote"] as const;

export async function HomeJobSearch({
  locale,
  filters,
  results,
  invalidFilters,
}: HomeJobSearchProps) {
  const copy = await getTranslations({ locale, namespace: "HomeJobSearch" });

  return (
    <section
      id="home-job-search"
      className="home-job-search"
      aria-labelledby="home-job-search-title"
    >
      <div className="page-container home-job-search-inner">
        <header className="home-job-search-heading">
          <span className="sector-kicker">{copy("eyebrow")}</span>
          <h2 id="home-job-search-title">{copy("title")}</h2>
          <p>{copy("description")}</p>
        </header>

        <form className="home-job-search-form" method="get">
          <label className="home-job-search-field home-job-search-keyword">
            <span>{copy("keywordLabel")}</span>
            <span className="home-job-search-input-wrap">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                name="query"
                maxLength={160}
                defaultValue={filters.query}
                placeholder={copy("keywordPlaceholder")}
              />
            </span>
          </label>
          <label className="home-job-search-field">
            <span>{copy("districtLabel")}</span>
            <select name="district" defaultValue={filters.district ?? ""}>
              <option value="">{copy("allDistricts")}</option>
              {northernCyprusDistrictValues.map((district) => (
                <option key={district} value={district}>
                  {copy(`districts.${districtKeys[district]}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="home-job-search-field">
            <span>{copy("jobTypeLabel")}</span>
            <select name="jobType" defaultValue={filters.jobType ?? ""}>
              <option value="">{copy("allJobTypes")}</option>
              {jobTypes.map((jobType) => (
                <option key={jobType} value={jobType}>
                  {copy(`jobTypes.${jobType}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="home-job-search-field">
            <span>{copy("workplaceLabel")}</span>
            <select
              name="workplaceMode"
              defaultValue={filters.workplaceMode ?? ""}
            >
              <option value="">{copy("allWorkplaces")}</option>
              {workplaceModes.map((workplaceMode) => (
                <option key={workplaceMode} value={workplaceMode}>
                  {copy(`workplaceModes.${workplaceMode}`)}
                </option>
              ))}
            </select>
          </label>
          <button className="button button-primary home-job-search-submit" type="submit">
            <Search size={17} aria-hidden="true" />
            {copy("searchAction")}
          </button>
          <Link className="home-job-search-clear" href="/">
            {copy("clearFilters")}
          </Link>
        </form>

        {invalidFilters ? (
          <p className="home-job-search-error" role="alert">
            {copy("invalidFilters")}
          </p>
        ) : null}

        {results ? (
          <div className="home-job-search-results">
            <div className="home-job-search-results-heading">
              <h3>
                <BriefcaseBusiness size={18} aria-hidden="true" />
                {copy("resultsTitle")}
              </h3>
              <p aria-live="polite">
                {results.total === 1
                  ? copy("resultCountSingular")
                  : copy("resultCountPlural", { count: results.total })}
              </p>
            </div>

            {results.previews.length > 0 ? (
              <ul className="home-job-preview-list">
                {results.previews.map((preview, index) => (
                  <li className="home-job-preview" key={`${preview.companyName}-${preview.title}-${index}`}>
                    <h4>{preview.title}</h4>
                    <p>{preview.companyName}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="home-job-search-empty">
                <h4>{copy("emptyTitle")}</h4>
                <p>{copy("emptyDescription")}</p>
              </div>
            )}

            {results.total > results.pageSize ? (
              <nav className="home-job-search-pagination" aria-label={copy("paginationLabel")}>
                {results.page > 1 ? (
                  <a
                    href={buildSearchHref(filters, results.page - 1)}
                    rel="prev"
                    aria-label={copy("previousPage")}
                  >
                    <ChevronLeft size={17} aria-hidden="true" />
                    {copy("previousPage")}
                  </a>
                ) : <span />}
                <span>{copy("pageCount", { page: results.page, pages: Math.ceil(results.total / results.pageSize) })}</span>
                {results.page * results.pageSize < results.total ? (
                  <a
                    href={buildSearchHref(filters, results.page + 1)}
                    rel="next"
                    aria-label={copy("nextPage")}
                  >
                    {copy("nextPage")}
                    <ChevronRight size={17} aria-hidden="true" />
                  </a>
                ) : <span />}
              </nav>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function buildSearchHref(filters: PublicJobSearchFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.district) params.set("district", filters.district);
  if (filters.jobType) params.set("jobType", filters.jobType);
  if (filters.workplaceMode) params.set("workplaceMode", filters.workplaceMode);
  params.set("page", String(page));
  return `?${params.toString()}`;
}
