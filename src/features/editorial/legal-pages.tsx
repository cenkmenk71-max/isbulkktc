import { ArrowLeft, FileText, Mail, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

export type LegalPageKey = "privacy" | "cookies" | "terms";

const legalIcons = {
  privacy: ShieldCheck,
  cookies: FileText,
  terms: FileText,
} as const;

const legalPaths: Record<LegalPageKey, string> = {
  privacy: "/privacy",
  cookies: "/cookies",
  terms: "/terms",
};

type Document = { title: string; intro: string; updated: string };

// next-intl types every message key literally, so the section list is written
// out per document instead of derived from a template string. Adding a section
// means adding its keys to the locale files and to this map together.
const documentSections: Record<
  LegalPageKey,
  { key: string; title: string; paragraphs: string[] }[]
> = {
  privacy: [
    {
      key: "privacy.sections.s1",
      title: "privacy.sections.s1.title",
      paragraphs: ["privacy.sections.s1.p1", "privacy.sections.s1.p2"],
    },
    {
      key: "privacy.sections.s2",
      title: "privacy.sections.s2.title",
      paragraphs: ["privacy.sections.s2.p1", "privacy.sections.s2.p2"],
    },
    {
      key: "privacy.sections.s3",
      title: "privacy.sections.s3.title",
      paragraphs: ["privacy.sections.s3.p1", "privacy.sections.s3.p2"],
    },
    {
      key: "privacy.sections.s4",
      title: "privacy.sections.s4.title",
      paragraphs: ["privacy.sections.s4.p1", "privacy.sections.s4.p2"],
    },
  ],
  cookies: [
    {
      key: "cookies.sections.s1",
      title: "cookies.sections.s1.title",
      paragraphs: ["cookies.sections.s1.p1"],
    },
    {
      key: "cookies.sections.s2",
      title: "cookies.sections.s2.title",
      paragraphs: ["cookies.sections.s2.p1", "cookies.sections.s2.p2"],
    },
    {
      key: "cookies.sections.s3",
      title: "cookies.sections.s3.title",
      paragraphs: ["cookies.sections.s3.p1", "cookies.sections.s3.p2"],
    },
  ],
  terms: [
    {
      key: "terms.sections.s1",
      title: "terms.sections.s1.title",
      paragraphs: ["terms.sections.s1.p1", "terms.sections.s1.p2"],
    },
    {
      key: "terms.sections.s2",
      title: "terms.sections.s2.title",
      paragraphs: ["terms.sections.s2.p1", "terms.sections.s2.p2"],
    },
    {
      key: "terms.sections.s3",
      title: "terms.sections.s3.title",
      paragraphs: ["terms.sections.s3.p1", "terms.sections.s3.p2"],
    },
    {
      key: "terms.sections.s4",
      title: "terms.sections.s4.title",
      paragraphs: ["terms.sections.s4.p1", "terms.sections.s4.p2"],
    },
  ],
};

export async function LegalPageContent({
  locale,
  page,
}: {
  locale: AppLocale;
  page: LegalPageKey;
}) {
  const t = await getTranslations({ locale, namespace: "Legal" });
  const Icon = legalIcons[page];
  const document: Document = {
    title: t(`${page}.title` as never),
    intro: t(`${page}.intro` as never),
    updated: t(`${page}.updated` as never),
  };

  return (
    <div className="editorial-page legal-page">
      <div className="page-container legal-page-layout">
        <nav className="legal-page-back" aria-label={t("backLabel")}>
          <Link href="/">
            <ArrowLeft size={14} aria-hidden="true" />
            {t("backToHome")}
          </Link>
        </nav>

        <header className="editorial-page-heading legal-page-heading">
          <span className="legal-page-eyebrow">
            <Icon size={14} aria-hidden="true" />
            {t("eyebrow")}
          </span>
          <h1>{document.title}</h1>
          <p>{document.intro}</p>
          <span className="legal-page-updated">
            {t("lastUpdated", { date: document.updated })}
          </span>
        </header>

        <div className="editorial-page-content legal-page-content">
          {documentSections[page].map((section, index) => (
            <section className="legal-section" key={section.key}>
              <h2>
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {t(section.title as never)}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{t(paragraph as never)}</p>
              ))}
            </section>
          ))}

          <aside className="legal-page-contact">
            <Mail size={16} aria-hidden="true" />
            <p>{t("contactNote")}</p>
            <a href={`mailto:${t("contactEmail")}`}>{t("contactEmail")}</a>
          </aside>

          <nav className="legal-page-siblings" aria-label={t("relatedLabel")}>
            {(Object.keys(legalPaths) as LegalPageKey[])
              .filter((key) => key !== page)
              .map((key) => (
                <Link href={legalPaths[key]} key={key}>
                  {t(`${key}.title` as never)}
                </Link>
              ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
