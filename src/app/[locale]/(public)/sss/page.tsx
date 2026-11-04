import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getManagedFaq } from "@/server/dal/content";
import { buildFaqPageStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";

type FaqPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: FaqPageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "FaqPage" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/sss",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function FaqPage({ params }: FaqPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "FaqPage" });
  const entries = await getManagedFaq(locale);

  const structuredData = buildFaqPageStructuredData({
    locale,
    baseUrl: getAppBaseUrl(),
    pathname: "/sss",
    entries,
  });

  return (
    <>
      <JsonLd data={structuredData} />
      <div className="editorial-page guide-page">
        <div className="page-container guide-container">
          <header className="guide-header">
            <p className="editorial-kicker">{t("eyebrow")}</p>
            <h1>{t("title")}</h1>
            <p className="guide-lead">{t("lead")}</p>
          </header>

          <div className="faq-list">
            {entries.map((entry) => (
              <details className="faq-item" key={entry.question}>
                <summary>{entry.question}</summary>
                <p>{entry.answer}</p>
              </details>
            ))}
          </div>

          <footer className="guide-footer">
            <p>{t("ctaBody")}</p>
            <div className="guide-cta-row">
              <Link className="button button-primary" href="/jobs">
                {t("ctaJobs")}
              </Link>
              <Link className="button button-outline" href="/contact">
                {t("ctaContact")}
              </Link>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
