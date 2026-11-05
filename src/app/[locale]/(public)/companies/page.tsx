import type { Metadata } from "next";
import Image from "next/image";
import { connection } from "next/server";
import { ArrowUpRight, Building2 } from "lucide-react";
import { EmployerLogo } from "@/components/jobs/employer-logo";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CompanyDirectory } from "@/features/companies/company-directory";
import { withCompanyLogos } from "@/features/companies/company-logos";
import { companyDirectory } from "@/features/companies/directory-data";
import { applyCompanyDirectoryOverrides, deduplicateCompanyDirectory } from "@/features/companies/directory";
import { getPublicCompanyDirectoryOverrides } from "@/server/dal/companies";
import { getManagedDirectoryEntries } from "@/server/dal/content";
import { getPublicJobCompanies } from "@/server/dal/jobs";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { buildCompaniesIndexStructuredData } from "@/content/ai-visibility/structured-data";
import { JsonLd } from "@/content/ai-visibility/json-ld";
import { SITE_NAME } from "@/content/ai-visibility/site";
import { createLocalizedPageMetadata } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";

type CompaniesPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: CompaniesPageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "CompaniesMeta" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/companies",
    title: t("title"),
    description: t("description"),
  });
}

export default async function CompaniesPage({ params }: CompaniesPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  await connection();
  const [t, overrides, jobCompanies, managedDirectory] = await Promise.all([
    getTranslations("CompanyDirectory"),
    getPublicCompanyDirectoryOverrides(),
    getPublicJobCompanies(),
    getManagedDirectoryEntries(),
  ]);
  // The managed directory already carries its logos; the bundled bundle is only
  // merged with the logo manifest on the fallback path.
  const publishedCompanies = managedDirectory
    ? deduplicateCompanyDirectory(
        applyCompanyDirectoryOverrides(managedDirectory, overrides),
      )
    : withCompanyLogos(
        deduplicateCompanyDirectory(
          applyCompanyDirectoryOverrides(companyDirectory, overrides),
        ),
      );

  // The directory index names its own section with the nav's employer label,
  // so the structured data agrees with the visible navigation.
  const navCopy = await getTranslations({ locale, namespace: "Nav" });
  const structuredData = buildCompaniesIndexStructuredData({
    locale,
    baseUrl: getAppBaseUrl(),
    pageLabel: navCopy("employer"),
    homeLabel: SITE_NAME,
  });

  return (
    <div className="company-directory-page">
      <JsonLd data={structuredData} />
      <div className="page-container">
        <header className="company-directory-hero">
          <Image
            src="/images/companies-hero.webp"
            alt=""
            fill
            preload
            sizes="(max-width: 740px) 100vw, 1200px"
            quality={85}
            className="company-directory-hero-image"
          />
          <span className="company-directory-hero-shade" aria-hidden="true" />
          <div className="company-directory-hero-copy">
            <p className="company-directory-eyebrow">
              <span aria-hidden="true" />
              {t("eyebrow")}
            </p>
            <h1>{t("title")}</h1>
            <p className="company-directory-description">
              {t("description")}
            </p>
          </div>
          <div className="company-directory-total" aria-label={t("totalLabel", { count: publishedCompanies.length })}>
            <Building2 size={20} aria-hidden="true" />
            <strong>{publishedCompanies.length.toLocaleString(locale)}</strong>
            <span>{t("totalLabel", { count: publishedCompanies.length })}</span>
          </div>
        </header>

        {jobCompanies.length > 0 ? (
          <section
            className="company-job-employers"
            aria-labelledby="company-job-employers-title"
          >
            <div className="company-job-employers-heading">
              <div>
                <p className="company-directory-eyebrow">
                  {t("jobEmployersEyebrow")}
                </p>
                <h2 id="company-job-employers-title">
                  {t("jobEmployersTitle")}
                </h2>
                <p>{t("jobEmployersDescription")}</p>
              </div>
              <span>
                {t("jobEmployersCount", { count: jobCompanies.length })}
              </span>
            </div>
            <ul>
              {jobCompanies.map((company) => (
                <li key={company.company_slug}>
                  <article className="company-job-employer-card">
                    <div className="company-job-employer-heading">
                      <EmployerLogo
                        companyName={company.company_name}
                        logoUrl={company.logo_url}
                        className="company-job-employer-logo"
                        sizes="48px"
                      />
                      <div>
                        <strong>
                          <Link
                            href={`/jobs?query=${encodeURIComponent(company.company_name)}`}
                          >
                            {company.company_name}
                          </Link>
                        </strong>
                        <small>
                          {t("activeJobCount", {
                            count: company.active_job_count,
                          })}
                        </small>
                      </div>
                    </div>
                    {company.profile_description ? (
                      <p className="company-job-employer-description">
                        {company.profile_description}
                      </p>
                    ) : null}
                    {company.categories.length > 0 || company.municipality ? (
                      <div className="company-job-employer-facts">
                        {company.categories.map((category) => (
                          <span key={category}>{category}</span>
                        ))}
                        {company.municipality ? (
                          <span>{company.municipality}</span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="company-job-employer-links">
                      {company.website ? (
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("companyWebsite")}:{" "}
                          {new URL(company.website).hostname}
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </a>
                      ) : null}
                      {/* The source-site profile and listing links used to be
                          rendered here. They sent our own visitors to the
                          competitor's page the listing was imported from, which
                          is the opposite of what the page is for. */}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
            <p className="company-job-employers-note">
              {t("jobEmployersVerificationNote")}
            </p>
          </section>
        ) : null}
        <CompanyDirectory companies={publishedCompanies} />
      </div>
    </div>
  );
}
