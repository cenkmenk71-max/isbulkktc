import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FreelanceExperience } from "@/components/freelance/freelance-experience";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";

type FreelancePageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: FreelancePageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "FreelanceMeta" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/freelance",
    title: t("title"),
    description: t("description"),
  });
}

export default async function FreelancePage({ params }: FreelancePageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) {
    notFound();
  }
  setRequestLocale(locale);
  return <FreelanceExperience locale={locale} />;
}
