import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BlogPageContent } from "@/features/editorial/brand-pages";
import { buildArticleIndexStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { SITE_NAME } from "@/content/ai-visibility/site";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";

export const revalidate = 1800;

type BlogRouteProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: BlogRouteProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "BlogMeta" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/blog",
    title: t("title"),
    description: t("description"),
  });
}

export default async function BlogRoute({ params }: BlogRouteProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  // The index names its own section with the label the nav already renders, so
  // the structured data agrees with the visible navigation in every locale.
  const navCopy = await getTranslations({ locale, namespace: "Nav" });
  const structuredData = buildArticleIndexStructuredData({
    locale,
    baseUrl: getAppBaseUrl(),
    pageLabel: navCopy("blog"),
    homeLabel: SITE_NAME,
  });

  return (
    <>
      <JsonLd data={structuredData} />
      <BlogPageContent locale={locale} />
    </>
  );
}
