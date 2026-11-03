import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JobsExperience } from "@/components/jobs/jobs-experience";
import { DistrictLinks } from "@/components/jobs/district-links";
import {
  publicJobSearchSchema,
  type PublicJobSearchFilters,
} from "@/features/jobs/schemas";
import { getDistrictMessageKey } from "@/features/jobs/presentation";
import { resolveDistrictFromSlug } from "@/features/locations/northern-cyprus-districts";
import { routing, type AppLocale } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { searchPublicJobs } from "@/server/dal/jobs";

type DistrictPageProps = {
  params: Promise<{ locale: string; district: string }>;
};

// The page reads the live job catalogue through a cookie-bound client, so it is
// rendered per request like `/jobs`. Pre-rendering it would freeze an empty
// listing into the build output.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: DistrictPageProps): Promise<Metadata> {
  const { locale: requestedLocale, district: requestedDistrict } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const district = resolveDistrictFromSlug(requestedDistrict);
  if (!district) notFound();

  const [t, searchCopy] = await Promise.all([
    getTranslations({ locale, namespace: "DistrictPage" }),
    getTranslations({ locale, namespace: "HomeJobSearch" }),
  ]);
  const districtName = searchCopy(
    getDistrictMessageKey(district),
  );

  return createLocalizedPageMetadata({
    locale,
    pathname: `/is-ilanlari/${requestedDistrict}`,
    title: t("metaTitle", { district: districtName }),
    description: t("metaDescription", { district: districtName }),
  });
}

export default async function DistrictPage({ params }: DistrictPageProps) {
  const { locale: requestedLocale, district: requestedDistrict } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const district = resolveDistrictFromSlug(requestedDistrict);
  if (!district) notFound();

  setRequestLocale(locale);

  const [t, searchCopy] = await Promise.all([
    getTranslations({ locale, namespace: "DistrictPage" }),
    getTranslations({ locale, namespace: "HomeJobSearch" }),
  ]);
  const districtName = searchCopy(
    getDistrictMessageKey(district),
  );

  const filters: PublicJobSearchFilters = publicJobSearchSchema.parse({
    district,
  });
  const results = await searchPublicJobs(filters);

  return (
    <JobsExperience
      locale={locale}
      filters={filters}
      results={results}
      invalidFilters={false}
      title={t("title", { district: districtName })}
      description={t("intro", { district: districtName })}
      eyebrow={t("eyebrow")}
      emptyTitle={t("emptyTitle", { district: districtName })}
      emptyDescription={t("emptyDescription", { district: districtName })}
      footerSlot={
        <DistrictLinks
          locale={locale as AppLocale}
          currentDistrict={district}
          title={t("otherDistricts")}
          browseAllLabel={t("browseAll")}
        />
      }
    />
  );
}
