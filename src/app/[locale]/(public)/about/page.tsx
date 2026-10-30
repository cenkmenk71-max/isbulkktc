import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AboutPageContent } from "@/features/editorial/brand-pages";
import { buildFaqPageStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";
import { getManagedFaq } from "@/server/dal/content";

type AboutRouteProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: AboutRouteProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "AboutMeta" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/about",
    title: t("title"),
    description: t("description"),
  });
}

export default async function AboutRoute({ params }: AboutRouteProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const faqEntries = await getManagedFaq(locale);
  const faqStructuredData = buildFaqPageStructuredData({
    locale,
    baseUrl: getAppBaseUrl(),
    pathname: "/about",
    entries: faqEntries,
  });
  return (
    <>
      <JsonLd data={faqStructuredData} />
      <AboutPageContent locale={locale} faqEntries={faqEntries} />
    </>
  );
}
