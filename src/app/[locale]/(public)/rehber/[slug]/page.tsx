import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getGuide, getGuides } from "@/content/guides";
import { buildGuideStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { getLocalePrefix, routing, type AppLocale } from "@/i18n/routing";
import {
  createLocalizedPageMetadata,
  getLocalizedSlugPathnames,
  resolveLocalizedSlugPathname,
} from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";

type GuidePageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  // Each locale's *own* slugs. Reusing the default locale's slugs under every
  // prefix would prerender five URLs that 404 and leave the real localized pages
  // to be rendered on demand.
  return routing.locales.flatMap((locale) =>
    getGuides(locale).map((guide) => ({ locale, slug: guide.slug })),
  );
}

/**
 * A slug that belongs to a different locale is a mislabelled link, not a
 * missing page: `/en/rehber/kktc-is-bulma-rehberi` carries the Turkish slug
 * under the English prefix. Send it to the English guide it names; a slug no
 * locale knows is a genuine 404.
 */
function siblingRedirect(locale: AppLocale, slug: string): never {
  const pathname = resolveLocalizedSlugPathname({
    section: "/rehber",
    locale,
    slug,
    siblings: getGuides,
  });
  if (!pathname) notFound();
  redirect(`${getLocalePrefix(locale)}${pathname}`);
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
  if (!guide) siblingRedirect(locale, slug);

  return createLocalizedPageMetadata({
    locale,
    pathname: `/rehber/${guide.slug}`,
    // Guide slugs are translated per locale, so each `hreflang` alternate has to
    // resolve the sibling slug rather than reuse this locale's one under every
    // prefix — otherwise five of the six advertised URLs answer 404.
    localizedPathnames: getLocalizedSlugPathnames({
      section: "/rehber",
      locale,
      slug: guide.slug,
      siblings: getGuides,
    }),
    title: guide.title,
    description: guide.description,
    // The page carries `Article` structured data, so the social graph must
    // agree; `website` would contradict the page's own `@type`.
    openGraphType: "article",
    // A guide tracks a single authored date, so it is both its publication and
    // its edit date — the same value the Article graph's `datePublished` /
    // `dateModified` default to. Emitting the pair keeps the unfurl consistent
    // with the markup rather than leaving the article timestamps unset.
    articleTimes: { published: guide.updated, modified: guide.updated },
  });
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { locale: requestedLocale, slug } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const guide = getGuide(locale, slug);
  if (!guide) siblingRedirect(locale, slug);

  setRequestLocale(locale);
  const [t, footerCopy] = await Promise.all([
    getTranslations({ locale, namespace: "Guides" }),
    getTranslations({ locale, namespace: "Footer" }),
  ]);
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
    // The breadcrumb names the section in the page's own language. The producer
    // defaults to the historical Turkish/Latin "Rehber", which a `de`/`fa` page
    // would assert alongside its localized copy; the footer already renders this
    // label in all six locales, so the two can never disagree.
    sectionName: footerCopy("links.guides"),
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
