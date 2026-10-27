import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PackagesExperience } from "@/components/packages/packages-experience";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";

type PackagesPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PackagesPageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "PackagesMeta" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/packages",
    title: t("title"),
    description: t("description"),
  });
}

export default async function PackagesPage({ params }: PackagesPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  return <PackagesExperience locale={locale} />;
}
