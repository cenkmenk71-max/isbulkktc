import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeExperience } from "@/components/home/home-experience";
import { publicJobSearchSchema } from "@/features/jobs/schemas";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { searchPublicJobPreviews } from "@/server/dal/jobs";

type HomePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "HomeMeta" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/",
    title: t("title"),
    description: t("description"),
  });
}

export default async function HomePage({
  params,
  searchParams,
}: HomePageProps) {
  const [{ locale: requestedLocale }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) {
    notFound();
  }
  setRequestLocale(locale);

  const defaultFilters = publicJobSearchSchema.parse({});
  const search = publicJobSearchSchema.safeParse({
    query: query.query,
    district: query.district,
    jobType: query.jobType,
    workplaceMode: query.workplaceMode,
    page: query.page,
  });
  const filters = search.success ? search.data : defaultFilters;
  const results = search.success
    ? await searchPublicJobPreviews(filters)
    : null;

  return (
    <HomeExperience
      locale={locale}
      jobSearch={{
        filters,
        results,
        invalidFilters: !search.success,
      }}
    />
  );
}
