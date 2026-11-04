import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getGuide, getGuideSlugs } from "@/content/guides";
import { buildGuideStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";

type GuidePageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getGuideSlugs().map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: GuidePageProps): Promise<Metadata> {
  const { locale: requestedLocale, slug } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const guide = getGuide(locale, slug);
  if (!guide) notFound();

  return createLocalizedPageMetadata({
    locale,
    pathname: `/rehber/${guide.slug}`,
    title: guide.title,
    description: guide.description,
  });
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { locale: requestedLocale, slug } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const guide = getGuide(locale, slug);
  if (!guide) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Guides" });
  const others = (await import("@/content/guides")).getGuides(locale).filter(
    (candidate) => candidate.slug !== guide.slug,
  );

  const structuredData = buildGuideStructuredData({
    locale,
    baseUrl: getAppBaseUrl(),
    slug: guide.slug,
    title: guide.title,
    description: guide.description,
    updated: guide.updated,
  });

  return (
    <>
      <JsonLd data={structuredData} />
      <div className="editorial-page guide-page">
        <div className="page-container guide-container">
          <article className="guide-article">
            <header className="guide-header">
              <p className="editorial-kicker">{guide.eyebrow}</p>
              <h1>{guide.title}</h1>
              <p className="guide-lead">{guide.lead}</p>
              <p className="guide-meta">
                <time dateTime={guide.updated}>
                  {t("updated", { date: guide.updated })}
                </time>
                <span aria-hidden="true">·</span>
                <span>{t("readMinutes", { minutes: guide.readMinutes })}</span>
              </p>
            </header>

            {guide.sections.map((section) => (
              <section className="guide-section" key={section.heading}>
                <h2>{section.heading}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.list ? (
                  <ul>
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}

            <footer className="guide-footer">
              <p>{t("ctaBody")}</p>
              <div className="guide-cta-row">
                <Link className="button button-primary" href="/jobs">
                  {t("ctaJobs")}
                </Link>
                <Link className="button button-outline" href="/register">
                  {t("ctaRegister")}
                </Link>
              </div>
            </footer>
          </article>

          {others.length > 0 ? (
            <nav className="guide-more" aria-label={t("moreGuides")}>
              <h2>{t("moreGuides")}</h2>
              <ul>
                {others.map((other) => (
                  <li key={other.slug}>
                    <Link href={`/rehber/${other.slug}`}>
                      <strong>{other.title}</strong>
                      <span>{other.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </div>
    </>
  );
}
