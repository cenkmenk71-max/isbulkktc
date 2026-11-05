import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getArticle, getArticles } from "@/content/editorial";
import { buildGuideStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { getLocalePrefix, routing, type AppLocale } from "@/i18n/routing";
import {
  createLocalizedPageMetadata,
  getLocalizedSlugPathnames,
  resolveLocalizedSlugPathname,
} from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";

type ArticlePageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  // Each locale's own slugs; reusing the default locale's set under every prefix
  // prerenders five URLs that 404.
  return routing.locales.flatMap((locale) =>
    getArticles(locale).map((article) => ({ locale, slug: article.slug })),
  );
}

/**
 * A slug that belongs to a different locale is a mislabelled link, not a
 * missing page, so send it to the article it names; a slug no locale knows is a
 * genuine 404.
 */
function siblingRedirect(locale: AppLocale, slug: string): never {
  const pathname = resolveLocalizedSlugPathname({
    section: "/blog",
    locale,
    slug,
    siblings: getArticles,
  });
  if (!pathname) notFound();
  redirect(`${getLocalePrefix(locale)}${pathname}`);
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
  if (!article) siblingRedirect(locale, slug);

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
    // The page carries `Article` structured data, so the social graph must
    // agree; `website` would contradict the page's own `@type`.
    openGraphType: "article",
  });
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { locale: requestedLocale, slug } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const article = getArticle(locale, slug);
  if (!article) siblingRedirect(locale, slug);

  setRequestLocale(locale);
  const [t, navCopy] = await Promise.all([
    getTranslations({ locale, namespace: "Guides" }),
    getTranslations({ locale, namespace: "Nav" }),
  ]);

  const structuredData = buildGuideStructuredData({
    locale,
    baseUrl: getAppBaseUrl(),
    slug: article.slug,
    title: article.title,
    description: article.description,
    updated: article.updated,
    pathname: "/blog",
    // The breadcrumb names the section in the page's own language. The producer
    // defaults to the historical Turkish/Latin "Blog", which a `de`/`fa` page
    // would assert alongside its localized copy; the nav already renders this
    // label in all six locales, so the two can never disagree.
    sectionName: navCopy("blog"),
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
