import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPageContent } from "@/features/editorial/legal-pages";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";

type LegalRouteProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: LegalRouteProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "Legal" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/cookies",
    title: t("cookies.title"),
    description: t("cookies.intro"),
  });
}

export default async function LegalRoute({ params }: LegalRouteProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  return <LegalPageContent locale={locale} page="cookies" />;
}
