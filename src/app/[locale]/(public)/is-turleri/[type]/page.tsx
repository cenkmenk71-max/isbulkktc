import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JobsExperience } from "@/components/jobs/jobs-experience";
import { DistrictLinks } from "@/components/jobs/district-links";
import { JobTypeLinks } from "@/components/jobs/job-type-links";
import { buildJobTypePageStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { SITE_NAME } from "@/content/ai-visibility/site";
import {
  publicJobSearchSchema,
  type PublicJobSearchFilters,
} from "@/features/jobs/schemas";
import { getJobTypeMessageKey } from "@/features/jobs/presentation";
import { resolveJobTypeFromSlug } from "@/features/jobs/job-type-slugs";
import { routing, type AppLocale } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";
import { searchPublicJobs } from "@/server/dal/jobs";

type JobTypePageProps = {
  params: Promise<{ locale: string; type: string }>;
};

// The page reads the live catalogue through a cookie-bound client, so it is
// rendered per request like `/jobs`; pre-rendering would freeze an empty listing.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: JobTypePageProps): Promise<Metadata> {
  const { locale: requestedLocale, type: requestedType } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const jobType = resolveJobTypeFromSlug(requestedType);
  if (!jobType) notFound();

  const [t, searchCopy] = await Promise.all([
    getTranslations({ locale, namespace: "JobTypePage" }),
    getTranslations({ locale, namespace: "HomeJobSearch" }),
  ]);
  const typeName = searchCopy(getJobTypeMessageKey(jobType));

  return createLocalizedPageMetadata({
    locale,
    pathname: `/is-turleri/${requestedType}`,
    title: t("metaTitle", { type: typeName }),
    description: t("metaDescription", { type: typeName }),
  });
}

export default async function JobTypePage({ params }: JobTypePageProps) {
  const { locale: requestedLocale, type: requestedType } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const jobType = resolveJobTypeFromSlug(requestedType);
  if (!jobType) notFound();

  setRequestLocale(locale);

  const [t, searchCopy] = await Promise.all([
    getTranslations({ locale, namespace: "JobTypePage" }),
    getTranslations({ locale, namespace: "HomeJobSearch" }),
  ]);
  const typeName = searchCopy(getJobTypeMessageKey(jobType));

  const filters: PublicJobSearchFilters = publicJobSearchSchema.parse({
    jobType,
  });
  const results = await searchPublicJobs(filters);

  const navCopy = await getTranslations({ locale, namespace: "Nav" });
  const structuredData = buildJobTypePageStructuredData({
    locale,
    baseUrl: getAppBaseUrl(),
    typeSlug: requestedType,
    typeName,
    // Breadcrumb labels must name the pages the trail walks through, not the
    // home hero's slogans: `HomeJobSearch.title`/`eyebrow` are marketing copy
    // ("Fırsatları hesap açmadan keşfedin."), which a crawler would read as the
    // title of the home page and of the jobs index in the breadcrumb.
    jobsLabel: navCopy("jobs"),
    homeLabel: SITE_NAME,
  });

  return (
    <>
      <JsonLd data={structuredData} />
      <JobsExperience
        locale={locale}
        filters={filters}
        results={results}
        invalidFilters={false}
        title={t("title", { type: typeName })}
        description={t("intro", { type: typeName })}
        eyebrow={t("eyebrow")}
        emptyTitle={t("emptyTitle", { type: typeName })}
        emptyDescription={t("emptyDescription", { type: typeName })}
        footerSlot={
          <>
            <JobTypeLinks
              locale={locale as AppLocale}
              currentType={jobType}
              title={t("otherTypes")}
              browseAllLabel={t("browseAll")}
            />
            <DistrictLinks
              locale={locale as AppLocale}
              title={t("districts")}
              browseAllLabel={t("browseAll")}
            />
          </>
        }
      />
    </>
  );
}
