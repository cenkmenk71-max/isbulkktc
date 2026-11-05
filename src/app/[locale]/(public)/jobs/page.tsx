import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JobsExperience } from "@/components/jobs/jobs-experience";
import { DistrictLinks } from "@/components/jobs/district-links";
import { JobTypeLinks } from "@/components/jobs/job-type-links";
import { buildJobsIndexStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { SITE_NAME } from "@/content/ai-visibility/site";
import {
  publicJobSearchSchema,
  type PublicJobSearchFilters,
} from "@/features/jobs/schemas";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";
import { searchPublicJobs } from "@/server/dal/jobs";

type JobsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// `generateMetadata` and the page both need the result set, and Next renders
// them within one request scope, so memoise per request instead of querying
// twice. The key is the primitive filter values, not the filter object: React
// compares arguments by reference, so two structurally equal objects from two
// parses would miss the cache.
const searchPublicJobsOnce = cache(
  (
    query: string,
    district: string | null,
    jobType: string | null,
    workplaceMode: string | null,
    page: number,
  ) => searchPublicJobs({ query, district, jobType, workplaceMode, page }),
);

function searchJobsOnce(filters: PublicJobSearchFilters) {
  return searchPublicJobsOnce(
    filters.query,
    filters.district,
    filters.jobType,
    filters.workplaceMode,
    filters.page,
  );
}

function parseJobSearchQuery(
  query: Record<string, string | string[] | undefined>,
) {
  return publicJobSearchSchema.safeParse({
    query: query.query === "" ? undefined : query.query,
    district: query.district === "" ? undefined : query.district,
    jobType: query.jobType === "" ? undefined : query.jobType,
    workplaceMode: query.workplaceMode === "" ? undefined : query.workplaceMode,
    page: query.page === "" ? undefined : query.page,
  });
}

// A filtered search that matches nothing (or carries unparseable filters) is a
// soft 404 when it answers `index, follow` with an empty body. Keep it out of
// the index but leave `follow` on so crawlers still reach the links it renders.
function noIndexSearchMetadata(metadata: Metadata): Metadata {
  return {
    ...metadata,
    robots: {
      index: false,
      follow: true,
      googleBot: { index: false, follow: true },
    },
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: JobsPageProps): Promise<Metadata> {
  const [{ locale: requestedLocale }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "JobsMeta" });
  const search = parseJobSearchQuery(query);
  // Unparseable filters render the generic listing under a junk URL — the same
  // dead end as an empty result, so it must not be indexed either.
  if (!search.success) {
    return noIndexSearchMetadata(
      createLocalizedPageMetadata({
        locale,
        pathname: "/jobs",
        title: t("title"),
        description: t("description"),
      }),
    );
  }

  const filters = search.data;
  // A filtered search that matches nothing is a soft 404 if it answers
  // `index, follow` with an empty page, so keep it out of the index while
  // leaving the links crawlable. The out-of-range `?page=` case is a hard 404
  // and is handled in the page itself, on the render path.
  const isFiltered = Boolean(
    filters.query ||
      filters.district ||
      filters.jobType ||
      filters.workplaceMode,
  );
  if (isFiltered) {
    const results = await searchJobsOnce(filters);
    if (results.total === 0) {
      return noIndexSearchMetadata(
        createLocalizedPageMetadata({
          locale,
          pathname: "/jobs",
          title: t("title"),
          description: t("description"),
        }),
      );
    }
  }

  // A page of the unfiltered sequence is its own page, not a duplicate of
  // `/jobs`. Google treats `?page=n` URLs as separate pages and is explicit that
  // the first page must not be their canonical, so the pathname carries the
  // parameter and every signal built from it — canonical, `hreflang` alternates
  // and `og:url` — points at the same page in each locale. Out-of-range numbers
  // never reach here: the render path 404s `page > lastPage`. A filtered result
  // stays on `/jobs` because it is a query variation, not a page of the
  // sequence, and is `noindex` whenever it renders nothing.
  const paged = !isFiltered && filters.page > 1;
  return createLocalizedPageMetadata({
    locale,
    pathname: paged ? `/jobs?page=${filters.page}` : "/jobs",
    title: t("title"),
    description: t("description"),
  });
}

export default async function JobsPage({
  params,
  searchParams,
}: JobsPageProps) {
  const [{ locale: requestedLocale }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const search = parseJobSearchQuery(query);
  const filters = search.success
    ? search.data
    : publicJobSearchSchema.parse({});
  const results = search.success ? await searchJobsOnce(filters) : null;
  // `?page=N` past the last page is not a real page: the search RPC clamps the
  // offset to the final page, so it would otherwise serve that page's content
  // again under a fresh, never-linked URL (a soft 404). Fail it here, on the
  // render path, so the response is a genuine 404.
  if (search.success && results) {
    const lastPage = Math.max(1, Math.ceil(results.total / results.pageSize));
    if (filters.page > lastPage) notFound();
  }
  const copy = await getTranslations({ locale, namespace: "JobsPage" });
  const districtCopy = await getTranslations({
    locale,
    namespace: "DistrictPage",
  });
  const jobTypeCopy = await getTranslations({
    locale,
    namespace: "JobTypePage",
  });
  // The index page names its own section: `Nav.jobs` is the label the reader
  // already sees for this route, so the breadcrumb and `about` agree with the
  // navigation instead of the hero slogan (`JobsPage.title`).
  const navCopy = await getTranslations({ locale, namespace: "Nav" });
  const structuredData = buildJobsIndexStructuredData({
    locale,
    baseUrl: getAppBaseUrl(),
    pageLabel: navCopy("jobs"),
    homeLabel: SITE_NAME,
  });

  return (
    <>
      <JsonLd data={structuredData} />
      <JobsExperience
        locale={locale}
        filters={filters}
        results={results}
        invalidFilters={!search.success}
        title={copy("title")}
        description={copy("description")}
        eyebrow={copy("eyebrow")}
        footerSlot={
          <>
            <DistrictLinks
              locale={locale}
              title={districtCopy("otherDistricts")}
              browseAllLabel={districtCopy("browseAll")}
            />
            <JobTypeLinks
              locale={locale}
              title={jobTypeCopy("otherTypes")}
              browseAllLabel={jobTypeCopy("browseAll")}
            />
          </>
        }
      />
    </>
  );
}
