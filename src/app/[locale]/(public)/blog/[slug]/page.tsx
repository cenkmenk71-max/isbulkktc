import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getArticle, getArticleSlugs, getArticles } from "@/content/editorial";
import { buildGuideStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { routing } from "@/i18n/routing";
import {
  createLocalizedPageMetadata,
  getLocalizedSlugPathnames,
} from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";

type ArticlePageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getArticleSlugs().map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { locale: requestedLocale, slug } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const article = getArticle(locale, slug);
  if (!article) notFound();

  return createLocalizedPageMetadata({
    locale,
    pathname: `/blog/${article.slug}`,
    // Article slugs are translated per locale, so every `hreflang` alternate
    // resolves the sibling slug instead of reusing this locale's slug under
    // every prefix, which would advertise 404s.
    localizedPathnames: getLocalizedSlugPathnames({
      section: "/blog",
      locale,
      slug: article.slug,
      siblings: getArticles,
    }),
    title: article.title,
    description: article.description,
  });
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { locale: requestedLocale, slug } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const article = getArticle(locale, slug);
  if (!article) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Guides" });

  const structuredData = buildGuideStructuredData({
    locale,
    baseUrl: getAppBaseUrl(),
    slug: article.slug,
    title: article.title,
    description: article.description,
    updated: article.updated,
    pathname: "/blog",
  });

  return (
    <>
      <JsonLd data={structuredData} />
      <div className="editorial-page guide-page">
        <div className="page-container guide-container">
          <article className="guide-article">
            <header className="guide-header">
              <p className="editorial-kicker">{article.category}</p>
              <h1>{article.title}</h1>
              <p className="guide-lead">{article.description}</p>
              <p className="guide-meta">
                <time dateTime={article.updated}>
                  {t("updated", { date: article.updated })}
                </time>
                <span aria-hidden="true">·</span>
                <span>{t("readMinutes", { minutes: article.readMinutes })}</span>
              </p>
            </header>

            {article.sections.map((section) => (
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
                <Link className="button button-outline" href="/rehber">
                  {t("moreGuides")}
                </Link>
              </div>
            </footer>
          </article>
        </div>
      </div>
    </>
  );
}
