import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getGuides } from "@/content/guides";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";

type GuidesIndexProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: GuidesIndexProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "Guides" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/rehber",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function GuidesIndexPage({ params }: GuidesIndexProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Guides" });
  const guides = getGuides(locale);

  return (
    <div className="editorial-page guide-page">
      <div className="page-container guide-container">
        <header className="guide-header">
          <p className="editorial-kicker">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className="guide-lead">{t("lead")}</p>
        </header>

        <ul className="guide-index-list">
          {guides.map((guide) => (
            <li key={guide.slug}>
              <Link href={`/rehber/${guide.slug}`}>
                <strong>{guide.title}</strong>
                <span>{guide.description}</span>
                <small>
                  {t("readMinutes", { minutes: guide.readMinutes })}
                </small>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
