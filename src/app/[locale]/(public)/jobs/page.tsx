import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JobsExperience } from "@/components/jobs/jobs-experience";
import { publicJobSearchSchema } from "@/features/jobs/schemas";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { searchPublicJobs } from "@/server/dal/jobs";

type JobsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: JobsPageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "JobsMeta" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/jobs",
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
  const search = publicJobSearchSchema.safeParse({
    query: query.query === "" ? undefined : query.query,
    district: query.district === "" ? undefined : query.district,
    jobType: query.jobType === "" ? undefined : query.jobType,
    workplaceMode:
      query.workplaceMode === "" ? undefined : query.workplaceMode,
    page: query.page === "" ? undefined : query.page,
  });
  const filters = search.success
    ? search.data
    : publicJobSearchSchema.parse({});
  const results = search.success ? await searchPublicJobs(filters) : null;
  const copy = await getTranslations({ locale, namespace: "JobsPage" });

  return (
    <JobsExperience
      locale={locale}
      filters={filters}
      results={results}
      invalidFilters={!search.success}
      title={copy("title")}
      description={copy("description")}
      eyebrow={copy("eyebrow")}
    />
  );
}
