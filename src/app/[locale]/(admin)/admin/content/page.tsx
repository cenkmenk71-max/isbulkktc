import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { FileText, ListChecks, MessageSquareQuote, ShieldCheck } from "lucide-react";
import { AdminMfaGate } from "@/features/identity/admin-mfa-gate";
import {
  EditFaqEntryForm,
  EditListingPlanForm,
  LegalDocumentForm,
  NewFaqEntryForm,
} from "@/features/editorial/admin-content-forms";
import {
  adminContentLocales,
  adminLegalKeys,
} from "@/features/editorial/admin-content-schemas";
import {
  getAdminFaqEntries,
  getAdminListingPlans,
  getAdminSiteContentEntries,
} from "@/server/dal/content";
import { getPlatformAdminMfaStatus } from "@/server/dal/user";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type AdminContentPageProps = {
  params: Promise<{ locale: string }>;
};

type StoredLegalDocument = {
  title: string;
  intro: string;
  updated: string;
  sections: { title: string; paragraphs: string[] }[];
};

function parseStoredDocument(document: unknown): StoredLegalDocument | null {
  if (!document || typeof document !== "object") return null;
  const candidate = document as Record<string, unknown>;
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.intro !== "string" ||
    typeof candidate.updated !== "string" ||
    !Array.isArray(candidate.sections)
  ) {
    return null;
  }
  const sections = candidate.sections.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const entry = section as Record<string, unknown>;
    if (typeof entry.title !== "string" || !Array.isArray(entry.paragraphs)) {
      return [];
    }
    return [
      {
        title: entry.title,
        paragraphs: entry.paragraphs.filter(
          (paragraph): paragraph is string => typeof paragraph === "string",
        ),
      },
    ];
  });
  if (sections.length === 0) return null;
  return {
    title: candidate.title,
    intro: candidate.intro,
    updated: candidate.updated,
    sections,
  };
}

export default async function AdminContentPage({
  params,
}: AdminContentPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const mfa = await getPlatformAdminMfaStatus();
  const copy = await getTranslations("AdminContent");

  if (!mfa.aal2) {
    return (
      <main className="admin-packages-page page-container">
        <AdminMfaGate verifiedFactorId={mfa.verifiedTotpFactorId} />
      </main>
    );
  }

  const [siteContent, faqEntries, plans] = await Promise.all([
    getAdminSiteContentEntries(),
    getAdminFaqEntries(),
    getAdminListingPlans(),
  ]);

  const legalRows = adminLegalKeys.map((key) => ({
    key,
    locale,
    document: parseStoredDocument(
      siteContent.find(
        (row) => row.content_key === `legal.${key}` && row.locale === locale,
      )?.document,
    ),
  }));
  const localeFaqEntries = faqEntries.filter((entry) => entry.locale === locale);

  return (
    <main className="admin-packages-page page-container">
      <header className="admin-packages-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("eyebrow")}
        </p>
        <h1>{copy("title")}</h1>
        <p>{copy("description")}</p>
        <div className="admin-packages-links">
          <span>
            <ShieldCheck size={15} aria-hidden="true" />
            {copy("mfaVerified")}
          </span>
          <Link href="/admin/packages">{copy("catalogLink")}</Link>
          <Link href="/admin/company-profiles">{copy("reviewsLink")}</Link>
        </div>
      </header>

      <section className="admin-packages-section" aria-labelledby="legal-title">
        <header className="admin-packages-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("legalEyebrow")}
            </p>
            <h2 id="legal-title">{copy("legalTitle")}</h2>
            <p>{copy("legalDescription")}</p>
          </div>
          <span className="admin-count">{legalRows.length}</span>
        </header>
        <div className="admin-package-list">
          {legalRows.map((row) => (
            <LegalDocumentForm key={row.key} row={row} />
          ))}
        </div>
      </section>

      <section className="admin-packages-section" aria-labelledby="faq-title">
        <header className="admin-packages-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("faqEyebrow")}
            </p>
            <h2 id="faq-title">{copy("faqTitle")}</h2>
            <p>{copy("faqDescription")}</p>
          </div>
          <span className="admin-count">{localeFaqEntries.length}</span>
        </header>
        <NewFaqEntryForm locale={locale} />
        {localeFaqEntries.length ? (
          <div className="admin-package-list">
            {localeFaqEntries.map((entry) => (
              <EditFaqEntryForm entry={entry} key={entry.id} />
            ))}
          </div>
        ) : (
          <p className="admin-package-empty" role="status">
            <MessageSquareQuote size={19} aria-hidden="true" />
            {copy("emptyFaq")}
          </p>
        )}
      </section>

      <section className="admin-packages-section" aria-labelledby="plans-title">
        <header className="admin-packages-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("plansEyebrow")}
            </p>
            <h2 id="plans-title">{copy("plansTitle")}</h2>
            <p>{copy("plansDescription")}</p>
          </div>
          <span className="admin-count">{plans.length}</span>
        </header>
        {plans.length ? (
          <div className="admin-package-list">
            {plans.map((plan) => (
              <EditListingPlanForm key={plan.code} plan={plan} />
            ))}
          </div>
        ) : (
          <p className="admin-package-empty" role="status">
            <ListChecks size={19} aria-hidden="true" />
            {copy("emptyPlans")}
          </p>
        )}
      </section>

      <p className="admin-content-footnote">
        <FileText size={15} aria-hidden="true" />
        {copy("languages")}: {adminContentLocales.join(" · ")}
      </p>
    </main>
  );
}
